// Feng shui layout model: geometry, attachments, scoring and explanations.
// Shared by the UI (live scoring while dragging) and the optimizer worker.
//
// Coordinates (metres): x runs west -> east (0..width), z runs north -> south
// (0..depth). Plan view draws north at the top. rot is 0..3 (x 90 degrees);
// an item with rot 0 has its back to the north and faces south (+z).

import { CATALOG } from './catalog.js';

const F = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // facing (front) vector per rot
const L = [[1, 0], [0, -1], [-1, 0], [0, 1]];   // lateral vector per rot
const WALL_FACING_ROT = { N: 0, W: 1, S: 2, E: 3 }; // rot that puts the back on this wall
const SOFAS = ['sofa', 'loveseat'];
const BEDS = ['bed_queen', 'bed_king', 'bed_twin'];
export const WALKWAY = 0.55; // metres of clear path we require

export const facing = (rot) => F[rot];
export const lateral = (rot) => L[rot];

export function halfExtents(def, rot) {
  return rot % 2 ? [def.d / 2, def.w / 2] : [def.w / 2, def.d / 2];
}

function toWorld(p, lx, lz) {
  return [p.x + lx * L[p.rot][0] + lz * F[p.rot][0], p.z + lx * L[p.rot][1] + lz * F[p.rot][1]];
}

/** Local rect (relative to item p, in its own frame) -> world AABB. */
function localRect(p, cx, cz, sw, sd) {
  const [x, z] = toWorld(p, cx, cz);
  return p.rot % 2 ? { x, z, hx: sd / 2, hz: sw / 2 } : { x, z, hx: sw / 2, hz: sd / 2 };
}

export function overlapArea(a, b) {
  const ox = Math.min(a.x + a.hx, b.x + b.hx) - Math.max(a.x - a.hx, b.x - b.hx);
  const oz = Math.min(a.z + a.hz, b.z + b.hz) - Math.max(a.z - a.hz, b.z - b.hz);
  return ox > 0 && oz > 0 ? ox * oz : 0;
}

function rectDistance(a, b) {
  const dx = Math.max(0, Math.abs(a.x - b.x) - a.hx - b.hx);
  const dz = Math.max(0, Math.abs(a.z - b.z) - a.hz - b.hz);
  return Math.hypot(dx, dz);
}

function outsideArea(r, room) {
  const inX = Math.max(0, Math.min(r.x + r.hx, room.width) - Math.max(r.x - r.hx, 0));
  const inZ = Math.max(0, Math.min(r.z + r.hz, room.depth) - Math.max(r.z - r.hz, 0));
  return 4 * r.hx * r.hz - inX * inZ;
}

const angleDeg = (ax, az, bx, bz) => {
  const c = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1e-9);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};

/* ---------------- Room features ---------------- */

export function wallInfo(room, wall, offset) {
  const { width: W, depth: D } = room;
  switch (wall) {
    case 'N': return { p: [offset, 0], n: [0, 1], t: [1, 0] };
    case 'S': return { p: [offset, D], n: [0, -1], t: [1, 0] };
    case 'W': return { p: [0, offset], n: [1, 0], t: [0, 1] };
    default: return { p: [W, offset], n: [-1, 0], t: [0, 1] };
  }
}

export function wallLength(room, wall) {
  return wall === 'N' || wall === 'S' ? room.width : room.depth;
}

export function doorInfo(room) {
  const { wall, offset, width } = room.door;
  const w = wallInfo(room, wall, offset);
  const along = (half, depth, dist) => {
    const cx = w.p[0] + w.n[0] * dist, cz = w.p[1] + w.n[1] * dist;
    return w.t[0] ? { x: cx, z: cz, hx: half, hz: depth / 2 } : { x: cx, z: cz, hx: depth / 2, hz: half };
  };
  return {
    ...w,
    width,
    swing: along(width / 2, width, width / 2),
    path: along(width / 2, 1.6, 0.8),
  };
}

