import { CATALOG, TIERS, ROOM_PRESETS } from './catalog.js';
import { fitBudget } from './budget.js';
import { evaluate, explain, freeKeys, clampInside, wallLength, overlapArea } from './fengshui.js';
import { optimize } from './optimizer.js';
import { PlanView } from './plan2d.js';
import { RoomView, buildArScene, singleItemScene, exportGLB } from './scene3d.js';
import { openAr } from './ar.js';
import { encodeProject, decodeProject } from './share.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const WALL_LABEL = { N: 'North', E: 'East', S: 'South', W: 'West' };
const STORE_KEY = 'chispace-v1';
const RING = 326.7;

/* ---------------- State ---------------- */

let state;
let selectedKey = null;
let view = 'plan';
let lastResult = null;
let worker = null;
let busy = false;

function presetState(type) {
  const p = ROOM_PRESETS[type];
  return {
    roomType: type,
    room: { width: p.width, depth: p.depth, height: 2.6, door: { ...p.door }, windows: p.windows.map((w) => ({ ...w })) },
    budget: p.budget,
    selection: p.items.map(([t, qty, must], i) => ({ id: 's' + i, type: t, qty, must, lockedTier: null })),
    layout: null,
    seed: 1,
    stale: false,
  };
}

function loadInitialState() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('p')) {
    try {
      const d = decodeProject(hash.get('p'));
      const s = { roomType: d.roomType, room: d.room, budget: d.budget, selection: d.selection, layout: null, seed: 1, stale: false };
      if (d.layoutPositions) {
        s.layout = desiredInstances(s).map((i) => ({ ...i, ...(d.layoutPositions[i.key] || {}) }));
      }
      return { state: s, fromLink: true, openArOnLoad: hash.get('ar') === '1' };
    } catch (e) {
      console.warn('Bad share link', e);
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.room && saved.selection) return { state: saved };
  } catch { /* ignore */ }
  return { state: presetState('bedroom') };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function budgetResult() {
  return fitBudget(state.selection, state.budget);
}

/** Instances implied by the selection after the budget optimizer runs. */
function desiredInstances(s = state) {
  const res = fitBudget(s.selection, s.budget);
  const out = [];
  for (const line of res.lines) {
    if (!line.included) continue;
    for (let i = 0; i < line.qty; i++) {
      out.push({ key: `${line.id}-${i}`, type: line.type, tier: line.tier, x: s.room.width / 2, z: s.room.depth / 2, rot: 0 });
    }
  }
  return out;
}

/** Merge the current layout with the desired instances (keeps positions, adds new pieces). */
function syncLayout() {
  if (!state.layout) return null;
  const old = new Map(state.layout.map((i) => [i.key, i]));
  let added = false;
  const merged = desiredInstances().map((inst) => {
    const prev = old.get(inst.key);
    if (!prev) { added = true; return inst; }
    return { ...inst, x: prev.x, z: prev.z, rot: prev.rot };
  });
  if (added) state.stale = true;
  state.layout = merged.map((i) => clampInside(i, state.room));
  return state.layout;
}

/* ---------------- Views ---------------- */

const plan = new PlanView($('#plan-host'), {
  freeKeys: () => new Set(state.layout ? freeKeys(state.layout) : []),
  onSelect: (key) => { selectedKey = key; render({ only3d: false }); },
  onMove: (key, pos, final) => {
    state.layout = state.layout.map((i) => (i.key === key ? { ...i, ...pos } : i));
    render({ skip3d: !final });
  },
});
const view3d = new RoomView($('#three-host'));
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
view3d.setTheme(darkQuery.matches);
darkQuery.addEventListener('change', (e) => { view3d.setTheme(e.matches); });

/* ---------------- Render ---------------- */

function render({ skip3d = false } = {}) {
  const instances = syncLayout();
  lastResult = instances ? evaluate(state.room, instances) : null;
  const placed = lastResult ? lastResult.placed : [];

  plan.selected = selectedKey;
  plan.render(state.room, placed, { problems: problemKeys(lastResult) });
  if (view === '3d' && !skip3d) view3d.update(state.room, placed);
  view3d.pending = skip3d || view !== '3d';

  renderBudget();
  renderArrange();
  $('#stale').hidden = !(state.layout && state.stale) || busy;
  save();
}

