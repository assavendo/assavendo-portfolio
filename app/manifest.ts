import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Assavendo", short_name: "Assavendo", description: "Solutions web concrètes pour les problèmes réels des entreprises.", start_url: "/", display: "standalone", background_color: "#09141d", theme_color: "#0b3c5d", lang: "fr", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
