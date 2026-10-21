const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export { esc };

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL);

export async function sendEmail(opts: { to: string; subject: string; html: string; replyTo?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY; const from = process.env.CONTACT_FROM_EMAIL;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

/** Alerte à l'exploitant (paiement à vérifier, livraison en échec…). Sans effet si l'e-mail n'est pas configuré. */
export async function notifyOwner(subject: string, html: string): Promise<void> {
  const to = process.env.CONTACT_TO_EMAIL;
  if (to) await sendEmail({ to, subject: `[Assavendo] ${subject}`, html });
}
