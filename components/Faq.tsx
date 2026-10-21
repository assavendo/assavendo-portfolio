import { faq } from "@/lib/site-content";

/** FAQ accessible (details/summary natifs) + données structurées strictement identiques au texte visible. */
export function Faq({ limit }: { limit?: number }) {
  const items = limit ? faq.slice(0, limit) : faq;
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <div className="faq">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      {items.map((f) => <details key={f.q}><summary>{f.q}</summary><div className="answer"><p>{f.a}</p></div></details>)}
    </div>
  );
}
