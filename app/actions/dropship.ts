"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { allow } from "@/lib/rate-limit";
import { FetchRefused, parseTarget, robotsRulesAllow, safeFetch } from "@/lib/safe-fetch";
import { extractSupplierProduct, type SupplierImage } from "@/lib/dropship/source";
import { proposeSupplierProduct } from "@/lib/ai/agents";

const back = (msg: string, kind: "ok" | "erreur" = "ok"): never => {
  revalidatePath("/admin/dropshipping");
  redirect(`/admin/dropshipping?${kind}=${encodeURIComponent(msg)}`);
};
const schema = z.object({
  supplier_url: z.string().trim().min(12).max(2000),
  product_query: z.string().trim().min(2, "Indiquez le nom du produit.").max(200),
  operator_prompt: z.string().trim().max(4000).optional().default(""),
  supplier_connection_id: z.string().uuid().optional().or(z.literal("")),
  rights_confirmed: z.literal("on", { error: "Confirmez que vous êtes autorisé à utiliser cette source et ses images." }),
});

async function robotsError(target: URL): Promise<string | null> {
  const robots = await safeFetch(new URL("/robots.txt", target).toString(), { maxBytes: 200_000, timeoutMs: 5000, totalTimeoutMs: 8000, maxRedirects: 2, httpsOnly: true });
  if (robots.status === 200 && !robotsRulesAllow(robots.body, target.pathname + target.search)) return "Le fournisseur interdit l'accès automatisé à cette page dans robots.txt.";
  if (robots.status !== 200 && robots.status !== 404 && (robots.status < 200 || robots.status >= 400)) return "Impossible de vérifier les règles d'accès du fournisseur; import bloqué par prudence.";
  return null;
}

