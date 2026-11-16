type FxRate = { rate: number; date: string | null; fetchedAt: number };

const cache = new Map<string, FxRate>();
const CACHE_MS = 6 * 60 * 60 * 1000;

export async function getRatesToEur(currencies: string[]): Promise<Record<string, FxRate>> {
  const normalized = [...new Set(currencies.map((v) => v.trim().toUpperCase()).filter(Boolean))];
  const result: Record<string, FxRate> = { EUR: { rate: 1, date: null, fetchedAt: Date.now() } };
  const missing: string[] = [];
  const now = Date.now();

  for (const currency of normalized) {
    if (currency === "EUR") continue;
    const hit = cache.get(currency);
    if (hit && now - hit.fetchedAt < CACHE_MS) result[currency] = hit;
    else missing.push(currency);
  }

  if (missing.length) {
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rates?base=EUR&quotes=${encodeURIComponent(missing.join(","))}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`FX service HTTP ${response.status}`);
    const data = await response.json() as { date?: string; base?: string; quote?: string; rate?: number }[];
    for (const row of data) {
      const quote = String(row.quote ?? "").toUpperCase();
      const rate = Number(row.rate);
      if (!quote || !Number.isFinite(rate) || rate <= 0) continue;
      const entry = { rate, date: row.date ?? null, fetchedAt: now };
      cache.set(quote, entry);
      result[quote] = entry;
    }
  }

  for (const currency of normalized) {
    if (currency === "EUR") continue;
    if (!result[currency]) throw new Error(`Aucun taux EUR disponible pour ${currency}.`);
  }
  return result;
}

export function toEurCents(sourceCents: number, sourceCurrency: string, rates: Record<string, FxRate>): number {
  const currency = sourceCurrency.trim().toUpperCase();
  if (currency === "EUR") return Math.round(sourceCents);
  const eurPerUnit = 1 / rates[currency].rate;
  return Math.round(sourceCents * eurPerUnit);
}
