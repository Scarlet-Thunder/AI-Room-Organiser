// Procedural 3D furniture. Every builder returns a THREE.Group whose origin is
// the footprint centre on the floor, facing +z, sized to the catalog dims.
// Plain materials (no textures) keep GLB/USDZ exports small for AR.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATALOG } from './catalog.js';

const PALETTES = [
  { wood: '#dcc7a3', wood2: '#c9b38e', fabric: '#a3a9ae', fabric2: '#8e959b', accent: '#f4f2ee', metal: '#cfd3d6', metalness: 0.4, blanket: '#c9ced6', pot: '#f1efe9', rug: '#d9d4c7', rug2: '#bfb8a6' },
  { wood: '#b9895a', wood2: '#a07448', fabric: '#5f7f8f', fabric2: '#4e6d7c', accent: '#ebe5da', metal: '#3b3f44', metalness: 0.5, blanket: '#d9c4a3', pot: '#c26a43', rug: '#a8b5a2', rug2: '#7f8f78' },
  { wood: '#6b4630', wood2: '#56371f', fabric: '#2f5d50', fabric2: '#264c41', accent: '#efe7d8', metal: '#c9a96e', metalness: 0.85, blanket: '#b5654a', pot: '#1f2326', rug: '#8c5a46', rug2: '#d8c8a8' },
];

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
  return matCache.get(key);
}

function add(g, geo, material, x, y, z, rx = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g, w, h, d, x, y, z, m) => add(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
const rbox = (g, w, h, d, x, y, z, m, r = 0.04) =>
  add(g, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)), m, x, y, z);
const cyl = (g, rt, rb, h, x, y, z, m, seg = 28) => add(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);

function legs(g, w, d, h, inset, size, m, round = false) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - inset), z = sz * (d / 2 - inset);
    round ? cyl(g, size / 2, size / 2.6, h, x, h / 2, z, m, 12) : box(g, size, h, size, x, h / 2, z, m);
  }
}