async function imagesForReview(images: SupplierImage[]): Promise<(SupplierImage & { content_type: string; content_length: number })[]> {
  const accepted = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  const out: (SupplierImage & { content_type: string; content_length: number })[] = [];
  for (const image of images.slice(0, 6)) {
    if (out.length >= 4) break;
    try {
      const r = await safeFetch(image.url, { method: "HEAD", timeoutMs: 5000, totalTimeoutMs: 8000, maxRedirects: 3, httpsOnly: true });
      const type = (r.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const bytes = Number(r.headers["content-length"] ?? "");
      if (r.status >= 200 && r.status < 300 && accepted.has(type) && Number.isSafeInteger(bytes) && bytes > 0 && bytes <= 8 * 1024 * 1024) {
        out.push({ ...image, url: r.url, content_type: type, content_length: bytes });
      }
    } catch { /* Une image bloquée ou trop volumineuse n'empêche pas l'examen de la fiche. */ }
  }
  return out;
}

export async function importSupplierProduct(form: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return back(parsed.error.issues[0]?.message ?? "Formulaire invalide.", "erreur");
  if (!(await allow("dropship-import", 5, 3600))) return back("Limite atteinte : réessayez dans une heure.", "erreur");

  let target: URL;
  try {
    target = parseTarget(parsed.data.supplier_url);
    if (target.protocol !== "https:") return back("Seules les pages fournisseur publiques en HTTPS sont acceptées.", "erreur");
    target.hash = "";
  } catch (e) {
    const message = e instanceof FetchRefused ? e.message : "Adresse fournisseur invalide.";
    return back(message, "erreur");
  }

  const db = supabaseAdmin();
  const supplierConnectionId = parsed.data.supplier_connection_id || null;
  if (supplierConnectionId) {
    const { data: connection, error: connectionError } = await db.from("supplier_connections").select("id,name").eq("id", supplierConnectionId).maybeSingle();
    if (connectionError || !connection) return back("Le fournisseur sélectionné n'existe plus. Actualisez le Centre fournisseurs.", "erreur");
  }
  const { data: duplicate } = await db.from("dropship_imports").select("id,status").eq("supplier_url", target.toString()).is("archived_at", null).in("status", ["queued", "running", "needs_review", "approved"]).limit(1).maybeSingle();
  if (duplicate) return back(`Cette page est déjà importée (référence ${duplicate.id}, statut ${duplicate.status}).`, "erreur");

  const { data: row, error: insertError } = await db.from("dropship_imports").insert({
    supplier_url: target.toString(), product_query: parsed.data.product_query, operator_prompt: parsed.data.operator_prompt ?? "", status: "queued", rights_confirmed: true,
    extracted: { version: 1, requested_at: new Date().toISOString(), supplier_connection_id: supplierConnectionId }, images: [],
  }).select("id").single();
  if (insertError || !row) return back("L'import n'a pas pu être enregistré dans Supabase.", "erreur");

  const fail = async (message: string) => {
    await db.from("dropship_imports").update({ status: "failed", error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", row.id);
    return back(message, "erreur");
  };

  try {
    await db.from("dropship_imports").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", row.id);
    const denied = await robotsError(target);
    if (denied) return await fail(denied);

    const response = await safeFetch(target.toString(), { maxBytes: 800_000, timeoutMs: 8000, totalTimeoutMs: 15_000, maxRedirects: 4, httpsOnly: true });
    if (response.status !== 200) return await fail(`La page fournisseur a répondu ${response.status}; aucune donnée n'a été importée.`);
    const contentType = (response.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return await fail("La source n'est pas une page HTML publique.");
    const finalTarget = parseTarget(response.url);
    if (finalTarget.toString() !== target.toString()) {
      const finalDenied = await robotsError(finalTarget);
      if (finalDenied) return await fail(finalDenied);
    }
    const extracted = extractSupplierProduct(response.body, response.url, parsed.data.product_query);
    const safeImages = await imagesForReview(extracted.images);
    const imageRecords = safeImages.map((image) => ({ ...image, rights_confirmed: true, credit: "Image source fournisseur — droits à vérifier avant publication" }));
    const values = {
      ...extracted,
      source_page: response.url,
      requested_name: parsed.data.product_query,
      extracted_at: new Date().toISOString(),
      source_content_truncated: response.truncated,
      supplier_connection_id: supplierConnectionId,
      price_note: "Prix affiché par le fournisseur : référence non vérifiée, ne pas utiliser comme prix de vente.",
    };
    const { error: updateError } = await db.from("dropship_imports").update({ status: "running", extracted: values, images: imageRecords, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updateError) return await fail("La fiche extraite n'a pas pu être conservée dans Supabase.");

    const modelSourceUrl = new URL(response.url); modelSourceUrl.search = ""; modelSourceUrl.hash = "";
    const proposal = await proposeSupplierProduct({ importId: row.id, supplierUrl: modelSourceUrl.toString(), productQuery: parsed.data.product_query, operatorPrompt: parsed.data.operator_prompt ?? "", extracted, supplierConnectionId });
    if (!proposal.ok) return await fail(`Extraction terminée, mais la proposition IA a échoué : ${proposal.note}`);
    const { error: doneError } = await db.from("dropship_imports").update({ status: "needs_review", error: null, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (doneError) return await fail("Proposition créée, mais le statut d'import n'a pas pu être mis à jour. Vérifiez le Centre IA avant de relancer.");
    return back(`Import ${row.id} prêt : vérifiez le texte et générez une image dans la fiche, puis décidez dans le Centre IA.`);
  } catch (e) {
    const message = e instanceof FetchRefused ? e.message : "Échec réseau ou analyse fournisseur; aucun produit n'a été publié.";
    return await fail(message);
  }
}


export async function archiveSupplierImport(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return back("Import invalide.", "erreur");
  const db = supabaseAdmin();
  const { data: row } = await db.from("dropship_imports").select("id,status,product_id,archived_at").eq("id", id.data).maybeSingle();
  if (!row) return back("Import introuvable.", "erreur");
  if (row.archived_at) return back("Cet import est déjà archivé.");
  if (row.status === "queued" || row.status === "running") return back("Cet import est encore en traitement; archivez-le après analyse.", "erreur");
  const now = new Date().toISOString();
  const { error } = await db.from("dropship_imports").update({ archived_at: now, archived_by: user.id, updated_at: now }).eq("id", row.id).is("archived_at", null);
  if (error) return back("L'archivage a échoué.", "erreur");
  await db.from("ai_audit_logs").insert({
    actor_type: "user",
    actor_id: user.id,
    user_id: user.id,
    service: "supplier-workspace",
    action: "archive_supplier_import",
    resource_type: "dropship_import",
    resource_id: row.id,
    policy_decision: "ALLOW",
    metadata: { status: row.status, product_id: row.product_id ?? null },
    timestamp: now,
    created_at: now,
  });
  return back("Import archivé.");
}

export async function restoreSupplierImport(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return back("Import invalide.", "erreur");
  const db = supabaseAdmin();
  const { data: row } = await db.from("dropship_imports").select("id,status,archived_at").eq("id", id.data).maybeSingle();
  if (!row) return back("Import introuvable.", "erreur");
  if (!row.archived_at) return back("Cet import est déjà actif.");
  const now = new Date().toISOString();
  const { error } = await db.from("dropship_imports").update({ archived_at: null, archived_by: null, updated_at: now }).eq("id", row.id).not("archived_at", "is", null);
  if (error) return back("La restauration a échoué.", "erreur");
  await db.from("ai_audit_logs").insert({
    actor_type: "user",
    actor_id: user.id,
    user_id: user.id,
    service: "supplier-workspace",
    action: "restore_supplier_import",
    resource_type: "dropship_import",
    resource_id: row.id,
    policy_decision: "ALLOW",
    metadata: { status: row.status },
    timestamp: now,
    created_at: now,
  });
  return back("Import restauré.");
}
