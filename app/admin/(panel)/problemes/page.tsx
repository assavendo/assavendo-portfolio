import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { ProblemForm } from "@/components/admin/ProblemForm";
import { toolKeys } from "@/lib/tool-keys";
import { deleteProblem } from "@/app/actions/admin";
import type { Domain, Problem } from "@/lib/types";

export default async function Problemes({ searchParams }: { searchParams: Promise<{ id?: string; statut?: string; cree?: string }> }) {
  const { sb } = await requireAdmin(); const sp = await searchParams;
  const { data: domains } = await sb.from("domains").select("*").order("sort");
  if (sp.id) {
    const p = sp.id === "nouveau" ? null : ((await sb.from("problems").select("*").eq("id", sp.id).maybeSingle()).data as Problem | null);
    return <div><p><Link href="/admin/problemes">← Retour à la liste</Link></p><h1 style={{ fontSize: "1.8rem" }}>{p ? "Modifier le problème" : "Nouveau problème"}</h1>
      <div className="panel"><ProblemForm p={p} domains={(domains ?? []) as Domain[]} tools={[...toolKeys]} cree={sp.cree === "1"} /></div>
      {p ? <form action={deleteProblem}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm">Supprimer définitivement</button></form> : null}</div>;
  }
  let q = sb.from("problems").select("id, title, status, format, tool_key, domains(name)").order("sort"); if (sp.statut) q = q.eq("status", sp.statut);
  const { data } = await q;
  return <div><div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}><h1 style={{ fontSize: "1.8rem", margin: 0 }}>Problèmes</h1><Link className="btn btn-primary" href="/admin/problemes?id=nouveau">Ajouter un problème</Link></div>
    <p>Filtrer : <Link href="/admin/problemes">tous</Link> · <Link href="/admin/problemes?statut=draft">brouillons</Link> · <Link href="/admin/problemes?statut=published">publiés</Link></p>
    <div className="table-scroll"><table className="tbl"><thead><tr><th>Titre</th><th>Domaine</th><th>Contenu</th><th>Statut</th></tr></thead><tbody>
      {(data ?? []).map((r: any) => <tr key={r.id}><td><Link href={`/admin/problemes?id=${r.id}`}>{r.title}</Link></td><td>{r.domains?.name ?? "—"}</td><td>{r.format === "tool" ? `Outil : ${r.tool_key}` : "Explication"}</td><td><span className={`status s-${r.status}`}>{({ draft: "Brouillon", published: "Publié", archived: "Archivé" } as any)[r.status]}</span></td></tr>)}
    </tbody></table></div></div>;
}
