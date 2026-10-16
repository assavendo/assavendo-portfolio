"use server";
import { z } from "zod";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { supabaseAdmin } from "@/lib/supabase/server";
import { esc, sendEmail } from "@/lib/email";

export type FormState = { ok: boolean; message: string };
const schema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
  email: z.string().trim().email("Cette adresse e-mail semble invalide.").max(320),
  projectType: z.string().trim().max(80).optional(),
  message: z.string().trim().min(12, "Décrivez votre besoin en quelques phrases.").max(4000),
  consent: z.literal("on", { error: "Acceptez le traitement de votre demande pour continuer." }),
});

export async function submitContact(_: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "Merci, votre message a bien été envoyé." }; // champ piège
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  const ip = await clientIp();
  if (!(await allow("contact", 5, 3600))) return { ok: false, message: "Trop de messages envoyés depuis votre connexion. Réessayez plus tard ou écrivez-nous directement par e-mail." };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) return { ok: false, message: "La vérification anti-robot a échoué. Rechargez la page et réessayez." };
  const { name, email, projectType, message } = parsed.data;
  const { error } = await supabaseAdmin().from("contact_messages").insert({ name, email: email.toLowerCase(), project_type: projectType || null, message, consent: true });
  if (error) return { ok: false, message: "Votre message n'a pas pu être enregistré. Réessayez dans un instant." };
  const to = process.env.CONTACT_TO_EMAIL;
  if (to) await sendEmail({ to, replyTo: email, subject: `Nouvelle demande de ${name}`, html: `<p><strong>${esc(name)}</strong> &lt;${esc(email)}&gt;${projectType ? ` — ${esc(projectType)}` : ""}</p><p style="white-space:pre-wrap">${esc(message)}</p>` });
  await sendEmail({ to: email, subject: "Votre demande a bien été reçue — Assavendo", html: `<p>Bonjour ${esc(name)},</p><p>Nous avons bien reçu votre demande et vous répondrons personnellement sous deux jours ouvrés.</p><p>Assavendo</p>` });
  return { ok: true, message: "Merci, votre message a bien été envoyé. Vous recevrez un accusé de réception par e-mail." };
}