/** Bagua map oriented with the entrance wall at the bottom. */
export const BAGUA_LABELS = [
  ['Knowledge', 'Career', 'Helpful people'],
  ['Family', 'Health', 'Children'],
  ['Wealth', 'Fame', 'Love'],
];
export function bagua(room) {
  const { width: W, depth: D } = room;
  const wall = room.door.wall;
  // (u: 0 = left .. 1 = right as you enter, v: 0 = entrance .. 1 = far wall) -> world
  const map = (u, v) => {
    switch (wall) {
      case 'S': return [u * W, D - v * D];
      case 'N': return [W - u * W, v * D];
      case 'W': return [v * W, u * D];
      default: return [W - v * W, D - u * D];
    }
  };
  const zones = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const [x1, z1] = map(c / 3, r / 3), [x2, z2] = map((c + 1) / 3, (r + 1) / 3);
      zones.push({
        label: BAGUA_LABELS[r][c],
        x: Math.min(x1, x2), z: Math.min(z1, z2), w: Math.abs(x2 - x1), d: Math.abs(z2 - z1),
      });
    }
  }
  return { zones, wealthCorner: map(0, 1), loveCorner: map(1, 1) };
}

/* ---------------- Attachments ---------------- */

/**
 * Some items are positioned relative to a parent (nightstands flank the bed,
 * the chair tucks into the desk...). Returns Map key -> { parent, place(p) }.
 */
function attachmentPlan(instances) {
  const byType = (types) => instances.filter((i) => types.includes(i.type));
  const beds = byType(BEDS), sofas = byType(SOFAS), desks = byType(['desk']);
  const plan = new Map();
  let ns = 0, chairs = 0, cts = 0, sts = 0;
  for (const inst of instances) {
    const def = CATALOG[inst.type];
    if (inst.type === 'nightstand' && beds[0] && ns < 2) {
      const side = ns++ === 0 ? -1 : 1;
      plan.set(inst.key, { parent: beds[0].key, place: (b) => ({ lx: side * (b.w / 2 + 0.05 + def.w / 2), lz: -b.d / 2 + def.d / 2, dr: 0 }) });
    } else if (inst.type === 'office_chair' && desks[chairs]) {
      plan.set(inst.key, { parent: desks[chairs++].key, place: (d) => ({ lx: 0, lz: d.d / 2 + 0.1, dr: 2 }) });
    } else if (inst.type === 'coffee_table' && sofas[cts]) {
      plan.set(inst.key, { parent: sofas[cts++].key, place: (s) => ({ lx: 0, lz: s.d / 2 + 0.4 + def.d / 2, dr: 0 }) });
    } else if (inst.type === 'side_table' && sofas[0] && sts < 2) {
      const side = sts++ === 0 ? 1 : -1;
      plan.set(inst.key, { parent: sofas[0].key, place: (s) => ({ lx: side * (s.w / 2 + 0.05 + def.w / 2), lz: -s.d / 2 + 0.35, dr: 0 }) });
    } else if (inst.type === 'rug' && (sofas[0] || beds[0])) {
      const parent = sofas[0] || beds[0];
      const onSofa = !!sofas[0];
      plan.set(inst.key, { parent: parent.key, place: (p) => ({ lx: 0, lz: onSofa ? p.d / 2 + 0.55 : p.d * 0.22, dr: 0 }) });
    }
  }
  return plan;
}

export function freeKeys(instances) {
  const plan = attachmentPlan(instances);
  return instances.filter((i) => !plan.has(i.key)).map((i) => i.key);
}

/** Expand instances into fully placed items (attachments resolved). */
export function resolve(instances) {
  const plan = attachmentPlan(instances);
  const out = new Map();
  const build = (inst, x, z, rot, parent) => {
    const def = CATALOG[inst.type];
    const [hx, hz] = halfExtents(def, rot);
    return { key: inst.key, type: inst.type, tier: inst.tier, def, x, z, rot, w: def.w, d: def.d, h: def.h, hx, hz, parent: parent || null };
  };
  for (const inst of instances) if (!plan.has(inst.key)) out.set(inst.key, build(inst, inst.x, inst.z, inst.rot));
  for (const inst of instances) {
    const a = plan.get(inst.key);
    if (!a) continue;
    const p = out.get(a.parent);
    const { lx, lz, dr } = a.place(p);
    const [x, z] = toWorld(p, lx, lz);
    out.set(inst.key, build(inst, x, z, (p.rot + dr) % 4, p.key));
  }
  return instances.map((i) => out.get(i.key));
}

