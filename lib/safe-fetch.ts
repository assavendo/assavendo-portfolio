import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/** Vrai si l'adresse appartient à un réseau interne, local ou réservé (protection SSRF). */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true;
}

export class FetchRefused extends Error {}

export type SafeResponse = { url: string; status: number; headers: Record<string, string>; body: string; truncated: boolean; redirects: string[] };

/** Résolution DNS validée au moment de la connexion (évite le DNS rebinding). */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return (callback as any)(err);
    const ok = addresses.filter((a) => !isPrivateIp(a.address));
    if (!ok.length) return (callback as any)(new FetchRefused("Adresse interne refusée"));
    if ((options as any)?.all) return (callback as any)(null, ok);
    (callback as any)(null, ok[0].address, ok[0].family);
  });
};

export function parseTarget(input: string): URL {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try { url = new URL(raw); } catch { throw new FetchRefused("Adresse invalide"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchRefused("Seuls http et https sont acceptés");
  if (url.username || url.password) throw new FetchRefused("Identifiants dans l'adresse refusés");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchRefused("Port non autorisé");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !net.isIP(host.replace(/^\[|\]$/g, ""))) throw new FetchRefused("Nom d'hôte non public");
  if (net.isIP(host.replace(/^\[|\]$/g, "")) && isPrivateIp(host.replace(/^\[|\]$/g, ""))) throw new FetchRefused("Adresse interne refusée");
  return url;
}

function once(url: URL, method: "GET" | "HEAD", maxBytes: number, timeoutMs: number): Promise<{ status: number; headers: Record<string, string>; body: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method, lookup: guardedLookup, timeout: timeoutMs,
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
    req.on("timeout", () => req.destroy(new FetchRefused("Délai dépassé")));
    req.on("error", (e) => reject(e));
    req.end();
  });
}

/** Lecture publique d'une page : redirections revalidées, taille et durée plafonnées. */
export async function safeFetch(input: string, opts: { method?: "GET" | "HEAD"; maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}): Promise<SafeResponse> {
  const { method = "GET", maxBytes = 1_500_000, timeoutMs = 8000, maxRedirects = 4 } = opts;
  let url = parseTarget(input);
  const redirects: string[] = [];
  for (let i = 0; i <= maxRedirects; i++) {
    const r = await once(url, method, maxBytes, timeoutMs);
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
