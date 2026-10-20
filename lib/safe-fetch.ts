import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { isBlockedIp } from "./ip.ts";

/** Vrai si l'adresse appartient à un réseau interne, local ou réservé (protection SSRF). Voir lib/ip.ts. */
export const isPrivateIp = isBlockedIp;

export class FetchRefused extends Error {}

export type SafeResponse = { url: string; status: number; headers: Record<string, string>; body: string; truncated: boolean; redirects: string[] };

/** Résolution DNS validée au moment de la connexion (évite le DNS rebinding). Une seule adresse interne dans la réponse suffit à refuser. */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    if (!addresses.length || addresses.some((a) => isBlockedIp(a.address))) return (callback as any)(new FetchRefused("Adresse interne refusée"));
    if ((options as any)?.all) return (callback as any)(null, addresses);
    (callback as any)(null, addresses[0].address, addresses[0].family);
  });
};

/** Résout un nom d'hôte public et refuse tout ce qui mène à une adresse interne. Sert aux outils qui ouvrent eux-mêmes une connexion. */
export async function resolvePublicHost(hostname: string): Promise<{ address: string; family: number }[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) { if (isBlockedIp(host)) throw new FetchRefused("Adresse interne refusée"); return [{ address: host, family: net.isIP(host) }]; }
  const list = await dns.promises.lookup(host, { all: true });
  if (!list.length || list.some((a) => isBlockedIp(a.address))) throw new FetchRefused("Adresse interne refusée");
  return list;
}

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".lan", ".intranet", ".corp", ".private"];

export function parseTarget(input: string): URL {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try { url = new URL(raw); } catch { throw new FetchRefused("Adresse invalide"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchRefused("Seuls http et https sont acceptés");
  if (url.username || url.password) throw new FetchRefused("Identifiants dans l'adresse refusés");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchRefused("Port non autorisé");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) {
    if (isBlockedIp(bare)) throw new FetchRefused("Adresse interne refusée");
  } else if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".")) {
    throw new FetchRefused("Nom d'hôte non public");
  }
  return url;
}

type Once = { status: number; headers: Record<string, string>; body: string; truncated: boolean };
function once(url: URL, method: "GET" | "HEAD", maxBytes: number, idleMs: number, signal: AbortSignal): Promise<Once> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method, lookup: guardedLookup, timeout: idleMs, signal, maxHeaderSize: 16_384,
      headers: { "user-agent": "AssavendoBot/1.0 (+https://assavendo.fr/bot)", accept: "text/html,*/*;q=0.8", "accept-encoding": "identity" },
    }, (res) => {
      const chunks: Buffer[] = []; let size = 0; let truncated = false;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v ?? "");
      if (method === "HEAD") { res.resume(); return resolve({ status: res.statusCode ?? 0, headers, body: "", truncated: false }); }
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { truncated = true; chunks.push(c.subarray(0, c.length - (size - maxBytes))); req.destroy(); return; }
        chunks.push(c);
      });
      const done = () => resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8"), truncated });
      res.on("end", done); res.on("close", done);
    });
    // Contrôle supplémentaire : l'adresse réellement connectée doit elle aussi être publique (défense en profondeur).
    req.on("socket", (socket) => {
      const check = () => { if (socket.remoteAddress && isBlockedIp(socket.remoteAddress)) req.destroy(new FetchRefused("Adresse interne refusée")); };
      if (socket.connecting) socket.once("connect", check); else check();
    });
    req.on("timeout", () => req.destroy(new FetchRefused("Délai dépassé")));
    req.on("error", (e) => reject(signal.aborted ? new FetchRefused("Délai dépassé") : e));
    req.end();
  });
}

export type SafeFetchOptions = { method?: "GET" | "HEAD"; maxBytes?: number; timeoutMs?: number; totalTimeoutMs?: number; maxRedirects?: number };

/**
 * Lecture publique d'une page : adresses validées à la connexion ET à chaque redirection, taille plafonnée,
 * délai d'inactivité (timeoutMs) ET délai total (totalTimeoutMs). Un serveur qui refuse HEAD est réinterrogé en GET (en-têtes seulement).
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { method = "GET", maxBytes = 1_500_000, timeoutMs = 8000, totalTimeoutMs = 15_000, maxRedirects = 4 } = opts;
  const signal = AbortSignal.timeout(totalTimeoutMs);
  let url = parseTarget(input);
  const redirects: string[] = [];
  for (let i = 0; i <= maxRedirects; i++) {
    let r = await once(url, method, maxBytes, timeoutMs, signal);
    if (method === "HEAD" && [403, 405, 501].includes(r.status)) r = { ...(await once(url, "GET", 2048, timeoutMs, signal)), body: "", truncated: false };
    const loc = r.headers["location"];
    if (r.status >= 300 && r.status < 400 && loc) {
      redirects.push(url.toString());
      url = parseTarget(new URL(loc, url).toString());
      continue;
    }
    return { url: url.toString(), ...r, redirects };
  }
  throw new FetchRefused("Trop de redirections");
}

/** Respect de robots.txt pour l'agent générique et l'agent AssavendoBot. */
export async function robotsAllows(target: URL): Promise<boolean> {
  try {
    const r = await safeFetch(new URL("/robots.txt", target).toString(), { maxBytes: 200_000, timeoutMs: 4000, maxRedirects: 2 });
    if (r.status !== 200) return true;
    return robotsRulesAllow(r.body, target.pathname + target.search);
  } catch { return true; }
}

export function robotsRulesAllow(txt: string, path: string): boolean {
  let applies = false; let anyGroup = false; const disallows: string[] = []; const allows: string[] = [];
  for (const line of txt.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim(); if (!clean) continue;
    const idx = clean.indexOf(":"); if (idx < 0) continue;
    const key = clean.slice(0, idx).trim().toLowerCase(); const val = clean.slice(idx + 1).trim();
    if (key === "user-agent") { const ua = val.toLowerCase(); applies = ua === "*" || ua.includes("assavendobot"); anyGroup ||= applies; }
    else if (applies && key === "disallow" && val) disallows.push(val);
    else if (applies && key === "allow" && val) allows.push(val);
  }
  if (!anyGroup) return true;
  const longest = (rules: string[]) => rules.filter((r) => path.startsWith(r.replace(/\*$/, ""))).reduce((m, r) => Math.max(m, r.length), -1);
  return longest(allows) >= longest(disallows);
}
