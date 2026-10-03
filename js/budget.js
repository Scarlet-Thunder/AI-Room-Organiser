// Picks a quality tier for every selected item so the total fits the budget.
// 1. Everything starts at Essential (or the tier the user locked).
// 2. If still over budget, drop nice-to-haves (least important, priciest first).
// 3. Spend what's left upgrading the items that matter most per dollar.

import { CATALOG, UPGRADE_WEIGHT } from './catalog.js';

/**
 * selection: [{ id, type, qty, must, lockedTier: null | 0 | 1 | 2 }]
 * returns { lines: [{ id, type, qty, tier, unit, total, included }], total, budget, over, dropped }
 */
export function fitBudget(selection, budget) {
  const lines = selection.map((s) => ({
    id: s.id, type: s.type, qty: s.qty, must: s.must,
    locked: s.lockedTier != null, tier: s.lockedTier ?? 0, included: true,
  }));
  const price = (l, tier = l.tier) => CATALOG[l.type].prices[tier] * l.qty;
  const sum = () => lines.reduce((t, l) => t + (l.included ? price(l) : 0), 0);

  const dropped = [];
  const optional = lines.filter((l) => !l.must)
    .sort((a, b) => (UPGRADE_WEIGHT[a.type] - UPGRADE_WEIGHT[b.type]) || (price(b) - price(a)));
  for (const l of optional) {
    if (sum() <= budget) break;
    l.included = false;
    dropped.push(l.id);
  }

  // Greedy upgrades by value (importance per extra dollar).
  for (;;) {
    const left = budget - sum();
    let best = null, bestValue = 0;
    for (const l of lines) {
      if (!l.included || l.locked || l.tier >= 2) continue;
      const cost = price(l, l.tier + 1) - price(l);
      if (cost > left) continue;
      const value = (UPGRADE_WEIGHT[l.type] || 1) / cost;
      if (value > bestValue) { best = l; bestValue = value; }
    }
    if (!best) break;
    best.tier++;
  }

  const total = sum();
  return {
    lines: lines.map((l) => ({ ...l, unit: CATALOG[l.type].prices[l.tier], total: l.included ? price(l) : 0 })),
    total,
    budget,
    over: total > budget,
    dropped,
  };
}
