import { Synth } from './audio.ts';
import { MidiInput } from './midi.ts';
import { KeyboardView, ComputerKeys, FIRST, LAST } from './keyboard.ts';
import { makeControl, type Control } from './ui/controls.ts';
import { Seismograph, BodyView, FieldMap, BeatLamps, type MapUnit } from './ui/map.ts';
import { PARAMS, PARAM_BY_ID, PRESETS, defaults, fromNorm, toNorm, UNITS, UNIT_PREFIX, BODIES, CHARACTER, TUBES, MELODIC, type ParamValues } from './dsp/params.ts';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const synth = new Synth();
const values: ParamValues = defaults();
const controls = new Map<string, Control>();

// ---- audio start -----------------------------------------------------------

const startBtn = $<HTMLButtonElement>('#start');
async function startAudio(): Promise<void> {
  if (synth.running) return;
  startBtn.disabled = true;
  startBtn.textContent = 'raising…';
  try {
    await synth.start();
    synth.loadPreset(values);
    startBtn.textContent = `in the field · ${synth.latencyMs.toFixed(0)} ms`;
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = 'raise';
    console.error(err);
    alert(`Could not start audio: ${(err as Error).message}`);
  }
}
startBtn.addEventListener('click', startAudio);
window.addEventListener('pointerdown', () => void startAudio(), { once: true });
window.addEventListener('keydown', () => void startAudio(), { once: true });

// ---- visuals ---------------------------------------------------------------

const seismo = new Seismograph($<HTMLCanvasElement>('#scope'));

// ---- note routing ----------------------------------------------------------

const handler = {
  noteOn(note: number, velocity: number) {
    void startAudio();
    synth.noteOn(note, velocity);
    keyboard.setPressed(note, true);
  },
  noteOff(note: number) {
    synth.noteOff(note);
    keyboard.setPressed(note, false);
  },
  cc(cc: number, value: number) {
    synth.cc(cc, value);
    if (cc === 64) keyboard.setSustain(value >= 64);
  },
  bend(value: number) { synth.bend(value); },
};

const keyboard = new KeyboardView($<HTMLCanvasElement>('#keyboard'), handler);
const octaveLabel = $('#octave');
new ComputerKeys(handler, (o) => (octaveLabel.textContent = `C${o}`));

const master = $<HTMLInputElement>('#master');
master.addEventListener('input', () => { onParam('volume', Number(master.value)); controls.get('volume')?.set(Number(master.value)); });

$<HTMLButtonElement>('#panic').addEventListener('click', () => {
  synth.panic();
  for (let n = FIRST; n <= LAST; n++) keyboard.setPressed(n, false);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault(); handler.cc(64, 127);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { e.preventDefault(); handler.cc(64, 0); }
});

// ---- windows ---------------------------------------------------------------

interface Group { title?: string; ids: string[]; cls?: string }
interface PanelSpec {
  title: string; sub?: string; cls: string; span: number; groups: Group[];
  /** which view it lives in */
  tab: string;
  /** unit index: the window folds when the unit's level is 0 */
  unit?: number;
  /** extra display elements, placed before the controls */
  extra?: (body: HTMLElement) => void;
}

const bodyViews: BodyView[] = [];
let fieldMap: FieldMap | null = null;
const lamps = new BeatLamps();
const marchLine = document.createElement('div'); marchLine.className = 'readline';
const fieldLine = document.createElement('div'); fieldLine.className = 'readline';

const unitGroups = (i: number): Group[] => {
  const u = UNIT_PREFIX[i];
  return [
    { title: 'body', ids: [`${u}Body`, `${u}Level`, `${u}Size`, `${u}Tension`, `${u}Damp`, `${u}Char`] },
    { title: 'strike', cls: 'strike', ids: [`${u}Hard`, `${u}Pos`, `${u}Grit`, `${u}Bend`] },
    { title: 'horn', cls: 'horn', ids: [`${u}Partial`, `${u}Snap`, `${u}Lip`, `${u}Breath`, `${u}Growl`] },
    { title: 'crowd', ids: [`${u}Count`, `${u}Spread`, `${u}Cohesion`, `${u}Vary`] },
    { title: 'place', ids: [`${u}Dist`, `${u}Az`] },
    { title: 'keys', ids: [`${u}KeyLo`, `${u}KeyHi`, `${u}Track`, `${u}Root`] },
  ];
};

