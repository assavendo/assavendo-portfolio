"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { supabaseAdmin } from "@/lib/supabase/server";
import { esc, sendEmail, isEmailConfigured } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { requireAdmin } from "@/lib/admin";
import { slugify } from "@/lib/slug";
import { hashSupportToken } from "@/lib/support";
import type { FormState } from "./contact";

const makeSupportToken = () => randomBytes(32).toString("hex");
const ticketUrl = (token: string) => `${siteUrl}/aide/ticket/${token}`;
const valuesOf = (form: FormData) => Object.fromEntries([...form.entries()].filter(([key]) => key !== "cf-turnstile-response" && key !== "website")) as Record<string, string>;

const ticketSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
  email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320),
  subject: z.string().trim().min(3, "Indiquez un sujet.").max(180),
  category: z.string().trim().min(2).max(80),
  order_reference: z.string().trim().max(80).optional().or(z.literal("")),
  body: z.string().trim().min(10, "Décrivez votre problème en quelques phrases.").max(5000),
  consent: z.literal("on", { error: "Acceptez le traitement de votre demande pour continuer." }),
});

export async function createSupportTicket(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Merci, votre demande a bien été enregistrée." };
  const parsed = ticketSchema.safeParse(Object.fromEntries(form));
  const values = valuesOf(form);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.", values };
  const ip = await clientIp();
  if (!(await allow("support-ticket", 3, 3600))) return { ok: false, message: "Trop de tickets envoyés récemment. Réessayez plus tard.", values };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) return { ok: false, message: "La vérification anti-robot a échoué.", values };

  const email = parsed.data.email.toLowerCase();
  const db = supabaseAdmin();
  let orderId: string | null = null;
  let orderReference: string | null = parsed.data.order_reference?.trim() || null;
  if (orderReference) {
    const { data: order } = await db.from("orders")
      .select("id,order_number")
      .eq("customer_email", email)
      .eq("order_number", orderReference)
      .maybeSingle();
    if (!order) orderReference = null;
    else orderId = order.id;
  }

  const token = makeSupportToken();
  const { data: ticket, error } = await db.from("support_tickets").insert({
    access_token_hash: hashSupportToken(token),
    name: parsed.data.name,
    email,
    subject: parsed.data.subject,
    category: parsed.data.category,
    order_id: orderId,
    order_reference: orderReference,
    status: "open",
    priority: "normal",
    last_message_at: new Date().toISOString(),
  }).select("id,ticket_number").single();
  if (error || !ticket) return { ok: false, message: "Le ticket n'a pas pu être enregistré. Réessayez dans un instant.", values };

  const { error: messageError } = await db.from("support_messages").insert({
    ticket_id: ticket.id,
    author_type: "customer",
    author_name: parsed.data.name,
    body: parsed.data.body,
  });
  if (messageError) {
    await db.from("support_tickets").delete().eq("id", ticket.id);
    return { ok: false, message: "Le message n'a pas pu être enregistré. Réessayez dans un instant.", values };
  }

  const url = ticketUrl(token);
  const owner = process.env.CONTACT_TO_EMAIL;
  if (owner) {
    await sendEmail({
      to: owner,
      replyTo: email,
      subject: `[Support ${ticket.ticket_number}] ${parsed.data.subject}`,
      html: `<p><strong>${esc(parsed.data.name)}</strong> &lt;${esc(email)}&gt;</p><p><strong>Ticket :</strong> ${esc(ticket.ticket_number)}</p><p style="white-space:pre-wrap">${esc(parsed.data.body)}</p><p><a href="${esc(url)}">Lien de suivi client</a></p>`,
    });
  }
  const customerSent = await sendEmail({
    to: email,
    subject: `Votre ticket ${ticket.ticket_number} — Assavendo`,
    html: `<p>Bonjour ${esc(parsed.data.name)},</p><p>Votre demande a bien été enregistrée sous la référence <strong>${esc(ticket.ticket_number)}</strong>.</p><p><a href="${esc(url)}">Consulter le ticket et ajouter un message</a></p><p>Ce lien est personnel : ne le partagez pas.</p><p>Assavendo</p>`,
  });

  return {
    ok: true,
    message: customerSent && isEmailConfigured()
      ? `Ticket ${ticket.ticket_number} créé. Un e-mail de suivi vous a été envoyé.`
      : `Ticket ${ticket.ticket_number} créé.`,
    values: { ticketUrl: url, ticketNumber: ticket.ticket_number },
  };
}

const replySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  body: z.string().trim().min(2).max(5000),
  website: z.string().optional(),
});

export async function replySupportTicket(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Message reçu." };
  const parsed = replySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Message invalide." };
  const ip = await clientIp();
  if (!(await allow("support-reply", 8, 3600))) return { ok: false, message: "Trop de réponses récemment. Réessayez plus tard." };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) return { ok: false, message: "La vérification anti-robot a échoué." };

  const db = supabaseAdmin();
  const { data: ticket } = await db.from("support_tickets")
    .select("id,ticket_number,name,email,subject,status")
    .eq("access_token_hash", hashSupportToken(parsed.data.token))
    .maybeSingle();
  if (!ticket) return { ok: false, message: "Ticket introuvable ou lien invalide." };
  if (ticket.status === "closed") return { ok: false, message: "Ce ticket est fermé. Créez une nouvelle demande pour poursuivre." };

  const { error } = await db.from("support_messages").insert({
    ticket_id: ticket.id,
    author_type: "customer",
    author_name: ticket.name,
    body: parsed.data.body,
  });
  if (error) return { ok: false, message: "Votre message n'a pas pu être enregistré." };
  await db.from("support_tickets").update({ status: "open", last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ticket.id);

  const owner = process.env.CONTACT_TO_EMAIL;
  if (owner) {
    await sendEmail({
      to: owner,
      replyTo: ticket.email,
      subject: `[Support ${ticket.ticket_number}] Nouveau message`,
      html: `<p>Nouveau message du client pour <strong>${esc(ticket.ticket_number)}</strong>.</p><p style="white-space:pre-wrap">${esc(parsed.data.body)}</p>`,
    });
  }
  revalidatePath("/aide/ticket/" + parsed.data.token);
  return { ok: true, message: "Votre message a bien été ajouté." };
}

const helpArticleSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(3).max(160),
  slug: z.string().trim().max(120).optional().or(z.literal("")),
  summary: z.string().trim().max(500).optional().or(z.literal("")),
  content: z.string().trim().min(20).max(20000),
  category: z.string().trim().min(2).max(80),
  status: z.enum(["draft", "published", "archived"]),
  sort: z.coerce.number().int().min(0).max(100000),
});

export async function saveHelpArticle(form: FormData) {
  const { user, sb } = await requireAdmin();
  const parsed = helpArticleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return redirect("/admin/aide?erreur=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Article invalide."));
  const slug = slugify(parsed.data.slug || parsed.data.title);
  if (!slug) return redirect("/admin/aide?erreur=Slug%20invalide");
  const payload = {
    slug,
    title: parsed.data.title,
    summary: parsed.data.summary ?? "",
    content: parsed.data.content,
    category: parsed.data.category,
    status: parsed.data.status,
    sort: parsed.data.sort,
    updated_at: new Date().toISOString(),
  };
  const query = parsed.data.id
    ? sb.from("help_articles").update(payload).eq("id", parsed.data.id).select("id").maybeSingle()
    : sb.from("help_articles").insert({ ...payload, created_by: user.id }).select("id").single();
  const { data, error } = await query;
  if (error || !data) return redirect("/admin/aide?erreur=" + encodeURIComponent(error?.code === "23505" ? "Ce slug existe déjà." : "Article non enregistré."));
  revalidatePath("/aide");
  revalidatePath("/aide/" + slug);
  revalidatePath("/admin/aide");
  return redirect("/admin/aide?ok=Article%20enregistré.");
}

export async function deleteHelpArticle(form: FormData) {
  const { sb } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const { data: article } = await sb.from("help_articles").select("slug").eq("id", id).maybeSingle();
  const { error } = await sb.from("help_articles").delete().eq("id", id);
  if (error) return redirect("/admin/aide?erreur=" + encodeURIComponent("Suppression impossible."));
  if (article?.slug) revalidatePath("/aide/" + article.slug);
  revalidatePath("/aide");
  revalidatePath("/admin/aide");
  return redirect("/admin/aide?ok=Article%20supprimé.");
}

const adminReplySchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(2).max(5000),
  status: z.enum(["pending_customer","resolved","closed"]),
});

export async function replySupportTicketAsAdmin(form: FormData) {
  const { user, sb } = await requireAdmin();
  const parsed = adminReplySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return redirect("/admin/support?erreur=Réponse%20invalide.");
  const { data: ticket } = await sb.from("support_tickets").select("id,ticket_number,name,email,status").eq("id", parsed.data.ticket_id).maybeSingle();
  if (!ticket) return redirect("/admin/support?erreur=Ticket%20introuvable.");
  const { error: messageError } = await sb.from("support_messages").insert({
    ticket_id: ticket.id,
    author_type: "admin",
    author_id: user.id,
    author_name: user.email || "Assavendo",
    body: parsed.data.body,
  });
  if (messageError) return redirect("/admin/support?erreur=Réponse%20non%20enregistrée.");
  const { error: ticketError } = await sb.from("support_tickets").update({
    status: parsed.data.status,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", ticket.id);
  if (ticketError) return redirect("/admin/support?erreur=Statut%20non%20enregistré.");
  await sendEmail({
    to: ticket.email,
    subject: `Réponse à votre ticket ${ticket.ticket_number} — Assavendo`,
    html: `<p>Bonjour ${esc(ticket.name)},</p><p>Assavendo a répondu à votre ticket <strong>${esc(ticket.ticket_number)}</strong>.</p><p style="white-space:pre-wrap">${esc(parsed.data.body)}</p><p>Utilisez votre lien personnel de suivi reçu lors de la création du ticket pour consulter toute la conversation et répondre.</p><p>Assavendo</p>`,
  });
  revalidatePath("/admin/support");
  return redirect("/admin/support?ok=Réponse%20envoyée.");
}

const ticketUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open","pending_customer","pending_assavendo","resolved","closed"]),
  priority: z.enum(["low","normal","high","urgent"]),
});

export async function updateSupportTicket(form: FormData) {
  const { sb } = await requireAdmin();
  const parsed = ticketUpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return redirect("/admin/support?erreur=Statut%20ou%20priorité%20invalide.");
  const { error } = await sb.from("support_tickets").update({
    status: parsed.data.status,
    priority: parsed.data.priority,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.id);
  if (error) return redirect("/admin/support?erreur=Mise%20à%20jour%20impossible.");
  revalidatePath("/admin/support");
  return redirect("/admin/support?ok=Ticket%20mis%20à%20jour.");
}
