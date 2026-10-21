import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileCta } from "@/components/MobileCta";
import { siteUrl } from "@/lib/env";

// Pas de canonique ici : chaque page déclare la sienne (une canonique héritée enverrait toutes les pages vers l'accueil).
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Assavendo — Solutions web concrètes pour les problèmes réels des entreprises", template: "%s — Assavendo" },
  description: "Assavendo résout les problèmes web qui coûtent des clients : sites lents ou invisibles, paiements, sécurité, automatisation, données. Testez nos outils directement en ligne.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "Assavendo" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f6f9" }, { media: "(prefers-color-scheme: dark)", color: "#09141d" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="skip" href="#contenu">Aller au contenu</a>
        <Header />
        <main id="contenu">{children}</main>
        <Footer />
        <MobileCta />
      </body>
    </html>
  );
}
