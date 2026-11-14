import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hashSupportToken } from "@/lib/support";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SupportReplyForm } from "@/components/SupportReplyForm";

export const metadata: Metadata = { title: "Mon ticket", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const STATUS: Record<string,string> = {
  open: "Ouvert",
  pending_customer: "En attente de votre réponse",
  pending_assavendo: "En cours de traitement",
  resolved: "Résolu",
  closed: "Fermé",
};

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token) || !process.env.SUPABASE_SECRET_KEY) notFound();
  const db = supabaseAdmin();
  const { data: ticket } = await db.from("support_tickets")
    .select("id,ticket_number,name,email,subject,category,status,priority,created_at,updated_at")
    .eq("access_token_hash", hashSupportToken(token))
    .maybeSingle();
  if (!ticket) notFound();
  const { data: messages } = await db.from("support_messages")
    .select("id,author_type,author_name,body,created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at");
  return (
    <div className="section"><div className="wrap" style={{ maxWidth: 820 }}>
      <p><Link href="/aide">← Centre d'aide</Link></p>
      <div style={{ display:"flex", justifyContent:"space-between", gap:".7rem", flexWrap:"wrap", alignItems:"baseline" }}>
        <h1 style={{ fontSize: "clamp(1.9rem,4vw,2.6rem)" }}>Ticket {ticket.ticket_number}</h1>
        <span className="status s-draft">{STATUS[ticket.status] ?? ticket.status}</span>
      </div>
      <p className="muted">{ticket.subject} · {ticket.category} · créé le {new Date(ticket.created_at).toLocaleString("fr-FR")}</p>
      <div style={{ display:"grid", gap:"1rem", marginTop:"1rem" }}>
        {(messages ?? []).map((message) => <article className="panel" key={message.id}>
          <p className="small muted"><strong>{message.author_type === "admin" ? "Assavendo" : message.author_name}</strong> · {new Date(message.created_at).toLocaleString("fr-FR")}</p>
          <p style={{ whiteSpace:"pre-wrap" }}>{message.body}</p>
        </article>)}
      </div>
      {ticket.status !== "closed" ? <section className="panel" style={{ marginTop:"1.4rem" }}>
        <h2 style={{ fontSize:"1.2rem" }}>Répondre</h2>
        <SupportReplyForm token={token} />
      </section> : null}
      <p className="muted small" style={{ marginTop:"1.2rem" }}>Ce lien personnel donne accès à votre ticket. Ne le partagez pas. Pour une nouvelle demande, <Link href="/aide#ticket">créez un nouveau ticket</Link>.</p>
    </div></div>
  );
}
