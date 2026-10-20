/** Compteur en mémoire (par instance) : repli de lib/rate-limit.ts quand la base de limitation est injoignable. */
const memory = new Map<string, { n: number; reset: number }>();
export function memoryHit(key: string, max: number, windowSeconds: number, now = Date.now()): boolean {
  const e = memory.get(key);
  if (!e || e.reset <= now) {
    if (memory.size > 5000) for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
    memory.set(key, { n: 1, reset: now + windowSeconds * 1000 });
    return true;
  }
  e.n += 1;
  return e.n <= max;
}
