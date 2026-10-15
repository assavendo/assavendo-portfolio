import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Heart, MessageCircle, Share2, ShoppingBag, Star } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { SiteShell } from "@/components/SiteShell";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";

function getVisitorId() {
  const key = "assavendo-visitor-id";
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}
export default function ProductDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [comment, setComment] = useState(""); const [rating, setRating] = useState(5); const [reviewText, setReviewText] = useState("");
  const visitorId = useMemo(() => getVisitorId(), []);
  const utils = trpc.useUtils();
  const query = trpc.product.bySlug.useQuery({ slug, visitorId });
  const checkoutReady = trpc.product.checkoutReady.useQuery();
  const item = query.data?.product;
  usePageMeta(item ? `${item.title} — Boutique Assavendo` : "Produit — Boutique Assavendo", item?.summary ?? "Fiche produit Assavendo.");
  const likeMutation = trpc.product.toggleLike.useMutation({ onSuccess: () => utils.product.bySlug.invalidate({ slug, visitorId }), onError: (error) => toast.error(error.message) });
  const commentMutation = trpc.product.addComment.useMutation({ onSuccess: (result) => { setComment(""); toast.success(result.message); }, onError: (error) => toast.error(error.message) });
  const reviewMutation = trpc.product.addReview.useMutation({ onSuccess: (result) => { setReviewText(""); toast.success(result.message); }, onError: (error) => toast.error(error.message) });
  const checkoutMutation = trpc.product.createCheckout.useMutation({ onError: (error) => toast.error(error.message) });
  const price = useMemo(() => item ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: item.currency || "EUR" }).format(item.priceCents / 100) : "", [item]);
  if (query.isLoading) return <SiteShell><div className="loading-state">Chargement du produit…</div></SiteShell>;
  if (!query.data || !item || query.error) return <SiteShell><div className="empty-state"><ShoppingBag size={28} /><h2>Produit introuvable</h2><p>Cette fiche n’est pas disponible ou n’a pas été publiée.</p><Link className="button button-outline" href="/boutique">Retour à la boutique</Link></div></SiteShell>;
  const stats = query.data.stats;
  const share = async () => { try { if (navigator.share) await navigator.share({ title: item.title, text: item.summary, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); toast.success("Lien copié"); } } catch { /* Annulation volontaire du partage */ } };
  const toggleLike = () => { likeMutation.mutate({ productId: item.id, visitorId }); };
  const buy = () => {
    const checkoutWindow = window.open("about:blank", "_blank");
    if (checkoutWindow) checkoutWindow.opener = null;
    toast.info("Ouverture du paiement sécurisé Stripe…");
    checkoutMutation.mutate({ productId: item.id, email }, { onSuccess: (result) => { if (checkoutWindow && result.url) checkoutWindow.location.href = result.url; else if (result.url) window.location.href = result.url; }, onError: () => checkoutWindow?.close() });
  };
  return <SiteShell><div className="detail-topline"><Link href="/boutique" className="back-link"><ArrowLeft size={16} /> Retour à la boutique</Link><button className="icon-action" onClick={share} aria-label="Partager ce produit"><Share2 size={17} /></button></div>
    <section className="product-detail-grid"><div className="product-detail-image">{item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : <div className="product-placeholder"><span>{item.title.slice(0, 1)}</span><i /><b /></div>}<span className="product-available"><i /> DISPONIBLE</span></div><div className="product-detail-copy"><span className="eyebrow">CRÉATION ASSAVENDO</span><h1>{item.title}</h1><p className="product-summary">{item.summary}</p><div className="product-rating"><span className="stars">{[1,2,3,4,5].map((value) => <Star key={value} size={15} fill={value <= Math.round(stats.rating) ? "currentColor" : "none"} />)}</span><span>{stats.reviews ? `${stats.rating.toFixed(1)} · ${stats.reviews} avis` : "Pas encore d’avis"}</span></div><strong className="product-price">{price}</strong><p className="product-stock-note">{checkoutReady.data?.ready ? "Paiement test sécurisé · La commande est confirmée après validation Stripe." : "Le paiement test sera activé après configuration du webhook Stripe."}</p><div className="checkout-form"><label>E-mail de réception<input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.fr" /></label><button className="button button-primary buy-button" disabled={!email || !email.includes("@") || checkoutMutation.isPending || !checkoutReady.data?.ready} onClick={buy}>{checkoutMutation.isPending ? "Préparation…" : checkoutReady.data?.ready ? "Acheter en toute sécurité" : "Paiement bientôt disponible"}<ArrowRight size={17} /></button></div><div className="product-actions"><button className={`social-button ${stats.liked ? "selected" : ""}`} onClick={toggleLike} disabled={likeMutation.isPending}><Heart size={17} fill={stats.liked ? "currentColor" : "none"} /> {stats.likes} J’aime</button><button className="social-button" onClick={share}><Copy size={16} /> Partager</button><span className="product-type-chip">{item.productType === "digital" ? "Produit numérique" : item.productType === "service" ? "Service" : "Objet physique"}</span></div></div></section>
    <section className="section product-description"><div><span className="eyebrow">À PROPOS DE CETTE CRÉATION</span><h2>Chaque détail compte.</h2></div><div className="description-copy"><p>{item.description}</p>{item.features?.length ? <ul>{item.features.map((feature: string) => <li key={feature}><Check size={15} />{feature}</li>)}</ul> : null}{item.demoUrl ? <a className="text-link" href={item.demoUrl} target={item.demoUrl.startsWith("https://") ? "_blank" : undefined} rel={item.demoUrl.startsWith("https://") ? "noreferrer" : undefined}>Tester la démonstration <ArrowRight size={15} /></a> : null}</div></section>
    <section className="section product-community"><div className="section-heading"><div><span className="eyebrow">VOTRE RETOUR COMPTE</span><h2>Notes & conversations</h2></div><span className="community-count"><Star size={16} /> {stats.reviews} avis · <MessageCircle size={16} /> {stats.comments} commentaires</span></div>
      <div className="community-grid"><form className="community-form" onSubmit={(event) => { event.preventDefault(); reviewMutation.mutate({ productId: item.id, visitorId, name, rating, body: reviewText }); }}><span className="eyebrow">LAISSER UN AVIS</span><label>Votre nom<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="rating-picker"><span>Votre note</span><div>{[1,2,3,4,5].map((value) => <button type="button" key={value} aria-label={`${value} étoiles`} onClick={() => setRating(value)}><Star size={19} fill={value <= rating ? "currentColor" : "none"} /></button>)}</div></div><label>Votre avis<textarea required minLength={10} maxLength={1500} rows={4} value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Qu’avez-vous pensé de cette création ?" /></label><button className="button button-outline" type="submit" disabled={reviewMutation.isPending}>Envoyer l’avis <ArrowRight size={15} /></button><small>Les avis sont soumis à modération avant publication.</small></form>
        <div className="comment-column"><form className="comment-form" onSubmit={(event) => { event.preventDefault(); commentMutation.mutate({ productId: item.id, name: name || "Visiteur", body: comment }); }}><span className="eyebrow">ÉCRIRE UN COMMENTAIRE</span><textarea required minLength={3} maxLength={1200} value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Votre commentaire…" /><div className="comment-form-bottom"><input aria-label="Votre nom" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom" /><button className="button button-primary" type="submit" disabled={commentMutation.isPending}>Publier <ArrowRight size={14} /></button></div><small>Les commentaires sont publiés après vérification.</small></form>
          {stats.recentComments?.length ? <div className="comment-list">{stats.recentComments.map((entry) => <article className="comment-item" key={entry.id}><div className="comment-avatar">{entry.name.slice(0,1).toUpperCase()}</div><div><strong>{entry.name}</strong><small>{new Date(entry.createdAt).toLocaleDateString("fr-FR")}</small><p>{entry.body}</p></div></article>)}</div> : <div className="comment-empty"><MessageCircle size={23} /><p>Pas encore de conversation. Ouvrez-la avec un retour utile.</p></div>}
        </div></div>
    </section>
  </SiteShell>;
}