function problemKeys(res) {
  const set = new Set();
  if (!res) return set;
  res.walk?.unreachable.forEach((k) => set.add(k));
  const solid = res.placed.filter((p) => !p.def.floor);
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    if (a.parent === b.key || b.parent === a.key || (a.parent && a.parent === b.parent)) continue;
    if (overlapArea(a, b) > 0.002) { set.add(a.key); set.add(b.key); }
  }
  for (const p of res.placed) {
    if (p.x - p.hx < -0.01 || p.z - p.hz < -0.01 || p.x + p.hx > state.room.width + 0.01 || p.z + p.hz > state.room.depth + 0.01) set.add(p.key);
  }
  return set;
}

function renderRoomPanel() {
  const r = state.room;
  $('#presets').innerHTML = Object.entries(ROOM_PRESETS)
    .map(([k, p]) => `<button data-preset="${k}" aria-pressed="${k === state.roomType}">${p.label}</button>`).join('');
  setVal('#room-w', r.width);
  setVal('#room-d', r.depth);
  setVal('#room-h', r.height);
  $('#door-wall').innerHTML = Object.entries(WALL_LABEL).map(([k, v]) => `<option value="${k}" ${k === r.door.wall ? 'selected' : ''}>${v}</option>`).join('');
  setVal('#door-width', r.door.width);
  const len = wallLength(r, r.door.wall);
  const off = $('#door-off');
  off.min = r.door.width / 2;
  off.max = len - r.door.width / 2;
  off.value = r.door.offset;
  $('#door-off-out').textContent = `${r.door.offset.toFixed(2)} m`;
  $('#windows').innerHTML = r.windows.map((w, i) => `
    <div class="window-row" data-i="${i}">
      <label>Wall<select data-f="wall">${Object.keys(WALL_LABEL).map((k) => `<option ${k === w.wall ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Centre (m)<input type="number" data-f="offset" step="0.05" min="0" value="${w.offset}" /></label>
      <label>Width<input type="number" data-f="width" step="0.05" min="0.4" value="${w.width}" /></label>
      <button data-remove-window="${i}" aria-label="Remove window">✕</button>
    </div>`).join('') || '<p class="hint">No windows.</p>';
}

function setVal(sel, v) {
  const e = $(sel);
  if (document.activeElement !== e) e.value = v;
}

function renderCatalog() {
  const groups = {};
  for (const [type, def] of Object.entries(CATALOG)) (groups[def.cat] ||= []).push([type, def]);
  $('#catalog').innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="cat-group"><h4>${cat}</h4><div class="cat-grid">
      ${items.map(([type, d]) => `
        <div class="cat-card">
          <div class="top"><span>${d.icon}</span>${d.name}</div>
          <div class="meta">${d.w}×${d.d} m · ${money(d.prices[0])}–${money(d.prices[2])}</div>
          <div class="btns"><button data-add="${type}">+ Add</button><button data-preview="${type}" title="Preview in 3D / AR">3D·AR</button></div>
        </div>`).join('')}
    </div></div>`).join('');
}

function renderBudget() {
  const res = budgetResult();
  setVal('#budget', state.budget);
  setVal('#budget-range', Math.min(15000, state.budget));
  const pct = Math.min(100, (res.total / Math.max(1, state.budget)) * 100);
  $('#budget-fill').style.width = pct + '%';
  $('.budget-bar').classList.toggle('over', res.over);
  const left = state.budget - res.total;
  $('#budget-status').innerHTML = res.over
    ? `<b style="color:var(--bad)">${money(res.total)}</b>: over by ${money(-left)} even at Essential tier. Remove items or raise the budget.`
    : `<b>${money(res.total)}</b> of ${money(state.budget)} · ${money(left)} left${res.dropped.length ? ` · ${res.dropped.length} nice-to-have${res.dropped.length > 1 ? 's' : ''} dropped` : ''}`;

  $('#sel-list').innerHTML = res.lines.map((l) => {
    const s = state.selection.find((x) => x.id === l.id);
    const d = CATALOG[l.type];
    const tierOpts = [`<option value="auto" ${s.lockedTier == null ? 'selected' : ''}>Auto${l.included ? ` (${TIERS[l.tier]})` : ''}</option>`,
      ...TIERS.map((t, i) => `<option value="${i}" ${s.lockedTier === i ? 'selected' : ''}>${t} · ${money(d.prices[i])}</option>`)].join('');
    return `<li class="${l.included ? '' : 'dropped'}" data-id="${l.id}">
      <span class="icon">${d.icon}</span><span class="nm">${d.name}</span>
      <span class="price">${l.included ? money(l.total) : '–'}</span>
      <div class="ctrls">
        <span class="qty"><button data-qty="-1" aria-label="Fewer">−</button>${l.qty}<button data-qty="1" aria-label="More">+</button></span>
        <select data-tier aria-label="Tier">${tierOpts}</select>
        <button class="star" data-must aria-pressed="${s.must}" title="Must-have">★</button>
        <button data-remove aria-label="Remove">✕</button>
      </div>
      ${l.included ? '' : '<span class="note">Dropped to fit the budget</span>'}
    </li>`;
  }).join('') || '<li class="hint">Nothing yet. Add furniture below.</li>';
}

function renderArrange() {
  const res = lastResult;
  $('#arrange-btn').disabled = busy || !desiredInstances().length;
  $('#another-btn').disabled = busy || !state.layout;
  const chip = $('#score-chip');
  if (!res) {
    $('#score-num').textContent = '–';
    $('#score-label').textContent = 'Not arranged yet';
    $('#score-fg').style.strokeDashoffset = RING;
    $('#checks').innerHTML = '';
    chip.hidden = true;
  } else {
    const score = res.score;
    const label = score >= 85 ? 'Excellent harmony' : score >= 70 ? 'Good flow' : score >= 50 ? 'Fair' : 'Needs work';
    const color = score >= 70 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
    $('#score-num').textContent = score;
    $('#score-label').textContent = label;
    $('#score-hint').textContent = state.stale ? 'Furniture changed. Re-arrange for an updated layout.' : 'Drag pieces in the plan to fine-tune; the score updates live.';
    const fg = $('#score-fg');
    fg.style.strokeDashoffset = RING * (1 - score / 100);
    fg.style.stroke = color;
    chip.hidden = false;
    chip.textContent = `Feng shui ${score}/100`;
    const { checks, notes } = explain(state.room, res);
    const icon = { good: '✓', warn: '!', bad: '✕', tip: 'i' };
    $('#checks').innerHTML = checks.map((c) => `<li class="${c.status}"><span class="ic">${icon[c.status]}</span><span><b>${c.title}</b><span class="d">${c.detail}</span></span></li>`).join('');
    renderItemCard(res, notes);
  }
  if (!res) renderItemCard(null, {});

  const b = budgetResult();
  $('#shop').innerHTML = b.lines.filter((l) => l.included).map((l) =>
    `<li><span>${l.qty > 1 ? l.qty + '× ' : ''}${CATALOG[l.type].name} <span class="hint">· ${TIERS[l.tier]}</span></span><span>${money(l.total)}</span></li>`).join('')
    + `<li class="total"><span>Total</span><span>${money(b.total)}</span></li>`;
}

function renderItemCard(res, notes) {
  const card = $('#item-card');
  const p = res && selectedKey ? res.placed.find((q) => q.key === selectedKey) : null;
  if (!p) { card.hidden = true; return; }
  const free = new Set(freeKeys(state.layout));
  card.hidden = false;
  card.innerHTML = `
    <div class="t"><span>${p.def.icon} ${p.def.name}</span><span>${money(p.def.prices[p.tier])}</span></div>
    <p class="hint">${TIERS[p.tier]} tier · ${p.def.w}×${p.def.d}×${p.def.h} m</p>
    <p>${notes[p.key] || ''}</p>
    <div class="btns">
      ${free.has(p.key) ? '<button class="small" data-rotate>⟳ Rotate (R)</button>' : ''}
      <button class="small" data-item-ar>📱 This piece in AR</button>
      <button class="small" data-deselect>Done</button>
    </div>`;
}

/* ---------------- Actions ---------------- */

function setStep(step) {
  $$('.steps button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.step === step)));
  $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== step; });
  $('.sidebar').scrollTop = 0;
}