const LAYOUT: PanelSpec[] = [
  ...Array.from({ length: UNITS }, (_, i): PanelSpec => ({
    tab: 'army', unit: i, title: ROMAN[i], sub: 'unit', cls: 'unit', span: 6,
    extra: (b) => { const c = document.createElement('canvas'); c.className = 'bodyview'; b.append(c); bodyViews[i] = new BodyView(c); },
    groups: unitGroups(i),
  })),
  { tab: 'field', title: 'the field', sub: 'drag a unit to move it', cls: 'map', span: 8, extra: (b) => {
    const c = document.createElement('canvas'); c.className = 'fieldmap'; b.append(c);
    fieldMap = new FieldMap(c, (i, dist, az) => { onParam(`${UNIT_PREFIX[i]}Dist`, dist); onParam(`${UNIT_PREFIX[i]}Az`, az); controls.get(`${UNIT_PREFIX[i]}Dist`)?.set(dist); controls.get(`${UNIT_PREFIX[i]}Az`)?.set(az); }, () => { /* selection only */ });
    b.append(fieldLine);
  }, groups: [] },
  { tab: 'field', title: 'terrain', sub: 'echoes · the tail', cls: 'terrain', span: 4, groups: [{ ids: ['terrain', 'early', 'tailMix', 'tailDecay', 'tailTone', 'ground'] }] },
  { tab: 'field', title: 'air', sub: 'the way to you', cls: 'air', span: 4, groups: [{ ids: ['air', 'latency', 'proximity'] }] },
  { tab: 'field', title: 'weather', sub: 'wind', cls: 'air', span: 4, groups: [{ ids: ['wind', 'gust', 'windBed'] }] },
  { tab: 'field', title: 'out', sub: '', cls: 'out', span: 4, groups: [{ ids: ['volume'] }] },
  { tab: 'drill', title: 'march', sub: 'the clock · the approach', cls: 'march', span: 6, extra: (b) => { b.append(lamps.el, marchLine); }, groups: [{ ids: ['tempo', 'approach', 'approachFrom', 'rally', 'vel', 'bend'] }] },
  { tab: 'drill', title: 'rolls', sub: 'retrigger the held keys on the clock', cls: 'roll', span: 6, groups: Array.from({ length: UNITS }, (_, i) => ({ title: ROMAN[i], ids: [`${UNIT_PREFIX[i]}Roll`, `${UNIT_PREFIX[i]}Accent`] })) },
];

function onParam(id: string, v: number): void {
  values[id] = v;
  synth.setParam(id, v);
  setCurrent(null);
  if (id.endsWith('Body')) {
    // a melodic body tracks the keys unless told otherwise; a struck one plays its natural pitch
    const track = MELODIC.includes(Math.round(v)) ? 1 : 0;
    const tid = id.replace(/Body$/, 'Track');
    if (values[tid] !== track) { values[tid] = track; synth.setParam(tid, track); controls.get(tid)?.set(track); }
  }
  if (id.endsWith('Level') || id.endsWith('Body')) refreshUnits();
  if (id.endsWith('Count') || id.endsWith('Dist') || id.endsWith('Az') || id.endsWith('Body') || id.endsWith('Level')) refreshMap();
  if (id === 'terrain' || id === 'wind') refreshMap();
  if (id === 'volume') master.value = String(v);
}

function refreshUnits(expandOn = false): void {
  for (const [i, { panel, meta, name }] of unitPanels) {
    const u = UNIT_PREFIX[i];
    const lvl = values[`${u}Level`];
    const body = Math.round(values[`${u}Body`]);
    const off = lvl <= 0;
    name.textContent = BODIES[body];
    meta.textContent = off ? 'off' : `level ${lvl.toFixed(2)}`;
    panel.classList.toggle('off', off);
    panel.classList.toggle('is-horn', TUBES.includes(body));
    if (expandOn) panel.classList.toggle('collapsed', off);
    const charLabel = controls.get(`${u}Char`)?.el.querySelector('.label');
    if (charLabel) charLabel.textContent = CHARACTER[body];
    bodyViews[i]?.set(body, Math.round(values[`${u}Count`]));
  }
}

