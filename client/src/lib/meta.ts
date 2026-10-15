import { useEffect } from "react";
import { portfolioExamples } from "@/data/portfolio-examples";

const knownExample = (pathname: string) => {
  const slug = pathname.match(/^\/exemples\/([^/]+)$/)?.[1];
  return slug ? portfolioExamples.some(example => example.slug === slug) : false;
};

function upsertMeta(selector: string, create: () => HTMLElement, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLElement>(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    upsertMeta('meta[name="description"]', () => {
      const item = document.createElement("meta");
      item.name = "description";
      return item;
    }, "content", description);
    upsertMeta('meta[property="og:title"]', () => {
      const item = document.createElement("meta");
      item.setAttribute("property", "og:title");
      return item;
    }, "content", title);
    upsertMeta('meta[property="og:description"]', () => {
      const item = document.createElement("meta");
      item.setAttribute("property", "og:description");
      return item;
    }, "content", description);

    const pathname = window.location.pathname;
    const isPrivate = pathname === "/admin" || pathname === "/paiement/retour" || pathname.startsWith("/demos/") || pathname.startsWith("/mentions-legales") || pathname.startsWith("/confidentialite") || pathname.startsWith("/conditions-generales");
    const knownPublic = pathname === "/" || pathname === "/portfolio" || pathname === "/boutique" || knownExample(pathname) || pathname.startsWith("/produits/");
    upsertMeta('meta[name="robots"]', () => {
      const item = document.createElement("meta");
      item.name = "robots";
      return item;
    }, "content", isPrivate || !knownPublic ? "noindex,follow" : "index,follow");
    upsertMeta('meta[property="og:type"]', () => {
      const item = document.createElement("meta");
      item.setAttribute("property", "og:type");
      return item;
    }, "content", pathname.startsWith("/produits/") ? "product" : "website");
    upsertMeta('meta[name="twitter:card"]', () => {
      const item = document.createElement("meta");
      item.name = "twitter:card";
      return item;
    }, "content", "summary");

    // A stable public origin is not configured yet. Do not canonicalize to Preview or an inferred Host.
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
    document.head.querySelector('meta[property="og:image"]')?.remove();
    document.head.querySelector('meta[name="twitter:image"]')?.remove();
  }, [title, description]);
}
