"use client";
import { useMemo, useState } from "react";
import { sampleSize, significance } from "@/lib/tools/abtest";
import { Num, fmt } from "./shared";
import { ToolActions } from "./ToolActions";

export default function AbTool() {
  const [base, setBase] = useState(3); const [lift, setLift] = useState(15);
  const [nA, setNA] = useState(2400); const [cA, setCA] = useState(72); const [nB, setNB] = useState(2400); const [cB, setCB] = useState(94);
  const size = useMemo(() => sampleSize(base, lift), [base, lift]);
  const sig = useMemo(() => (nA > 0 && nB > 0 && cA >= 0 && cB >= 0 && cA <= nA && cB <= nB ? significance(nA, cA, nB, cB) : null), [nA, cA, nB, cB]);
  return (
    <div>
      <h3>1. Avant de lancer : combien de visiteurs faut-il ?</h3>
      <div className="grid2"><Num label="Taux de conversion actuel" suffix="%" value={base} set={setBase} step={0.1} /><Num label="Amélioration minimale qui vous intéresse" suffix="% relatif" value={lift} set={setLift} step={1} /></div>
      <div className="kpis"><div className="kpi"><b>{Number.isFinite(size) ? fmt(size) : "—"}</b><small>visiteurs par variante (confiance 95 %, puissance 80 %)</small></div><div className="kpi"><b>{Number.isFinite(size) ? fmt(size * 2) : "—"}</b><small>visiteurs au total</small></div></div>
      <h3 style={{ marginTop: "2rem" }}>2. Après le test : l'écart est-il réel ?</h3>
      <div className="grid2"><Num label="Visiteurs A" value={nA} set={setNA} step={100} /><Num label="Conversions A" value={cA} set={setCA} /><Num label="Visiteurs B" value={nB} set={setNB} step={100} /><Num label="Conversions B" value={cB} set={setCB} /></div>
      {sig ? (
        <div aria-live="polite">
          <div className="kpis">
            <div className="kpi"><b>{fmt(sig.pA * 100, 2)} % → {fmt(sig.pB * 100, 2)} %</b><small>taux de conversion A → B</small></div>
            <div className="kpi"><b>{Number.isFinite(sig.lift) ? `${sig.lift >= 0 ? "+" : ""}${fmt(sig.lift * 100, 1)} %` : "—"}</b><small>écart relatif</small></div>
            <div className="kpi"><b>{fmt(sig.pValue, 3)}</b><small>valeur p (test bilatéral)</small></div>
          </div>
          <p className={`alert ${sig.pValue < 0.05 ? "alert-ok" : "alert-err"}`} style={{ marginTop: "1rem" }}>
            {sig.pValue < 0.05 ? "L'écart est statistiquement significatif au seuil de 5 %, à condition d'avoir atteint la taille d'échantillon prévue et de ne pas avoir arrêté le test au premier écart favorable."
              : "L'écart n'est pas significatif : il peut très bien venir du hasard. Ne déployez pas la variante sur cette seule base ; poursuivez le test jusqu'à la taille d'échantillon calculée."}
          </p>
          <ToolActions summary={`Test A/B : ${fmt(sig.pA * 100, 2)} % → ${fmt(sig.pB * 100, 2)} %, valeur p ${fmt(sig.pValue, 3)}. Échantillon recommandé : ${Number.isFinite(size) ? fmt(size) : "—"} visiteurs par variante.`} subject={`Mon test A/B est-il fiable ? (p = ${fmt(sig.pValue, 3)})`} cta="Faire relire mon test A/B" />
        </div>
      ) : <p className="muted">Vérifiez que les conversions ne dépassent pas les visiteurs.</p>}
    </div>
  );
}