function mapUnits(): MapUnit[] {
  return UNIT_PREFIX.map((u, i) => ({
    body: Math.round(values[`${u}Body`]), count: Math.round(values[`${u}Count`]), dist: values[`${u}Dist`], az: values[`${u}Az`],
    level: unitLevels[i], on: values[`${u}Level`] > 0,
  }));
}
const unitLevels = new Float32Array(UNITS);
function refreshMap(): void {
  fieldMap?.setUnits(mapUnits());
  fieldMap?.setField(Math.round(values.terrain), windNow, approachNow);
}
let windNow = 0, approachNow = 1;

// ---- views: three tabs
const TABS: { id: string; name: string; hint: string }[] = [
  { id: 'army', name: 'army', hint: 'eight units · bodies · strikes · crowds' },
  { id: 'field', name: 'field', hint: 'the map · terrain · air · weather' },
  { id: 'drill', name: 'drill', hint: 'march clock · approach · rolls' },
];
const tabsEl = $('#tabs');
const tabButtons = new Map<string, HTMLButtonElement>();
function showTab(id: string): void {
  for (const [t, b] of tabButtons) b.classList.toggle('on', t === id);
  for (const el of panelsEl.querySelectorAll<HTMLElement>('.win')) el.hidden = el.dataset.tab !== id;
  try { localStorage.setItem('siege.tab', id); } catch { /* ignore */ }
  if (id === 'field') refreshMap();
}
for (const t of TABS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tab';
  b.innerHTML = `<span>${t.name}</span><small>${t.hint}</small>`;
  b.addEventListener('click', () => showTab(t.id));
  tabsEl.append(b); tabButtons.set(t.id, b);
}
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { closeBrowser(); return; }
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (e.key === '`') { e.preventDefault(); openBrowser(); return; }
  const i = ['1', '2', '3'].indexOf(e.key);
  if (i >= 0) showTab(TABS[i].id);
});

const panelsEl = $('#panels');
const unitPanels = new Map<number, { panel: HTMLElement; meta: HTMLElement; name: HTMLElement }>();
for (const spec of LAYOUT) {
  const panel = document.createElement('section');
  panel.className = `win ${spec.cls}`;
  panel.style.gridColumn = `span ${spec.span}`;
  panel.dataset.tab = spec.tab;
  const h = document.createElement('h2');
  h.textContent = spec.title;
  if (spec.unit !== undefined) {
    const name = document.createElement('span'); name.className = 'name'; h.append(name);
    const meta = document.createElement('span'); meta.className = 'meta';
    h.append(meta);
    h.classList.add('fold');
    h.addEventListener('click', () => panel.classList.toggle('collapsed'));
    unitPanels.set(spec.unit, { panel, meta, name });
  } else if (spec.sub) { const s = document.createElement('small'); s.textContent = spec.sub; h.append(s); }
  const body = document.createElement('div');
  body.className = 'body';
  spec.extra?.(body);
  for (const g of spec.groups) {
    let host: HTMLElement = body;
    if (g.title) {
      const sg = document.createElement('div'); sg.className = `subgroup ${g.cls ?? ''}`;
      const t = document.createElement('div'); t.className = 'title'; t.textContent = g.title;
      const row = document.createElement('div'); row.className = 'row';
      sg.append(t, row); body.append(sg); host = row;
    }
    for (const id of g.ids) {
      const def = PARAM_BY_ID[id];
      if (!def) { console.warn('unknown param', id); continue; }
      const c = makeControl(def, values[id], (v) => onParam(id, v));
      controls.set(id, c);
      host.append(c.el);
    }
  }
  panel.append(h, body);
  panelsEl.append(panel);
}

// ---- presets ---------------------------------------------------------------

const CATEGORY_NAMES: Record<string, string> = {
  drums: 'drums', metal: 'metal', horns: 'horns', instruments: 'instruments', crowds: 'crowds', cannon: 'cannon & siege', field: 'the field', signals: 'signals', init: 'init',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);
const catRank = (tag: string) => { const i = CATEGORY_ORDER.indexOf(tag); return i < 0 ? CATEGORY_ORDER.length : i; };
const BROWSE_ORDER = [...PRESETS].sort((a, b) => catRank(a.tag) - catRank(b.tag));

const nameEl = $('#preset-name');
const tagEl = $('#preset-tag');
let current: string | null = null;

