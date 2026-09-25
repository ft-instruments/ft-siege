// The whole instrument: MIDI in, stereo audio out. Eight units, each
// with its place on the field; every key goes to every unit whose range
// covers it. The march clock drives the rolls, the approach moves the
// army towards you, the rally tightens it, and the wind blows.
//
//   units → paths (delay · ground · air · proximity · pan) → terrain
//   (echoes · tail) → wind bed → volume → DC block → clip
//
// Shaped like a plugin processor: construct with a sample rate, feed
// noteOn/noteOff/controlChange/pitchBend, call process(L, R, n).

import { Unit, CHUNK } from './unit.ts';
import { Path, Terrain, Wind } from './space.ts';
import { DCBlock, softClip } from './util.ts';
import { defaults, PARAM_BY_ID, UNITS, UNIT_PREFIX, type ParamId, type ParamValues } from './params.ts';

export class SiegeEngine {
  readonly p: ParamValues = defaults();
  readonly units: Unit[] = [];
  private paths: Path[] = [];
  private terrain: Terrain;
  private wind: Wind;
  private dcL: DCBlock; private dcR: DCBlock;
  private mono = new Float32Array(CHUNK);
  private sustain = false;
  private sustained: number[] = [];
  private held: number[] = [];
  private bendNorm = 0;
  private beat = 0;
  private armyT = 0;              // seconds since the army was first heard
  private quiet = 0;              // seconds of silence
  private readonly fs: number;

  /** Peak level of the last block (for meters). */
  peakL = 0; peakR = 0;
  /** Recent output for the seismograph; ring buffers. */
  readonly scopeL = new Float32Array(512);
  readonly scopeR = new Float32Array(512);
  private scopeIdx = 0;
  /**
   * Live state for the display, per unit i: [i*3] level, [i*3+1] hits since last read,
   * [i*3+2] distance /4 (0..200); then [24] wind (0..255), [25] approach progress, [26] beat phase, [27] rally.
   */
  readonly display = new Uint8Array(32);

  constructor(sampleRate: number) {
    this.fs = sampleRate;
    for (let i = 0; i < UNITS; i++) { this.units.push(new Unit(i, sampleRate)); this.paths.push(new Path(sampleRate)); }
    this.terrain = new Terrain(sampleRate);
    this.wind = new Wind(sampleRate);
    this.dcL = new DCBlock(sampleRate); this.dcR = new DCBlock(sampleRate);
  }

  get activeVoices(): number {
    let c = 0;
    for (const u of this.units) if (u.active) c++;
    return c;
  }

  // ---------------------------------------------------------------- params

  setParam(id: ParamId, value: number): void {
    const def = PARAM_BY_ID[id];
    if (!def) return;
    this.p[id] = Math.min(def.max, Math.max(def.min, value));
  }

  setParams(values: Partial<ParamValues>): void {
    for (const id in values) this.setParam(id, values[id]!);
  }

  /** Replace every parameter (preset load). Missing ids go to their default. */
  loadPreset(values: Partial<ParamValues>): void {
    const d = defaults();
    for (const id in d) this.setParam(id, values[id] ?? d[id]);
  }

  // ------------------------------------------------------------------ MIDI

  private get cohesionScale(): number {
    const r = this.p.rally;
    return r > 0 ? Math.min(1, 0.15 + 0.85 * this.armyT / r) : 1;
  }

  noteOn(note: number, velocity: number): void {
    if (velocity <= 0) { this.noteOff(note); return; }
    const sens = this.p.vel;
    const vel = (1 - sens) + sens * Math.min(1, velocity / 127);
    if (!this.held.includes(note)) this.held.push(note);
    const si = this.sustained.indexOf(note); if (si >= 0) this.sustained.splice(si, 1);
    const p = this.p;
    for (let i = 0; i < UNITS; i++) {
      const pre = UNIT_PREFIX[i];
      if (p[`${pre}Level`] <= 0) continue;
      if (note < p[`${pre}KeyLo`] || note > p[`${pre}KeyHi`]) continue;
      this.units[i].noteOn(note, vel, p, this.cohesionScale);
    }
  }

  noteOff(note: number): void {
    const hi = this.held.indexOf(note); if (hi >= 0) this.held.splice(hi, 1);
    if (this.sustain) { if (!this.sustained.includes(note)) this.sustained.push(note); return; }
    for (const u of this.units) u.noteOff(note);
  }

