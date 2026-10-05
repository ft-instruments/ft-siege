import { Synth } from './audio.ts';
import { MidiInput } from './midi.ts';
import { KeyboardView, ComputerKeys, FIRST, LAST } from './keyboard.ts';
import { makeControl, type Control } from './ui/controls.ts';
import { Seismograph, BodyView, FieldMap, BeatLamps, type MapUnit } from './ui/map.ts';
import { Viz } from './ui/viz.ts';
import { PARAMS, PARAM_BY_ID, PRESETS, defaults, fromNorm, toNorm, UNITS, UNIT_PREFIX, BODIES, CHARACTER, TUBES, MELODIC, type ParamValues, type Preset } from './dsp/params.ts';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const synth = new Synth();
const values: ParamValues = defaults();
const controls = new Map<string, Control>();

// ---- audio start -----------------------------------------------------------

const startBtn = $<HTMLButtonElement>('#start');
const startLabel = $('#start-label');
let wokeAt = 0;
async function startAudio(): Promise<void> {
  if (synth.running) return;
  startBtn.disabled = true;
  startLabel.textContent = 'raising…';
  try {
    await synth.start();
    synth.loadPreset(values);
    startBtn.disabled = false;
    startBtn.classList.add('on');
    startBtn.title = 'in the field — click to stand the army down';
    startLabel.textContent = `in the field · ${synth.latencyMs.toFixed(0)} ms`;
    wokeAt = performance.now();
  } catch (err) {
    startBtn.disabled = false;
    startLabel.textContent = 'raise';
    console.error(err);
    alert(`Could not start audio: ${(err as Error).message}`);
  }
}
/** Stand the army down: notes stop and the audio device is released. */
async function sleepAudio(): Promise<void> {
  synth.panic();
  for (let n = FIRST; n <= LAST; n++) keyboard.setPressed(n, false);
  await synth.suspend();
  startBtn.classList.remove('on');
  startBtn.title = 'raise the army';
  startLabel.textContent = 'stood down';
}
// the power button toggles; playing a note (or any first click) also raises it
startBtn.addEventListener('click', () => {
  if (synth.running) { if (performance.now() - wokeAt > 400) void sleepAudio(); }
  else void startAudio();
});
window.addEventListener('pointerdown', () => void startAudio(), { once: true });
window.addEventListener('keydown', () => void startAudio(), { once: true });

// ---- visuals ---------------------------------------------------------------

const seismo = new Seismograph($<HTMLCanvasElement>('#scope'));
const logo = $('.brand h1');
/** The name takes a blow: on a preset load and on muster. */
const strike = () => { logo.classList.remove('strike'); void logo.offsetWidth; logo.classList.add('strike'); };

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
/** The slider's lit part follows its value. */
const setMaster = (v: number) => { master.value = String(v); master.style.setProperty('--fill', `${v * 100}%`); };
master.addEventListener('input', () => {
  const v = Number(master.value);
  master.style.setProperty('--fill', `${v * 100}%`);
  onParam('volume', v);
  controls.get('volume')?.set(v);
});

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

// ---- modules ---------------------------------------------------------------

interface Group {
  title?: string; ids: string[]; cls?: string;
  /** the module's main controls, drawn large */
  hero?: boolean;
  /** knob size, when not the usual */
  size?: number;
}
interface PanelSpec {
  title: string; sub?: string; cls: string; span: number; groups: Group[];
  /** which view it lives in */
  tab: string;
  /** unit index: the module folds to one line when the unit's level is 0 */
  unit?: number;
  /** the picture drawn at the top of the module (see ui/viz.ts) */
  viz?: string;
  /** extra display elements, placed before the controls */
  extra?: (body: HTMLElement) => void;
}

const bodyViews: BodyView[] = [];
let fieldMap: FieldMap | null = null;
const lamps = new BeatLamps();
const marchLine = document.createElement('div'); marchLine.className = 'readline';
const fieldLine = document.createElement('div'); fieldLine.className = 'readline';

/**
 * A unit: what it is and its body large, then the strike (or the horn),
 * the crowd, its place on the field and its keys.
 */
