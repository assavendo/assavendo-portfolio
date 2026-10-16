export type RoasInput = { price: number; productCost: number; shipping: number; paymentFeePct: number; paymentFeeFixed: number; returnRatePct: number; monthlyBudget: number };
export type RoasResult = { unitMargin: number; marginRate: number; breakevenRoas: number | null; maxCpa: number; scenarios: { roas: number; sales: number; revenue: number; profit: number }[] };

/**
 * Marge moyenne par commande. Pour une commande conservée : prix - coût - livraison - frais de paiement.
 * Pour une commande retournée : le client est remboursé, le produit revient en stock ;
 * la livraison et les frais de paiement restent à la charge du vendeur.
 */
export function roasModel(i: RoasInput): RoasResult {
  const r = Math.min(Math.max(i.returnRatePct, 0), 100) / 100;
  const fees = i.price * (i.paymentFeePct / 100) + i.paymentFeeFixed;
  const kept = i.price - i.productCost - i.shipping - fees;
  const returned = -(i.shipping + fees);
  const unitMargin = (1 - r) * kept + r * returned;
  const marginRate = i.price > 0 ? unitMargin / i.price : 0;
  const breakevenRoas = marginRate > 0 ? 1 / marginRate : null;
  const maxCpa = Math.max(0, unitMargin);
  const scenarios = [1, 1.5, 2, 3, 4, 5, 6].map((roas) => {
    const revenue = i.monthlyBudget * roas;
    const sales = i.price > 0 ? revenue / i.price : 0;
    return { roas, sales: Math.round(sales), revenue, profit: sales * unitMargin - i.monthlyBudget };
  });
  return { unitMargin, marginRate, breakevenRoas, maxCpa, scenarios };
}

export type CartInput = { visits: number; conversionPct: number; avgOrder: number; abandonmentPct: number; recoveryGainPct: number };
export function cartModel(i: CartInput) {
  const orders = i.visits * (i.conversionPct / 100);
  const revenue = orders * i.avgOrder;
  const carts = i.abandonmentPct < 100 ? orders / (1 - i.abandonmentPct / 100) : 0;
  const abandoned = carts - orders;
  const recovered = abandoned * (i.recoveryGainPct / 100);
  return { orders, revenue, carts, abandoned, recoveredOrders: recovered, recoveredRevenue: recovered * i.avgOrder };
}
