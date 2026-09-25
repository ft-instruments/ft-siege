// Driven tubes. A waveguide bore (one delay line for the round trip, a
// bell that reflects the lows and radiates the highs) driven by either a
// lip valve — a second-order resonator whose squared, clipped output is
// the lip opening (the Cook / STK "swinging door") — or a single reed (a
// pressure-controlled valve, clarinet-style). The lip's own frequency is
// set independently of the bore, which is what gives what samples cannot:
// the rip into a note from below, notes that crack between partials, and
// growl when breath is unsteady.
//
// A horn unit plays its `partial` of the tube: for a note at f the tube
// is f/partial long and the lips buzz at f. With `natural` on, the tube is
// a fixed length (the root) and the lips are asked for the note as it is:
// on the harmonic series it speaks, off it fights the bore and cracks.

import { Rng, OnePoleLP } from './util.ts';

const MAX_RT = 8192;          // longest round trip in samples (5.9 Hz at 48 k) — bigger than any note needs
// The lip valve constants: displacement → opening gain, rest opening, flow → pressure coupling, lip Q.
// Found by sweeping (scripts/render.ts horn): these make the bore win over the lips and the note lock.
const LIP_K = 2, LIP_REST = 0.3, LIP_Z = 0.4, LIP_Q = 4;
// An outward-striking valve plays sharp of the bore's resonance, more so on low partials; the tube
// is cut long to compensate (measured at the nominal lip tension).
const sharpCents = (partial: number, lipHz: number) => 100 / Math.pow(partial, 0.6) * Math.min(2, Math.max(0.4, Math.pow(130 / lipHz, 0.45)));
const nominalLip = (k: number) => 1 - 0.15 / Math.sqrt(k);
// the jet crosses the mouth in about half a period for the fundamental; `breathy` lengthens it a little
const JET_RATIO = (c: number) => 0.53 + 0.06 * c;
// the jet plays sharp, more so low down; the pipe is cut long to compensate (measured)
const fluteSharpCents = (f: number) => 15 + 45 * Math.sqrt(130 / f);

export interface HornParams {
  pipe: boolean;         // reed instead of lips
  flute: boolean;        // an air jet instead of a valve (bone flute)
  partial: number;
  natural: boolean;
  rootFreq: number;
  lip: number;           // lip tension multiplier (0.5..2)
  breath: number;        // attack seconds
  growl: number;
  damp: number;          // bore loss
  char: number;          // rip (horn) / reed stiffness (pipe)
  size: number;          // bell size, metres-ish
  vel: number;
}

export class HornVoice {
  active = false;
  released = false;
  note = -1;
  age = 0;
  private bore = new Float32Array(MAX_RT);
  private widx = 0;
  private rt = 100;             // round-trip length in samples (fractional)
  private rtTarget = 100;
  private lipY1 = 0; private lipY2 = 0; private lipDC = 0;
  private lipCos = 0; private lipR = 0.997; private lipG = 0.03;
  private lipFreq = 220; private lipTarget = 220; private lipStart = 220;
  private ripT = 1;             // 0..1 progress of the rip glide
  private ripRate = 0;
  private breath = 0;           // smoothed pressure
  private breathTarget = 0;
  private breathA = 0.001; private releaseA = 0.001;
  private bellLP: OnePoleLP; private radHP: OnePoleLP;
  private growlLP: OnePoleLP;
  private dcX = 0; private dcY = 0;
  private rng: Rng;
  private readonly fs: number;
  private reflect = 0.9;
  private pipe = false;
  private flute = false;
  private jet = new Float32Array(MAX_RT);   // the jet's own delay (flute)
  private jetIdx = 0;
  private jetLen = 40;
  private reedStiff = 0.3;
  private partialK = 1;
  private lipK = LIP_K; private lipRest = LIP_REST;
  private noteFreq = 220;
  private detune = 1;
  private onsetDelay = 0;       // samples to wait before the breath starts (crowd spread)
  level = 0;
  /** per-instance output gain (crowd normalisation) */
  gain = 1;

  constructor(sampleRate: number, seed: number) {
    this.fs = sampleRate;
    this.rng = new Rng(seed * 2654435761 + 1);
    this.bellLP = new OnePoleLP(sampleRate, 1200);
    this.radHP = new OnePoleLP(sampleRate, 300);
    this.growlLP = new OnePoleLP(sampleRate, 120);
  }

  clear(): void {
    this.bore.fill(0); this.lipY1 = this.lipY2 = this.lipDC = 0; this.breath = 0; this.dcX = this.dcY = 0;
    this.bellLP.z = 0; this.radHP.z = 0; this.growlLP.z = 0; this.level = 0;
  }

