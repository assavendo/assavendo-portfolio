import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { allow } from "@/lib/rate-limit";
import { safeFetch, FetchRefused } from "@/lib/safe-fetch";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/ai/crypto";
import { candidates, classifyFailure, scrub, specificFirst, type KeyRow } from "@/lib/ai/policy";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status });
type StoredImage = { url?: string; alt?: string; credit?: string; kind?: string; content_type?: string; content_length?: number };
type ImportRow = { id: string; status: string; rights_confirmed: boolean; images: unknown; extracted: Record<string, unknown> | null; updated_at: string };
const getImages = (value: unknown) => Array.isArray(value) ? value as StoredImage[] : [];
const premiumImage = (images: StoredImage[]) => images.find((image) => image.kind === "premium" && typeof image.url === "string");

export async function POST(req: Request) {
  await requireAdmin();
  if (!(await allow("dropship-image", 3, 3600))) return fail("Limite d'images atteinte; réessayez plus tard.", 429);
  const body = await req.json().catch(() => null) as { importId?: unknown } | null;
  if (!body || typeof body.importId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.importId)) return fail("Référence d'import invalide.", 400);

  const db = supabaseAdmin();
  const { data: item, error: itemError } = await db.from("dropship_imports").select("id,status,rights_confirmed,images,extracted,updated_at").eq("id", body.importId).maybeSingle() as { data: ImportRow | null; error: unknown };
  if (itemError || !item) return fail("Import introuvable.", 404);
  if (item.status !== "needs_review" || !item.rights_confirmed) return fail("L'import doit être en revue et les droits de la source confirmés.", 409);
  const priorImages = getImages(item.images);
  const existing = premiumImage(priorImages);
  if (existing?.url) return NextResponse.json({ url: existing.url, existing: true });
  if (!priorImages.some((image) => image.kind === "source" && typeof image.url === "string")) return fail("Aucune image fournisseur publique et vérifiée n'est disponible.", 422);

  const { data: settings } = await db.from("ai_settings").select("enabled,daily_call_cap").eq("id", 1).maybeSingle();
  if (!settings?.enabled) return fail("L'interrupteur général des IA est désactivé.", 503);
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("ai_runs").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString());
  if ((count ?? 0) >= settings.daily_call_cap) return fail("Le plafond quotidien des appels IA est atteint.", 429);

  const { data: rows } = await db.from("ai_keys").select("*").eq("provider", "openai").eq("enabled", true).limit(20);
  const keys = specificFirst(candidates((rows ?? []) as KeyRow[], "catalogue"), "catalogue");
  const key = keys.find((candidate) => {
    try { return new URL(candidate.base_url).origin === "https://api.openai.com"; } catch { return false; }
  });
  if (!key) return fail("Ajoutez une clé OpenAI active avec le rôle général ou catalogue dans le Centre IA. Les services compatibles ne gèrent pas cette retouche d'image.", 503);

  let secret: string;
  try { secret = decryptSecret(key.secret_enc); } catch { return fail("La clé OpenAI est illisible; vérifiez AI_MASTER_KEY dans l'environnement serveur.", 503); }

  const now = new Date().toISOString();
  const { data: claim, error: claimError } = await db.from("dropship_imports").update({ status: "running", updated_at: now }).eq("id", item.id).eq("status", "needs_review").select("id").maybeSingle();
  if (claimError) return fail("Impossible de réserver cet import pour une génération unique.", 503);
  let claimed = Boolean(claim);
  if (!claimed) {
    const { data: current, error: currentError } = await db.from("dropship_imports").select("id,status,updated_at,extracted").eq("id", item.id).maybeSingle();
    if (currentError || !current) return fail("Import introuvable.", 404);
    const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
    if (current.status === "running" && current.extracted && current.updated_at < staleBefore) {
      const { data: reclaimed, error: reclaimError } = await db.from("dropship_imports").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", item.id).eq("status", "running").lt("updated_at", staleBefore).not("extracted", "is", null).select("id").maybeSingle();
      if (reclaimError) return fail("Impossible de reprendre l'import interrompu.", 503);
      claimed = Boolean(reclaimed);
    }
  }
  if (!claimed) return fail("Une génération est déjà en cours ou cet import a changé d'état.", 409);

  let lockReleased = false;
  let uploadedPath: string | null = null;
  let imageSaved = false;
  const releaseLock = async () => {
    if (lockReleased) return;
    const { error } = await db.from("dropship_imports").update({ status: "needs_review", updated_at: new Date().toISOString() }).eq("id", item.id).eq("status", "running");
    if (!error) lockReleased = true;
  };

  try {
    // Relire après la réservation : une requête arrivée en retard doit retrouver l'image déjà créée,
    // et non relancer un second appel OpenAI à partir de son instantané initial.
    const { data: fresh, error: freshError } = await db.from("dropship_imports").select("id,status,rights_confirmed,images,extracted,updated_at").eq("id", item.id).maybeSingle() as { data: ImportRow | null; error: unknown };
    if (freshError || !fresh || fresh.status !== "running" || !fresh.rights_confirmed) return fail("L'import a changé d'état pendant sa réservation.", 409);
    const currentImages = getImages(fresh.images);
    const alreadyGenerated = premiumImage(currentImages);
    if (alreadyGenerated?.url) {
      await releaseLock();
      return NextResponse.json({ url: alreadyGenerated.url, existing: true });
    }
    const source = currentImages.find((image) => image.kind === "source" && typeof image.url === "string");
    if (!source?.url) return fail("Aucune image fournisseur publique et vérifiée n'est disponible.", 422);

    try {
      const checked = await safeFetch(source.url, { method: "HEAD", timeoutMs: 6000, totalTimeoutMs: 9000, maxRedirects: 3, httpsOnly: true });
      const type = (checked.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const imageBytes = Number(checked.headers["content-length"] ?? "");
      if (checked.status < 200 || checked.status >= 300 || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type) || !Number.isSafeInteger(imageBytes) || imageBytes <= 0 || imageBytes > 8 * 1024 * 1024) {
        return fail("L'image source n'est plus vérifiable ou dépasse 8 Mo; aucune retouche n'a été lancée.", 422);
      }
      source.url = checked.url;
    } catch (error) {
      return fail(error instanceof FetchRefused ? "La source image a été refusée par le contrôle de sécurité." : "La source image n'est pas accessible publiquement.", 422);
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(110_000),
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-image-1.5",
          images: [{ image_url: source.url }],
          prompt: "Create one premium, photorealistic e-commerce studio photograph of the exact physical product shown in the reference image. Keep the product itself faithful: do not change its shape, dimensions, materials, color, number of pieces, labels, marks, packaging, text, brand or safety information. Do not add accessories, logos, claims, certifications, ingredients or parts. Place it alone on a clean softly lit neutral white background with realistic shadows, centered, square composition, no extra text. If exact fidelity cannot be maintained, preserve the source appearance rather than embellishing it.",
          quality: "medium",
          size: "1024x1024",
          output_format: "webp",
          output_compression: 85,
        }),
      });
    } catch {
      await db.from("ai_runs").insert({ agent: "catalogue-image", key_id: key.id, key_label: key.label, ok: false, attempts: 1, latency_ms: Date.now() - started, error: "Réseau ou délai dépassé" });
      return fail("Le service d'image ne répond pas; réessayez plus tard. Aucun produit n'a été publié.", 502);
    }

    const raw = await response.text().catch(() => "");
    let output: { data?: { b64_json?: string }[]; error?: { message?: string; type?: string } } = {};
    try { output = JSON.parse(raw); } catch { /* réponse fournisseur illisible */ }
    if (!response.ok || !output.data?.[0]?.b64_json) {
      const classification = classifyFailure(response.status, Number(response.headers.get("retry-after")) || null, output.error?.type ?? "");
      const message = scrub(`Génération d'image refusée (${response.status})`).slice(0, 160);
      const update: Record<string, unknown> = { last_error: message, fail_count: key.fail_count + 1 };
      if (classification.disable) update.enabled = false;
      if (classification.cooldownSec) update.cooldown_until = new Date(Date.now() + classification.cooldownSec * 1000).toISOString();
      await db.from("ai_keys").update(update).eq("id", key.id);
      await db.from("ai_runs").insert({ agent: "catalogue-image", key_id: key.id, key_label: key.label, ok: false, attempts: 1, latency_ms: Date.now() - started, error: message });
      return fail("OpenAI n'a pas généré l'image. Vérifiez la clé, son accès à la génération d'images et son quota.", response.status === 429 ? 429 : 502);
    }

    const bytes = Buffer.from(output.data[0].b64_json, "base64");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
      await db.from("ai_runs").insert({ agent: "catalogue-image", key_id: key.id, key_label: key.label, ok: false, attempts: 1, latency_ms: Date.now() - started, error: "Image retournée invalide ou trop volumineuse" });
      return fail("Le fichier produit par OpenAI est invalide ou dépasse la limite du stockage.", 502);
    }

    const path = `dropshipping/${item.id}/premium.webp`;
    const { error: uploadError } = await db.storage.from("media").upload(path, bytes, { contentType: "image/webp", cacheControl: "3600", upsert: true });
    if (uploadError) {
      await db.from("ai_runs").insert({ agent: "catalogue-image", key_id: key.id, key_label: key.label, ok: false, attempts: 1, latency_ms: Date.now() - started, error: "Échec du stockage média" });
      return fail("Image générée mais impossible à enregistrer dans le stockage média.", 502);
    }
    uploadedPath = path;
    const url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
    const premium = { url, alt: `Photo produit générée par IA : ${String(fresh.extracted?.product_name ?? "produit").slice(0, 150)}`, credit: "Image générée par IA à partir de la source fournisseur; vérifier sa fidélité avant publication.", kind: "premium", rights_confirmed: true };
    const nextImages = [...currentImages.filter((image) => image.kind !== "premium"), premium];
    const extracted = { ...(fresh.extracted ?? {}), premium_image_url: url, image_generated_at: new Date().toISOString() };
    const { data: updated, error: updateError } = await db.from("dropship_imports").update({ images: nextImages, extracted, status: "needs_review", updated_at: new Date().toISOString() }).eq("id", item.id).eq("status", "running").select("id").maybeSingle();
    if (updateError) {
      const { data: persisted } = await db.from("dropship_imports").select("status,images").eq("id", item.id).maybeSingle();
      const persistedImage = getImages(persisted?.images).find((image) => image.kind === "premium" && image.url === url);
      if (!persistedImage) {
        uploadedPath = null; // résultat incertain : ne pas supprimer une image possiblement déjà référencée
        return fail("La sauvegarde de l'image est incertaine; vérifiez l'import avant toute nouvelle tentative.", 503);
      }
      imageSaved = true;
      lockReleased = persisted?.status !== "running";
    } else if (!updated) {
      return fail("L'import a changé d'état pendant la génération; l'image temporaire sera supprimée.", 409);
    } else {
      imageSaved = true;
      lockReleased = true;
    }

    const today = new Date().toISOString().slice(0, 10);
    await db.from("ai_keys").update({ used_day: today, used_today: (key.used_day === today ? key.used_today : 0) + 1, fail_count: 0, last_error: null, last_ok_at: new Date().toISOString(), cooldown_until: null }).eq("id", key.id);
    await db.from("ai_runs").insert({ agent: "catalogue-image", key_id: key.id, key_label: key.label, ok: true, attempts: 1, latency_ms: Date.now() - started });
    return NextResponse.json({ url });
  } finally {
    if (uploadedPath && !imageSaved) {
      try { await db.storage.from("media").remove([uploadedPath]); } catch { /* un objet orphelin est préférable à un échec de réponse */ }
    }
    if (!lockReleased) {
      try { await releaseLock(); } catch { /* un verrou ancien sera récupérable après cinq minutes */ }
    }
  }
}
