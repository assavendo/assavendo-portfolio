import type { Metadata } from "next";
import Link from "next/link";
import { steps } from "@/lib/site-content";
import { Faq } from "@/components/Faq";

export const metadata: Metadata = { title: "Méthode et questions fréquentes", description: "Comment Assavendo travaille : diagnostic mesuré, proposition écrite, réalisation par ordre d'impact, validation. Réponses aux questions sur les délais, le budget, les accès et la confidentialité.", alternates: { canonical: "/methode" } };

export default function Methode() {
  return (
    <div className="section"><div className="wrap">
      <div className="section-head"><p className="eyebrow">Méthode</p><h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Mesurer avant d'agir, prouver après</h1>
        <p className="lede">Nous partons de ce que vous observez, nous le vérifions avec des mesures, puis nous corrigeons dans l'ordre d'impact. Ce que nous ne pouvons pas démontrer, nous ne l'affirmons pas.</p></div>
      <ol className="steps">{steps.map((s) => <li key={s.title}><h2 style={{ fontSize: "1.22rem" }}>{s.title}</h2><p>{s.text}</p></li>)}</ol>
      <section className="section-tight" style={{ marginTop: "3rem" }} aria-labelledby="principes">
        <h2 id="principes">Nos principes</h2>
        <ul className="deliverables" style={{ maxWidth: 900 }}>
          <li>Aucun témoignage, note, logo ou chiffre inventé : une preuve qui n'existe pas encore n'est pas affichée.</li>
          <li>Un outil n'est annoncé que s'il fonctionne réellement sur la page où il est proposé.</li>
          <li>Les résultats attendus sont des objectifs vérifiables, jamais des promesses de ventes ou de classement.</li>
          <li>Les limites de chaque outil et de chaque mesure sont affichées avec le résultat.</li>
        </ul>
      </section>
      <section className="section-tight" id="questions" aria-labelledby="faq-titre" style={{ marginTop: "2rem" }}>
        <h2 id="faq-titre">Questions fréquentes</h2><Faq />
      </section>
      <div className="cta-band" style={{ marginTop: "3rem" }}>
        <div><h2>Une autre question ?</h2><p>Écrivez-nous : la réponse est personnelle, sous deux jours ouvrés.</p></div>
        <Link className="btn btn-signal btn-lg" href="/contact">Nous écrire</Link>
      </div>
    </div></div>
  );
}