  private setLip(freq: number, loose: number): void {
    const th = 2 * Math.PI * Math.min(0.45 * this.fs, freq) / this.fs;
    this.lipCos = Math.cos(th);
    // Q of the lips ~ 4, tighter for high partials (the embouchure firms up), wider when loose;
    // a reed is stiffer still. r from the bandwidth f/Q.
    const q = (this.pipe ? 10 + 8 * this.reedStiff : LIP_Q * (1 + 0.3 * (this.partialK - 1))) * (1 - 0.4 * loose);
    this.lipR = Math.exp(-Math.PI * freq / (q * this.fs));
    // displacement resonator with unit gain at DC: blowing harder holds the lips further open
    this.lipG = 1 - 2 * this.lipR * this.lipCos + this.lipR * this.lipR;
  }

  /** `freq` is the note's frequency; `detune` the crowd's per-instance deviation; `onsetMs` its delay. */
  noteOn(note: number, freq: number, p: HornParams, detune: number, onsetMs: number): void {
    const fs = this.fs;
    this.active = true; this.released = false; this.note = note; this.age = 0;
    this.pipe = p.pipe; this.flute = p.flute;
    this.detune = detune;
    this.noteFreq = freq * detune;
    this.onsetDelay = Math.round(onsetMs * 1e-3 * fs);
    this.retune(p);
    // the rip: the lips start below the target and glide up over the breath attack
    const rip = p.pipe || p.flute ? 0 : p.char;
    this.lipStart = this.lipTarget * (1 - 0.3 * rip);
    this.ripT = rip > 0 ? 0 : 1;
    this.ripRate = 1 / Math.max(1, p.breath * fs * (0.6 + 0.8 * rip));
    this.lipFreq = this.lipStart;
    this.breathTarget = 0.6 + 0.6 * p.vel;
    // a tongued attack: the pressure jumps to a third of its target, then the breath swells
    if (this.breath < this.breathTarget * 0.35) this.breath = this.breathTarget * 0.35;
    this.breathA = 1 - Math.exp(-1 / Math.max(1, p.breath * fs));
    this.releaseA = 1 - Math.exp(-1 / (0.06 * fs));
    this.reflect = 0.97 - 0.2 * p.damp;
    this.reedStiff = p.char;
    // a reed is a stiffer, buzzier valve than lips
    this.lipK = p.pipe ? LIP_K * (1.5 + 1.5 * p.char) : LIP_K;
    this.lipRest = p.pipe ? LIP_REST * 0.6 : LIP_REST;
    // bell: bigger horns radiate lower; the reflection keeps what the bell cannot radiate. A pipe has no bell: bright, nasal.
    this.bellLP.set(fs, p.pipe ? 2500 + 3000 / (0.5 + p.size) : p.flute ? 1800 + 2500 / (0.5 + p.size) : 350 + 2200 / (0.5 + p.size));
    this.radHP.set(fs, p.pipe ? 200 + 300 / (0.5 + p.size) : 80 + 200 / (0.5 + p.size));
    if (p.flute) { this.reflect = 0.93 - 0.15 * p.damp; this.jet.fill(0); }
    // fresh lips; if the bore is quiet, seed it with a standing wave at the note's period so the
    // horn speaks at once instead of growing its oscillation from nothing over a few round trips
    this.lipY1 = this.lipY2 = 0;
    if (this.level < 1e-3) {
      const rt = this.rtTarget, n = Math.min(MAX_RT, Math.ceil(rt * 4));
      const w = Math.max(4, rt * 0.3);
      for (let i = 0; i < n; i++) {
        const ph = i % rt;
        this.bore[(this.widx - 1 - i + MAX_RT * 2) % MAX_RT] = ph < w ? 0.3 * (0.5 - 0.5 * Math.cos(6.283185307 * ph / w)) : 0;
      }
    }
  }

  /** Re-derive tube length and lip frequency from the note and the horn parameters (bend, param changes). */
  retune(p: HornParams, bendMult = 1): void {
    const f = this.noteFreq * bendMult;
    let tubeF: number, lipF: number;
    if (p.natural) {
      tubeF = p.rootFreq * this.detune;
      const k = Math.max(1, Math.round(f / tubeF));
      // ask the lips for the note as played; on the series it lands, off it cracks
      lipF = f;
      if (Math.abs(f / (k * tubeF) - 1) < 0.03) lipF = k * tubeF;
    } else {
      tubeF = f / Math.max(1, p.partial);
      lipF = f;
    }
    const k = p.natural ? Math.max(1, Math.round(f / tubeF)) : Math.max(1, p.partial);
    this.partialK = k;
    this.lipTarget = lipF * p.lip * nominalLip(k);
    if (this.flute) {
      // an open pipe: one period round trip; the jet's travel across the mouth is a fraction of it, and
      // that fraction (with the breath) is what picks the register
      this.rtTarget = Math.min(MAX_RT - 4, this.fs / tubeF * Math.pow(2, fluteSharpCents(f) / 1200) - 2);
      this.jetLen = Math.max(2, this.rtTarget * JET_RATIO(p.char) / Math.max(1, k));
    } else this.rtTarget = Math.min(MAX_RT - 4, this.fs / tubeF * Math.pow(2, sharpCents(k, this.lipTarget) / 1200) - 3);
    if (this.age === 0) this.rt = this.rtTarget;
    this.setLip(this.ripT >= 1 ? this.lipTarget : this.lipFreq, p.growl);
  }

