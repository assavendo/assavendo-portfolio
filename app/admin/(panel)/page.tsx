import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
export default async function Dashboard() {
  const { sb } = await requireAdmin();
  const count = async (t: string, f?: (q: any) => any) => { let q: any = sb.from(t).select("*", { count: "exact", head: true }); if (f) q = f(q); return (await q).count ?? 0; };
  const [pub, drafts, products, pendingC, pendingR, newMsg, paid] = await Promise.all([
    count("problems", (q) => q.eq("status", "published")), count("problems", (q) => q.eq("status", "draft")), count("products", (q) => q.eq("status", "published")),
    count("product_comments", (q) => q.eq("status", "pending")), count("product_reviews", (q) => q.eq("status", "pending")), count("contact_messages", (q) => q.eq("status", "new")), count("orders", (q) => q.eq("status", "paid")),
  ]);
  const k = (label: string, n: number, href: string) => <Link href={href} className="kpi" style={{ textDecoration: "none", color: "inherit" }}><b>{n}</b><small>{label}</small></Link>;
  return <div><h1 style={{ fontSize: "2rem" }}>Tableau de bord</h1>
    <div className="kpis">{k("problèmes publiés", pub, "/admin/problemes")}{k("brouillons à rédiger", drafts, "/admin/problemes")}{k("produits publiés", products, "/admin/produits")}{k("à modérer", pendingC + pendingR, "/admin/moderation")}{k("nouveaux messages", newMsg, "/admin/messages")}{k("commandes payées", paid, "/admin/commandes")}</div></div>;
}