function setView(v) {
  view = v;
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  $('#plan-host').hidden = v !== 'plan';
  $('#three-host').hidden = v !== '3d';
  $('#view-hint').textContent = v === 'plan' ? 'Drag furniture to adjust · R to rotate the selected piece' : 'Drag to orbit · scroll or pinch to zoom';
  view3d.setVisible(v === '3d');
  if (v === '3d') view3d.update(state.room, lastResult ? lastResult.placed : []);
}

function markRoomChanged() {
  if (state.layout) state.stale = true;
  render();
}

function arrange(newSeed = false) {
  const instances = desiredInstances();
  if (!instances.length || busy) return;
  if (newSeed) state.seed = (state.seed * 7919 + 13) % 100000;
  busy = true;
  selectedKey = null;
  $('#busy').hidden = false;
  $('#stale').hidden = true;
  $('#busy-fill').style.width = '0';
  renderArrange();
  const t0 = performance.now();
  const finish = (layout) => {
    const wait = Math.max(0, 700 - (performance.now() - t0)); // let the animation register
    setTimeout(() => {
      busy = false;
      state.layout = layout;
      state.stale = false;
      $('#busy').hidden = true;
      render();
      setStep('arrange');
      toast(`Arranged! Feng shui score ${lastResult.score}/100`);
    }, wait);
  };
  try {
    worker ||= new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') $('#busy-fill').style.width = `${e.data.progress * 100}%`;
      else if (e.data.type === 'done') finish(e.data.instances);
      else if (e.data.type === 'error') { busy = false; $('#busy').hidden = true; toast('Arrange failed: ' + e.data.message); render(); }
    };
    worker.onerror = () => { worker = null; runOnMainThread(); };
    worker.postMessage({ room: state.room, instances, seed: state.seed });
  } catch {
    runOnMainThread();
  }
  function runOnMainThread() {
    setTimeout(() => finish(optimize(state.room, instances, { seed: state.seed }).instances), 30);
  }
}

