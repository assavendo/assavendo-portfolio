import Image from "next/image";
import Link from "next/link";
import { eur, type Product, type Variant } from "@/lib/types";
import { isAvailable } from "@/lib/search";
import { priceFrom } from "@/lib/catalog";

export const KIND_LABEL = { physical: "Produit physique", digital: "Téléchargement", service: "Service" } as const;

export function ProductCard({ p, variants = [] }: { p: Product; variants?: Variant[] }) {
  const mine = variants.filter((v) => v.product_id === p.id);
  const ok = isAvailable(p, mine);
  const { cents, from } = priceFrom(p, mine);
  const old = p.compare_at_cents && p.compare_at_cents > cents ? p.compare_at_cents : null;
  const pct = old ? Math.round((1 - cents / old) * 100) : 0;
  const left = p.kind === "physical" && p.track_stock ? (mine.length ? mine.reduce((s, v) => s + v.stock_qty, 0) : p.stock_qty ?? 0) : null;
  return (
    <article className={`card pcard${ok ? "" : " is-out"}`}>
      <div className="card-media">
        {p.images[0] ? <Image src={p.images[0].url} alt={p.images[0].alt || p.title} fill sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 280px" unoptimized /> : <div className="cover-fallback" aria-hidden="true">{p.title}</div>}
        {old && ok ? <span className="tag tag-promo">−{pct} %</span> : null}
      </div>
      <div className="card-body">
        <p className="pcard-kind">{KIND_LABEL[p.kind]}</p>
        <h3><Link href={`/boutique/${p.slug}`}>{p.title}</Link></h3>
        <div className="card-foot">
          <span className="price">{from ? "À partir de " : ""}{cents ? eur(cents) : "Gratuit"}</span>
          {old ? <s className="price-old"><span className="sr-only">Ancien prix </span>{eur(old)}</s> : null}
        </div>
        {!ok ? <p className="stock out">Épuisé</p> : left !== null && left > 0 && left <= (p.low_stock_threshold ?? 3) ? <p className="stock low">Plus que {left} en stock</p> : null}
      </div>
    </article>
  );
}