const unitGroups = (i: number): Group[] => {
  const u = UNIT_PREFIX[i];
  return [
    { hero: true, ids: [`${u}Body`, `${u}Level`, `${u}Size`, `${u}Tension`, `${u}Damp`, `${u}Char`] },
    { title: 'strike', cls: 'strike', ids: [`${u}Hard`, `${u}Pos`, `${u}Grit`, `${u}Bend`] },
    { title: 'horn', cls: 'horn', ids: [`${u}Partial`, `${u}Snap`, `${u}Lip`, `${u}Breath`, `${u}Growl`] },
    { title: 'crowd', ids: [`${u}Count`, `${u}Spread`, `${u}Cohesion`, `${u}Vary`] },
    { title: 'place', ids: [`${u}Dist`, `${u}Az`] },
    { title: 'keys', ids: [`${u}KeyLo`, `${u}KeyHi`, `${u}Track`, `${u}Root`] },
  ];
};

const LAYOUT: PanelSpec[] = [
  // ---- army: eight units
  ...Array.from({ length: UNITS }, (_, i): PanelSpec => ({
    tab: 'army', unit: i, title: ROMAN[i], cls: 'unit', span: 6,
    extra: (b) => { const c = document.createElement('canvas'); c.className = 'viz bodyview'; b.before(c); bodyViews[i] = new BodyView(c); },
    groups: unitGroups(i),
  })),

  // ---- field: the map, and what lies between the army and you
  { tab: 'field', title: 'the field', sub: 'drag a unit to move it', cls: 'map wide', span: 12, extra: (b) => {
    const c = document.createElement('canvas'); c.className = 'fieldmap'; b.append(c);
    fieldMap = new FieldMap(c, (i, dist, az) => {
      for (const [id, v] of [[`${UNIT_PREFIX[i]}Dist`, dist], [`${UNIT_PREFIX[i]}Az`, az]] as const) { onParam(id, v); controls.get(id)?.set(v); }
    }, () => { /* selection only */ });
    b.append(fieldLine);
  }, groups: [] },
  { tab: 'field', title: 'terrain', sub: 'echoes · the tail', cls: 'terrain', span: 4, viz: 'terrain', groups: [{ hero: true, ids: ['early', 'tailMix', 'tailDecay'] }, { ids: ['terrain', 'tailTone', 'ground'] }] },
  { tab: 'field', title: 'air', sub: 'the way to you · out', cls: 'air', span: 4, viz: 'air', groups: [{ hero: true, ids: ['air', 'proximity', 'volume', 'latency'] }] },
  { tab: 'field', title: 'weather', sub: 'wind', cls: 'weather', span: 4, viz: 'weather', groups: [{ hero: true, ids: ['wind', 'gust', 'windBed'] }] },

  // ---- drill: the clock
  { tab: 'drill', title: 'march', sub: 'the clock · the approach', cls: 'march', span: 5, viz: 'march', extra: (b) => { b.append(lamps.el, marchLine); }, groups: [{ hero: true, ids: ['tempo', 'approach', 'rally'] }, { ids: ['approachFrom', 'vel', 'bend'] }] },
  { tab: 'drill', title: 'rolls', sub: 'retrigger the held keys on the clock', cls: 'roll', span: 7, viz: 'rolls', groups: Array.from({ length: UNITS }, (_, i) => ({ title: ROMAN[i], cls: 'lane', size: 30, ids: [`${UNIT_PREFIX[i]}Roll`, `${UNIT_PREFIX[i]}Accent`] })) },
];

const vizzes: Viz[] = [];
const redrawViz = () => { for (const v of vizzes) v.redraw(); };

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
  if (id.endsWith('Level') || id.endsWith('Body') || id.endsWith('Count')) refreshUnits();
  if (id.endsWith('Count') || id.endsWith('Dist') || id.endsWith('Az') || id.endsWith('Body') || id.endsWith('Level')) refreshMap();
  if (id === 'terrain' || id === 'wind') refreshMap();
  if (id === 'volume') setMaster(v);
  redrawViz();
}