function shareUrl(ar = false) {
  return location.href.split('#')[0] + '#p=' + encodeProject(state) + (ar ? '&ar=1' : '');
}

async function openRoomAr() {
  if (!lastResult) { toast('Arrange your room first.'); return; }
  const b = budgetResult();
  try {
    const glb = await exportGLB(buildArScene(state.room, lastResult.placed));
    await openAr({
      glb,
      title: 'Your room in AR',
      subtitle: `${lastResult.placed.length} pieces · ${state.room.width}×${state.room.depth} m · ${money(b.total)} · feng shui ${lastResult.score}/100`,
      shareUrl: shareUrl(true),
    });
  } catch (e) {
    console.error(e);
    toast('Could not open the 3D viewer: ' + e.message);
  }
}

async function openItemAr(type, tier) {
  const d = CATALOG[type];
  try {
    const glb = await exportGLB(singleItemScene(type, tier));
    await openAr({ glb, title: d.name, subtitle: `${TIERS[tier]} tier · ${money(d.prices[tier])} · ${d.w}×${d.d}×${d.h} m (real size in AR)`, shareUrl: null });
  } catch (e) {
    toast('Could not open the 3D viewer: ' + e.message);
  }
}

function rotateSelected() {
  if (!selectedKey || !state.layout || !freeKeys(state.layout).includes(selectedKey)) return;
  state.layout = state.layout.map((i) => (i.key === selectedKey ? clampInside({ ...i, rot: (i.rot + 1) % 4 }, state.room) : i));
  render();
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}
document.addEventListener('app-toast', (e) => toast(e.detail));

function nextId() {
  let n = 0;
  for (const s of state.selection) n = Math.max(n, parseInt(s.id.slice(1), 10) + 1 || 0);
  return 's' + n;
}

function clampRoomFeatures() {
  const r = state.room;
  r.width = Math.min(12, Math.max(2, r.width || 2));
  r.depth = Math.min(12, Math.max(2, r.depth || 2));
  const fit = (f) => {
    const len = wallLength(r, f.wall);
    f.width = Math.min(f.width, len - 0.1);
    f.offset = Math.min(Math.max(f.offset, f.width / 2), len - f.width / 2);
  };
  fit(r.door);
  r.windows.forEach(fit);
}

/* ---------------- Events ---------------- */

