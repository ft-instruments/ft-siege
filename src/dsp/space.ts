// The field. Not a hall: an outdoor acoustic model.
//
//  Path (one per unit) — the way from a unit to the listener:
//    speed-of-sound delay (a drum at 400 m arrives 1.2 s late; when the
//    distance moves, the changing delay *is* the Doppler shift), 1/r
//    level, air absorption (a low-pass whose cutoff falls with distance
//    and humidity, ISO 9613 in spirit), a ground-reflection comb (path
//    difference 2·hs·hl/d, so it collapses to plain reinforcement far
//    away), a pan, and proximity overload for anything within 12 m (the
//    air and the ear do not stay linear next to a taiko).
//
//  Terrain (global) — sparse early reflections that are the landscape
//    (a ridge, valley walls, city walls, forest scattering) and a long,
//    low-density, dark tail: rolling, not diffuse.
//
//  Wind — a slow random signal that modulates the far paths' absorption
//    and level (sound carried and taken by the wind) and an optional bed.

import { readDelay, tanhf, OnePoleLP } from './util.ts';

const C_SOUND = 343;
const MAX_DIST = 800;
const LISTENER_H = 1.7, SOURCE_H = 1.2;

export class Path {
  private buf: Float32Array;
  private widx = 0;
  private delay = 0;               // current delay in samples (smoothed → Doppler)
  private gain = 0; private cut = 20000;
  private silent = 1e9;            // samples since the input was last non-zero
  private airLP: OnePoleLP;
  private thumpLP: OnePoleLP;
  private gbuf = new Float32Array(1024);
  private gidx = 0;
  private readonly fs: number;
  panL = 1; panR = 1;
  /** for the display: current distance in metres */
  distNow = 8;

  constructor(sampleRate: number) {
    this.fs = sampleRate;
    this.buf = new Float32Array(Math.ceil(MAX_DIST / C_SOUND * sampleRate * 1.05) + 64);
    this.airLP = new OnePoleLP(sampleRate, 20000);
    this.thumpLP = new OnePoleLP(sampleRate, 70);
  }

  clear(): void { this.buf.fill(0); this.gbuf.fill(0); this.airLP.z = 0; this.thumpLP.z = 0; }

  /**
   * `input` (mono, `count` samples) is added into L/R at `off`.
   * `dist` metres, `lateBy` metres beyond the nearest unit (the arrival delay), `az` −1..1, `wind` −1..1 (already scaled by the wind amount).
   */
  process(input: Float32Array, count: number, L: Float32Array, R: Float32Array, off: number,
    dist: number, lateBy: number, az: number, latency: boolean, air: number, ground: number, proximity: number, wind: number): void {
    const fs = this.fs, buf = this.buf, len = buf.length;
    this.distNow = dist;
    const far = Math.min(1, dist / 150);
    // targets for this chunk
    const targetDelay = latency ? Math.min(len - 8, lateBy / C_SOUND * fs) : 0;
    const targetGain = Math.pow(6 / Math.max(6, dist), 0.6) * (1 + 0.35 * wind * far);
    let cut = 20000 / (1 + dist / 40 * (0.35 + 0.9 * air)) * (1 + 0.5 * wind * far);
    if (cut < 200) cut = 200; else if (cut > 20000) cut = 20000;
    this.airLP.set(fs, cut);
    // ground comb: the reflected path arrives 2·hs·hl/d later, inverted for soft ground at low frequencies
    const dpath = 2 * SOURCE_H * LISTENER_H / Math.max(1, dist);
    let gDelay = dpath / C_SOUND * fs; if (gDelay < 1) gDelay = 1; else if (gDelay > 1000) gDelay = 1000;
    const gCoef = ground * (dist < 3 ? 0.25 : 0.7) * (0.5 + 0.5 * far);
    // proximity: within 12 m
    const near = dist < 12 ? proximity * (12 - dist) / 12 : 0;
    const drive = 1 + 4 * near, unDrive = 1 / (1 + 1.4 * near);
    const ang = (az + 1) * 0.25 * Math.PI;
    const pL = Math.cos(ang), pR = Math.sin(ang);
    // Doppler-safe glide of the delay: at most ~8 % pitch shift per chunk step — unless the path
    // has been silent, in which case nothing is in flight and the delay can simply jump
    let d = this.delay;
    let silent = this.silent;
    for (let i = 0; i < count; i++) { const a = input[i]; if (a > 1e-6 || a < -1e-6) { silent = 0; break; } }
    if (silent > 0) silent += count;
    if (silent > 0.25 * fs && Math.abs(targetDelay - d) > 1) { d = targetDelay; this.buf.fill(0); }
    this.silent = silent;
    const maxStep = 0.08 * count;
    let dd = targetDelay - d; if (dd > maxStep) dd = maxStep; else if (dd < -maxStep) dd = -maxStep;
    const dStep = dd / count;
    let gain = this.gain; const gStep = (targetGain - gain) / count;
    let widx = this.widx, gidx = this.gidx;
    const gbuf = this.gbuf, air_ = this.airLP, thump = this.thumpLP;
    for (let i = 0; i < count; i++) {
      buf[widx] = input[i];
      d += dStep; gain += gStep;
      let x = d < 1 ? input[i] : readDelay(buf, widx, d);
      if (++widx >= len) widx = 0;
      // ground
      gbuf[gidx] = x;
      x += gCoef * readDelay(gbuf, gidx, gDelay);
      if (++gidx >= 1024) gidx = 0;
      // air
      x = air_.tick(x) * gain;
      // proximity overload + thump
      if (near > 0) x = tanhf(x * drive) * unDrive + thump.tick(x) * near * 1.5;
      L[off + i] += x * pL;
      R[off + i] += x * pR;
    }
    this.widx = widx; this.gidx = gidx; this.delay = d; this.gain = gain; this.cut = cut;
    this.panL = pL; this.panR = pR;
  }

