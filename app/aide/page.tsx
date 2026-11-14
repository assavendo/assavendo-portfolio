import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedHelpArticles } from "@/lib/help";
import { SupportTicketForm } from "@/components/SupportTicketForm";

export const metadata: Metadata = { title: "Centre d'aide", description: "Base de connaissances, suivi de commande et support Assavendo.", alternates: { canonical: "/aide" } };
export const dynamic = "force-dynamic";

export default async function Aide({ searchParams }: { searchParams: Promise<{ recherche?: string }> }) {
  const { recherche } = await searchParams;
  const articles = await getPublishedHelpArticles();
  const query = String(recherche ?? "").trim().toLocaleLowerCase("fr-FR");
  const filtered = query ? articles.filter((a) => [a.title, a.summary, a.category, a.content].join(" ").toLocaleLowerCase("fr-FR").includes(query)) : articles;
  const groups = filtered.reduce<Record<string, typeof articles>>((acc, article) => {
    (acc[article.category] ||= []).push(article);
    return acc;
  }, {});

  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 1040 }}>
      <h1 style={{ fontSize:"clamp(2rem,4vw,3rem)" }}>Centre d'aide</h1>
      <p className="muted">Base de connaissances, réponses pratiques et support sécurisé. Vous pouvez consulter un article ou ouvrir un ticket sans mot de passe.</p>
      <form className="panel" method="get" style={{ display:"flex", gap:".6rem", flexWrap:"wrap", alignItems:"end", marginTop:"1.2rem" }}>
        <label className="field" style={{ flex:"1 1 24rem" }}>Rechercher<input className="input" name="recherche" defaultValue={recherche ?? ""} placeholder="commande, paiement, livraison…" /></label>
        <button className="btn btn-ghost">Rechercher</button>
        {query ? <Link className="btn btn-ghost" href="/aide">Effacer</Link> : null}
      </form>
      {!filtered.length ? <p className="panel">Aucun article ne correspond à votre recherche. <a href="#ticket">Ouvrir un ticket</a>.</p> : null}
      {Object.entries(groups).map(([category, items]) => <section key={category} style={{ marginTop:"1.8rem" }}>
        <h2 style={{ fontSize:"1.35rem" }}>{category}</h2>
        <div style={{ display:"grid", gap:".8rem", gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))" }}>
          {items.map((article) => <article className="panel" key={article.id}>
            <span className="eyebrow">{article.category}</span>
            <h3 style={{ margin:".35rem 0" }}><Link href={`/aide/${article.slug}`}>{article.title}</Link></h3>
            <p className="muted">{article.summary}</p>
            <Link href={`/aide/${article.slug}`}>Lire la réponse →</Link>
          </article>)}
        </div>
      </section>)}
      <section id="ticket" className="panel" style={{ marginTop:"2.5rem" }}>
        <h2 style={{ fontSize:"1.35rem" }}>Ouvrir un ticket</h2>
        <p className="muted">Votre ticket est protégé par un jeton aléatoire personnel, haché côté serveur. Pour une demande concernant une commande, indiquez son numéro si vous l'avez.</p>
        <SupportTicketForm />
      </section>
    </div></div>
  );
}