function bind() {
  $$('.steps button').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.step)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.goto)));
  $$('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#bagua-toggle').addEventListener('change', (e) => { plan.showBagua = e.target.checked; render({ skip3d: true }); });

  $('#presets').addEventListener('click', (e) => {
    const k = e.target.closest('[data-preset]')?.dataset.preset;
    if (!k) return;
    if (state.layout && !confirm(`Start a new ${ROOM_PRESETS[k].label.toLowerCase()}? This replaces your current room and furniture list.`)) return;
    state = presetState(k);
    selectedKey = null;
    renderRoomPanel();
    render();
    arrange();
  });
  const num = (sel, fn) => $(sel).addEventListener('change', (e) => { fn(parseFloat(e.target.value)); clampRoomFeatures(); renderRoomPanel(); markRoomChanged(); });
  num('#room-w', (v) => { state.room.width = v; });
  num('#room-d', (v) => { state.room.depth = v; });
  num('#room-h', (v) => { state.room.height = Math.min(4, Math.max(2.2, v || 2.6)); });
  num('#door-width', (v) => { state.room.door.width = v || 0.9; });
  $('#door-wall').addEventListener('change', (e) => { state.room.door.wall = e.target.value; clampRoomFeatures(); renderRoomPanel(); markRoomChanged(); });
  $('#door-off').addEventListener('input', (e) => {
    state.room.door.offset = parseFloat(e.target.value);
    $('#door-off-out').textContent = `${state.room.door.offset.toFixed(2)} m`;
    if (state.layout) state.stale = true;
    render({ skip3d: true });
  });
  $('#door-off').addEventListener('change', () => render());
  $('#add-window').addEventListener('click', () => {
    const wall = ['N', 'E', 'W', 'S'].find((w) => !state.room.windows.some((x) => x.wall === w) && w !== state.room.door.wall) || 'N';
    state.room.windows.push({ wall, offset: wallLength(state.room, wall) / 2, width: 1.2 });
    clampRoomFeatures(); renderRoomPanel(); markRoomChanged();
  });
  $('#windows').addEventListener('change', (e) => {
    const row = e.target.closest('.window-row');
    if (!row) return;
    const w = state.room.windows[+row.dataset.i];
    const f = e.target.dataset.f;
    w[f] = f === 'wall' ? e.target.value : parseFloat(e.target.value) || w[f];
    clampRoomFeatures(); renderRoomPanel(); markRoomChanged();
  });
  $('#windows').addEventListener('click', (e) => {
    const i = e.target.closest('[data-remove-window]')?.dataset.removeWindow;
    if (i == null) return;
    state.room.windows.splice(+i, 1);
    renderRoomPanel(); markRoomChanged();
  });

  const setBudget = (v) => { state.budget = Math.max(0, Math.round(v || 0)); render(); };
  $('#budget').addEventListener('change', (e) => setBudget(parseFloat(e.target.value)));
  $('#budget-range').addEventListener('input', (e) => setBudget(parseFloat(e.target.value)));

  $('#catalog').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]')?.dataset.add;
    const prev = e.target.closest('[data-preview]')?.dataset.preview;
    if (add) {
      const existing = state.selection.find((s) => s.type === add);
      if (existing) existing.qty++;
      else state.selection.push({ id: nextId(), type: add, qty: 1, must: false, lockedTier: null });
      toast(`Added ${CATALOG[add].name}`);
      render();
    } else if (prev) {
      openItemAr(prev, 1);
    }
  });
  $('#sel-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const s = state.selection.find((x) => x.id === li.dataset.id);
    const q = e.target.closest('[data-qty]');
    if (q) { s.qty = Math.max(1, Math.min(6, s.qty + +q.dataset.qty)); render(); }
    else if (e.target.closest('[data-must]')) { s.must = !s.must; render(); }
    else if (e.target.closest('[data-remove]')) { state.selection = state.selection.filter((x) => x !== s); render(); }
  });
  $('#sel-list').addEventListener('change', (e) => {
    if (!e.target.matches('[data-tier]')) return;
    const s = state.selection.find((x) => x.id === e.target.closest('li').dataset.id);
    s.lockedTier = e.target.value === 'auto' ? null : +e.target.value;
    render();
  });

  $('#arrange-btn').addEventListener('click', () => arrange());
  $('#another-btn').addEventListener('click', () => arrange(true));
  $('#stale-btn').addEventListener('click', () => arrange());
  $('#ar-btn').addEventListener('click', openRoomAr);
  $('#ar-close').addEventListener('click', () => $('#ar-dialog').close());
  $('#ar-dialog').addEventListener('click', (e) => { if (e.target.id === 'ar-dialog') e.target.close(); });
  $('#share-btn').addEventListener('click', async () => {
    const url = shareUrl();
    try { await navigator.clipboard.writeText(url); toast('Link copied. It contains the whole layout, no account needed.'); }
    catch { prompt('Copy this link:', url); }
  });
  $('#item-card').addEventListener('click', (e) => {
    if (e.target.closest('[data-rotate]')) rotateSelected();
    else if (e.target.closest('[data-deselect]')) { selectedKey = null; render({ skip3d: true }); }
    else if (e.target.closest('[data-item-ar]')) {
      const p = lastResult.placed.find((q) => q.key === selectedKey);
      if (p) openItemAr(p.type, p.tier);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    if (e.key === 'Escape' && selectedKey) { selectedKey = null; render({ skip3d: true }); }
  });
}

/* ---------------- Start ---------------- */

const init = loadInitialState();
state = init.state;
bind();
renderRoomPanel();
renderCatalog();
render();
if (init.fromLink) history.replaceState(null, '', location.pathname + location.search);
if (!state.layout) arrange();
else if (init.fromLink) setStep('arrange');
if (init.openArOnLoad) setTimeout(openRoomAr, 300);
