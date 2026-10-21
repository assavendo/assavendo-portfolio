"use client";
import { useMemo, useState } from "react";
import { cartModel } from "@/lib/tools/finance";
import { Num, fmt, money } from "./shared";
import { ToolActions } from "./ToolActions";

export default function CartTool() {
  const [s, set] = useState({ visits: 10000, conversionPct: 1.8, avgOrder: 65, abandonmentPct: 70, recoveryGainPct: 10 });
  const bind = (k: keyof typeof s) => (n: number) => set((v) => ({ ...v, [k]: n }));
  const ok = Object.values(s).every(Number.isFinite) && s.abandonmentPct < 100;
  const r = useMemo(() => (ok ? cartModel(s) : null), [s, ok]);
  return (
    <div>
      <p className="alert note">Valeurs de départ : données d'exemple, à remplacer par celles de votre boutique.</p>
      <div className="grid2" style={{ marginTop: "1rem" }}>
        <Num label="Visites par mois" value={s.visits} set={bind("visits")} step={500} />
        <Num label="Taux de conversion actuel" suffix="%" value={s.conversionPct} set={bind("conversionPct")} step={0.1} />
        <Num label="Panier moyen" suffix="€" value={s.avgOrder} set={bind("avgOrder")} step={1} />
        <Num label="Paniers abandonnés" suffix="%" value={s.abandonmentPct} set={bind("abandonmentPct")} step={1} />
        <Num label="Part des abandons que vous espérez récupérer" suffix="%" value={s.recoveryGainPct} set={bind("recoveryGainPct")} step={1} />
      </div>
      {r ? (
        <div className="kpis" aria-live="polite">
          <div className="kpi"><b>{fmt(r.orders)}</b><small>commandes par mois aujourd'hui</small></div>
          <div className="kpi"><b>{money(r.revenue)}</b><small>chiffre d'affaires actuel</small></div>
          <div className="kpi"><b>{fmt(r.abandoned)}</b><small>paniers abandonnés par mois</small></div>
          <div className="kpi" style={{ borderColor: "var(--ink)" }}><b>{money(r.recoveredRevenue)}</b><small>récupérable par mois ({fmt(r.recoveredOrders)} commandes)</small></div>
        </div>
      ) : <p className="muted" style={{ marginTop: "1rem" }}>Renseignez des valeurs valides (abandon inférieur à 100 %).</p>}
      {r ? <ToolActions summary={`Paniers abandonnés : ${fmt(r.abandoned)} par mois, dont environ ${money(r.recoveredRevenue)} récupérables (${fmt(r.recoveredOrders)} commandes) selon mes hypothèses.`} subject={`Paniers abandonnés : ${money(r.recoveredRevenue)} récupérables par mois selon ma simulation`} cta="Réduire mes abandons de panier" /> : null}
      <p className="muted small" style={{ marginTop: "1rem" }}>Simulation arithmétique : le taux de récupération réel dépend de votre boutique et doit être mesuré.</p>
    </div>
  );
}
