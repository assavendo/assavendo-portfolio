export type EmailIssue = { level: "erreur" | "avertissement" | "ok"; text: string; fix?: string };
export type EmailReport = { spf: { record: string | null; issues: EmailIssue[] }; dmarc: { record: string | null; issues: EmailIssue[] }; dkim: DkimResult; score: number };

/** Sélecteurs DKIM les plus répandus (Google Workspace, Microsoft 365, Mailchimp, SendGrid, Resend, Brevo…). Un sélecteur personnalisé ne peut pas être deviné. */
export const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "k2", "k3", "mail", "dkim", "s1", "s2", "smtp", "resend", "mandrill", "mte1", "mxvault", "sig1", "brevo1", "brevo2"] as const;
export type DkimResult = { found: { selector: string; record: string }[]; checked: number; issue: EmailIssue };

/** Interprète les enregistrements trouvés pour les sélecteurs testés. */
export function analyzeDkim(found: { selector: string; record: string }[], checked: number): DkimResult {
  const valid = found.filter((f) => /v=DKIM1|k=rsa|k=ed25519|p=[A-Za-z0-9+/=]{20,}/i.test(f.record));
  if (valid.length) return { found: valid, checked, issue: { level: "ok", text: `${valid.length} clé${valid.length > 1 ? "s" : ""} DKIM détectée${valid.length > 1 ? "s" : ""} (${valid.map((v) => v.selector).join(", ")}).` } };
  return { found: [], checked, issue: { level: "avertissement", text: `Aucune clé DKIM trouvée parmi ${checked} sélecteurs courants.`, fix: "Cela ne prouve pas qu'il n'y en a pas : un service d'envoi utilise souvent son propre sélecteur. Activez DKIM chez votre service d'e-mail et publiez la clé qu'il fournit." } };
}

export function analyzeSpf(txts: string[]): { record: string | null; issues: EmailIssue[] } {
  const spfs = txts.filter((t) => /^v=spf1\b/i.test(t));
  const issues: EmailIssue[] = [];
  if (spfs.length === 0) return { record: null, issues: [{ level: "erreur", text: "Aucun enregistrement SPF.", fix: "Ajouter un enregistrement TXT, par exemple « v=spf1 include:_spf.votre-service.com -all », avec les services qui envoient pour vous." }] };
  if (spfs.length > 1) issues.push({ level: "erreur", text: "Plusieurs enregistrements SPF : le résultat est invalide.", fix: "Fusionner tous les services dans un seul enregistrement v=spf1." });
  const r = spfs[0];
  const lookups = (r.match(/\b(include:|a\b|mx\b|ptr\b|exists:|redirect=)/gi) ?? []).length;
  if (lookups > 10) issues.push({ level: "erreur", text: `Environ ${lookups} résolutions DNS : la limite de 10 est dépassée.`, fix: "Retirer les services inutiles ou remplacer des include par des adresses ip4/ip6." });
  else if (lookups > 7) issues.push({ level: "avertissement", text: `Environ ${lookups} résolutions DNS sur 10 autorisées.`, fix: "Garder de la marge avant d'ajouter un service." });
  if (/\+all\b/i.test(r) || /\ball\b(?!.*[-~?]all)/i.test(r) && !/[-~?]all/i.test(r)) issues.push({ level: "erreur", text: "« +all » autorise n'importe qui à envoyer en votre nom.", fix: "Terminer par -all (strict) ou ~all (transition)." });
  else if (/\?all\b/i.test(r)) issues.push({ level: "avertissement", text: "« ?all » ne protège pas.", fix: "Terminer par ~all puis -all une fois les tests terminés." });
  else if (/~all\b/i.test(r)) issues.push({ level: "avertissement", text: "« ~all » : les envois non autorisés sont seulement suspects.", fix: "Passer à -all quand tous vos services d'envoi sont listés." });
  else if (/-all\b/i.test(r)) issues.push({ level: "ok", text: "Politique stricte (-all)." });
  else issues.push({ level: "avertissement", text: "Pas de mécanisme final (all).", fix: "Terminer l'enregistrement par -all ou ~all." });
  if (r.length > 450) issues.push({ level: "avertissement", text: "Enregistrement très long.", fix: "Au-delà de 255 caractères, il doit être découpé en plusieurs chaînes ; simplifier si possible." });
  return { record: r, issues };
}

export function analyzeDmarc(txts: string[]): { record: string | null; issues: EmailIssue[] } {
  const rec = txts.filter((t) => /^v=DMARC1\b/i.test(t));
  if (rec.length === 0) return { record: null, issues: [{ level: "erreur", text: "Aucun enregistrement DMARC.", fix: "Publier un TXT sur _dmarc.votredomaine : « v=DMARC1; p=none; rua=mailto:dmarc@votredomaine » pour commencer à observer." }] };
  const r = rec[0]; const issues: EmailIssue[] = [];
  if (rec.length > 1) issues.push({ level: "erreur", text: "Plusieurs enregistrements DMARC.", fix: "Ne garder qu'un seul enregistrement." });
  const p = r.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
  if (p === "none") issues.push({ level: "avertissement", text: "p=none : DMARC observe mais ne bloque rien.", fix: "Après analyse des rapports, passer à p=quarantine puis p=reject." });
  else if (p === "quarantine") issues.push({ level: "ok", text: "p=quarantine : les messages non conformes vont en indésirables." });
  else if (p === "reject") issues.push({ level: "ok", text: "p=reject : les messages usurpés sont refusés." });
  else issues.push({ level: "erreur", text: "Politique p= absente ou invalide.", fix: "Indiquer p=none, p=quarantine ou p=reject." });
  if (!/\brua=/i.test(r)) issues.push({ level: "avertissement", text: "Aucune adresse de rapports (rua).", fix: "Ajouter rua=mailto:… pour recevoir les rapports agrégés." });
  const pct = Number(r.match(/\bpct=(\d+)/i)?.[1] ?? 100);
  if (pct < 100) issues.push({ level: "avertissement", text: `Politique appliquée à ${pct} % des messages seulement.`, fix: "Monter pct à 100 une fois la configuration validée." });
  return { record: r, issues };
}

export function emailScore(spf: { issues: EmailIssue[] }, dmarc: { issues: EmailIssue[] }, dkim?: DkimResult): number {
  const pen = (l: EmailIssue[]) => l.reduce((s, i) => s + (i.level === "erreur" ? 30 : i.level === "avertissement" ? 10 : 0), 0);
  // DKIM non détecté : pénalité légère seulement (sélecteur peut-être personnalisé).
  return Math.max(0, 100 - pen(spf.issues) - pen(dmarc.issues) - (dkim && dkim.found.length === 0 ? 5 : 0));
}
