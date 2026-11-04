"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Lien « Panier » avec le nombre d'articles (cookie lisible, sans donnée sensible) : les pages restent statiques. */
export function CartLink() {
  const path = usePathname(); const [n, setN] = useState(0);
  useEffect(() => { const m = document.cookie.match(/(?:^|; )av_cart_n=(\d+)/); setN(m ? Number(m[1]) : 0); }, [path]);
  return <Link href="/panier" className="cart-link" aria-current={path === "/panier" ? "page" : undefined}>Panier{n > 0 ? <span className="cart-badge" aria-label={`${n} article${n > 1 ? "s" : ""}`}>{n}</span> : null}</Link>;
}