/* ---------------- Wall helpers ---------------- */

const WALL_TOL = 0.04;
/** Which wall the item's back is flush against (or null). */
export function backWall(p, room) {
  switch (p.rot) {
    case 0: return Math.abs(p.z - p.hz) < WALL_TOL ? 'N' : null;
    case 1: return Math.abs(p.x - p.hx) < WALL_TOL ? 'W' : null;
    case 2: return Math.abs(p.z + p.hz - room.depth) < WALL_TOL ? 'S' : null;
    default: return Math.abs(p.x + p.hx - room.width) < WALL_TOL ? 'E' : null;
  }
}
function backGap(p, room) {
  switch (p.rot) {
    case 0: return Math.max(0, p.z - p.hz);
    case 1: return Math.max(0, p.x - p.hx);
    case 2: return Math.max(0, room.depth - p.z - p.hz);
    default: return Math.max(0, room.width - p.x - p.hx);
  }
}
function alongRange(p, wall) {
  return wall === 'N' || wall === 'S' ? [p.x - p.hx, p.x + p.hx] : [p.z - p.hz, p.z + p.hz];
}
function windowOverlap(p, room, wall) {
  let total = 0;
  const [a, b] = alongRange(p, wall);
  for (const win of room.windows) {
    if (win.wall !== wall) continue;
    total += Math.max(0, Math.min(b, win.offset + win.width / 2) - Math.max(a, win.offset - win.width / 2));
  }
  return total;
}

/** Place a free item flush against a wall at position t (0..1 along the wall). */
export function snapToWall(inst, room, wall, t) {
  const def = CATALOG[inst.type];
  const rot = WALL_FACING_ROT[wall];
  const [hx, hz] = halfExtents(def, rot);
  const len = wallLength(room, wall);
  const along = wall === 'N' || wall === 'S' ? hx : hz;
  const pos = along + t * Math.max(0, len - 2 * along);
  if (wall === 'N') return { ...inst, rot, x: pos, z: hz };
  if (wall === 'S') return { ...inst, rot, x: pos, z: room.depth - hz };
  if (wall === 'W') return { ...inst, rot, x: hx, z: pos };
  return { ...inst, rot, x: room.width - hx, z: pos };
}

export function clampInside(inst, room) {
  const def = CATALOG[inst.type];
  const [hx, hz] = halfExtents(def, inst.rot);
  return {
    ...inst,
    x: Math.min(Math.max(inst.x, hx), Math.max(hx, room.width - hx)),
    z: Math.min(Math.max(inst.z, hz), Math.max(hz, room.depth - hz)),
  };
}

/* ---------------- Scoring ---------------- */

const COMMAND_W = {
  bed: { back: 35, line: 30, far: 12 },
  desk: { back: 30, line: 10, far: 8 },
  sofa: { back: 25, line: 6, far: 6 },
};

function accessZones(p) {
  const a = p.def.access;
  if (!a) return [];
  const zones = [];
  if (a.front) zones.push(localRect(p, 0, p.d / 2 + a.front / 2, p.w, a.front));
  if (a.sides) {
    zones.push(localRect(p, -(p.w / 2 + a.sides / 2), 0.1 * p.d, a.sides, p.d * 0.75));
    zones.push(localRect(p, p.w / 2 + a.sides / 2, 0.1 * p.d, a.sides, p.d * 0.75));
  }
  if (a.around) {
    const s = a.around;
    zones.push(localRect(p, 0, p.d / 2 + s / 2, p.w, s), localRect(p, 0, -p.d / 2 - s / 2, p.w, s),
      localRect(p, -p.w / 2 - s / 2, 0, s, p.d), localRect(p, p.w / 2 + s / 2, 0, s, p.d));
  }
  return zones;
}

const related = (a, b) => a.parent === b.key || b.parent === a.key || (a.parent && a.parent === b.parent);

/**
 * Score a layout. Returns { penalty, score (0..100), terms, placed }.
 * withWalkway: also run the (slower) grid path check.
 */
