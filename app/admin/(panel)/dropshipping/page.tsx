import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SupplierImportForm } from "@/components/admin/SupplierImportForm";

export const dynamic = "force-dynamic";

export default async function Dropshipping({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { data, error } = await supabaseAdmin()
    .from("dropship_imports")
    .select("id,supplier_url,product_query,operator_prompt,status,images,extracted,error,product_id,created_at,updated_at,archived_at,decided_at")
    .order("created_at", { ascending: false })
    .limit(60);

  return <div>
    {sp.ok ? <p className="alert alert-ok" role="status">{sp.ok}</p> : null}
    {sp.erreur ? <p className="alert alert-err" role="alert">{sp.erreur}</p> : null}
    {error ? <p className="alert alert-err" role="alert">Lecture des imports fournisseur impossible.</p> : null}
    <SupplierImportForm imports={(data ?? []) as never} />
  </div>;
}
