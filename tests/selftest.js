// Browser self-test for the planning engine. Open tests/selftest.html via a local server.
import { ROOM_PRESETS, CATALOG } from '../js/catalog.js';
import { fitBudget } from '../js/budget.js';
import { evaluate, explain, resolve, backWall, bagua, overlapArea } from '../js/fengshui.js';
import { optimize } from '../js/optimizer.js';

export function presetInstances(key) {
  const p = ROOM_PRESETS[key];
  const out = [];
  p.items.forEach(([type, qty], n) => {
    for (let i = 0; i < qty; i++) out.push({ key: `${type}-${n}-${i}`, type, tier: 1, x: 1, z: 1, rot: 0 });
  });
  return out;
}

export function presetRoom(key) {
  const p = ROOM_PRESETS[key];
  return { width: p.width, depth: p.depth, height: 2.6, door: { ...p.door }, windows: p.windows.map((w) => ({ ...w })) };
}

export async function run(log) {
  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => { ok ? pass++ : fail++; log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

  // Budget
  const sel = [
    { id: 'a', type: 'bed_queen', qty: 1, must: true, lockedTier: null },
    { id: 'b', type: 'nightstand', qty: 2, must: true, lockedTier: null },
    { id: 'c', type: 'mirror', qty: 1, must: false, lockedTier: null },
    { id: 'd', type: 'wardrobe', qty: 1, must: false, lockedTier: null },
  ];
  const tight = fitBudget(sel, 500);
  check('budget: drops nice-to-haves when tight', !tight.over && tight.dropped.length > 0, `total $${tight.total}, dropped ${tight.dropped}`);
  const rich = fitBudget(sel, 10000);
  check('budget: upgrades everything when rich', rich.lines.every((l) => l.tier === 2), `total $${rich.total}`);
  const mid = fitBudget(sel, 2000);
  check('budget: never exceeds budget', mid.total <= 2000 && !mid.over, `total $${mid.total} tiers ${mid.lines.map((l) => l.tier).join('')}`);
  const bedFirst = fitBudget(sel, 1200);
  check('budget: upgrades the bed before the mirror', bedFirst.lines[0].tier >= bedFirst.lines[2].tier || !bedFirst.lines[2].included);

  // Geometry
  const room = presetRoom('bedroom');
  const bg = bagua(room);
  check('bagua: wealth corner is far-left of a south door', bg.wealthCorner[0] === 0 && bg.wealthCorner[1] === 0, JSON.stringify(bg.wealthCorner));

  // Optimizer on every preset
  for (const key of Object.keys(ROOM_PRESETS)) {
    const r = presetRoom(key);
    const t0 = performance.now();
    const best = optimize(r, presetInstances(key), { seed: 7 });
    const ms = Math.round(performance.now() - t0);
    const res = best.result;
    const placed = resolve(best.instances);
    const solid = placed.filter((p) => !p.def.floor);
    let overlaps = 0;
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      if (a.parent === b.key || b.parent === a.key || (a.parent && a.parent === b.parent)) continue;
      if (overlapArea(a, b) > 0.001) overlaps++;
    }
    const inside = placed.every((p) => p.x - p.hx > -0.01 && p.z - p.hz > -0.01 && p.x + p.hx < r.width + 0.01 && p.z + p.hz < r.depth + 0.01);
    const { checks } = explain(r, res);
    const bad = checks.filter((c) => c.status === 'bad').map((c) => c.title);
    check(`optimizer: ${key}`, overlaps === 0 && inside && res.score >= 60,
      `score ${res.score}, ${ms} ms, overlaps ${overlaps}, inside ${inside}, unreachable ${res.walk.unreachable.length}${bad.length ? ', bad: ' + bad.join('; ') : ''}`);
    const bed = placed.find((p) => p.type.startsWith('bed'));
    if (bed) check(`optimizer: ${key} bed against a wall`, !!backWall(bed, r), `rot ${bed.rot} at ${bed.x},${bed.z}`);
    const terms = Object.entries(res.terms).filter(([, v]) => v > 0.5).map(([k, v]) => `${k}:${v.toFixed(1)}`).join(' ');
    log(`      terms ${terms || '(none)'}`);
  }

  // Determinism
  const a = optimize(room, presetInstances('bedroom'), { seed: 3, iterations: 2000, restarts: 2 });
  const b = optimize(room, presetInstances('bedroom'), { seed: 3, iterations: 2000, restarts: 2 });
  check('optimizer: same seed gives same layout', JSON.stringify(a.instances) === JSON.stringify(b.instances));

  check('catalog: every item has 3 prices', Object.values(CATALOG).every((c) => c.prices.length === 3));
  log(`\n${pass} passed, ${fail} failed`);
  return { pass, fail };
}