function refreshUnits(expandOn = false): void {
  for (const [i, { panel, meta, name }] of unitPanels) {
    const u = UNIT_PREFIX[i];
    const lvl = values[`${u}Level`];
    const body = Math.round(values[`${u}Body`]);
    const count = Math.round(values[`${u}Count`]);
    const off = lvl <= 0;
    name.textContent = count > 1 ? `${BODIES[body]} ×${count}` : BODIES[body];
    meta.textContent = off ? 'off' : `lvl ${Math.round(lvl * 100)}`;
    panel.classList.toggle('off', off);
    panel.classList.toggle('is-horn', TUBES.includes(body));
    if (expandOn) panel.classList.toggle('collapsed', off);
    const charLabel = controls.get(`${u}Char`)?.el.querySelector('.label');
    if (charLabel) charLabel.textContent = CHARACTER[body];
    bodyViews[i]?.set(body, count);
    rollLanes[i]?.classList.toggle('off', off);
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

const panelsEl = $('#panels');
const rollLanes: HTMLElement[] = [];
const unitPanels = new Map<number, { panel: HTMLElement; meta: HTMLElement; name: HTMLElement }>();
for (const spec of LAYOUT) {
  const panel = document.createElement('section');
  panel.className = `panel ${spec.cls}`;
  panel.style.gridColumn = `span ${spec.span}`;
  panel.dataset.tab = spec.tab;
  const head = document.createElement('div');
  head.className = 'head';
  const h = document.createElement('h2');
  h.textContent = spec.title;
  head.append(h);
  if (spec.unit !== undefined) {
    // units fold to one line; the header names the body and shows the level
    const name = document.createElement('small'); name.className = 'name'; head.append(name);
    const meta = document.createElement('span'); meta.className = 'meta';
    head.append(meta);
    head.classList.add('fold');
    head.addEventListener('click', () => panel.classList.toggle('collapsed'));
    unitPanels.set(spec.unit, { panel, meta, name });
  } else if (spec.sub) { const s = document.createElement('small'); s.textContent = spec.sub; head.append(s); }
  panel.append(head);
  if (spec.viz) {
    const v = new Viz(spec.viz, values, spec.viz === 'rolls');
    vizzes.push(v);
    panel.append(v.el);
  }
  const body = document.createElement('div');
  body.className = 'body';
  panel.append(body);
  spec.extra?.(body);
  for (const g of spec.groups) {
    let host: HTMLElement = body;
    if (g.title || g.hero || g.cls) {
      const sg = document.createElement('div'); sg.className = `subgroup ${g.cls ?? ''} ${g.hero ? 'hero' : ''}`;
      if (g.title) { const t = document.createElement('div'); t.className = 'title'; t.textContent = g.title; sg.append(t); }
      const row = document.createElement('div'); row.className = 'row';
      sg.append(row); body.append(sg); host = row;
      if (g.cls === 'lane') rollLanes.push(sg);
    }
    for (const id of g.ids) {
      const def = PARAM_BY_ID[id];
      if (!def) { console.warn('unknown param', id); continue; }
      // the seventeen bodies are a list to pick from; everything else lays out its choices
      const c = makeControl(def, values[id], (v) => onParam(id, v), { hero: g.hero, size: g.size, segLimit: 8 });
      controls.set(id, c);
      host.append(c.el);
    }
  }
  panelsEl.append(panel);
}

// ---- views: three tabs -----------------------------------------------------

const TABS: { id: string; name: string; hint: string }[] = [
  { id: 'army', name: 'army', hint: 'eight units · bodies · strikes · crowds' },
  { id: 'field', name: 'field', hint: 'the map · terrain · air · weather' },
  { id: 'drill', name: 'drill', hint: 'march clock · approach · rolls' },
];
const tabsEl = $('#tabs');
const tabLight = tabsEl.querySelector<HTMLElement>('.tab-light')!;
const tabButtons = new Map<string, HTMLButtonElement>();
let shownTab = '';
function placeTabLight(): void {
  const b = tabButtons.get(shownTab);
  if (!b) return;
  tabLight.style.left = `${b.offsetLeft}px`;
  tabLight.style.width = `${b.offsetWidth}px`;
}
function showTab(id: string): void {
  if (id === shownTab) return;
  shownTab = id;
  for (const [t, b] of tabButtons) b.classList.toggle('on', t === id);
  tabsEl.dataset.on = id;
  placeTabLight();
  // the modules of the view come in, one after another
  let i = 0;
  for (const el of panelsEl.querySelectorAll<HTMLElement>('.panel')) {
    const on = el.dataset.tab === id;
    el.hidden = !on;
    el.classList.remove('enter');
    if (on) { void el.offsetWidth; el.style.setProperty('--i', String(i++)); el.classList.add('enter'); }
  }
  redrawViz();
  if (id === 'field') refreshMap();
  for (const b of bodyViews) b?.draw();
  try { localStorage.setItem('siege.tab', id); } catch { /* ignore */ }
}
for (const t of TABS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tab';
  b.innerHTML = `<span class="n">${ROMAN[TABS.indexOf(t)]}</span><span class="nm">${t.name}</span><small>${t.hint}</small>`;
  b.addEventListener('click', () => showTab(t.id));
  tabsEl.append(b); tabButtons.set(t.id, b);
}
new ResizeObserver(placeTabLight).observe(tabsEl);

// 1–3 switch view, ` opens the preset browser, Esc closes it
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { closeBrowser(); return; }
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (e.key === '`') { e.preventDefault(); openBrowser(); return; }
  const i = ['1', '2', '3'].indexOf(e.key);
  if (i >= 0) showTab(TABS[i].id);
});

