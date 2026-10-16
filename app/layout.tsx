import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Assavendo — Solutions web concrètes pour les problèmes réels des entreprises", template: "%s — Assavendo" },
  description: "Assavendo résout les problèmes web qui coûtent des clients : sites lents ou invisibles, paiements, sécurité, automatisation, données. Testez nos outils directement en ligne.",
  openGraph: { type: "website", locale: "fr_FR", siteName: "Assavendo" },
  alternates: { canonical: "/" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3c5d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="skip" href="#contenu">Aller au contenu</a>
        <Header />
        <main id="contenu">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