const BUILDERS = {
  bed(g, d, P, tier) {
    const wood = mat(P.wood), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    legs(g, d.w - 0.06, d.d - 0.06, 0.12, 0.06, 0.06, tier === 2 ? metal : wood, tier === 2);
    box(g, d.w, 0.2, d.d, 0, 0.22, 0, wood);
    rbox(g, d.w - 0.06, 0.24, d.d - 0.12, 0, 0.44, 0.03, mat('#f6f4f0'), 0.06);
    const headMat = tier === 0 ? wood : mat(P.fabric, { roughness: 0.95 });
    rbox(g, d.w + 0.04, d.h - 0.05, 0.09, 0, (d.h - 0.05) / 2 + 0.05, -d.d / 2 + 0.045, headMat, tier === 0 ? 0.01 : 0.04);
    rbox(g, d.w - 0.02, 0.07, d.d * 0.6, 0, 0.59, d.d / 2 - d.d * 0.3 - 0.04, mat(P.accent, { roughness: 1 }), 0.03);
    rbox(g, d.w, 0.08, d.d * 0.22, 0, 0.6, d.d / 2 - d.d * 0.11 - 0.03, mat(P.blanket, { roughness: 1 }), 0.03);
    const pillowW = d.w < 1.3 ? d.w * 0.7 : d.w * 0.4;
    const xs = d.w < 1.3 ? [0] : [-d.w * 0.23, d.w * 0.23];
    for (const x of xs) rbox(g, pillowW, 0.14, 0.38, x, 0.63, -d.d / 2 + 0.32, mat('#ffffff', { roughness: 1 }), 0.06);
  },
  nightstand(g, d, P) {
    const wood = mat(P.wood), dark = mat(P.wood2), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    legs(g, d.w, d.d, 0.12, 0.04, 0.035, dark);
    box(g, d.w, d.h - 0.12, d.d, 0, 0.12 + (d.h - 0.12) / 2, 0, wood);
    box(g, d.w - 0.05, (d.h - 0.12) * 0.42, 0.012, 0, d.h - (d.h - 0.12) * 0.27, d.d / 2 + 0.006, dark);
    cyl(g, 0.012, 0.012, 0.1, 0, d.h - (d.h - 0.12) * 0.27, d.d / 2 + 0.03, metal).rotation.z = Math.PI / 2;
    cyl(g, 0.06, 0.08, 0.04, -d.w * 0.2, d.h + 0.02, 0, mat(P.accent));
    cyl(g, 0.012, 0.012, 0.22, -d.w * 0.2, d.h + 0.15, 0, metal);
    cyl(g, 0.08, 0.11, 0.14, -d.w * 0.2, d.h + 0.3, 0, mat('#f5ecd9', { emissive: '#3a2e1a' }));
  },
  wardrobe(g, d, P) {
    const wood = mat(P.wood), dark = mat(P.wood2), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    box(g, d.w, 0.06, d.d - 0.04, 0, 0.03, -0.02, dark);
    box(g, d.w, d.h - 0.06, d.d, 0, 0.06 + (d.h - 0.06) / 2, 0, wood);
    for (const s of [-1, 1]) {
      box(g, d.w / 2 - 0.015, d.h - 0.14, 0.02, s * (d.w / 4), 0.06 + (d.h - 0.06) / 2, d.d / 2 + 0.01, mat(P.wood, { roughness: 0.6 }));
      box(g, 0.02, 0.35, 0.025, s * 0.04, d.h * 0.52, d.d / 2 + 0.035, metal);
    }
  },
  dresser(g, d, P) {
    const wood = mat(P.wood), dark = mat(P.wood2), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    legs(g, d.w, d.d, 0.12, 0.05, 0.04, dark);
    const bodyH = d.h - 0.12;
    box(g, d.w, bodyH, d.d, 0, 0.12 + bodyH / 2, 0, wood);
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) {
      const y = 0.12 + bodyH * (r + 0.5) / 3;
      box(g, d.w / 2 - 0.03, bodyH / 3 - 0.03, 0.012, s * d.w / 4, y, d.d / 2 + 0.006, dark);
      cyl(g, 0.012, 0.012, 0.12, s * d.w / 4, y, d.d / 2 + 0.03, metal).rotation.z = Math.PI / 2;
    }
    cyl(g, 0.07, 0.05, 0.25, d.w * 0.3, d.h + 0.125, 0, mat(P.pot));
  },
  bookshelf(g, d, P) {
    const wood = mat(P.wood);
    box(g, d.w, d.h, 0.015, 0, d.h / 2, -d.d / 2 + 0.0075, mat(P.wood2));
    for (const s of [-1, 1]) box(g, 0.03, d.h, d.d, s * (d.w / 2 - 0.015), d.h / 2, 0, wood);
    const shelves = 5;
    const bookColors = ['#8c3b2f', '#2f4f6b', '#c79a3b', '#3e6b48', '#d8d2c4', '#5a3d5c', '#9e6b3f'];
    let k = 0;
    for (let i = 0; i <= shelves; i++) {
      const y = 0.02 + (d.h - 0.04) * i / shelves;
      box(g, d.w - 0.06, 0.025, d.d - 0.02, 0, y, 0.01, wood);
      if (i === shelves) break;
      let x = -d.w / 2 + 0.05;
      while (x < d.w / 2 - 0.12) {
        const bw = 0.025 + ((k * 37) % 5) * 0.008, bh = 0.18 + ((k * 53) % 4) * 0.025;
        if ((k * 13) % 7 === 0) { x += 0.08; k++; continue; }
        box(g, bw, bh, d.d * 0.7, x + bw / 2, y + 0.0125 + bh / 2, 0, mat(bookColors[k % bookColors.length]));
        x += bw + 0.004;
        k++;
      }
    }
  },
  desk(g, d, P, tier) {
    const wood = mat(P.wood), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    box(g, d.w, 0.035, d.d, 0, d.h - 0.0175, 0, wood);
    legs(g, d.w, d.d, d.h - 0.035, 0.04, 0.04, tier === 0 ? wood : metal);
    if (tier > 0) box(g, 0.4, 0.14, d.d - 0.08, d.w / 2 - 0.26, d.h - 0.105, 0, mat(P.wood2));
    const screen = mat('#15181c', { roughness: 0.3 });
    box(g, 0.6, 0.36, 0.025, 0, d.h + 0.3, -d.d / 2 + 0.16, screen);
    box(g, 0.56, 0.32, 0.002, 0, d.h + 0.3, -d.d / 2 + 0.174, mat('#24384f', { emissive: '#0e1a2a', roughness: 0.2 }));
    box(g, 0.04, 0.12, 0.04, 0, d.h + 0.06, -d.d / 2 + 0.15, metal);
    box(g, 0.22, 0.012, 0.16, 0, d.h + 0.006, -d.d / 2 + 0.15, metal);
    box(g, 0.42, 0.015, 0.14, 0, d.h + 0.0075, 0.05, mat('#2a2d31'));
    cyl(g, 0.07, 0.06, 0.16, -d.w * 0.38, d.h + 0.08, -0.12, mat(P.pot));
    add(g, new THREE.IcosahedronGeometry(0.11, 1), mat('#4f7d45', { flatShading: true }), -d.w * 0.38, d.h + 0.24, -0.12);
  },
  office_chair(g, d, P) {
    const fabric = mat(P.fabric2, { roughness: 0.95 }), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(g, 0.05, 0.03, 0.3, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, metal);
      leg.rotation.y = a;
      cyl(g, 0.025, 0.025, 0.04, Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29, mat('#222'));
    }
    cyl(g, 0.03, 0.03, 0.36, 0, 0.26, 0, metal);
    rbox(g, 0.5, 0.08, 0.48, 0, 0.47, 0.02, fabric, 0.035);
    const back = rbox(g, 0.46, 0.55, 0.06, 0, 0.82, -0.24, fabric, 0.03);
    back.rotation.x = -0.12;
    for (const s of [-1, 1]) {
      box(g, 0.03, 0.2, 0.03, s * 0.26, 0.6, 0, metal);
      rbox(g, 0.06, 0.03, 0.26, s * 0.26, 0.71, 0, mat('#2a2d31'), 0.012);
    }
  },
  sofa(g, d, P, tier, seats) {
    const fabric = mat(P.fabric, { roughness: 0.95 }), fabric2 = mat(P.fabric2, { roughness: 0.95 });
    const legMat = tier === 2 ? mat(P.metal, { metalness: P.metalness, roughness: 0.35 }) : mat(P.wood2);
    legs(g, d.w - 0.08, d.d - 0.1, 0.1, 0.04, 0.045, legMat, true);
    const arm = 0.17;
    rbox(g, d.w - 0.02, 0.2, d.d - 0.04, 0, 0.2, 0, fabric2, 0.03);
    rbox(g, d.w, 0.48, 0.2, 0, 0.1 + 0.24 + 0.1, -d.d / 2 + 0.1, fabric2, 0.05);
    for (const s of [-1, 1]) rbox(g, arm, 0.36, d.d, s * (d.w / 2 - arm / 2), 0.1 + 0.18 + 0.04, 0, fabric, 0.05);
    const inner = d.w - 2 * arm;
    const n = seats || (inner > 1.5 ? 3 : inner > 0.9 ? 2 : 1);
    const cw = inner / n;
    for (let i = 0; i < n; i++) {
      const x = -inner / 2 + cw * (i + 0.5);
      rbox(g, cw - 0.015, 0.16, d.d - 0.3, x, 0.38, 0.1, fabric, 0.05);
      const back = rbox(g, cw - 0.03, 0.42, 0.18, x, 0.62, -d.d / 2 + 0.26, fabric, 0.07);
      back.rotation.x = -0.12;
    }
    if (tier > 0) {
      for (const s of [-1, 1]) {
        const p = rbox(g, 0.4, 0.38, 0.12, s * (inner / 2 - 0.25), 0.62, -d.d / 2 + 0.4, mat(P.accent, { roughness: 1 }), 0.05);
        p.rotation.x = -0.25;
      }
    }
  },
  coffee_table(g, d, P, tier) {
    const wood = mat(P.wood, { roughness: 0.5 }), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    cyl(g, d.w / 2, d.w / 2, 0.04, 0, d.h - 0.02, 0, wood, 40);
    if (tier === 0) {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        cyl(g, 0.018, 0.014, d.h - 0.04, Math.cos(a) * d.w * 0.32, (d.h - 0.04) / 2, Math.sin(a) * d.w * 0.32, wood, 12);
      }
    } else {
      cyl(g, 0.08, 0.1, d.h - 0.06, 0, (d.h - 0.04) / 2, 0, tier === 2 ? metal : mat(P.wood2));
      cyl(g, d.w * 0.28, d.w * 0.3, 0.025, 0, 0.0125, 0, tier === 2 ? metal : mat(P.wood2), 36);
    }
    box(g, 0.22, 0.03, 0.16, -0.12, d.h + 0.015, 0.05, mat('#7b4b3a'));
    box(g, 0.2, 0.025, 0.15, -0.12, d.h + 0.042, 0.05, mat('#e7e2d8'));
    cyl(g, 0.05, 0.035, 0.14, 0.16, d.h + 0.07, -0.08, mat(P.pot, { roughness: 0.4 }));
  },
  side_table(g, d, P) {
    const wood = mat(P.wood, { roughness: 0.5 }), metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    cyl(g, d.w / 2, d.w / 2, 0.03, 0, d.h - 0.015, 0, wood, 36);
    cyl(g, 0.02, 0.02, d.h - 0.04, 0, (d.h - 0.03) / 2, 0, metal, 12);
    cyl(g, d.w * 0.35, d.w * 0.37, 0.02, 0, 0.01, 0, metal, 30);
  },
  tv_stand(g, d, P) {
    const wood = mat(P.wood), dark = mat(P.wood2);
    legs(g, d.w, d.d, 0.08, 0.06, 0.035, dark);
    box(g, d.w, 0.42, d.d, 0, 0.08 + 0.21, 0, wood);
    for (let i = 0; i < 3; i++) box(g, d.w / 3 - 0.02, 0.36, 0.012, -d.w / 3 + (i * d.w) / 3, 0.29, d.d / 2 + 0.006, dark);
    const tvW = Math.min(1.3, d.w - 0.2), tvH = tvW * 0.5625;
    box(g, 0.3, 0.015, 0.18, 0, 0.5 + 0.0075, -0.02, mat('#222'));
    box(g, 0.05, 0.1, 0.03, 0, 0.56, -0.05, mat('#222'));
    box(g, tvW, tvH, 0.045, 0, d.h - tvH / 2, -0.05, mat('#111316', { roughness: 0.3 }));
    box(g, tvW - 0.03, tvH - 0.03, 0.002, 0, d.h - tvH / 2, -0.027, mat('#1d2a3a', { emissive: '#0b1420', roughness: 0.15 }));
  },
  dining_set(g, d, P, tier) {
    const wood = mat(P.wood, { roughness: 0.55 }), fabric = mat(P.fabric, { roughness: 0.95 });
    const tw = 0.85, td = 1.3, th = 0.75;
    box(g, tw, 0.04, td, 0, th - 0.02, 0, wood);
    legs(g, tw, td, th - 0.04, 0.06, 0.05, mat(P.wood2));
    cyl(g, 0.06, 0.05, 0.2, 0, th + 0.1, 0, mat(P.pot, { roughness: 0.4 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const c = new THREE.Group();
      legs(c, 0.4, 0.4, 0.44, 0.03, 0.03, mat(P.wood2));
      tier === 0 ? box(c, 0.42, 0.04, 0.42, 0, 0.46, 0, wood) : rbox(c, 0.42, 0.06, 0.42, 0, 0.47, 0, fabric, 0.02);
      box(c, 0.42, 0.42, 0.03, 0, 0.7, -0.2, tier === 2 ? fabric : wood);
      c.position.set(sx * 0.49, 0, sz * 0.32);
      c.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(c);
    }
  },
  floor_lamp(g, d, P) {
    const metal = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    cyl(g, 0.15, 0.16, 0.03, 0, 0.015, 0, metal);
    cyl(g, 0.013, 0.013, d.h - 0.3, 0, (d.h - 0.3) / 2 + 0.03, 0, metal, 12);
    cyl(g, 0.16, 0.2, 0.3, 0, d.h - 0.15, 0, mat('#f6eedc', { emissive: '#4a3a1c', side: THREE.DoubleSide, roughness: 1 }), 32);
  },
  plant(g, d, P) {
    cyl(g, 0.2, 0.15, 0.36, 0, 0.18, 0, mat(P.pot, { roughness: 0.5 }));
    cyl(g, 0.18, 0.18, 0.02, 0, 0.35, 0, mat('#4a3626'));
    cyl(g, 0.02, 0.025, 0.5, 0, 0.6, 0, mat('#6b4f35'), 8);
    const greens = ['#3f6f3a', '#4f8445', '#5d9450', '#356232'];
    const blobs = [[0, 1.05, 0, 0.26], [0.14, 0.92, 0.08, 0.2], [-0.13, 0.9, -0.06, 0.21], [0.05, 0.78, -0.14, 0.18], [-0.06, 1.2, 0.07, 0.17], [0.1, 0.72, 0.12, 0.15]];
    blobs.forEach(([x, y, z, r], i) => add(g, new THREE.IcosahedronGeometry(r, 1), mat(greens[i % 4], { flatShading: true, roughness: 0.9 }), x, Math.min(y, d.h - r * 0.6), z));
  },
  rug(g, d, P) {
    box(g, d.w, 0.008, d.d, 0, 0.004, 0, mat(P.rug, { roughness: 1 }));
    box(g, d.w - 0.16, 0.009, d.d - 0.16, 0, 0.0045, 0, mat(P.rug2, { roughness: 1 }));
    box(g, d.w - 0.3, 0.01, d.d - 0.3, 0, 0.005, 0, mat(P.rug, { roughness: 1 }));
  },
  mirror(g, d, P) {
    const frame = mat(P.metal, { metalness: P.metalness, roughness: 0.35 });
    const tilt = -0.06;
    const fr = rbox(g, d.w, d.h - 0.02, 0.035, 0, (d.h - 0.02) / 2, -d.d / 2 + 0.06, frame, 0.015);
    fr.rotation.x = tilt;
    const glass = box(g, d.w - 0.07, d.h - 0.1, 0.005, 0, (d.h - 0.02) / 2, -d.d / 2 + 0.08, mat('#dfe7ee', { metalness: 1, roughness: 0.04 }));
    glass.rotation.x = tilt;
  },
};
BUILDERS.loveseat = (g, d, P, t) => BUILDERS.sofa(g, d, P, t, 2);
BUILDERS.armchair = (g, d, P, t) => BUILDERS.sofa(g, d, P, t, 1);
BUILDERS.bed_queen = BUILDERS.bed_king = BUILDERS.bed_twin = BUILDERS.bed;

export function buildFurniture(type, tier = 0) {
  const def = CATALOG[type];
  const g = new THREE.Group();
  g.name = type;
  (BUILDERS[type] || ((gg) => box(gg, def.w, def.h, def.d, 0, def.h / 2, 0, mat('#999'))))(g, def, PALETTES[tier] || PALETTES[0], tier);
  return g;
}