// ---- presets ---------------------------------------------------------------

// Categories, in the order they should appear in the browser. "user" is the
// sounds saved in this browser.
const CATEGORY_NAMES: Record<string, string> = {
  user: 'yours', drums: 'drums', rhythms: 'rhythms', metal: 'metal', horns: 'horns', instruments: 'instruments', mallets: 'mallets & bells',
  pads: 'pads & drones', leads: 'leads', bass: 'bass', crowds: 'crowds', cannon: 'cannon & siege', cinematic: 'cinematic',
  field: 'the field', signals: 'signals', fx: 'fx', init: 'init',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);
const catRank = (tag: string) => { const i = CATEGORY_ORDER.indexOf(tag); return i < 0 ? CATEGORY_ORDER.length : i; };

// ---- your presets: kept in this browser's storage, as diffs from the defaults
const USER_KEY = 'siege.user-presets';
function readUser(): Preset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_KEY) ?? '[]') as { name: string; values: Partial<ParamValues> }[];
    return raw.filter((p) => typeof p?.name === 'string' && p.values).map((p) => ({ name: p.name, tag: 'user', values: p.values }));
  } catch { return []; }
}
let userPresets = readUser();
function writeUser(): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(userPresets.map((p) => ({ name: p.name, values: p.values })))); }
  catch { /* private mode: they last until the page closes */ }
}

const allPresets = (): Preset[] => [...userPresets, ...PRESETS];
const findPreset = (name: string | null) => (name ? allPresets().find((x) => x.name === name) : undefined);
let browseOrder: Preset[] = [];
const sortPresets = () => { browseOrder = allPresets().sort((a, b) => catRank(a.tag) - catRank(b.tag)); };
sortPresets();

const nameEl = $('#preset-name');
const tagEl = $('#preset-tag');
let current: string | null = null;
let lastLoaded: string | null = null;

/** Reflect the loaded preset in the header; null means the patch was edited. */
function setCurrent(name: string | null): void {
  if (current === name) return;
  current = name;
  if (name) lastLoaded = name;
  const p = findPreset(name);
  nameEl.textContent = p ? p.name : (lastLoaded ?? 'custom');
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
  setMaster(values.volume);
  redrawViz();
}

function loadPreset(name: string): void {
  const p = findPreset(name);
  if (!p) return;
  applyValues({ ...defaults(), ...p.values } as ParamValues);
  current = null;                 // force the header to refresh even for the same name
  setCurrent(name);
  nameEl.classList.remove('swap'); void nameEl.offsetWidth; nameEl.classList.add('swap');
  strike();
  try { localStorage.setItem('siege.preset', name); } catch { /* private mode */ }
}

const stepPreset = (d: number) => {
  const i = browseOrder.findIndex((p) => p.name === (current ?? lastLoaded));
  loadPreset(browseOrder[(i + d + browseOrder.length) % browseOrder.length].name);
};
$('#prev').addEventListener('click', () => stepPreset(-1));
$('#next').addEventListener('click', () => stepPreset(1));

/** The current sound as a diff from the defaults: what a preset stores. */
function patchDiff(): Partial<ParamValues> {
  const d = defaults();
  const diff: Partial<ParamValues> = {};
  for (const id in values) if (Math.abs(values[id] - d[id]) > 1e-9) diff[id] = Number(values[id].toFixed(4));
  return diff;
}

// ---- the browser -----------------------------------------------------------

