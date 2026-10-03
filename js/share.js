// Compact project encoding for share links / QR codes. Stored in the URL
// hash, which browsers never send to the server.

const WALLS = 'NESW';

export function encodeProject(state) {
  const r = state.room;
  const data = {
    v: 1,
    t: state.roomType,
    r: [r.width, r.depth, r.height, WALLS.indexOf(r.door.wall), r.door.offset, r.door.width,
      r.windows.map((w) => [WALLS.indexOf(w.wall), w.offset, w.width])],
    b: state.budget,
    s: state.selection.map((s) => [s.type, s.qty, s.must ? 1 : 0, s.lockedTier ?? -1]),
    // Layout keys are "<selection id>-<n>"; store selection index instead of id.
    l: (state.layout || []).map((i) => {
      const cut = i.key.lastIndexOf('-');
      const sel = state.selection.findIndex((s) => s.id === i.key.slice(0, cut));
      return [sel, +i.key.slice(cut + 1), i.x, i.z, i.rot];
    }).filter((l) => l[0] >= 0),
  };
  const json = JSON.stringify(data);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeProject(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (d.v !== 1) throw new Error('Unsupported link version');
  const [width, depth, height, dw, doff, dwid, wins] = d.r;
  const selection = d.s.map(([type, qty, must, lt], i) => ({ id: 's' + i, type, qty, must: !!must, lockedTier: lt < 0 ? null : lt }));
  return {
    roomType: d.t,
    room: { width, depth, height, door: { wall: WALLS[dw], offset: doff, width: dwid }, windows: wins.map(([w, o, wd]) => ({ wall: WALLS[w], offset: o, width: wd })) },
    budget: d.b,
    selection,
    layoutPositions: d.l.length ? Object.fromEntries(d.l.map(([sel, n, x, z, rot]) => [`s${sel}-${n}`, { x, z, rot }])) : null,
  };
}
