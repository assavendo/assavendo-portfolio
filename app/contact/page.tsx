import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
export const metadata: Metadata = { title: "Contact", description: "Décrivez votre projet ou votre problème web : Assavendo vous répond personnellement.", alternates: { canonical: "/contact" } };
export default async function Contact({ searchParams }: { searchParams: Promise<{ sujet?: string }> }) {
  const { sujet } = await searchParams;
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)" }}>Décrivez votre besoin</h1>
      <p className="muted">Quelques phrases suffisent : ce que vous observez, ce que cela vous coûte, ce que vous espérez. Nous répondons sous deux jours ouvrés.</p>
      <ContactForm defaultMessage={sujet ? `Sujet : ${sujet.slice(0, 160)}\n\n` : ""} />
    </div></div>
  );
}