/** Reflect the loaded preset in the header; null means the patch was edited. */
function setCurrent(name: string | null): void {
  if (current === name) return;
  current = name;
  const p = name ? PRESETS.find((x) => x.name === name) : undefined;
  nameEl.textContent = p ? p.name : (name ?? 'custom');
  tagEl.textContent = p ? (CATEGORY_NAMES[p.tag] ?? p.tag) : 'edited';
  tagEl.dataset.tag = p ? p.tag : 'edited';
  for (const [n, card] of cards) card.classList.toggle('on', n === name);
}

function applyValues(next: ParamValues): void {
  for (const def of PARAMS) {
    values[def.id] = next[def.id];
    controls.get(def.id)?.set(next[def.id]);
  }
  synth.loadPreset(values);
  refreshUnits(true);
  refreshMap();
  master.value = String(values.volume);
}

function loadPreset(name: string): void {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) return;
  applyValues({ ...defaults(), ...p.values } as ParamValues);
  setCurrent(name);
  try { localStorage.setItem('siege.preset', name); } catch { /* private mode */ }
}
const stepPreset = (d: number) => {
  const i = BROWSE_ORDER.findIndex((p) => p.name === current);
  loadPreset(BROWSE_ORDER[(i + d + BROWSE_ORDER.length) % BROWSE_ORDER.length].name);
};
$('#prev').addEventListener('click', () => stepPreset(-1));
$('#next').addEventListener('click', () => stepPreset(1));

// ---- the browser -----------------------------------------------------------

const browserEl = $('#browser');
const listEl = $('#browser-list');
const searchEl = $<HTMLInputElement>('#browser-search');
const cards = new Map<string, HTMLButtonElement>();

{
  let lastTag = '';
  for (const p of BROWSE_ORDER) {
    if (p.tag !== lastTag) {
      lastTag = p.tag;
      const h = document.createElement('div');
      h.className = 'cat'; h.dataset.tag = p.tag;
      h.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
      listEl.append(h);
    }
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'card'; card.dataset.tag = p.tag;
    card.dataset.search = `${p.name} ${CATEGORY_NAMES[p.tag] ?? p.tag}`.toLowerCase();
    card.innerHTML = `<span class="nm"></span><span class="tg"></span>`;
    card.querySelector<HTMLElement>('.nm')!.textContent = p.name;
    card.querySelector<HTMLElement>('.tg')!.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
    card.addEventListener('click', () => { loadPreset(p.name); closeBrowser(); });
    listEl.append(card);
    cards.set(p.name, card);
  }
}

function filterBrowser(): void {
  const q = searchEl.value.trim().toLowerCase();
  // while searching, results come from several categories at once, so each
  // card names its own; otherwise the heading above it already does
  listEl.classList.toggle('searching', q.length > 0);
  let shownInCat = 0;
  let cat: HTMLElement | null = null;
  for (const el of listEl.children as HTMLCollectionOf<HTMLElement>) {
    if (el.classList.contains('cat')) {
      if (cat) cat.hidden = shownInCat === 0;
      cat = el; shownInCat = 0;
      continue;
    }
    const hit = !q || (el.dataset.search ?? '').includes(q);
    el.hidden = !hit;
    if (hit) shownInCat++;
  }
  if (cat) cat.hidden = shownInCat === 0;
}

function openBrowser(): void {
  browserEl.hidden = false;
  searchEl.value = '';
  filterBrowser();
  searchEl.focus();
  cards.get(current ?? '')?.scrollIntoView({ block: 'center' });
}
function closeBrowser(): void { browserEl.hidden = true; }

$('#browse').addEventListener('click', openBrowser);
$('#browser-close').addEventListener('click', closeBrowser);
browserEl.addEventListener('click', (e) => { if (e.target === browserEl) closeBrowser(); });
searchEl.addEventListener('input', filterBrowser);
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = [...listEl.querySelectorAll<HTMLButtonElement>('.card')].find((c) => !c.hidden);
    if (first) first.click();
  }
});