const browserEl = $('#browser');
const listEl = $('#browser-list');
const sideEl = $('#browser-side');
const searchEl = $<HTMLInputElement>('#browser-search');
const cards = new Map<string, HTMLButtonElement>();
const heads = new Map<string, HTMLElement>();

/** (Re)build the list and the sidebar from the factory bank and yours. */
function buildBrowser(): void {
  listEl.replaceChildren(); sideEl.replaceChildren(); cards.clear(); heads.clear();
  const counts = new Map<string, number>();
  for (const p of browseOrder) counts.set(p.tag, (counts.get(p.tag) ?? 0) + 1);
  if (!userPresets.length) {
    // keep a place for them, so saving has somewhere to land
    const h = document.createElement('div'); h.className = 'cat'; h.dataset.tag = 'user';
    h.innerHTML = '<span class="nm"></span>';
    h.querySelector('.nm')!.textContent = CATEGORY_NAMES.user;
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = 'no orders of your own yet — shape a sound, then “save current” (⌘S)';
    listEl.append(h, empty); heads.set('user', h);
    counts.set('user', 0);
  }
  for (const tag of [...new Set(['user', ...browseOrder.map((p) => p.tag)])]) {
    const s = document.createElement('button');
    s.type = 'button'; s.dataset.tag = tag;
    s.innerHTML = '<span class="nm"></span><span class="count"></span>';
    s.querySelector('.nm')!.textContent = CATEGORY_NAMES[tag] ?? tag;
    s.querySelector('.count')!.textContent = String(counts.get(tag) ?? 0);
    s.addEventListener('click', () => {
      if (searchEl.value) { searchEl.value = ''; filterBrowser(); }
      heads.get(tag)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    sideEl.append(s);
  }
  let lastTag = '';
  for (const p of browseOrder) {
    if (p.tag !== lastTag) {
      lastTag = p.tag;
      const h = document.createElement('div');
      h.className = 'cat'; h.dataset.tag = p.tag;
      h.innerHTML = '<span class="nm"></span><span class="count"></span>';
      h.querySelector('.nm')!.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
      h.querySelector('.count')!.textContent = String(counts.get(p.tag) ?? 0);
      listEl.append(h); heads.set(p.tag, h);
    }
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'card'; card.dataset.tag = p.tag; card.title = p.name;
    card.dataset.search = `${p.name} ${CATEGORY_NAMES[p.tag] ?? p.tag}`.toLowerCase();
    card.innerHTML = `<span class="nm"></span><span class="tg"></span>`;
    card.querySelector<HTMLElement>('.nm')!.textContent = p.name;
    card.querySelector<HTMLElement>('.tg')!.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
    card.addEventListener('click', () => { loadPreset(p.name); closeBrowser(); });
    if (p.tag === 'user') {
      // yours can be deleted: one click arms it, the second deletes
      const del = document.createElement('span');
      del.className = 'del'; del.title = 'delete'; del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'delete?'; return; }
        userPresets = userPresets.filter((x) => x.name !== p.name);
        writeUser(); sortPresets(); buildBrowser(); filterBrowser();
        if (current === p.name) setCurrent(null);
      });
      del.addEventListener('mouseleave', () => { del.classList.remove('armed'); del.textContent = '×'; });
      card.append(del);
    }
    card.classList.toggle('on', p.name === current);
    listEl.append(card);
    cards.set(p.name, card);
  }
}
buildBrowser();

function filterBrowser(): void {
  const q = searchEl.value.trim().toLowerCase();
  // while searching, results come from several categories at once, so each
  // card names its own; otherwise the heading above it already does
  listEl.classList.toggle('searching', q.length > 0);
  let shownInCat = 0;
  let cat: HTMLElement | null = null;
  for (const el of listEl.children as HTMLCollectionOf<HTMLElement>) {
    if (el.classList.contains('cat')) {
      if (cat) cat.hidden = shownInCat === 0 && !!q;
      cat = el; shownInCat = 0;
      continue;
    }
    const hit = !q || (el.dataset.search ?? '').includes(q);
    el.hidden = !hit;
    if (hit) shownInCat++;
  }
  if (cat) cat.hidden = shownInCat === 0 && !!q;
}

// ---- saving: name the current sound
const saveBar = $<HTMLFormElement>('#savebar');
const saveName = $<HTMLInputElement>('#save-name');
const saveOk = $<HTMLButtonElement>('#save-ok');
const saveMsg = $('#save-msg');

