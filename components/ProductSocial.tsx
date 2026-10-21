"use client";
import { useActionState, useState, useTransition } from "react";
import { Turnstile } from "./Turnstile";
import { addComment, addReview, toggleLike, trackShare } from "@/app/actions/social";
import type { FormState } from "@/app/actions/contact";
import type { ProductStats } from "@/lib/data";

const init: FormState = { ok: false, message: "" };
const date = (s: string) => new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const Stars = ({ n }: { n: number }) => <span className="stars" role="img" aria-label={`${n.toFixed(1)} sur 5`}>{"★".repeat(Math.round(n))}{"☆".repeat(5 - Math.round(n))}</span>;

export function ActionsBar({ productId, slug, title, likes, shares, liked }: { productId: string; slug: string; title: string; likes: number; shares: number; liked: boolean }) {
  const [l, setL] = useState({ liked, n: likes }); const [msg, setMsg] = useState(""); const [pending, start] = useTransition(); const [s, setS] = useState(shares);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/boutique/${slug}`;
  function like() { start(async () => { const r = await toggleLike(productId, slug); if ("error" in r) setMsg(r.error); else { setMsg(""); setL((v) => ({ liked: r.liked, n: v.n + (r.liked ? 1 : -1) })); } }); }
  async function share(channel: string) {
    if (channel === "native" && navigator.share) { try { await navigator.share({ title, url }); } catch { return; } }
    else if (channel === "link") { await navigator.clipboard.writeText(url).catch(() => {}); setMsg("Lien copié."); }
    else window.open(channel === "linkedin" ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` : `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, "_blank", "noopener,noreferrer");
    setS((v) => v + 1); void trackShare(productId, channel);
  }
  return (
    <div>
      <div className="social" role="group" aria-label="Actions sur ce produit">
        <button className="btn btn-ghost btn-sm" aria-pressed={l.liked} onClick={like} disabled={pending}>{l.liked ? "♥ Aimé" : "♡ J'aime"} · {l.n}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => share("link")}>Copier le lien</button>
        <button className="btn btn-ghost btn-sm" onClick={() => share("linkedin")}>LinkedIn</button>
        <button className="btn btn-ghost btn-sm" onClick={() => share("whatsapp")}>WhatsApp</button>
        <span className="muted small" style={{ alignSelf: "center" }}>{s} partage{s > 1 ? "s" : ""}</span>
      </div>
      <p className="muted small" role="status">{msg}</p>
    </div>
  );
}

export function ReviewForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(addReview, init);
  const v = state.values ?? {};
  if (state.ok) return <p className="alert alert-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="productId" value={productId} />
      <label className="field">Votre nom<input className="input" name="name" required defaultValue={v.name} /></label>
      <label className="field">Note<select className="input" name="rating" defaultValue={v.rating ?? ""} required><option value="" disabled>Choisir…</option><option value="5">5 — Excellent</option><option value="4">4 — Très bien</option><option value="3">3 — Correct</option><option value="2">2 — Décevant</option><option value="1">1 — Mauvais</option></select></label>
      <label className="field full">Votre avis<textarea className="input" name="body" required minLength={10} defaultValue={v.body} /></label>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="full"><Turnstile resetKey={state} /></div>
      <div className="full"><button className="btn btn-primary" disabled={pending}>{pending ? "Envoi…" : "Publier mon avis"}</button>{state.message ? <p className="alert alert-err" role="alert" style={{ marginTop: ".8rem" }}>{state.message}</p> : null}<p className="muted small">Les avis sont relus avant publication. Un seul avis par visiteur.</p></div>
    </form>
  );
}

export function CommentForm({ productId, slug, parentId }: { productId: string; slug: string; parentId?: string }) {
  const [state, action, pending] = useActionState(addComment, init);
  const v = state.values ?? {};
  if (state.ok) return <p className="alert alert-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="productId" value={productId} /><input type="hidden" name="slug" value={slug} />{parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <label className="field">Votre nom<input className="input" name="name" required defaultValue={v.name} /></label>
      <label className="field full">{parentId ? "Votre réponse" : "Votre commentaire"}<textarea className="input" name="body" required minLength={3} defaultValue={v.body} style={{ minHeight: 90 }} /></label>
      <input className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="full"><Turnstile resetKey={state} /></div>
      <div className="full"><button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Envoi…" : "Publier"}</button>{state.message ? <p className="alert alert-err" role="alert" style={{ marginTop: ".8rem" }}>{state.message}</p> : null}</div>
    </form>
  );
}

export function Reviews({ stats }: { stats: ProductStats }) {
  if (!stats.reviewList.length) return <p className="muted">Aucun avis pour le moment.</p>;
  return <div>{stats.reviewList.map((r) => <div key={r.id} className="comment"><Stars n={r.rating} /> <strong>{r.author_name}</strong>{r.verified_purchase ? <span className="tag" style={{ marginLeft: ".5rem" }}>Achat vérifié</span> : null}<span className="muted small"> · {date(r.created_at)}</span><p style={{ marginTop: ".4rem" }}>{r.body}</p></div>)}</div>;
}

export function Comments({ stats, productId, slug, allow }: { stats: ProductStats; productId: string; slug: string; allow: boolean }) {
  const top = stats.comments.filter((c) => !c.parent_id); const [replyTo, setReplyTo] = useState<string | null>(null);
  return (
    <div>
      {top.length === 0 ? <p className="muted">Aucun commentaire pour le moment.</p> : top.map((c) => (
        <div key={c.id}>
          <div className="comment"><strong>{c.author_name}</strong><span className="muted small"> · {date(c.created_at)}</span><p style={{ marginTop: ".4rem" }}>{c.body}</p>{allow ? <button className="btn btn-ghost btn-sm" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>Répondre</button> : null}</div>
          {stats.comments.filter((r) => r.parent_id === c.id).map((r) => <div key={r.id} className="comment reply"><strong>{r.author_name}</strong>{r.is_owner_reply ? <span className="tag tag-tool" style={{ marginLeft: ".5rem" }}>Assavendo</span> : null}<span className="muted small"> · {date(r.created_at)}</span><p style={{ marginTop: ".4rem" }}>{r.body}</p></div>)}
          {replyTo === c.id ? <div className="comment reply"><CommentForm productId={productId} slug={slug} parentId={c.id} /></div> : null}
        </div>
      ))}
      {allow ? <div style={{ marginTop: "1.5rem" }}><h3>Ajouter un commentaire</h3><CommentForm productId={productId} slug={slug} /><p className="muted small">Les commentaires sont relus avant publication.</p></div> : <p className="muted">Les commentaires sont fermés.</p>}
    </div>
  );
}
