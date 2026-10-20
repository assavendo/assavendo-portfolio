export type Rating = "good" | "average" | "poor";
export type Metric = { id: "lcp" | "cls" | "tbt" | "fcp"; label: string; display: string; value: number; rating: Rating };
export type Opportunity = { title: string; detail: string; savingsMs: number | null };
export type PagespeedReport = {
  score: number; grade: "A" | "B" | "C" | "D" | "E"; metrics: Metric[]; opportunities: Opportunity[];
  field: { inp: { value: number; category: string } | null; lcp: { value: number; category: string } | null } | null;
  fetchedUrl: string;
};

const THRESHOLDS = { lcp: [2500, 4000], cls: [0.1, 0.25], tbt: [200, 600], fcp: [1800, 3000] } as const;
const rate = (id: keyof typeof THRESHOLDS, v: number): Rating => (v <= THRESHOLDS[id][0] ? "good" : v <= THRESHOLDS[id][1] ? "average" : "poor");
const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const stripMarkdown = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();

type Audit = { id?: string; title?: string; description?: string; score?: number | null; scoreDisplayMode?: string; numericValue?: number; displayValue?: string; details?: { type?: string; overallSavingsMs?: number } };

/** Transforme la réponse de l'API PageSpeed Insights en rapport lisible. Fonction pure : testée sans réseau. */
export function parsePagespeed(json: unknown): PagespeedReport {
  const j = json as { lighthouseResult?: { finalDisplayedUrl?: string; finalUrl?: string; categories?: { performance?: { score?: number | null } }; audits?: Record<string, Audit> }; loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> } };
  const lh = j?.lighthouseResult;
  const raw = lh?.categories?.performance?.score;
  if (!lh || typeof raw !== "number") throw new Error("Réponse PageSpeed inexploitable");
  const audits = lh.audits ?? {};
  const score = Math.round(raw * 100);
  const m = (id: Metric["id"], auditKey: string, label: string, fmt: (v: number) => string): Metric | null => {
    const v = audits[auditKey]?.numericValue;
    return typeof v === "number" ? { id, label, value: v, display: fmt(v), rating: rate(id, v) } : null;
  };
  const metrics = [
    m("lcp", "largest-contentful-paint", "Affichage du contenu principal (LCP)", seconds),
    m("fcp", "first-contentful-paint", "Premier affichage (FCP)", seconds),
    m("tbt", "total-blocking-time", "Temps de blocage (TBT)", (v) => `${Math.round(v)} ms`),
    m("cls", "cumulative-layout-shift", "Stabilité visuelle (CLS)", (v) => v.toFixed(2).replace(".", ",")),
  ].filter((x): x is Metric => x !== null);

  const all = Object.entries(audits).map(([id, a]) => ({ id, ...a }));
  const byOpportunity = all.filter((a) => a.details?.type === "opportunity" && (a.details.overallSavingsMs ?? 0) > 0)
    .sort((a, b) => (b.details!.overallSavingsMs ?? 0) - (a.details!.overallSavingsMs ?? 0))
    .map((a): Opportunity => ({ title: a.title ?? a.id, detail: stripMarkdown(a.description ?? "").split(". ")[0].replace(/\.$/, "") + ".", savingsMs: Math.round(a.details!.overallSavingsMs!) }));
  const diagnostics = all.filter((a) => a.details?.type !== "opportunity" && typeof a.score === "number" && a.score < 0.9 && !["informative", "manual", "notApplicable"].includes(a.scoreDisplayMode ?? "") && a.title)
    .sort((a, b) => (a.score as number) - (b.score as number))
    .map((a): Opportunity => ({ title: a.title!, detail: a.displayValue ? `${a.displayValue}.` : stripMarkdown(a.description ?? "").split(". ")[0] + ".", savingsMs: null }));
  const opportunities = [...byOpportunity, ...diagnostics].slice(0, 3);

  const fm = j.loadingExperience?.metrics ?? {};
  const pick = (k: string) => (typeof fm[k]?.percentile === "number" ? { value: fm[k]!.percentile!, category: String(fm[k]!.category ?? "") } : null);
  const inp = pick("INTERACTION_TO_NEXT_PAINT"); const lcpField = pick("LARGEST_CONTENTFUL_PAINT_MS");
  return {
    score, grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 50 ? "C" : score >= 25 ? "D" : "E",
    metrics, opportunities, field: inp || lcpField ? { inp, lcp: lcpField } : null, fetchedUrl: lh.finalDisplayedUrl ?? lh.finalUrl ?? "",
  };
}
