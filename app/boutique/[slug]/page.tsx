import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getProductStats, getPublishedProducts } from "@/lib/data";
import { visitorId } from "@/lib/visitor";
import { supabaseAdmin } from "@/lib/supabase/server";
import { eur } from "@/lib/types";
import { siteUrl } from "@/lib/env";
import { ActionsBar, Comments, ReviewForm, Reviews } from "@/components/ProductSocial";
import { BuyForm } from "@/components/BuyForm";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const p = (await getPublishedProducts()).find((x) => x.slug === slug); if (!p) return {};
  return { title: p.title, description: p.summary, alternates: { canonical: `/boutique/${p.slug}` }, openGraph: { images: p.images[0]?.url ? [p.images[0].url] : undefined } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ paiement?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const p = (await getPublishedProducts()).find((x) => x.slug === slug); if (!p) notFound();
  const stats = await getProductStats(p.id);
  const vid = await visitorId(false);
  let liked = false;
  if (vid && process.env.SUPABASE_SECRET_KEY) { const { data } = await supabaseAdmin().from("product_likes").select("product_id").eq("product_id", p.id).eq("visitor_id", vid).maybeSingle(); liked = !!data; }
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.title, description: p.summary, image: p.images.map((i) => i.url), offers: { "@type": "Offer", priceCurrency: "EUR", price: (p.price_cents / 100).toFixed(2), availability: "https://schema.org/InStock", url: `${siteUrl}/boutique/${p.slug}` }, /* Pas d'aggregateRating : les avis ne sont pas des achats vérifiés de façon exploitable par les moteurs de recherche. */ };
  return (
    <div className="section"><div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div className="p-hero" style={{ alignItems: "start" }}>
        <div className="gallery">
          <div className="main">{p.images[0] ? <Image src={p.images[0].url} alt={p.images[0].alt || p.title} fill sizes="(max-width: 900px) 100vw, 560px" priority unoptimized style={{ objectFit: "contain", objectPosition: "center" }} /> : <div className="cover-fallback" aria-hidden="true">{p.title}</div>}</div>
          {p.images.length > 1 ? <div className="thumbs">{p.images.slice(1, 6).map((i) => <Image key={i.url} src={i.url} alt={i.alt || p.title} width={76} height={43} unoptimized style={{ objectFit: "contain" }} />)}</div> : null}
        </div>
        <div>
          <h1 style={{ fontSize: "clamp(1.9rem,3.6vw,2.8rem)" }}>{p.title}</h1>
          <p>{p.summary}</p>
          {stats.reviews ? <p><span className="stars" aria-hidden="true">★</span> <strong>{stats.rating.toFixed(1)}</strong> <span className="muted">({stats.reviews} avis{stats.verifiedReviews ? `, dont ${stats.verifiedReviews} d'acheteurs` : ""})</span></p> : null}
          <p className="price">{p.price_cents ? eur(p.price_cents) : "Gratuit"}</p>
          {sp.paiement === "annule" ? <p className="alert alert-err" role="status">Paiement annulé : aucun montant n'a été prélevé.</p> : null}
          {p.price_cents === 0 || p.price_cents >= 50 ? <BuyForm productId={p.id} kind={p.kind} free={p.price_cents === 0} label={p.price_cents === 0 ? "Recevoir gratuitement" : `Acheter · ${eur(p.price_cents)}`} /> : <p className="muted">Ce produit n'est pas vendu en ligne : <a href="/contact">contactez-nous</a>.</p>}
          {p.demo_url ? <p style={{ marginTop: "1rem" }}><a className="btn btn-ghost" href={p.demo_url} target="_blank" rel="noopener noreferrer">Essayer la démonstration</a></p> : null}
          <ActionsBar productId={p.id} slug={p.slug} title={p.title} likes={stats.likes} shares={stats.shares} liked={liked} />
        </div>
      </div>
      <div className="p-layout" style={{ marginTop: "3rem" }}>
        <div>
          {p.description ? <section className="block"><h2>Description</h2>{p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</section> : null}
          {p.features.length ? <section className="block"><h2>Ce qui est inclus</h2><ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul></section> : null}
          {p.allow_reviews ? <section className="block" id="avis"><h2>Avis{stats.reviews ? ` (${stats.reviews})` : ""}</h2><Reviews stats={stats} /><h3 style={{ marginTop: "1.5rem" }}>Donner votre avis</h3><ReviewForm productId={p.id} /></section> : null}
          <section className="block" id="commentaires"><h2>Questions et commentaires</h2><Comments stats={stats} productId={p.id} slug={p.slug} allow={p.allow_comments} /></section>
        </div>
      </div>
    </div></div>
  );
}
