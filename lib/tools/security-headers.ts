export type Check = { id: string; label: string; status: "ok" | "warn" | "fail"; weight: number; found?: string; why: string; fix: string };
export type HeadersReport = { score: number; grade: "A" | "B" | "C" | "D" | "E"; checks: Check[]; usesHttps: boolean };

const get = (h: Record<string, string>, k: string) => h[k.toLowerCase()];

export function analyzeHeaders(h: Record<string, string>, usesHttps: boolean): HeadersReport {
  const checks: Check[] = [];
  const push = (c: Check) => checks.push(c);

  push(usesHttps
    ? { id: "https", label: "Connexion chiffrée (HTTPS)", status: "ok", weight: 20, found: "HTTPS actif", why: "Les échanges ne peuvent pas être lus ni modifiés en route.", fix: "" }
    : { id: "https", label: "Connexion chiffrée (HTTPS)", status: "fail", weight: 20, why: "Sans HTTPS, mots de passe et formulaires circulent en clair et les navigateurs affichent « non sécurisé ».", fix: "Installer un certificat (Let's Encrypt est gratuit) et rediriger tout le trafic http vers https." });

  const hsts = get(h, "strict-transport-security");
  const maxAge = Number(hsts?.match(/max-age=(\d+)/i)?.[1] ?? 0);
  push(!hsts ? { id: "hsts", label: "Strict-Transport-Security", status: "fail", weight: 15, why: "Empêche un retour vers la version non chiffrée du site.", fix: "Strict-Transport-Security: max-age=31536000; includeSubDomains" }
    : maxAge < 15552000 ? { id: "hsts", label: "Strict-Transport-Security", status: "warn", weight: 15, found: hsts, why: "La durée est trop courte pour protéger durablement les visiteurs.", fix: "Passer max-age à au moins 31536000 (un an)." }
    : { id: "hsts", label: "Strict-Transport-Security", status: "ok", weight: 15, found: hsts, why: "Le navigateur impose HTTPS pour ce site.", fix: "" });

  const csp = get(h, "content-security-policy");
  push(!csp ? { id: "csp", label: "Content-Security-Policy", status: "fail", weight: 25, why: "Sans politique, un script injecté dans une page s'exécute sans restriction.", fix: "Définir une politique : Content-Security-Policy: default-src 'self'; frame-ancestors 'none' puis l'élargir selon les services réellement utilisés." }
    : /unsafe-inline|unsafe-eval|\*(?!\.)/.test(csp.split(";").find((d) => d.trim().startsWith("script-src") || d.trim().startsWith("default-src")) ?? "") ? { id: "csp", label: "Content-Security-Policy", status: "warn", weight: 25, found: csp.slice(0, 160), why: "La politique existe mais autorise les scripts en ligne ou toutes origines : la protection est réduite.", fix: "Remplacer 'unsafe-inline' par des nonces ou des empreintes, et lister les origines autorisées." }
    : { id: "csp", label: "Content-Security-Policy", status: "ok", weight: 25, found: csp.slice(0, 160), why: "Les sources de scripts sont restreintes.", fix: "" });

  const xcto = get(h, "x-content-type-options");
  push(xcto?.toLowerCase() === "nosniff" ? { id: "xcto", label: "X-Content-Type-Options", status: "ok", weight: 10, found: xcto, why: "Le navigateur respecte le type déclaré des fichiers.", fix: "" }
    : { id: "xcto", label: "X-Content-Type-Options", status: "fail", weight: 10, why: "Un fichier peut être interprété autrement que prévu (attaque par détection de type).", fix: "X-Content-Type-Options: nosniff" });

  const xfo = get(h, "x-frame-options");
  const fa = /frame-ancestors/i.test(csp ?? "");
  push(fa || /^(deny|sameorigin)$/i.test(xfo ?? "") ? { id: "frame", label: "Protection contre l'intégration (clickjacking)", status: "ok", weight: 10, found: fa ? "frame-ancestors" : xfo, why: "Votre site ne peut pas être affiché à l'insu du visiteur dans le cadre d'un autre site.", fix: "" }
    : { id: "frame", label: "Protection contre l'intégration (clickjacking)", status: "fail", weight: 10, why: "Votre site peut être intégré dans une page piégée qui incite à cliquer.", fix: "Content-Security-Policy: frame-ancestors 'none' (ou X-Frame-Options: DENY)." });

  const rp = get(h, "referrer-policy");
  push(rp && !/unsafe-url|no-referrer-when-downgrade/i.test(rp) ? { id: "referrer", label: "Referrer-Policy", status: "ok", weight: 10, found: rp, why: "Les adresses internes ne fuient pas vers les sites tiers.", fix: "" }
    : { id: "referrer", label: "Referrer-Policy", status: rp ? "warn" : "fail", weight: 10, found: rp, why: "L'adresse complète des pages visitées peut être transmise aux sites externes.", fix: "Referrer-Policy: strict-origin-when-cross-origin" });

  const pp = get(h, "permissions-policy");
  push(pp ? { id: "perm", label: "Permissions-Policy", status: "ok", weight: 5, found: pp.slice(0, 120), why: "Les fonctions sensibles du navigateur (caméra, micro, position) sont encadrées.", fix: "" }
    : { id: "perm", label: "Permissions-Policy", status: "warn", weight: 5, why: "Rien ne limite l'usage de la caméra, du micro ou de la position par des scripts intégrés.", fix: "Permissions-Policy: camera=(), microphone=(), geolocation=()" });

  const server = get(h, "server"); const powered = get(h, "x-powered-by");
  const leaks = [server && /\d/.test(server) ? `Server: ${server}` : "", powered ? `X-Powered-By: ${powered}` : ""].filter(Boolean);
  push(leaks.length ? { id: "leak", label: "Informations techniques exposées", status: "warn", weight: 5, found: leaks.join(" · "), why: "Le logiciel et sa version aident un attaquant à cibler des failles connues.", fix: "Masquer ces en-têtes dans la configuration du serveur ou de l'application." }
    : { id: "leak", label: "Informations techniques exposées", status: "ok", weight: 5, why: "Aucune version de logiciel n'est annoncée.", fix: "" });

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.status === "ok" ? c.weight : c.status === "warn" ? c.weight * 0.5 : 0), 0);
  const score = Math.round((got / total) * 100);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "E";
  return { score, grade, checks, usesHttps };
}