export function evaluate(room, instances, { withWalkway = true } = {}) {
  const placed = resolve(instances);
  const door = doorInfo(room);
  const solid = placed.filter((p) => !p.def.floor);
  const t = { bounds: 0, overlap: 0, entry: 0, access: 0, window: 0, wall: 0, command: 0, relation: 0, decor: 0, center: 0, balance: 0, walkway: 0 };
  const diag = Math.hypot(room.width, room.depth);

  for (const p of placed) {
    t.bounds += (Math.max(0, p.hx - p.x) + Math.max(0, p.x + p.hx - room.width)
      + Math.max(0, p.hz - p.z) + Math.max(0, p.z + p.hz - room.depth)) * 200;
  }

  for (let i = 0; i < solid.length; i++) {
    const a = solid[i];
    for (let j = i + 1; j < solid.length; j++) {
      const b = solid[j];
      if (related(a, b)) continue;
      const o = overlapArea(a, b);
      if (o) t.overlap += 300 * o + 5;
    }
    t.entry += 200 * overlapArea(a, door.swing) + 40 * overlapArea(a, door.path);
  }

  for (const p of placed) {
    for (const z of accessZones(p)) {
      t.access += 40 * outsideArea(z, room);
      for (const q of solid) {
        if (q === p || related(p, q)) continue;
        t.access += 60 * overlapArea(z, q);
      }
    }
  }

  for (const p of solid) {
    const def = p.def;
    const wall = backWall(p, room);
    if (def.wall && !p.parent) {
      if (!wall) t.wall += def.wall * 0.5 + def.wall * 0.5 * Math.min(1, backGap(p, room));
    }
    if (wall) {
      const perM = BEDS.includes(p.type) ? 40 : p.h > 0.95 ? 15 : 0;
      t.window += perM * windowOverlap(p, room, wall);
    }
    if (def.commanding) {
      const w = COMMAND_W[def.commanding];
      const vx = door.p[0] - p.x, vz = door.p[1] - p.z;
      const dist = Math.hypot(vx, vz);
      const [fx, fz] = F[p.rot], [lx, lz] = L[p.rot];
      const ang = angleDeg(fx, fz, vx, vz);
      if (ang > 95) t.command += w.back * (ang - 95) / 85;
      const lateralOff = Math.abs(vx * lx + vz * lz);
      const half = p.w / 2 + 0.1;
      if (vx * fx + vz * fz > 0 && lateralOff < half) t.command += w.line * (0.5 + 0.5 * (1 - lateralOff / half));
      t.command += w.far * Math.max(0, 1 - dist / diag);
    }
    if (p.h > 1.2) {
      const c = { x: room.width / 2, z: room.depth / 2, hx: room.width / 6, hz: room.depth / 6 };
      t.center += 25 * overlapArea(p, c);
    }
  }

  // Relationships
  const first = (types) => placed.find((p) => types.includes(p.type));
  const seat = first(SOFAS);
  for (const p of placed) {
    if (p.type === 'tv_stand') {
      const target = seat || first(['armchair']) || first(BEDS);
      if (target) {
        const vx = target.x - p.x, vz = target.z - p.z, d = Math.hypot(vx, vz);
        t.relation += 20 * Math.min(1, angleDeg(F[p.rot][0], F[p.rot][1], vx, vz) / 90);
        t.relation += 15 * Math.min(1, angleDeg(F[target.rot][0], F[target.rot][1], -vx, -vz) / 90);
        if (d < 1.8) t.relation += (1.8 - d) * 15;
        if (d > 3.8) t.relation += (d - 3.8) * 8;
      }
    } else if (p.type === 'armchair') {
      const target = first(['coffee_table']) || seat || first(['tv_stand']);
      const tx = target ? target.x : room.width / 2, tz = target ? target.z : room.depth / 2;
      const vx = tx - p.x, vz = tz - p.z, d = Math.hypot(vx, vz);
      t.relation += 15 * Math.min(1, angleDeg(F[p.rot][0], F[p.rot][1], vx, vz) / 90);
      if (d < 0.9) t.relation += (0.9 - d) * 8;
      if (d > 2.0) t.relation += (d - 2.0) * 8;
    }
  }

  // Decor: plants in corners (first one in the wealth corner), lamps by seating, mirrors.
  const bg = bagua(room);
  const corners = [[0, 0], [room.width, 0], [0, room.depth], [room.width, room.depth]];
  let plantIdx = 0;
  for (const p of placed) {
    if (p.type === 'plant') {
      const target = plantIdx++ === 0 ? [bg.wealthCorner] : corners;
      const d = Math.min(...target.map(([cx, cz]) => Math.hypot(p.x - cx, p.z - cz)));
      t.decor += Math.max(0, d - 0.45) * (plantIdx === 1 ? 8 : 5);
    } else if (p.type === 'floor_lamp') {
      const anchors = placed.filter((q) => ['sofa', 'loveseat', 'armchair', 'desk', ...BEDS].includes(q.type));
      if (anchors.length) t.decor += Math.max(0, Math.min(...anchors.map((q) => rectDistance(p, q))) - 0.3) * 8;
      t.decor += Math.min(p.x, p.z, room.width - p.x, room.depth - p.z) * 3;
    } else if (p.type === 'mirror') {
      const lane = localRect(p, 0, p.d / 2 + diag / 2, p.w, diag);
      const bed = first(BEDS);
      if (bed && overlapArea(lane, bed) > 0) t.decor += 30;
      if (pointInRect(door.p, { ...lane, hx: lane.hx + 0.05, hz: lane.hz + 0.05 })) t.decor += 20;
    }
  }

  // Balance: area-weighted centre of mass near the room centre.
  let ax = 0, az = 0, at = 0;
  for (const p of solid) { const a = p.w * p.d; ax += p.x * a; az += p.z * a; at += a; }
  if (at) t.balance = 4 * Math.hypot(ax / at - room.width / 2, az / at - room.depth / 2);

  let walk = null;
  if (withWalkway) {
    walk = walkway(room, placed);
    t.walkway = 25 * walk.unreachable.length + (walk.doorBlocked ? 50 : 0);
  }

  const penalty = Object.values(t).reduce((s, v) => s + v, 0);
  return { penalty, score: Math.round(100 * Math.exp(-penalty / 90)), terms: t, placed, walk };
}

