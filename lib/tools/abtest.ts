/** Fonction de répartition de la loi normale centrée réduite (approximation d'Abramowitz et Stegun). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** Inverse de la répartition normale (algorithme d'Acklam). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425; const hi = 1 - lo;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > hi) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5; const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** Visiteurs nécessaires par variante pour détecter un écart relatif donné (test bilatéral). */
export function sampleSize(baselinePct: number, relativeLiftPct: number, alpha = 0.05, power = 0.8): number {
  const p1 = baselinePct / 100; const p2 = p1 * (1 + relativeLiftPct / 100);
  if (p1 <= 0 || p2 <= 0 || p2 >= 1 || p1 >= 1 || p1 === p2) return NaN;
  const za = normInv(1 - alpha / 2); const zb = normInv(power); const pb = (p1 + p2) / 2;
  const n = ((za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / ((p2 - p1) ** 2);
  return Math.ceil(n);
}
export function significance(nA: number, cA: number, nB: number, cB: number) {
  const pA = cA / nA; const pB = cB / nB; const pool = (cA + cB) / (nA + nB);
  const se = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
  const z = se === 0 ? 0 : (pB - pA) / se; const pValue = 2 * (1 - normCdf(Math.abs(z)));
  return { pA, pB, lift: pA > 0 ? (pB - pA) / pA : NaN, z, pValue };
}
