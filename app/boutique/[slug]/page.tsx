import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getProductStats, getPublishedProducts } from "@/lib/data";
import { visitorId } from "@/lib/visitor";
import { supabaseAdmin } from "@/lib/supabase/server";
import { eur } from "@/lib/types";
import { siteUrl } from "@/lib/env";
import { ActionsBar, Comments, ReviewForm, Reviews } from "@/components/ProductSocial";
import { AddToCart } from "@/components/AddToCart";
import { breadcrumb, getBrands, getCategories, getVariants } from "@/lib/catalog";
import { isAvailable } from "@/lib/search";
import Link from "next/link";
import { currentCustomer } from "@/lib/customer";
import { toggleFavorite } from "@/app/actions/account";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const p = (await getPublishedProducts()).find((x) => x.slug === slug); if (!p) return {};
  return { title: p.title, description: p.summary, alternates: { canonical: `/boutique/${p.slug}` }, openGraph: { images: p.images[0]?.url ? [p.images[0].url] : undefined } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ panier?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const p = (await getPublishedProducts()).find((x) => x.slug === slug); if (!p) notFound();
  const stats = await getProductStats(p.id);
  const [allVariants, cats, brands] = await Promise.all([getVariants(), getCategories(), getBrands()]);
  const variants = allVariants.filter((v) => v.product_id === p.id);
  const cat = cats.find((c) => c.id === p.category_id) ?? null; const crumbs = breadcrumb(cats, cat); const brand = brands.find((b) => b.id === p.brand_id);
  const available = isAvailable(p, variants);
  const cust = await currentCustomer();
  const isFav = cust ? Boolean((await cust.sb.from("favorites").select("product_id").eq("user_id", cust.user.id).eq("product_id", p.id).maybeSingle()).data) : false;
  const attrDefs = [...(cat?.attributes ?? []), ...(cat?.parent_id ? cats.find((c) => c.id === cat.parent_id)?.attributes ?? [] : [])];
  const attrRows = attrDefs.filter((a) => p.attributes?.[a.key] !== undefined && p.attributes[a.key] !== "").map((a) => ({ label: a.label, value: typeof p.attributes![a.key] === "boolean" ? (p.attributes![a.key] ? "Oui" : "Non") : `${p.attributes![a.key]}${a.unit ? ` ${a.unit}` : ""}` }));
  const old = p.compare_at_cents && p.compare_at_cents > p.price_cents ? p.compare_at_cents : null;
  const delivery = p.kind === "digital" ? "Téléchargement immédiat après confirmation du paiement" : p.kind === "physical" && p.delivery_min_days != null && p.delivery_max_days != null ? `Livraison en ${p.delivery_min_days === p.delivery_max_days ? p.delivery_min_days : `${p.delivery_min_days} à ${p.delivery_max_days}`} jour${p.delivery_max_days > 1 ? "s" : ""}${p.shipping_cents ? ` · ${eur(p.shipping_cents)}` : " · livraison offerte"}` : null;
  const vid = await visitorId(false);
  let liked = false;
  if (vid && process.env.SUPABASE_SECRET_KEY) { const { data } = await supabaseAdmin().from("product_likes").select("product_id").eq("product_id", p.id).eq("visitor_id", vid).maybeSingle(); liked = !!data; }
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.title, ...(brand ? { brand: { "@type": "Brand", name: brand.name } } : {}), ...(p.sku ? { sku: p.sku } : {}), ...(p.gtin ? { gtin: p.gtin } : {}), description: p.summary, image: p.images.map((i) => i.url), offers: { "@type": "Offer", priceCurrency: "EUR", price: (p.price_cents / 100).toFixed(2), availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${siteUrl}/boutique/${p.slug}` }, /* Pas d'aggregateRating : les avis ne sont pas des achats vérifiés de façon exploitable par les moteurs de recherche. */ };
  return (
    <div className="section"><div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <nav className="crumbs" aria-label="Fil d'Ariane"><ol><li><Link href="/">Accueil</Link></li><li><Link href="/boutique">Boutique</Link></li>{crumbs.map((c) => <li key={c.id}><Link href={`/categorie/${c.slug}`}>{c.name}</Link></li>)}<li><span aria-current="page">{p.title}</span></li></ol></nav>
      <div className="p-hero" style={{ alignItems: "start" }}>
        <div className="gallery">
          <div className="main">{p.images[0] ? <Image src={p.images[0].url} alt={p.images[0].alt || p.title} fill sizes="(max-width: 900px) 100vw, 560px" priority unoptimized style={{ objectFit: "contain", objectPosition: "center" }} /> : <div className="cover-fallback" aria-hidden="true">{p.title}</div>}</div>
          {p.images.length > 1 ? <div className="thumbs">{p.images.slice(1, 6).map((i) => <Image key={i.url} src={i.url} alt={i.alt || p.title} width={76} height={43} unoptimized style={{ objectFit: "contain" }} />)}</div> : null}
        </div>
        <div>
          <h1 style={{ fontSize: "clamp(1.9rem,3.6vw,2.8rem)" }}>{p.title}</h1>
          <p>{p.summary}</p>
          {stats.reviews ? <p><span className="stars" aria-hidden="true">★</span> <strong>{stats.rating.toFixed(1)}</strong> <span className="muted">({stats.reviews} avis{stats.verifiedReviews ? `, dont ${stats.verifiedReviews} d'acheteurs` : ""})</span></p> : null}
          {brand ? <p className="muted small">Marque : {brand.name}</p> : null}
          <p className="price">{p.price_cents ? eur(p.price_cents) : "Gratuit"}{old ? <> <s className="price-old"><span className="sr-only">Ancien prix </span>{eur(old)}</s></> : null}</p>
          {!available ? <p className="stock out" role="status">Épuisé</p> : null}
          <ul className="plain facts">{delivery ? <li>{delivery}</li> : null}{p.kind === "physical" && p.return_days ? <li>Retour possible sous {p.return_days} jours</li> : null}{p.warranty_months ? <li>Garantie {p.warranty_months} mois</li> : null}{p.origin_country ? <li>Origine : {p.origin_country}</li> : null}{p.sku ? <li>Référence : {p.sku}</li> : null}</ul>
          <AddToCart p={p} variants={variants} slug={p.slug} notice={sp.panier} />
          <form action={toggleFavorite} style={{ marginTop: ".6rem" }}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="back" value={`/boutique/${p.slug}`} /><button className="btn btn-ghost btn-sm" type="submit" aria-pressed={isFav}>{isFav ? "♥ Dans mes favoris" : "♡ Ajouter aux favoris"}</button></form>
          {p.demo_url ? <p style={{ marginTop: "1rem" }}><a className="btn btn-ghost" href={p.demo_url} target="_blank" rel="noopener noreferrer">Essayer la démonstration</a></p> : null}
          <ActionsBar productId={p.id} slug={p.slug} title={p.title} likes={stats.likes} shares={stats.shares} liked={liked} />
        </div>
      </div>
      <div className="p-layout" style={{ marginTop: "3rem" }}>
        <div>
          {p.description ? <section className="block"><h2>Description</h2>{p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</section> : null}
          {attrRows.length ? <section className="block"><h2>Caractéristiques</h2><table className="tbl"><tbody>{attrRows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}{p.weight_g ? <tr><th scope="row">Poids</th><td>{p.weight_g} g</td></tr> : null}</tbody></table></section> : null}
          {p.features.length ? <section className="block"><h2>Ce qui est inclus</h2><ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul></section> : null}
          {p.allow_reviews ? <section className="block" id="avis"><h2>Avis{stats.reviews ? ` (${stats.reviews})` : ""}</h2><Reviews stats={stats} /><h3 style={{ marginTop: "1.5rem" }}>Donner votre avis</h3><ReviewForm productId={p.id} /></section> : null}
          <section className="block" id="commentaires"><h2>Questions et commentaires</h2><Comments stats={stats} productId={p.id} slug={p.slug} allow={p.allow_comments} /></section>
        </div>
      </div>
    </div></div>
  );
}