function pointInRect([x, z], r) {
  return Math.abs(x - r.x) <= r.hx && Math.abs(z - r.z) <= r.hz;
}

/* ---------------- Walkway check ---------------- */

/**
 * Grid flood fill from the door with furniture inflated by half the walkway
 * width. An item is reachable if a reachable cell is within reach of it.
 */
export function walkway(room, placed) {
  const cell = 0.1, inflate = WALKWAY / 2;
  const nx = Math.max(1, Math.round(room.width / cell)), nz = Math.max(1, Math.round(room.depth / cell));
  const blocked = new Uint8Array(nx * nz);
  const solid = placed.filter((p) => !p.def.floor);
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = (i + 0.5) * cell, z = (k + 0.5) * cell;
      if (x < inflate || z < inflate || x > room.width - inflate || z > room.depth - inflate) { blocked[k * nx + i] = 1; continue; }
      for (const p of solid) {
        if (Math.abs(x - p.x) < p.hx + inflate && Math.abs(z - p.z) < p.hz + inflate) { blocked[k * nx + i] = 1; break; }
      }
    }
  }
  const door = doorInfo(room);
  const sx = Math.floor((door.p[0] + door.n[0] * (inflate + 0.05)) / cell);
  const sz = Math.floor((door.p[1] + door.n[1] * (inflate + 0.05)) / cell);
  const seen = new Uint8Array(nx * nz);
  const inGrid = (i, k) => i >= 0 && k >= 0 && i < nx && k < nz;
  let doorBlocked = !inGrid(sx, sz) || blocked[sz * nx + sx];
  if (!doorBlocked) {
    const q = [sz * nx + sx];
    seen[q[0]] = 1;
    while (q.length) {
      const c = q.pop(), i = c % nx, k = (c / nx) | 0;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk;
        if (!inGrid(ni, nk)) continue;
        const n = nk * nx + ni;
        if (!seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); }
      }
    }
  }
  const reach = inflate + 0.35;
  const unreachable = [];
  for (const p of solid) {
    if (p.parent && ['office_chair', 'nightstand', 'side_table'].includes(p.type)) continue;
    let ok = false;
    const i0 = Math.max(0, Math.floor((p.x - p.hx - reach) / cell)), i1 = Math.min(nx - 1, Math.floor((p.x + p.hx + reach) / cell));
    const k0 = Math.max(0, Math.floor((p.z - p.hz - reach) / cell)), k1 = Math.min(nz - 1, Math.floor((p.z + p.hz + reach) / cell));
    for (let k = k0; k <= k1 && !ok; k++) for (let i = i0; i <= i1; i++) if (seen[k * nx + i]) { ok = true; break; }
    if (!ok) unreachable.push(p.key);
  }
  return { unreachable, doorBlocked: !!doorBlocked, grid: { nx, nz, cell, seen } };
}