  controlChange(cc: number, value: number): void {
    switch (cc) {
      case 64: {
        const on = value >= 64;
        if (on === this.sustain) break;
        this.sustain = on;
        if (!on) {
          for (const n of this.sustained) for (const u of this.units) u.noteOff(n);
          this.sustained = [];
        }
        break;
      }
      case 120: case 123: this.allNotesOff(); break;
      default: break;
    }
  }

  /** -1..1 */
  pitchBend(v: number): void { this.bendNorm = Math.max(-1, Math.min(1, v)); }

  allNotesOff(): void {
    for (const u of this.units) u.allNotesOff();
    this.sustained = []; this.held = [];
  }

  panic(): void {
    this.allNotesOff();
    for (const u of this.units) u.clear();
    for (const pth of this.paths) pth.clear();
    this.terrain.clear();
  }

  // ---------------------------------------------------------------- audio

  process(L: Float32Array, R: Float32Array, n: number): void {
    const p = this.p, fs = this.fs;
    L.fill(0, 0, n); R.fill(0, 0, n);
    const bendMult = Math.pow(2, this.bendNorm * p.bend / 12);
    const beatsPerSample = p.tempo / 60 / fs;
    const latency = p.latency >= 0.5;
    const units = this.units, paths = this.paths, mono = this.mono;
    for (let off = 0; off < n; off += CHUNK) {
      const count = Math.min(CHUNK, n - off);
      const dt = count / fs;
      // the army clock: approach and rally run from the first key after silence
      let anyActive = this.held.length > 0 || this.sustained.length > 0;
      if (!anyActive) for (const u of units) if (u.active) { anyActive = true; break; }
      if (anyActive) { this.armyT += dt; this.quiet = 0; }
      else { this.quiet += dt; if (this.quiet > 1.5) this.armyT = 0; }
      const approach = p.approach;
      const approachT = approach > 0 ? Math.min(1, this.armyT / approach) : 1;
      const distMult = 1 + (p.approachFrom - 1) * (1 - approachT);
      const cohesionScale = this.cohesionScale;
      const beatPrev = this.beat;
      this.beat += beatsPerSample * count;
      const w = this.wind.tick(count, p.gust) * p.wind;
      // arrival is relative to the nearest unit that is on: the closest answers at once, the rest late
      let nearest = 800;
      for (let i = 0; i < UNITS; i++) if (p[`${UNIT_PREFIX[i]}Level`] > 0) nearest = Math.min(nearest, p[`${UNIT_PREFIX[i]}Dist`] * distMult);
      for (let i = 0; i < UNITS; i++) {
        const pre = UNIT_PREFIX[i];
        const u = units[i];
        if (p[`${pre}Level`] <= 0 && !u.active) continue;
        u.setBend(bendMult);
        u.process(mono, count, p, this.beat, beatPrev, cohesionScale);
        let dist = p[`${pre}Dist`] * distMult; if (dist > 800) dist = 800;
        paths[i].process(mono, count, L, R, off, dist, Math.max(0, dist - nearest), p[`${pre}Az`], latency, p.air, p.ground, p.proximity, w);
      }
      this.wind.bed(L, R, off, count, p.windBed);
    }
    this.terrain.process(L, R, n, p.terrain | 0, p.early, p.tailMix, p.tailDecay, p.tailTone);
    // volume, DC, safety clip, meters, scope
    const vol = p.volume * p.volume * 2.4;
    let pl = 0, pr = 0;
    const sL = this.scopeL, sR = this.scopeR; let si = this.scopeIdx;
    for (let i = 0; i < n; i++) {
      const l = softClip(this.dcL.tick(L[i] * vol));
      const r = softClip(this.dcR.tick(R[i] * vol));
      L[i] = l; R[i] = r;
      const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      if (al > pl) pl = al; if (ar > pr) pr = ar;
      sL[si] = l; sR[si] = r; si = (si + 1) & 511;
    }
    this.scopeIdx = si;
    this.peakL = pl; this.peakR = pr;
    // display
    const d = this.display;
    for (let i = 0; i < UNITS; i++) {
      const u = units[i];
      d[i * 3] = Math.min(255, Math.round(u.level * 900));
      d[i * 3 + 1] = Math.min(255, u.hits); u.hits = 0;
      d[i * 3 + 2] = Math.min(200, Math.round(paths[i].distNow / 4));
    }
    d[24] = Math.round((this.wind.value + 1) * 127.5);
    d[25] = Math.round(Math.min(1, p.approach > 0 ? this.armyT / p.approach : 1) * 255);
    d[26] = Math.round((this.beat % 4) / 4 * 255);
    d[27] = Math.round(this.cohesionScale * 255);
    d[28] = this.activeVoices;
  }
}