  noteOff(): void { this.released = true; }
  kill(): void { this.active = false; this.released = false; this.clear(); }

  process(out: Float32Array, off: number, count: number, growl: number): void {
    if (!this.active) return;
    const bore = this.bore;
    let widx = this.widx, rt = this.rt;
    const rtTarget = this.rtTarget;
    let breath = this.breath;
    const target = this.released ? 0 : this.breathTarget;
    const bA = this.released ? this.releaseA : this.breathA;
    let lipY1 = this.lipY1, lipY2 = this.lipY2, lipDC = this.lipDC;
    let lipFreq = this.lipFreq, ripT = this.ripT;
    const reflect = this.reflect, lipK = this.lipK, lipRest = this.lipRest;
    const flute = this.flute, jet = this.jet, jetLen = this.jetLen; let jetIdx = this.jetIdx;
    const bell = this.bellLP, rad = this.radHP, gl = this.growlLP, rng = this.rng;
    let dcX = this.dcX, dcY = this.dcY;
    let lvl = this.level;
    let onset = this.onsetDelay;
    for (let i = off; i < off + count; i++) {
      if (onset > 0) { onset--; continue; }
      // breath: smoothed, with growl (low-passed noise on the pressure)
      breath += (target - breath) * bA;
      const g = gl.tick(rng.bi());
      const mouth = breath * (1 + growl * g * 2.5);
      // the rip glide of the lip frequency
      if (ripT < 1) {
        ripT += this.ripRate; if (ripT > 1) ripT = 1;
        const s = ripT * ripT * (3 - 2 * ripT);
        lipFreq = this.lipStart + (this.lipTarget - this.lipStart) * s;
        if ((i & 15) === 0) this.setLip(lipFreq, growl);
      }
      // the bore: read the round trip (linear interpolation), reflect off the bell
      rt += (rtTarget - rt) * 0.002;
      let r = widx - rt; if (r < 0) r += MAX_RT;
      const i0 = r | 0, frac = r - i0;
      let i1 = i0 + 1; if (i1 >= MAX_RT) i1 -= MAX_RT;
      const boreOut = bore[i0] + (bore[i1] - bore[i0]) * frac;
      const low = bell.tick(boreOut);
      const borePressure = low * reflect;
      let inject: number;
      if (flute) {
        // the air jet (Cook / STK flute): the jet crosses the mouth with a delay, is bent by the bore's
        // pressure, and its sigmoid (x − x³) is what drives the pipe; the breath carries turbulence
        const jetIn = mouth * 0.25 * (1 + growl * 0.4 + 0.15 * rng.bi()) - borePressure * 0.5;
        const jd = jet[jetIdx]; jet[jetIdx] = jetIn; if (++jetIdx >= jetLen) jetIdx = 0;
        let jx = jd; if (jx > 1) jx = 1; else if (jx < -1) jx = -1;
        // no breath, no jet: the sigmoid's drive scales with the air actually blowing across the mouth
        const air = breath * 2 > 1 ? 1 : breath * 2;
        inject = (jx - jx * jx * jx) * 0.9 * air + borePressure;
      } else {
        // lip valve (outward-striking): the acoustic pressure difference drives a resonator; its displacement
        // plus the rest opening is the aperture, closed at 0; Bernoulli flow through it drives the bore
        const x = mouth - borePressure;
        lipDC += (x - lipDC) * 0.001;
        const y = this.lipG * (x - lipDC) + 2 * this.lipR * this.lipCos * lipY1 - this.lipR * this.lipR * lipY2;
        lipY2 = lipY1; lipY1 = y;
        let open = lipRest * (0.3 + 0.7 * breath) + y * lipK;
        if (open < 0) open = 0; else if (open > 1) open = 1;
        const flow = open * (x < 0 ? -Math.sqrt(-x) : Math.sqrt(x));
        inject = borePressure + flow * LIP_Z;
      }
      // DC block, write into the bore
      const dcOut = inject - dcX + 0.995 * dcY; dcX = inject; dcY = dcOut;
      bore[widx] = dcOut;
      if (++widx >= MAX_RT) widx = 0;
      // what leaves the bell: the highs the bell could not reflect, plus a little of the lows
      const o = ((boreOut - rad.tick(boreOut)) * 0.9 + low * 0.25) * this.gain;
      out[i] += o;
      const ay = o < 0 ? -o : o;
      lvl += (ay - lvl) * 0.001;
    }
    this.onsetDelay = onset; this.jetIdx = jetIdx;
    this.widx = widx; this.rt = rt; this.breath = breath;
    this.lipY1 = lipY1; this.lipY2 = lipY2; this.lipDC = lipDC; this.lipFreq = lipFreq; this.ripT = ripT;
    this.dcX = dcX; this.dcY = dcY; this.level = lvl;
    this.age += count;
    if (this.released && breath < 1e-4 && lvl < 1e-5) { this.active = false; this.clear(); }
  }
}