/* ---------------- Explanations ---------------- */

const WALL_NAMES = { N: 'north', S: 'south', E: 'east', W: 'west' };

/** Human-readable checklist + per-item notes for an evaluated layout. */
export function explain(room, result) {
  const { placed, terms, walk } = result;
  const door = doorInfo(room);
  const checks = [];
  const notes = {};
  const add = (status, title, detail) => checks.push({ status, title, detail });
  const name = (p) => p.def.name.replace(/ \(.*\)/, '');

  const fits = terms.bounds < 3 && terms.overlap < 0.5; // tolerate ~1 cm
  add(fits ? 'good' : 'bad', 'Everything fits', fits ? 'No overlapping pieces and nothing pokes through a wall.' : 'Some pieces overlap or don’t fit. Try a bigger room or fewer items.');

  for (const p of placed) {
    if (!p.def.commanding) continue;
    const vx = door.p[0] - p.x, vz = door.p[1] - p.z;
    const ang = angleDeg(F[p.rot][0], F[p.rot][1], vx, vz);
    const lateralOff = Math.abs(vx * L[p.rot][0] + vz * L[p.rot][1]);
    const inLine = vx * F[p.rot][0] + vz * F[p.rot][1] > 0 && lateralOff < p.w / 2 + 0.1;
    const wall = backWall(p, room);
    const problems = [];
    if (!wall) problems.push('it has no solid wall behind it');
    if (ang > 95) problems.push('your back would face the door');
    if (inLine) problems.push(p.def.commanding === 'bed' ? 'it is in direct line with the door (the “coffin position”)' : 'it sits directly in line with the door');
    const status = problems.length ? (problems.length > 1 || ang > 120 ? 'bad' : 'warn') : 'good';
    add(status, `${name(p)} in commanding position`,
      problems.length ? `Not ideal: ${problems.join(', ')}.` : `Backed by the ${WALL_NAMES[wall]} wall with a clear diagonal view of the door, so you can see who enters.`);
    notes[p.key] = problems.length ? `Compromise: ${problems.join(', ')}.`
      : `Commanding position: solid ${WALL_NAMES[wall]} wall behind, door in view but not in line.`;
  }

  const bed = placed.find((p) => BEDS.includes(p.type));
  if (bed) {
    const wall = backWall(bed, room);
    const underWin = wall && windowOverlap(bed, room, wall) > 0;
    add(underWin ? 'bad' : 'good', 'Bed not under a window', underWin ? 'The headboard is against a window, which feels unsupported and lets energy escape.' : 'The headboard rests on a solid wall for support while you sleep.');
    const sides = accessZones(bed).slice(1).every((z) => outsideArea(z, room) < 0.05);
    add(sides ? 'good' : 'warn', 'Bed reachable from both sides', sides ? 'Space on both sides keeps the relationship energy balanced.' : 'One side of the bed is against a wall. Fine for one sleeper, less ideal for couples.');
  }

  const entryOk = terms.entry < 1;
  add(entryOk ? 'good' : terms.entry < 15 ? 'warn' : 'bad', 'Clear entrance', entryOk ? 'The door swings freely and the path into the room is open, so energy (and you) can flow in.' : 'Something is crowding the door or the entry path.');

  if (walk) {
    const names = walk.unreachable.map((k) => name(placed.find((p) => p.key === k)));
    add(walk.doorBlocked ? 'bad' : names.length ? 'warn' : 'good', `Walkways of ${Math.round(WALKWAY * 100)} cm+`,
      walk.doorBlocked ? 'The doorway itself is blocked.' : names.length ? `Hard to reach: ${names.join(', ')}.` : 'Every piece can be reached from the door along comfortable paths.');
  }

  const unbacked = placed.filter((p) => p.def.wall >= 20 && !p.parent && !backWall(p, room));
  add(unbacked.length ? 'warn' : 'good', 'Solid backing', unbacked.length ? `Floating without wall support: ${unbacked.map(name).join(', ')}.` : 'Large pieces rest against walls, giving a stable, supported feel.');

  const blocking = placed.filter((p) => !BEDS.includes(p.type) && p.h > 0.95 && backWall(p, room) && windowOverlap(p, room, backWall(p, room)) > 0);
  add(blocking.length ? 'warn' : 'good', 'Windows unblocked', blocking.length ? `Blocking natural light: ${blocking.map(name).join(', ')}.` : 'Tall furniture stays clear of windows, so light and air flow freely.');

  const plants = placed.filter((p) => p.type === 'plant');
  if (plants.length) {
    const bg = bagua(room);
    const d = Math.hypot(plants[0].x - bg.wealthCorner[0], plants[0].z - bg.wealthCorner[1]);
    add(d < 0.9 ? 'good' : 'warn', 'Wealth corner activated', d < 0.9 ? 'A plant (wood element) sits in the far-left “wealth” corner of the bagua.' : 'Try moving a plant to the far-left corner from the door (the wealth area).');
    notes[plants[0].key] = d < 0.9 ? 'Wood element in the wealth corner (far left from the entrance).' : 'Plant: adds living wood energy.';
  } else {
    add('tip', 'Add a plant', 'A healthy plant in the far-left corner from the door activates the wealth area of the bagua.');
  }

  const mirror = placed.find((p) => p.type === 'mirror');
  if (mirror) {
    const lane = localRect(mirror, 0, mirror.d / 2 + 50, mirror.w, 100);
    const facesBed = bed && overlapArea(lane, bed) > 0;
    const facesDoor = pointInRect(door.p, { ...lane, hx: lane.hx + 0.05, hz: lane.hz + 0.05 });
    add(facesBed || facesDoor ? 'warn' : 'good', 'Mirror placement',
      facesBed ? 'The mirror reflects the bed, which is said to disturb sleep.' : facesDoor ? 'The mirror faces the door and bounces incoming energy straight back out.' : 'The mirror doesn’t reflect the bed or the door.');
  }

  const tv = placed.find((p) => p.type === 'tv_stand');
  if (tv) add(terms.relation < 12 ? 'good' : 'warn', 'Seating faces the TV', terms.relation < 12 ? 'Sofa and TV face each other at a comfortable viewing distance.' : 'The TV and seating aren’t lined up well.');

  const balanced = terms.balance < 2.5 && terms.center < 2;
  add(balanced ? 'good' : 'warn', 'Balanced energy', balanced ? 'Furniture is spread evenly and the centre (health area) stays open.' : 'The layout feels weighted to one side or the centre is crowded.');

  if (placed.some((p) => p.type === 'coffee_table')) {
    add('tip', 'Round coffee table', 'Rounded edges avoid “poison arrows” (sharp corners pointed at seating).');
  }

  for (const p of placed) {
    if (notes[p.key]) continue;
    const wall = backWall(p, room);
    if (p.parent) {
      const parent = placed.find((q) => q.key === p.parent);
      notes[p.key] = `Paired with the ${name(parent).toLowerCase()} for a functional, grounded grouping.`;
    } else if (p.type === 'tv_stand') notes[p.key] = 'Faces the seating at a comfortable viewing distance.';
    else if (p.type === 'floor_lamp') notes[p.key] = 'Lights the seating area and lifts energy in a quiet corner.';
    else if (p.type === 'armchair') notes[p.key] = 'Angled toward the conversation area.';
    else if (wall) notes[p.key] = `Backed by the ${WALL_NAMES[wall]} wall, clear of the door and windows.`;
    else notes[p.key] = 'Placed to keep walkways open.';
  }
  return { checks, notes };
}
