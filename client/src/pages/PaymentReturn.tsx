import { CheckCircle2, CircleAlert, Clock3, ArrowRight, XCircle } from "lucide-react";
import { Link } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";

export default function PaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id") ?? "";
  const cancelled = params.get("cancel") === "1";
  const query = trpc.product.orderStatus.useQuery({ sessionId }, { enabled: Boolean(sessionId) && !cancelled, refetchInterval: (query) => query.state.data?.status === "pending" ? 2500 : false, retry: 1 });
  const status = query.data?.status;
  usePageMeta(cancelled ? "Paiement annulé — Assavendo" : status === "paid" ? "Commande confirmée — Assavendo" : "Vérification du paiement — Assavendo", "Retour de votre parcours de paiement Assavendo. La commande est confirmée après validation Stripe côté serveur.");
  const title = cancelled ? "Le paiement a été annulé." : status === "paid" ? "Votre commande est confirmée." : status === "pending" ? "Votre paiement est en cours de vérification." : query.isError ? "La confirmation prend plus de temps." : "Nous vérifions votre paiement.";
  const message = cancelled ? "Aucun débit n’a été confirmé par Assavendo. Vous pouvez revenir à la boutique lorsque vous le souhaitez." : status === "paid" ? "Stripe a confirmé le paiement. Votre commande est enregistrée." : status === "pending" ? "Le paiement est en attente de confirmation du webhook Stripe. Ne relancez pas l’achat : cette page se mettra à jour automatiquement." : "La page de retour ne prouve pas le paiement. Nous attendons la confirmation serveur de Stripe.";
  const Icon = cancelled ? XCircle : status === "paid" ? CheckCircle2 : query.isError ? CircleAlert : Clock3;
  return <SiteShell><section className={`payment-result ${status === "paid" ? "is-paid" : ""}`}><span className="eyebrow">ASSAVENDO · COMMANDE</span><span className="payment-result-icon"><Icon size={31} /></span><h1>{title}</h1><p>{message}</p>{query.data && <div className="payment-receipt"><span>{query.data.productTitle}</span><strong>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: query.data.currency }).format(query.data.amountCents / 100)}</strong><small>Statut : {query.data.status === "paid" ? "Payé" : "En attente"}</small></div>}{query.isFetching && !cancelled && status !== "paid" && <div className="payment-refresh"><span className="loading-dot" /> Vérification automatique en cours</div>}<div className="payment-actions"><Link href="/boutique" className="button button-primary">Retourner à la boutique <ArrowRight size={16} /></Link><Link href="/" className="text-link">Revenir à l’accueil</Link></div></section></SiteShell>;
}
