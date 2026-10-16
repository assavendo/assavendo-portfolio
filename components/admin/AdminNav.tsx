"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items = [["/admin", "Tableau de bord"], ["/admin/problemes", "Problèmes"], ["/admin/produits", "Produits"], ["/admin/moderation", "Modération"], ["/admin/messages", "Messages"], ["/admin/commandes", "Commandes"]];
export function AdminNav() {
  const p = usePathname();
  return <nav aria-label="Administration">{items.map(([href, label]) => <Link key={href} href={href} aria-current={(href === "/admin" ? p === href : p.startsWith(href)) ? "page" : undefined}>{label}</Link>)}</nav>;
}
