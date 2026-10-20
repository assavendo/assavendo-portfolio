import net from "node:net";

/** Analyse stricte d'une adresse IPv4 décimale pointée. */
function parseV4(s: string): number[] | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n >= 0 && n <= 255) ? p : null;
}

/** Analyse d'une adresse IPv6 en 8 groupes de 16 bits (gère « :: » et l'IPv4 incorporée). Refuse les identifiants de zone. */
export function parseV6(input: string): number[] | null {
  let s = input.trim().toLowerCase();
  if (s.includes("%") || s.includes("[") || net.isIP(s) !== 6) return null;
  const tail = s.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (tail) {
    const v4 = parseV4(tail[1]); if (!v4) return null;
    s = s.slice(0, s.length - tail[1].length) + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let parts: string[];
  if (halves.length === 1) { if (head.length !== 8) return null; parts = head; }
  else { const fill = 8 - head.length - rest.length; if (fill < 1) return null; parts = [...head, ...Array(fill).fill("0"), ...rest]; }
  const groups = parts.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function blockedV4(p: number[]): boolean {
  const [a, b, c] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||        // CGNAT
    (a === 169 && b === 254) ||                  // lien local, métadonnées cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

const v4of = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/**
 * Vrai si l'adresse est interne, locale, réservée, de documentation ou non routable (protection SSRF).
 * Les formes qui incorporent une adresse IPv4 (mappée ::ffff:, SIIT, NAT64, 6to4) sont ramenées à l'IPv4 avant contrôle.
 * Pour l'IPv6, seul le monde routable 2000::/3 est autorisé, moins les plages spéciales. Toute valeur illisible est refusée.
 */
export function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) { const p = parseV4(ip); return !p || blockedV4(p); }
  if (v !== 6) return true;
  const g = parseV6(ip);
  if (!g) return true;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && g[5] === 0xffff) return blockedV4(v4of(g[6], g[7]));                 // ::ffff:a.b.c.d (IPv4 mappée)
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return blockedV4(v4of(g[6], g[7]));   // ::ffff:0:a.b.c.d (SIIT)
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return blockedV4(v4of(g[6], g[7])); // 64:ff9b::/96 (NAT64)
  if (zeros(0, 6)) return true;                                                             // ::/96 : :: , ::1 , IPv4 compatible
  if ((g[0] >> 13) !== 1) return true;                                                      // hors 2000::/3 : fc00::/7, fe80::/10, ff00::/8…
  if (g[0] === 0x2002) return blockedV4(v4of(g[1], g[2]));                                  // 6to4 : IPv4 incorporée
  if (g[0] === 0x2001 && g[1] < 0x0200) return true;                                        // 2001::/23 : Teredo, ORCHID, protocoles IETF
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                                      // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return true;                                        // documentation (3fff::/20)
  if (g[0] === 0x5f00) return true;                                                         // SRv6
  return false;
}
