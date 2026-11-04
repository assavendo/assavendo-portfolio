import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileCta } from "@/components/MobileCta";
import { siteUrl } from "@/lib/env";
import { getCategories } from "@/lib/catalog";

// Pas de canonique ici : chaque page déclare la sienne (une canonique héritée enverrait toutes les pages vers l'accueil).
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Assavendo — Boutique en ligne et services web", template: "%s — Assavendo" },
  description: "La boutique Assavendo : produits physiques et numériques, paiement sécurisé, informations claires. Et, pour les entreprises, des services web sur devis.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "Assavendo" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f6f9" }, { media: "(prefers-color-scheme: dark)", color: "#09141d" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const families = (await getCategories()).filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort).map((c) => ({ slug: c.slug, name: c.name }));
  return (
    <html lang="fr">
      <body>
        <a className="skip" href="#contenu">Aller au contenu</a>
        <Header families={families} />
        <main id="contenu">{children}</main>
        <Footer />
        <MobileCta />
      </body>
    </html>
  );
}
