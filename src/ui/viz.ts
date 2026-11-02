// The picture in each module: what the controls are doing, drawn from the
// parameters with the same maths the field uses (the terrain's echo taps
// and tail, air absorption over distance, the wind's gusts, the march
// clock with its approach and rally, the rolls on the clock). Redrawn when
// a value changes, never per audio block. The drawing helper and the Viz
// canvas are the family's (same as Mycelia's); the pictures are Siege's.

import { type ParamValues, TERRAINS, ROLL_BEATS, ROLLS, UNIT_PREFIX } from '../dsp/params.ts';
import { TERRAIN_TAPS } from '../dsp/space.ts';

type Draw = (g: Pen, v: ParamValues) => void;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** A canvas drawing helper with the module's accent and a glow. */
class Pen {
  constructor(public ctx: CanvasRenderingContext2D, public w: number, public h: number, public rgb: string) {}
  c(a: number): string { return `rgba(${this.rgb}, ${a})`; }

  grid(cols: number, rows = 2): void {
    const { ctx, w, h } = this;
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.08)'; ctx.lineWidth = 1;
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    for (let i = 1; i < cols; i++) { const x = Math.round((i / cols) * w) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let j = 1; j < rows; j++) { const y = Math.round((j / rows) * h) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** A glowing line through the points, with a fading fill down to `base`. */
  trace(pts: [number, number][], opts: { base?: number; alpha?: number; width?: number; fill?: boolean; dash?: number[] } = {}): void {
    if (pts.length < 2) return;
    const { ctx } = this;
    const alpha = opts.alpha ?? 1;
    if (opts.fill !== false && opts.base !== undefined) {
      const grad = ctx.createLinearGradient(0, 0, 0, this.h);
      grad.addColorStop(0, this.c(0.3 * alpha));
      grad.addColorStop(1, this.c(0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], opts.base);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1][0], opts.base);
      ctx.closePath(); ctx.fill();
    }
    ctx.setLineDash(opts.dash ?? []);
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.shadowColor = this.c(0.95 * alpha); ctx.shadowBlur = 8;
    ctx.strokeStyle = this.c(alpha); ctx.lineWidth = opts.width ?? 1.7;
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.setLineDash([]);
  }

  dot(x: number, y: number, r = 3, a = 1): void {
    const { ctx } = this;
    ctx.shadowColor = this.c(1); ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(255, 244, 228, ${a})`;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.shadowBlur = 0;
  }

  bar(x: number, y: number, w: number, h: number, a = 1): void {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, this.c(0.95 * a));
    grad.addColorStop(1, this.c(0.2 * a));
    ctx.shadowColor = this.c(0.8 * a); ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, Math.max(1, h));
    ctx.shadowBlur = 0;
  }

  text(s: string, x: number, y: number, align: CanvasTextAlign = 'left', a = 0.55): void {
    const { ctx } = this;
    ctx.font = '500 9px "IBM Plex Mono", "FT Symbols", ui-monospace, monospace';
    ctx.textAlign = align; ctx.fillStyle = `rgba(255, 244, 228, ${a})`;
    ctx.fillText(s.toUpperCase(), x, y);
  }
}

/** A repeatable noise, so a picture does not flicker between redraws. */
function rng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296) * 2 - 1; };
}

// ---- the pictures ----------------------------------------------------------------

/** Terrain: the landscape's echo taps, then the rolling tail (space.ts). */
const terrain: Draw = (g, v) => {
  const { w, h } = g;
  const t = Math.round(v.terrain);
  const span = Math.max(1.4, Math.min(6, v.tailDecay * 0.6));      // seconds shown
  const x = (s: number) => 6 + (s / span) * (w - 12);
  g.grid(Math.round(span * 4));
  const base = h - 6, top = 16;
  // the direct sound
  g.bar(x(0) - 1, top, 3, base - top);
  // the taps: brighter echoes are brighter bars
  for (const tap of TERRAIN_TAPS[t]) {
    const hh = (base - top) * Math.min(1, tap.g * 1.6) * (0.3 + 0.7 * v.early);
    g.bar(x(tap.ms / 1000) - 1, base - hh, 3, hh, 0.35 + tap.bright);
  }
  // the tail: an exponential that falls 60 dB over the roll-off time
  const pts: [number, number][] = [];
  const onset = 0.03;
  for (let i = 0; i <= 160; i++) {
    const s = onset + (i / 160) * (span - onset);
    const lvl = Math.exp((-6.9 * (s - onset)) / v.tailDecay) * v.tailMix;
    pts.push([x(s), base - lvl * (base - top) * 0.8]);
  }
  g.trace(pts, { base, alpha: 0.4 + 0.6 * v.tailTone });
  g.text(`${TERRAINS[t]} · ${v.tailDecay.toFixed(1)} s`, w - 8, 12, 'right');
};

/** Air: what reaches you from 10, 100 and 800 m (the per-path low-pass, space.ts). */
const air: Draw = (g, v) => {
  const { w, h } = g;
  const f0 = 40, f1 = 20000, top = 16, floor = 42;
  const x = (f: number) => (Math.log(f / f0) / Math.log(f1 / f0)) * w;
  g.grid(6);
  [10, 100, 800].forEach((d, k) => {
    const cut = Math.max(200, 20000 / (1 + (d / 40) * (0.35 + 0.9 * v.air)));
    const gain = Math.pow(6 / Math.max(6, d), 0.6);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) {
      const f = f0 * Math.pow(f1 / f0, i / 120);
      const db = Math.max(-floor, 20 * Math.log10(gain / Math.sqrt(1 + (f / cut) ** 2)));
      pts.push([x(f), top + (-db / floor) * (h - top - 4)]);
    }
    g.trace(pts, { base: h, alpha: 1 - k * 0.3, fill: k === 0 });
    // each distance named at the left, where the curves are still flat and apart
    g.text(`${d} m`, 8, pts[0][1] - 4, 'left', 0.75 - k * 0.15);
  });
  g.text(`humidity ${Math.round(v.air * 100)}%${v.latency >= 0.5 ? ' · late' : ''}`, w - 8, h - 8, 'right');
};

/** Weather: twenty seconds of the gust signal (two cascaded one-poles on noise, space.ts). */
const weather: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(10);
  const mid = h / 2, amp = h / 2 - 12;
  const seconds = 20, n = 600, noise = rng(0x2545f491);
  const a = 1 - Math.exp((-2 * Math.PI * v.gust * seconds) / n);
  let s1 = 0, s2 = 0;
  // warm the filter up so the picture starts mid-gust
  for (let i = 0; i < 200; i++) { s1 += (noise() * 6 - s1) * a; s2 += (s1 - s2) * a; }
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    s1 += (noise() * 6 - s1) * a; s2 += (s1 - s2) * a;
    const y = Math.max(-1, Math.min(1, s2)) * v.wind;
    pts.push([(i / (n - 1)) * w, mid - y * amp]);
  }
  // the bed: a band of hiss around the line
  if (v.windBed > 0) {
    g.ctx.fillStyle = g.c(0.12 * v.windBed + 0.04);
    const r = rng(7);
    for (let i = 0; i < 260; i++) g.ctx.fillRect(Math.abs(r()) * w, mid + r() * amp * v.windBed, 1.5, 1.5);
  }
  g.trace(pts, { alpha: v.wind > 0 ? 1 : 0.3, fill: false });
  g.text(`gust ${v.gust.toFixed(2)} Hz${v.windBed > 0 ? ` · bed ${Math.round(v.windBed * 100)}%` : ''}`, w - 8, 12, 'right');
};

/** March: the clock's beats, the army closing in over the approach, and the rally tightening it. */
const march: Draw = (g, v) => {
  const { w, h } = g;
  const beat = 60 / v.tempo;
  const span = Math.max(8 * beat, v.approach * 1.15, v.rally * 1.15, 4);
  const x = (s: number) => 6 + (s / span) * (w - 12);
  const base = h - 8, top = 16;
  // beats, every fourth one taller
  const ctx = g.ctx;
  for (let b = 0; b * beat <= span; b++) {
    const strong = b % 4 === 0;
    ctx.fillStyle = g.c(strong ? 0.22 : 0.08);
    ctx.fillRect(Math.round(x(b * beat)), top - 4, 1, base - top + 4);
    ctx.fillStyle = g.c(strong ? 0.8 : 0.4);
    ctx.fillRect(Math.round(x(b * beat)) - (strong ? 1 : 0), strong ? base - 10 : base - 5, strong ? 3 : 1, strong ? 10 : 5);
  }
  // the approach: level as the distance falls from `from`× to 1×
  const pts: [number, number][] = [], rally: [number, number][] = [];
  for (let i = 0; i <= 160; i++) {
    const s = (i / 160) * span;
    const at = v.approach > 0 ? Math.min(1, s / v.approach) : 1;
    const mult = 1 + (v.approachFrom - 1) * (1 - at);
    const lvl = Math.pow(1 / mult, 0.6);
    pts.push([x(s), base - 2 - lvl * (base - top - 4)]);
    const coh = v.rally > 0 ? Math.min(1, 0.15 + (0.85 * s) / v.rally) : 1;
    rally.push([x(s), base - 2 - coh * (base - top - 4)]);
  }
  g.trace(pts, { base, alpha: v.approach > 0 ? 1 : 0.35 });
  if (v.rally > 0) g.trace(rally, { fill: false, dash: [3, 3], alpha: 0.7, width: 1.2 });
  const bits = [`${Math.round(v.tempo)} bpm`];
  if (v.approach > 0) bits.push(`approach ${v.approach.toFixed(0)} s`);
  if (v.rally > 0) bits.push(`rally ${v.rally.toFixed(0)} s`);
  g.text(bits.join(' · '), w - 8, 12, 'right');
};

/** Rolls: one bar of each rolling unit on the march clock; every fourth hit is the strong one (unit.ts). */
const rolls: Draw = (g, v) => {
  const { w, h } = g;
  const lanes = UNIT_PREFIX.map((u, i) => ({ u, i, r: Math.round(v[`${u}Roll`]) })).filter((l) => v[`${l.u}Level`] > 0 && l.r > 0);
  g.grid(16, 1);
  if (!lanes.length) { g.text('no unit is rolling · pick a division below', w / 2, h / 2 + 3, 'center', 0.4); return; }
  const left = 34, lane = (h - 8) / Math.max(3, lanes.length);
  lanes.forEach(({ u, i, r }, k) => {
    const y = 4 + k * lane;
    g.text(ROMAN[i], left - 10, y + lane / 2 + 3, 'right', 0.7);
    const n = Math.round(4 / ROLL_BEATS[r]);
    for (let j = 0; j < n; j++) {
      const strong = j % 4 === 0;
      const hh = (lane - 3) * (strong ? 1 : 1 - v[`${u}Accent`] * 0.6);
      g.bar(left + (j / n) * (w - left - 44), y + (lane - hh) / 2, Math.max(1.5, ((w - left - 44) / n) * 0.45), hh, strong ? 1 : 0.7);
    }
    g.text(ROLLS[r], w - 8, y + lane / 2 + 3, 'right', 0.45);
  });
};

export const VIZ: Record<string, Draw> = { terrain, air, weather, march, rolls };

/** One module's picture: a canvas that redraws itself from the values. */
export class Viz {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private queued = false;

  constructor(private kind: string, private values: ParamValues, tall = false) {
    const el = document.createElement('canvas');
    el.className = tall ? 'viz tall' : 'viz';
    this.el = el;
    this.ctx = el.getContext('2d')!;
    new ResizeObserver(() => this.redraw()).observe(el);
  }

  /** Coalesced to one draw per frame, however many knobs moved. */
  redraw(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.draw(); });
  }

  private draw(): void {
    const r = { width: this.el.clientWidth, height: this.el.clientHeight };   // layout size: the plugin scales the page
    if (r.width === 0) return;                         // hidden tab: drawn when shown
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (this.el.width !== W || this.el.height !== H) { this.el.width = W; this.el.height = H; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, r.width, r.height);
    // the module's accent, resolved: the canvas's CSS colour is var(--accent)
    const rgb = getComputedStyle(this.el).color.match(/\d+(\.\d+)?/g)?.slice(0, 3).join(', ') ?? '255, 122, 26';
    VIZ[this.kind]?.(new Pen(this.ctx, r.width, r.height, rgb), this.values);
  }
}