// "muster": nudge a handful of continuous parameters of the units that are on, and move one of them on the field
$('#spore').addEventListener('click', () => {
  const on = UNIT_PREFIX.filter((u) => values[`${u}Level`] > 0);
  const pool = PARAMS.filter((p) => (p.scale === 'lin' || p.scale === 'log') && p.id !== 'volume' && p.id !== 'tempo'
    && (on.some((u) => p.id.startsWith(u)) || !/^u\d/.test(p.id)) && !p.id.endsWith('Level'));
  const next = { ...values };
  for (let i = 0; i < 8; i++) {
    const def = pool[Math.floor(Math.random() * pool.length)];
    const t = toNorm(def, next[def.id]) + (Math.random() - 0.5) * 0.25;
    next[def.id] = fromNorm(def, t);
  }
  if (on.length && Math.random() < 0.5) {
    const u = on[Math.floor(Math.random() * on.length)];
    next[`${u}Dist`] = fromNorm(PARAM_BY_ID[`${u}Dist`], Math.random());
    next[`${u}Az`] = Math.random() * 2 - 1;
  }
  applyValues(next);
  setCurrent(null);
});

$('#copy').addEventListener('click', async () => {
  const d = defaults();
  const diff: Record<string, number> = {};
  for (const id in values) if (Math.abs(values[id] - d[id]) > 1e-9) diff[id] = Number(values[id].toFixed(4));
  try { await navigator.clipboard.writeText(JSON.stringify(diff)); } catch { console.log(JSON.stringify(diff)); }
});

let startTab = 'army';
try { startTab = localStorage.getItem('siege.tab') ?? startTab; } catch { /* ignore */ }
showTab(TABS.some((t) => t.id === startTab) ? startTab : 'army');

let initial = BROWSE_ORDER[0].name;
try { initial = localStorage.getItem('siege.preset') ?? initial; } catch { /* ignore */ }
loadPreset(PRESETS.some((p) => p.name === initial) ? initial : BROWSE_ORDER[0].name);

// ---- MIDI ------------------------------------------------------------------

const midiLed = $('#midi-led');
const midiSel = $<HTMLSelectElement>('#midi-port');
const midi = new MidiInput(handler);
let ledTimer = 0;
midi.onActivity = () => {
  midiLed.classList.add('on');
  clearTimeout(ledTimer);
  ledTimer = window.setTimeout(() => midiLed.classList.remove('on'), 120);
};
midi.onPortsChanged = (ports) => {
  const cur = midiSel.value || 'all';
  midiSel.innerHTML = '<option value="all">all MIDI inputs</option>';
  for (const p of ports) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    midiSel.append(o);
  }
  midiSel.value = ports.some((p) => p.id === cur) ? cur : 'all';
};
midiSel.addEventListener('change', () => midi.select(midiSel.value as string | 'all'));
midi.init().then((ok) => {
  if (!ok) midiSel.innerHTML = `<option>${MidiInput.supported ? 'MIDI denied' : 'no Web MIDI'}</option>`;
});

// ---- stats / the live field ------------------------------------------------

const stats = $('#stats');
let lastPeak = 0;
let mapTick = 0;
synth.onStats = (s) => {
  stats.textContent = `${s.voices} units · ${String(Math.round(s.load * 100)).padStart(2, '0')}% dsp`;
  const peak = Math.max(s.peakL, s.peakR);
  lastPeak = peak;
  seismo.update(s.scope, peak);
  const d = s.display;
  for (let i = 0; i < UNITS; i++) {
    unitLevels[i] = d[i * 3] / 255;
    bodyViews[i]?.hit(d[i * 3 + 1], unitLevels[i]);
  }
  windNow = d[24] / 127.5 - 1;
  approachNow = d[25] / 255;
  lamps.set(d[26] / 255);
  const rally = d[27] / 255;
  marchLine.textContent = `approach ${values.approach > 0 ? `${Math.round(approachNow * 100)} %` : 'off'} · rally ${values.rally > 0 ? `${Math.round(rally * 100)} %` : 'off'}`;
  fieldLine.textContent = `wind ${windNow >= 0 ? '+' : ''}${windNow.toFixed(2)} · ${UNIT_PREFIX.filter((u) => values[`${u}Level`] > 0).length} units in the field`;
  if ((++mapTick & 3) === 0 && !panelsEl.querySelector<HTMLElement>('.win.map')?.hidden) refreshMap();
};
// expose for the headless check
(window as unknown as { __siege: unknown }).__siege = { synth, values, peak: () => lastPeak, loadPreset };
