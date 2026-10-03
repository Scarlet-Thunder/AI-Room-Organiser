// AI layout engine: simulated annealing over furniture positions/rotations,
// minimising the feng shui penalty from fengshui.js. Several random restarts;
// the best layout (including the walkway check) wins.

import { CATALOG } from './catalog.js';
import { evaluate, freeKeys, snapToWall, clampInside, backWall, resolve, wallLength, halfExtents } from './fengshui.js';

const WALLS = ['N', 'E', 'S', 'W'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round to the centimetre, push wall-backed pieces flush, keep inside the room. */
export function settle(inst, room) {
  let s = clampInside({ ...inst, x: Math.round(inst.x * 100) / 100, z: Math.round(inst.z * 100) / 100 }, room);
  const wall = backWall(resolve([s])[0], room);
  if (wall) {
    const [hx, hz] = halfExtents(CATALOG[s.type], s.rot);
    if (wall === 'N') s.z = hz;
    else if (wall === 'S') s.z = room.depth - hz;
    else if (wall === 'W') s.x = hx;
    else s.x = room.width - hx;
  }
  s.x = Math.round(s.x * 1000) / 1000;
  s.z = Math.round(s.z * 1000) / 1000;
  return s;
}

export function optimize(room, instances, { seed = 1, iterations = 14000, restarts = 8, onProgress } = {}) {
  const rand = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const free = new Set(freeKeys(instances));
  const freeIdx = instances.map((inst, i) => (free.has(inst.key) ? i : -1)).filter((i) => i >= 0);
  const energy = (s) => evaluate(room, s, { withWalkway: false }).penalty;

  if (!freeIdx.length) {
    return { instances, result: evaluate(room, instances) };
  }

  const randomPlace = (inst) => {
    const def = CATALOG[inst.type];
    if (def.wall || def.commanding) return snapToWall(inst, room, WALLS[(rand() * 4) | 0], rand());
    const rot = (rand() * 4) | 0;
    return clampInside({ ...inst, rot, x: rand() * room.width, z: rand() * room.depth }, room);
  };

  const mutate = (state, progress) => {
    const next = state.slice();
    const i = freeIdx[(rand() * freeIdx.length) | 0];
    const cur = next[i];
    const r = rand();
    const sigma = 0.04 + 0.6 * (1 - progress);
    if (r < 0.3) {
      next[i] = clampInside({ ...cur, x: cur.x + gauss() * sigma, z: cur.z + gauss() * sigma }, room);
    } else if (r < 0.5) {
      next[i] = snapToWall(cur, room, WALLS[(rand() * 4) | 0], rand());
    } else if (r < 0.65) {
      const p = resolve([cur])[0];
      const wall = backWall(p, room);
      if (wall) {
        const def = CATALOG[cur.type];
        const [hx, hz] = halfExtents(def, cur.rot);
        const along = wall === 'N' || wall === 'S' ? hx : hz;
        const len = wallLength(room, wall);
        const pos = wall === 'N' || wall === 'S' ? cur.x : cur.z;
        const span = Math.max(1e-6, len - 2 * along);
        const t = Math.min(1, Math.max(0, (pos - along) / span + gauss() * sigma / span));
        next[i] = snapToWall(cur, room, wall, t);
      } else {
        next[i] = clampInside({ ...cur, x: cur.x + gauss() * sigma, z: cur.z + gauss() * sigma }, room);
      }
    } else if (r < 0.75) {
      next[i] = clampInside({ ...cur, rot: (rand() * 4) | 0 }, room);
    } else if (r < 0.87 && freeIdx.length > 1) {
      const j = freeIdx[(rand() * freeIdx.length) | 0];
      if (j !== i) {
        const other = next[j];
        next[i] = clampInside({ ...cur, x: other.x, z: other.z, rot: other.rot }, room);
        next[j] = clampInside({ ...other, x: cur.x, z: cur.z, rot: cur.rot }, room);
      }
    } else {
      next[i] = randomPlace(cur);
    }
    return next;
  };

  let globalBest = null;
  for (let run = 0; run < restarts; run++) {
    let state = instances.map((inst) => (free.has(inst.key) ? randomPlace(inst) : inst));
    let e = energy(state);
    let best = state, bestE = e;
    const T0 = 30, T1 = 0.08;
    for (let it = 0; it < iterations; it++) {
      const progress = it / iterations;
      const T = T0 * Math.pow(T1 / T0, progress);
      const cand = mutate(state, progress);
      const ce = energy(cand);
      if (ce <= e || rand() < Math.exp((e - ce) / T)) {
        state = cand;
        e = ce;
        if (e < bestE) { best = state; bestE = e; }
      }
    }
    // Greedy polish with small moves.
    state = best; e = bestE;
    for (let it = 0; it < 1500; it++) {
      const cand = mutate(state, 1);
      const ce = energy(cand);
      if (ce < e) { state = cand; e = ce; }
    }
    const rounded = state.map((s) => (free.has(s.key) ? settle(s, room) : s));
    const result = evaluate(room, rounded);
    if (!globalBest || result.penalty < globalBest.result.penalty) globalBest = { instances: rounded, result };
    if (onProgress) onProgress((run + 1) / restarts, globalBest.result.score);
  }
  return globalBest;
}
