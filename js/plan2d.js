// Top-down SVG floor plan with drag-to-move furniture.
import { CATALOG } from './catalog.js';
import { doorInfo, bagua, halfExtents } from './fengshui.js';

const NS = 'http://www.w3.org/2000/svg';
const CAT_CLASS = { Sleeping: 'c-sleep', Living: 'c-living', Work: 'c-work', Storage: 'c-storage', Dining: 'c-dining', Decor: 'c-decor' };
const WALL_T = 0.12;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export class PlanView {
  /**
   * callbacks: onSelect(key|null), onMove(key, {x,z,rot}, final), freeKeys(): Set
   */
  constructor(container, callbacks) {
    this.container = container;
    this.cb = callbacks;
    this.svg = el('svg', { class: 'plan', role: 'img', 'aria-label': 'Floor plan' }, container);
    this.showBagua = false;
    this.selected = null;
    this.drag = null;
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('pointermove', (e) => this.onMove(e));
    this.svg.addEventListener('pointerup', (e) => this.onUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  render(room, placed, { problems = new Set() } = {}) {
    this.room = room;
    this.placed = placed;
    const pad = 0.55;
    this.svg.setAttribute('viewBox', `${-pad} ${-pad} ${room.width + 2 * pad} ${room.depth + 2 * pad}`);
    this.svg.replaceChildren();
    const s = this.svg;

    el('rect', { x: 0, y: 0, width: room.width, height: room.depth, class: 'floor' }, s);
    const grid = el('g', { class: 'grid' }, s);
    for (let x = 0.5; x < room.width; x += 0.5) el('line', { x1: x, y1: 0, x2: x, y2: room.depth }, grid);
    for (let z = 0.5; z < room.depth; z += 0.5) el('line', { x1: 0, y1: z, x2: room.width, y2: z }, grid);

    if (this.showBagua) {
      const bg = el('g', { class: 'bagua' }, s);
      bagua(room).zones.forEach((zn, i) => {
        el('rect', { x: zn.x, y: zn.z, width: zn.w, height: zn.d, class: 'bz bz' + i }, bg);
        const t = el('text', { x: zn.x + zn.w / 2, y: zn.z + zn.d / 2, class: 'bagua-label' }, bg);
        t.textContent = zn.label;
      });
    }

    // Walls with gaps for the door and windows
    const door = doorInfo(room);
    const openings = { N: [], S: [], E: [], W: [] };
    openings[room.door.wall].push([room.door.offset - door.width / 2, room.door.offset + door.width / 2, 'door']);
    for (const w of room.windows) openings[w.wall].push([w.offset - w.width / 2, w.offset + w.width / 2, 'win']);
    const walls = el('g', { class: 'walls' }, s);
    const seg = (wall, a, b, cls) => {
      const h = WALL_T / 2;
      if (wall === 'N') el('line', { x1: a, y1: -h, x2: b, y2: -h, class: cls }, walls);
      if (wall === 'S') el('line', { x1: a, y1: room.depth + h, x2: b, y2: room.depth + h, class: cls }, walls);
      if (wall === 'W') el('line', { x1: -h, y1: a, x2: -h, y2: b, class: cls }, walls);
      if (wall === 'E') el('line', { x1: room.width + h, y1: a, x2: room.width + h, y2: b, class: cls }, walls);
    };
    for (const wall of ['N', 'S', 'E', 'W']) {
      const len = wall === 'N' || wall === 'S' ? room.width : room.depth;
      const ops = openings[wall].sort((p, q) => p[0] - q[0]);
      let cur = -WALL_T;
      for (const [a, b, kind] of ops) {
        seg(wall, cur, a, 'wall');
        seg(wall, a, b, kind === 'door' ? 'door-gap' : 'window');
        cur = b;
      }
      seg(wall, cur, len + WALL_T, 'wall');
    }
    // Door swing arc
    const hinge = [door.p[0] - door.t[0] * door.width / 2, door.p[1] - door.t[1] * door.width / 2];
    const tip = [hinge[0] + door.n[0] * door.width, hinge[1] + door.n[1] * door.width];
    const end = [hinge[0] + door.t[0] * door.width, hinge[1] + door.t[1] * door.width];
    el('path', { d: `M${hinge} L${tip} A${door.width} ${door.width} 0 0 ${sweep(door)} ${end}`, class: 'door-swing' }, s);

    // Dimensions + compass
    const dim = el('g', { class: 'dims' }, s);
    el('text', { x: room.width / 2, y: -0.28 }, dim).textContent = `${room.width.toFixed(2)} m`;
    const dt = el('text', { x: -0.28, y: room.depth / 2, transform: `rotate(-90 ${-0.28} ${room.depth / 2})` }, dim);
    dt.textContent = `${room.depth.toFixed(2)} m`;
    const comp = el('g', { class: 'compass', transform: `translate(${room.width + 0.3} ${-0.3})` }, s);
    el('path', { d: 'M0 -0.16 L0.07 0.06 L0 0.02 L-0.07 0.06 Z' }, comp);
    el('text', { x: 0, y: 0.22 }, comp).textContent = 'N';

    // Furniture: rugs first, then by height so tall items draw on top
    const items = el('g', { class: 'items' }, s);
    const free = this.cb.freeKeys();
    const order = [...placed].sort((a, b) => (a.def.floor ? -1 : 0) - (b.def.floor ? -1 : 0) || a.h - b.h);
    for (const p of order) {
      const def = CATALOG[p.type];
      const g = el('g', {
        class: `item ${CAT_CLASS[def.cat]}${def.floor ? ' floor-item' : ''}${this.selected && (p.key === this.selected || p.parent === this.selected) ? ' selected' : ''}${problems.has(p.key) ? ' problem' : ''}${free.has(p.key) ? ' draggable' : ''}`,
        transform: `translate(${p.x} ${p.z}) rotate(${-90 * p.rot})`,
        'data-key': p.key,
      }, items);
      if (def.round) el('ellipse', { rx: def.w / 2, ry: def.d / 2, class: 'body' }, g);
      else el('rect', { x: -def.w / 2, y: -def.d / 2, width: def.w, height: def.d, rx: 0.04, class: 'body' }, g);
      if (!def.round && !def.floor) el('line', { x1: -def.w / 2 + 0.04, y1: def.d / 2 - 0.02, x2: def.w / 2 - 0.04, y2: def.d / 2 - 0.02, class: 'front' }, g);
      if (!def.floor) {
        const label = el('g', { transform: `rotate(${90 * p.rot})` }, g);
        const size = Math.min(0.32, Math.min(def.w, def.d) * 0.62);
        const icon = el('text', { class: 'icon', 'font-size': size, y: def.w > 0.9 && def.d > 0.6 ? -0.06 : 0 }, label);
        icon.textContent = def.icon;
        if (def.w > 0.9 && def.d > 0.6) {
          const t = el('text', { class: 'name', y: size * 0.75 }, label);
          t.textContent = def.name.replace(/ \(.*\)/, '');
        }
      }
    }
  }

  toWorld(e) {
    const pt = this.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return [p.x, p.y];
  }

  onDown(e) {
    const g = e.target.closest('.item');
    if (!g) { this.cb.onSelect(null); return; }
    const key = g.dataset.key;
    const p = this.placed.find((q) => q.key === key);
    const target = p.parent && !this.cb.freeKeys().has(key) ? this.placed.find((q) => q.key === p.parent) : p;
    this.cb.onSelect(target.key);
    if (!this.cb.freeKeys().has(target.key)) return;
    const [x, z] = this.toWorld(e);
    this.drag = { key: target.key, ox: target.x - x, oz: target.z - z, rot: target.rot, moved: false };
    try { this.svg.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    e.preventDefault();
  }

  onMove(e) {
    if (!this.drag) return;
    const [x, z] = this.toWorld(e);
    const p = this.placed.find((q) => q.key === this.drag.key);
    const [hx, hz] = halfExtents(p.def, this.drag.rot);
    let nx = Math.round((x + this.drag.ox) / 0.05) * 0.05;
    let nz = Math.round((z + this.drag.oz) / 0.05) * 0.05;
    const snap = 0.18;
    if (nx - hx < snap) nx = hx;
    if (this.room.width - nx - hx < snap) nx = this.room.width - hx;
    if (nz - hz < snap) nz = hz;
    if (this.room.depth - nz - hz < snap) nz = this.room.depth - hz;
    nx = Math.min(Math.max(nx, hx), this.room.width - hx);
    nz = Math.min(Math.max(nz, hz), this.room.depth - hz);
    this.drag.moved = true;
    this.drag.last = { x: +nx.toFixed(3), z: +nz.toFixed(3), rot: this.drag.rot };
    this.cb.onMove(this.drag.key, this.drag.last, false);
  }

  onUp() {
    if (!this.drag) return;
    if (this.drag.moved) this.cb.onMove(this.drag.key, this.drag.last, true);
    this.drag = null;
  }
}

function sweep(door) {
  // Choose the arc direction so it bulges into the room.
  const cross = door.t[0] * door.n[1] - door.t[1] * door.n[0];
  return cross > 0 ? 0 : 1;
}