  get cutoff(): number { return this.cut; }
}

// ---------------------------------------------------------------- terrain

interface Tap { ms: number; g: number; bright: number; side: number }
export const TERRAIN_TAPS: Tap[][] = [
  // field: one far ridge, faint, and the ground near you
  [{ ms: 46, g: 0.06, bright: 0.3, side: 1 }, { ms: 390, g: 0.13, bright: 0.18, side: -1 }],
  // valley: walls at a few hundred metres, each darker than the last
  [{ ms: 240, g: 0.4, bright: 0.4, side: -1 }, { ms: 410, g: 0.33, bright: 0.32, side: 1 }, { ms: 620, g: 0.25, bright: 0.25, side: -1 }, { ms: 790, g: 0.2, bright: 0.2, side: 1 }, { ms: 1040, g: 0.13, bright: 0.15, side: -1 }],
  // walls: close, hard, bright
  [{ ms: 17, g: 0.5, bright: 0.75, side: 1 }, { ms: 29, g: 0.45, bright: 0.7, side: -1 }, { ms: 43, g: 0.4, bright: 0.65, side: 1 }, { ms: 61, g: 0.35, bright: 0.6, side: -1 }, { ms: 83, g: 0.3, bright: 0.55, side: 1 }, { ms: 121, g: 0.25, bright: 0.5, side: -1 }, { ms: 172, g: 0.2, bright: 0.45, side: 1 }, { ms: 243, g: 0.15, bright: 0.4, side: -1 }],
  // forest: dense scattering, dark
  Array.from({ length: 12 }, (_, i) => ({ ms: 11 + i * i * 1.1 + i * 6, g: 0.34 - i * 0.022, bright: 0.28 - i * 0.01, side: i & 1 ? 1 : -1 })),
];
export const TERRAIN_TAIL_SCALE = [1.7, 2.3, 0.85, 1.05];
export const TAIL_BASE = [0.071, 0.097, 0.127, 0.149, 0.173, 0.199, 0.227, 0.251];   // seconds
const N = 8;
const MAX_TAPS = 12;

export class Terrain {
  private ebuf: Float32Array;
  private eidx = 0;
  private tapLP = new Float32Array(MAX_TAPS);
  private tapDelay = new Int32Array(MAX_TAPS);
  private lines: Float32Array[] = [];
  private idx = new Int32Array(N);
  private lengths = new Float64Array(N);
  private gains = new Float32Array(N);
  private lp = new Float32Array(N);
  private hp = new Float32Array(N);
  private tmp = new Float32Array(N);
  private readonly fs: number;
  private curTerrain = -1; private curDecay = -1;

  constructor(sampleRate: number) {
    this.fs = sampleRate;
    this.ebuf = new Float32Array(Math.ceil(1.2 * sampleRate) + 8);
    for (let i = 0; i < N; i++) this.lines.push(new Float32Array(Math.ceil(TAIL_BASE[i] * 2.4 * sampleRate) + 8));
    this.setup(0, 2.5);
  }

  clear(): void {
    this.ebuf.fill(0); this.tapLP.fill(0);
    for (const l of this.lines) l.fill(0);
    this.lp.fill(0); this.hp.fill(0);
  }

  private setup(terrain: number, decay: number): void {
    if (terrain === this.curTerrain && decay === this.curDecay) return;
    this.curTerrain = terrain; this.curDecay = decay;
    const taps = TERRAIN_TAPS[terrain];
    for (let t = 0; t < taps.length; t++) this.tapDelay[t] = Math.round(taps[t].ms * 1e-3 * this.fs);
    const scale = TERRAIN_TAIL_SCALE[terrain];
    for (let i = 0; i < N; i++) {
      this.lengths[i] = Math.min(this.lines[i].length - 4, TAIL_BASE[i] * scale * this.fs);
      this.gains[i] = Math.pow(10, (-3 * this.lengths[i]) / (decay * this.fs));
    }
  }