function checkName(): 'new' | 'overwrite' | 'taken' | 'empty' {
  const n = saveName.value.trim();
  if (!n) return 'empty';
  if (PRESETS.some((p) => p.name.toLowerCase() === n.toLowerCase())) return 'taken';
  return userPresets.some((p) => p.name.toLowerCase() === n.toLowerCase()) ? 'overwrite' : 'new';
}
function refreshSave(): void {
  const s = checkName();
  saveOk.textContent = s === 'overwrite' ? 'overwrite' : 'save';
  saveOk.disabled = s === 'empty' || s === 'taken';
  saveMsg.textContent = s === 'taken' ? 'a factory preset has that name' : s === 'overwrite' ? 'replaces your sound with that name' : '';
}
function openSave(): void {
  if (browserEl.hidden) openBrowser();
  saveBar.hidden = false;
  const base = findPreset(lastLoaded);
  saveName.value = base?.tag === 'user' ? base.name : current ? '' : (lastLoaded ? `${lastLoaded} (mine)` : '');
  refreshSave();
  saveName.focus(); saveName.select();
}
function closeSave(): void { saveBar.hidden = true; }
saveName.addEventListener('input', refreshSave);
saveBar.addEventListener('submit', (e) => {
  e.preventDefault();
  const s = checkName();
  if (s === 'empty' || s === 'taken') return;
  const name = saveName.value.trim();
  const p: Preset = { name, tag: 'user', values: patchDiff() };
  const i = userPresets.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) userPresets[i] = p; else userPresets.push(p);
  userPresets.sort((a, b) => a.name.localeCompare(b.name));
  writeUser(); sortPresets(); buildBrowser();
  closeSave(); closeBrowser();
  current = null; setCurrent(name);
  nameEl.classList.remove('swap'); void nameEl.offsetWidth; nameEl.classList.add('swap');
  try { localStorage.setItem('siege.preset', name); } catch { /* private mode */ }
});
$('#save-cancel').addEventListener('click', closeSave);
$('#browser-save').addEventListener('click', openSave);
$('#save').addEventListener('click', openSave);
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); openSave(); }
});

function openBrowser(): void {
  browserEl.hidden = false;
  closeSave();
  searchEl.value = '';
  filterBrowser();
  searchEl.focus();
  cards.get(current ?? lastLoaded ?? '')?.scrollIntoView({ block: 'center' });
}
function closeBrowser(): void { browserEl.hidden = true; closeSave(); }

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
  strike();
});

$('#copy').addEventListener('click', async () => {
  const diff = patchDiff();
  try { await navigator.clipboard.writeText(JSON.stringify(diff)); } catch { console.log(JSON.stringify(diff)); }
  const b = $('#copy');
  b.classList.add('done');
  setTimeout(() => b.classList.remove('done'), 1200);
});

let startTab = 'army';
try { startTab = localStorage.getItem('siege.tab') ?? startTab; } catch { /* ignore */ }
showTab(TABS.some((t) => t.id === startTab) ? startTab : 'army');

let initial = browseOrder.find((p) => p.tag !== 'user')!.name;
try { initial = localStorage.getItem('siege.preset') ?? initial; } catch { /* ignore */ }
loadPreset(findPreset(initial) ? initial : PRESETS[0].name);

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
const mapPanel = panelsEl.querySelector<HTMLElement>('.panel.map')!;
let lastPeak = 0;
let mapTick = 0;
synth.onStats = (s) => {
  stats.textContent = `${s.voices} units · ${Math.round(s.load * 100)}% dsp`;
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
  marchLine.textContent = `approach ${values.approach > 0 ? `${Math.round(approachNow * 100)}%` : 'off'} · rally ${values.rally > 0 ? `${Math.round(rally * 100)}%` : 'off'}`;
  fieldLine.textContent = `wind ${windNow >= 0 ? '+' : '−'}${Math.abs(windNow).toFixed(2)} · ${UNIT_PREFIX.filter((u) => values[`${u}Level`] > 0).length} units in the field`;
  if ((++mapTick & 3) === 0 && !mapPanel.hidden) refreshMap();
};
// expose for the headless check
(window as unknown as { __siege: unknown }).__siege = { synth, values, peak: () => lastPeak, loadPreset };
