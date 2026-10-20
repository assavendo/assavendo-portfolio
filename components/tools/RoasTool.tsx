"use client";
import { useMemo, useState } from "react";
import { roasModel } from "@/lib/tools/finance";
import { Num, fmt, money } from "./shared";
import { ToolActions } from "./ToolActions";

export default function RoasTool() {
  const [s, set] = useState({ price: 80, productCost: 28, shipping: 5, paymentFeePct: 1.5, paymentFeeFixed: 0.25, returnRatePct: 8, monthlyBudget: 2000 });
  const bind = (k: keyof typeof s) => (n: number) => set((v) => ({ ...v, [k]: n }));
  const ok = Object.values(s).every(Number.isFinite);
  const r = useMemo(() => (ok ? roasModel(s) : null), [s, ok]);
  return (
    <div>
      <p className="alert note">Valeurs de départ : données d'exemple, à remplacer par les vôtres.</p>
      <div className="grid2" style={{ marginTop: "1rem" }}>
        <Num label="Prix de vente TTC" suffix="€" value={s.price} set={bind("price")} step={0.5} />
        <Num label="Coût du produit" suffix="€" value={s.productCost} set={bind("productCost")} step={0.5} />
        <Num label="Livraison à votre charge" suffix="€" value={s.shipping} set={bind("shipping")} step={0.5} />
        <Num label="Frais de paiement" suffix="%" value={s.paymentFeePct} set={bind("paymentFeePct")} step={0.1} />
        <Num label="Frais fixes par paiement" suffix="€" value={s.paymentFeeFixed} set={bind("paymentFeeFixed")} step={0.05} />
        <Num label="Taux de retour" suffix="%" value={s.returnRatePct} set={bind("returnRatePct")} step={1} />
        <Num label="Budget publicitaire mensuel" suffix="€" value={s.monthlyBudget} set={bind("monthlyBudget")} step={100} />
      </div>
      {r ? (
        <div aria-live="polite">
          <div className="kpis">
            <div className="kpi"><b>{money(r.unitMargin)}</b><small>marge moyenne par commande</small></div>
            <div className="kpi"><b>{r.breakevenRoas ? fmt(r.breakevenRoas, 2) : "—"}</b><small>ROAS minimal pour ne pas perdre</small></div>
            <div className="kpi"><b>{money(r.maxCpa)}</b><small>coût maximal par vente</small></div>
          </div>
          {r.breakevenRoas === null ? <p className="alert alert-err" style={{ marginTop: "1rem" }}>Avec ces chiffres, chaque vente perd de l'argent avant même la publicité : revoyez le prix ou les coûts.</p> : null}
          <h3 style={{ marginTop: "1.5rem" }}>Scénarios sur {money(s.monthlyBudget)} de budget</h3>
          <div className="table-scroll"><table className="tbl"><thead><tr><th>ROAS obtenu</th><th>Ventes</th><th>Chiffre d'affaires</th><th>Résultat après publicité</th></tr></thead><tbody>
            {r.scenarios.map((x) => <tr key={x.roas}><td>{fmt(x.roas, 1)}</td><td>{fmt(x.sales)}</td><td>{money(x.revenue)}</td><td style={{ color: x.profit >= 0 ? "var(--ok)" : "var(--fail)", fontWeight: 650 }}>{money(x.profit)}</td></tr>)}
          </tbody></table></div>
          <ToolActions summary={`Rentabilité publicitaire : marge par commande ${money(r.unitMargin)}, ROAS minimal ${r.breakevenRoas ? fmt(r.breakevenRoas, 2) : "non atteignable"}, coût maximal par vente ${money(r.maxCpa)} (budget ${money(s.monthlyBudget)}/mois).`} subject={`Rentabilité de mon budget publicitaire (ROAS minimal ${r.breakevenRoas ? fmt(r.breakevenRoas, 2) : "non atteignable"})`} cta="Faire analyser mes campagnes" />
        </div>
      ) : <p className="muted">Renseignez tous les champs pour voir le résultat.</p>}
    </div>
  );
}