  process(L: Float32Array, R: Float32Array, n: number, terrain: number, early: number, tailMix: number, decay: number, tone: number): void {
    this.setup(terrain, decay);
    const fs = this.fs;
    const taps = TERRAIN_TAPS[terrain], nt = taps.length;
    const ebuf = this.ebuf, elen = ebuf.length, tapLP = this.tapLP, tapDelay = this.tapDelay;
    const lines = this.lines, idx = this.idx, lengths = this.lengths, gains = this.gains, lp = this.lp, hp = this.hp, tmp = this.tmp;
    const lpA = 1 - Math.exp(-2 * Math.PI * (350 + tone * 5000) / fs);
    const hpA = 1 - Math.exp(-2 * Math.PI * 45 / fs);
    const twoOverN = 2 / N;
    const wet = tailMix * 0.8;
    let eidx = this.eidx;
    for (let i = 0; i < n; i++) {
      const xl = L[i], xr = R[i];
      const mono = (xl + xr) * 0.5;
      ebuf[eidx] = mono;
      // early reflections: the landscape
      let eL = 0, eR = 0, eSum = 0;
      if (early > 0) {
        for (let t = 0; t < nt; t++) {
          const tp = taps[t];
          let r = eidx - tapDelay[t]; if (r < 0) r += elen;
          const v = ebuf[r];
          // per-tap darkening (one pole; coefficient from brightness)
          tapLP[t] += (v - tapLP[t]) * (0.08 + tp.bright * 0.6);
          const y = tapLP[t] * tp.g * early;
          eSum += y;
          if (tp.side > 0) { eL += y * 0.8; eR += y * 0.35; } else { eL += y * 0.35; eR += y * 0.8; }
        }
      }
      if (++eidx >= elen) eidx = 0;
      // the tail: fed by the sound plus its reflections
      let outL = 0, outR = 0;
      if (wet > 0) {
        const x = mono * 0.6 + eSum * 0.5;
        let sum = 0;
        for (let j = 0; j < N; j++) {
          const v = readDelay(lines[j], idx[j], lengths[j]);
          tmp[j] = v; sum += v;
          if (j & 1) outR += (j & 2) ? v : -v; else outL += (j & 2) ? v : -v;
        }
        const s = sum * twoOverN;
        for (let j = 0; j < N; j++) {
          let v = (tmp[j] - s) * gains[j] + ((j & 1) ? -x : x);
          lp[j] += (v - lp[j]) * lpA;
          hp[j] += (lp[j] - hp[j]) * hpA;
          v = lp[j] - hp[j];
          const line = lines[j];
          line[idx[j]] = v;
          if (++idx[j] >= line.length) idx[j] = 0;
        }
      }
      L[i] = xl + eL + outL * wet;
      R[i] = xr + eR + outR * wet;
    }
    this.eidx = eidx;
  }
}

// ---------------------------------------------------------------- wind

export class Wind {
  private s1 = 0; private s2 = 0;
  private seed = 0x2545f491;
  private bedLP: OnePoleLP; private bedHP: OnePoleLP;
  /** −1..1, slow */
  value = 0;
  private readonly fs: number;
  constructor(sampleRate: number) {
    this.fs = sampleRate;
    this.bedLP = new OnePoleLP(sampleRate, 500);
    this.bedHP = new OnePoleLP(sampleRate, 120);
  }
  private noise(): number {
    let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x | 0;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  }
  /** Advance one chunk of `count` samples; the gust rate in Hz. */
  tick(count: number, gustHz: number): number {
    // two cascaded one-poles at the gust rate, run once per chunk
    const a = 1 - Math.exp(-2 * Math.PI * gustHz * count / this.fs);
    this.s1 += (this.noise() * 6 - this.s1) * a;
    this.s2 += (this.s1 - this.s2) * a;
    let v = this.s2; if (v > 1) v = 1; else if (v < -1) v = -1;
    this.value = v;
    return v;
  }
  /** The audible bed: filtered noise breathing with the gusts, added into L/R. */
  bed(L: Float32Array, R: Float32Array, off: number, count: number, level: number): void {
    if (level <= 0) return;
    const w = this.value;
    this.bedLP.set(this.fs, 300 + 500 * (w + 1));
    const g = level * 0.05 * (0.55 + 0.45 * w);
    for (let i = off; i < off + count; i++) {
      const n = this.noise();
      const x = this.bedLP.tick(n) - this.bedHP.tick(n) * 0.9;
      L[i] += x * g; R[i] += x * g * 0.9 + this.noise() * g * 0.15;
    }
  }
}
