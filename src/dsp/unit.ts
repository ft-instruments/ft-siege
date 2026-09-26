// One unit of the army: a body (four modal banks — crowd variants, or
// voices when the body tracks the keys) or a horn (four voices of up to
// four instances), the exciters that strike, scrape or blast it, and the
// crowd scheduler that turns one key into two hundred hits.
//
// Crowds are honest physics on the cheap: a modal bank is linear, so a
// hundred strikes on a hundred similar drums is a hundred pulses into a
// few slightly different banks. The scheduler spreads them in time by
// `spread` and `cohesion`, varies their strength and position by
// `variation`, and the bank sums them for free.

import { ModalBank, newDesign, designBody, type Design, naturalF0, BODY_CONTACT, BODY_GAIN } from './modal.ts';
import { HornVoice, type HornParams } from './horn.ts';
import { Rng, midiToFreq } from './util.ts';
import { BODIES, BODY_GONG, BODY_BELL, BODY_SHIELD, BODY_ANVIL, BODY_BLADE, BODY_BOWED, BODY_FEET, BODY_HOOVES, BODY_CANNON, BODY_PIPE, BODY_FLUTE, TUBES, ROLL_BEATS, UNIT_PREFIX, type ParamValues } from './params.ts';

export const CHUNK = 32;
const BANKS = 4;
const HORN_VOICES = 4, HORN_INST = 4;
const MAX_PENDING = 1024;
const MAX_EVENTS = 256;         // hits scheduled per strike; a bigger crowd is merged into fewer, stronger events
const MAX_ACTIVE = 64;
const SHAPE_HANN = 0, SHAPE_NWAVE = 1;
const MAX_BLASTS = 8;

/**
 * How much of the velocity's loudness range each body takes. Gongs, bells and bronze
 * bloom harder the harder they are hit (modal.ts), which already widens their range, so
 * they take less of it; everything else takes it all.
 */
const VEL_CURVE = BODIES.map((_, b) => (b === BODY_GONG ? 0.15 : b === BODY_BELL ? 0.6 : b === BODY_SHIELD || b === BODY_ANVIL ? 0.85 : 1));

export class Unit {
  readonly idx: number;
  readonly pre: string;
  body = -1;
  private banks: ModalBank[] = [];
  private designs: Design[] = [];
  private bankNote = new Float64Array(BANKS).fill(-1);   // tracking: which note each bank is tuned to
  private bankAge = new Float64Array(BANKS);
  private horns: HornVoice[] = [];
  private hornNote = new Float64Array(HORN_VOICES).fill(-1);
  private hornAge = new Float64Array(HORN_VOICES);
  // pending hits (a small ring): when, amplitude, position, bank, pulse length, shape, noise
  private pT = new Float64Array(MAX_PENDING);
  private pA = new Float32Array(MAX_PENDING);
  private pP = new Float32Array(MAX_PENDING);
  private pB = new Uint8Array(MAX_PENDING);
  private pL = new Float32Array(MAX_PENDING);
  private pS = new Uint8Array(MAX_PENDING);
  private pN = new Float32Array(MAX_PENDING);
  private pending = 0;
  // active hits
  private hPhase = new Float64Array(MAX_ACTIVE);
  private hLen = new Float32Array(MAX_ACTIVE);
  private hAmp = new Float32Array(MAX_ACTIVE);
  private hPos = new Float32Array(MAX_ACTIVE);
  private hBank = new Uint8Array(MAX_ACTIVE);
  private hShape = new Uint8Array(MAX_ACTIVE);
  private hNoise = new Float32Array(MAX_ACTIVE);
  private hOn = new Uint8Array(MAX_ACTIVE);
  private A: Float32Array[] = [];
  private B: Float32Array[] = [];
  private held: number[] = [];
  private heldVel: number[] = [];
  private heldTouch: number[] = [];
  // blasts (cannon): the crack, the whump and the sub boom are synthesised directly, not through modes
  private bT = new Float64Array(MAX_BLASTS);       // samples since the blast (negative: pending)
  private bAmp = new Float32Array(MAX_BLASTS);
  private bCharge = new Float32Array(MAX_BLASTS);
  private bOn = new Uint8Array(MAX_BLASTS);
  private bLP = new Float32Array(MAX_BLASTS);      // whump low-pass state
  private bLP2 = new Float32Array(MAX_BLASTS);
  private bPh = new Float32Array(MAX_BLASTS);      // sub boom phase
  private scrapeTimer = 0;
  private scrapeAmp = 0;
  private rng: Rng;
  private readonly fs: number;
  private last = new Float64Array(8).fill(NaN);          // design cache key
  private hp: HornParams = { pipe: false, flute: false, partial: 2, natural: false, rootFreq: 110, lip: 1, breath: 0.08, growl: 0, damp: 0.3, char: 0.5, size: 1, vel: 0.7 };
  private bendMult = 1;
  private rollCount = 0;
  /** meters for the display */
  level = 0;
  hits = 0;              // hits fired since the last read
  crowdPending = 0;

  constructor(idx: number, sampleRate: number) {
    this.idx = idx;
    this.pre = UNIT_PREFIX[idx];
    this.fs = sampleRate;
    this.rng = new Rng(0x1234567 + idx * 7919);
    for (let b = 0; b < BANKS; b++) {
      this.banks.push(new ModalBank(sampleRate));
      this.designs.push(newDesign());
      this.A.push(new Float32Array(CHUNK));
      this.B.push(new Float32Array(CHUNK));
    }
    for (let v = 0; v < HORN_VOICES * HORN_INST; v++) this.horns.push(new HornVoice(sampleRate, idx * 64 + v + 1));
  }

  get isHorn(): boolean { return TUBES.includes(this.body); }
  get active(): boolean {
    if (this.pending > 0 || this.held.length > 0) return true;
    for (let i = 0; i < MAX_ACTIVE; i++) if (this.hOn[i]) return true;
    for (const b of this.banks) if (b.level > 1e-5) return true;
    for (const h of this.horns) if (h.active) return true;
    return false;
  }

  clear(): void {
    for (const b of this.banks) b.clear();
    for (const h of this.horns) h.kill();
    this.hOn.fill(0); this.pending = 0; this.held = []; this.heldVel = []; this.heldTouch = []; this.level = 0; this.bOn.fill(0);
  }

  // ------------------------------------------------------------ design

  private p(p: ParamValues, name: string): number { return p[`${this.pre}${name}`]; }

  /** Re-design the banks when the body-defining parameters change. Cheap: only cos/exp per mode. */
  private refreshDesign(p: ParamValues): void {
    const body = this.p(p, 'Body') | 0;
    const key = [body, this.p(p, 'Size'), this.p(p, 'Tension'), this.p(p, 'Damp'), this.p(p, 'Char'), this.p(p, 'Bend'), this.p(p, 'Vary'), this.p(p, 'Root')];
    let same = true;
    for (let i = 0; i < 8; i++) if (key[i] !== this.last[i]) { same = false; this.last[i] = key[i]; }
    if (same) return;
    if (body !== this.body) {
      this.body = body;
      for (const b of this.banks) b.clear();
      for (const h of this.horns) h.kill();
      this.bankNote.fill(-1); this.hornNote.fill(-1);
      this.hOn.fill(0); this.pending = 0;
    }
    if (this.isHorn) return;
    const track = this.p(p, 'Track') >= 0.5;
    for (let b = 0; b < BANKS; b++) {
      if (track) {
        if (this.bankNote[b] >= 0) this.designBank(p, b, this.bankNote[b]);
      } else this.designBank(p, b, -1);
    }
  }

  private designBank(p: ParamValues, b: number, note: number): void {
    const body = this.body;
    const size = this.p(p, 'Size'), tension = this.p(p, 'Tension'), vary = this.p(p, 'Vary');
    // crowd variants: each bank is a slightly different instrument — but a body that tracks the
    // keys uses its banks as voices, and a voice must be in tune (a few cents of spread at most)
    const spread = b === 0 ? 0 : ((b * 0.37 + 0.11) % 1 - 0.5) * 2;
    const dev = 1 + vary * (note >= 0 ? 0.006 : 0.16) * spread;
    const f0 = note >= 0 ? midiToFreq(note) * dev : naturalF0(body, size * dev, tension);
    designBody(this.designs[b], body, f0, size * dev, tension, this.p(p, 'Damp'), this.p(p, 'Char'), this.p(p, 'Bend'), this.idx * 4 + b);
    this.banks[b].load(this.designs[b]);
  }

  private refreshHorn(p: ParamValues): void {
    const h = this.hp;
    h.pipe = this.body === BODY_PIPE; h.flute = this.body === BODY_FLUTE;
    h.partial = this.p(p, 'Partial') | 0;
    h.natural = this.p(p, 'Snap') >= 0.5;
    h.rootFreq = midiToFreq(this.p(p, 'Root'));
    h.lip = this.p(p, 'Lip'); h.breath = this.p(p, 'Breath'); h.growl = this.p(p, 'Growl');
    h.damp = this.p(p, 'Damp'); h.char = this.p(p, 'Char'); h.size = this.p(p, 'Size');
  }

  // ------------------------------------------------------------ playing

  /** A key in this unit's range went down. `cohesionScale` (0..1) comes from the rally: the crowd tightens over time. */
  noteOn(note: number, vel: number, touch: number, p: ParamValues, cohesionScale: number): void {
    this.refreshDesign(p);
    const i = this.held.indexOf(note);
    if (i >= 0) { this.held.splice(i, 1); this.heldVel.splice(i, 1); this.heldTouch.splice(i, 1); }
    this.held.push(note); this.heldVel.push(vel); this.heldTouch.push(touch);
    this.rollCount = 0;
    this.strike(note, vel, touch, p, cohesionScale);
  }

  noteOff(note: number): void {
    const i = this.held.indexOf(note);
    if (i >= 0) { this.held.splice(i, 1); this.heldVel.splice(i, 1); this.heldTouch.splice(i, 1); }
    if (this.isHorn) for (const h of this.horns) if (h.active && !h.released && h.note === note) h.noteOff();
  }

  allNotesOff(): void {
    for (const n of this.held.slice()) this.noteOff(n);
  }

  setBend(mult: number): void {
    if (mult === this.bendMult) return;
    this.bendMult = mult;
    if (this.isHorn) for (const h of this.horns) if (h.active) h.retune(this.hp, mult);
  }

  /**
   * Fire the unit for a note: the whole crowd. `vel` is the loudness (linear gain), `touch`
   * (0..1, 1 = full force) how hard it was played: struck bodies get a harder, brighter
   * strike, horns more breath.
   */
  private strike(note: number, vel: number, touch: number, p: ParamValues, cohesionScale: number): void {
    const count = Math.max(1, Math.round(this.p(p, 'Count')));
    const spread = this.p(p, 'Spread');
    const cohesion = Math.min(1, this.p(p, 'Cohesion') * cohesionScale);
    const vary = this.p(p, 'Vary');
    this.hits++;
    if (this.isHorn) {
      this.refreshHorn(p);
      const freq = midiToFreq(note);
      const inst = Math.min(HORN_INST, count);
      const v = this.allocHorn(note);
      this.hp.vel = touch;
      for (let k = 0; k < inst; k++) {
        const h = this.horns[v * HORN_INST + k];
        const detune = k === 0 ? 1 : 1 + vary * 0.025 * this.rng.bi();
        const onset = k === 0 ? 0 : spread * (1 - cohesion) * this.rng.next();
        h.gain = (0.6 + 0.4 / Math.sqrt(inst)) / Math.sqrt(inst) * vel;
        h.noteOn(note, freq, this.hp, detune, onset);
        h.retune(this.hp, this.bendMult);
      }
      return;
    }
    const body = this.body;
    const track = this.p(p, 'Track') >= 0.5;
    // a harder hit is a harder strike: shorter contact, so more of the high modes; and grittier
    const hard = Math.max(0, Math.min(1, this.p(p, 'Hard') + (touch - 0.8) * 0.75));
    const grit = Math.min(1, this.p(p, 'Grit') * (0.45 + 0.7 * touch));
    const pos = this.p(p, 'Pos'), char = this.p(p, 'Char');
    // which banks: tracking → one bank tuned to the note; else all variants
    let bank0 = 0, nb = BANKS;
    if (track) { bank0 = this.allocBank(note, p); nb = 1; }
    const events = Math.min(MAX_PENDING - this.pending, MAX_EVENTS, count);
    if (events <= 0) return;
    const per = Math.sqrt(count / events);                       // merged hits are incoherent: amplitude grows as √n
    // loudness of a crowd: incoherent hits sum as √N (so N^-½ keeps one drum's loudness), plus a
    // bonus for the mass of it; but hits that land within ~30 ms of each other add up coherently,
    // so the amplitude is capped by the expected overlap
    const spreadMs = spread * (1 - cohesion);
    const overlap = count * Math.min(1, 15 / (spreadMs + 1));
    const ampAll = Math.min(Math.pow(count, -0.5) * (1 + 0.9 * Math.log10(count)), 8 / overlap) * per;
    // pulse length from hardness (touch included): 12 ms soft → 0.35 ms hard
    let lenMs = (0.35 + 11.5 * (1 - hard) * (1 - hard)) * BODY_CONTACT[body];
    let shape = SHAPE_HANN;
    if (body === BODY_CANNON) { shape = SHAPE_NWAVE; lenMs = 2 + 14 * char; }
    for (let i = 0; i < events; i++) {
      const u = i === 0 ? 0 : this.rng.next();
      const t = spreadMs * u + (i === 0 ? 0 : this.rng.next() * 2);
      const a = Math.pow(vel, VEL_CURVE[body]) * ampAll * (1 + vary * 0.8 * this.rng.bi()) * (body === BODY_CANNON ? 0.4 + 0.8 * char : 1);
      const ps = Math.max(0, Math.min(1, pos + vary * 0.4 * this.rng.bi()));
      const b = bank0 + (nb > 1 ? i % nb : 0);
      this.push(t, a, shape === SHAPE_NWAVE ? 0 : ps, b, lenMs * (1 + vary * 0.3 * this.rng.bi()), shape, grit);
      // gait: the second footfall / the far hoof
      if (body === BODY_FEET) this.push(t + 30 + 90 * char, a * 0.55, Math.min(1, ps + 0.3), b, lenMs * 0.7, shape, grit * 1.3);
      else if (body === BODY_HOOVES) { this.push(t + 18 + 55 * char, a * 0.75, ps, b, lenMs * 0.8, shape, grit); this.push(t + 40 + 130 * char, a * 0.5, ps, b, lenMs, shape, grit); }
      // cannon: the blast itself, then debris on the debris modes
      else if (body === BODY_CANNON) {
        for (let k = 0; k < MAX_BLASTS; k++) if (!this.bOn[k]) {
          this.bOn[k] = 1; this.bT[k] = -t * 1e-3 * this.fs; this.bAmp[k] = a * 3; this.bCharge[k] = char; this.bLP[k] = 0; this.bLP2[k] = 0; this.bPh[k] = 0; break;
        }
        for (let k = 0; k < 10; k++) this.push(t + 120 + this.rng.next() * (400 + 1200 * char), a * (0.04 + 0.1 * this.rng.next()), 1, b, 0.3 + this.rng.next() * 1.5, SHAPE_HANN, 0.8);
      }
    }
    // the blade draw starts on the key and runs while it is held
    if (body === BODY_BLADE || body === BODY_BOWED) { this.scrapeAmp = vel; this.scrapeTimer = 0; }
  }

  /**
   * A gun going off, at the muzzle: a crack of dense noise (the shock), a whump of noise low-passed
   * with a cutoff sweeping down as the pressure wave passes, and a sub boom (a sine falling from
   * ~90 to ~35 Hz) that carries; the charge lengthens all three.
   */
  private renderBlasts(out: Float32Array, count: number): void {
    const fs = this.fs, rng = this.rng;
    for (let k = 0; k < MAX_BLASTS; k++) {
      if (!this.bOn[k]) continue;
      let t = this.bT[k];
      const amp = this.bAmp[k], charge = this.bCharge[k];
      const shockLen = (0.0015 + 0.004 * charge) * fs;
      const crackTau = (0.006 + 0.02 * charge) * fs, whumpTau = (0.12 + 0.25 * charge) * fs, boomTau = (0.35 + 0.6 * charge) * fs;
      let lp = this.bLP[k], lp2 = this.bLP2[k], ph = this.bPh[k];
      for (let i = 0; i < count; i++, t++) {
        if (t < 0) continue;
        if (t > boomTau * 5) { this.bOn[k] = 0; break; }
        const n = rng.bi();
        // the shock front: an N-wave a few milliseconds long, then the crack: broadband noise over in tens of ms
        const shock = t < shockLen ? (1 - 2 * t / shockLen) * 2.5 : 0;
        const crack = n * Math.exp(-t / crackTau) * 3;
        // the whump: the same noise through a low-pass whose cutoff falls from ~2.5 kHz to ~60 Hz
        const fc = 60 + 2400 * Math.exp(-t / (whumpTau * 0.35));
        const a = 1 - Math.exp(-6.283185307 * fc / fs);
        lp += (n - lp) * a; lp2 += (lp - lp2) * a;
        const whump = lp2 * Math.exp(-t / whumpTau) * 3.5;
        // the sub boom
        const f = 35 + 55 * Math.exp(-t / (boomTau * 0.35));
        ph += f / fs; if (ph >= 1) ph -= 1;
        const boom = Math.sin(6.283185307 * ph) * (1 - Math.exp(-t / (0.004 * fs))) * Math.exp(-t / boomTau) * (0.5 + 0.5 * charge);
        out[i] += amp * (shock + crack + whump + boom);
      }
      this.bT[k] = t; this.bLP[k] = lp; this.bLP2[k] = lp2; this.bPh[k] = ph;
    }
  }

  private push(tMs: number, amp: number, pos: number, bank: number, lenMs: number, shape: number, noise: number): void {
    if (this.pending >= MAX_PENDING) return;
    const i = this.pending++;
    this.pT[i] = tMs * 1e-3 * this.fs; this.pA[i] = amp; this.pP[i] = pos; this.pB[i] = bank;
    this.pL[i] = Math.max(2, lenMs * 1e-3 * this.fs); this.pS[i] = shape; this.pN[i] = noise;
  }

  private allocBank(note: number, p: ParamValues): number {
    let best = -1, bestScore = Infinity;
    for (let b = 0; b < BANKS; b++) {
      if (this.bankNote[b] === note) { best = b; break; }
      const score = this.banks[b].level + this.bankAge[b] * 1e-9;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (this.bankNote[best] !== note) { this.bankNote[best] = note; this.designBank(p, best, note); }
    this.bankAge[best] = 0;
    return best;
  }

  private allocHorn(note: number): number {
    let best = 0, bestScore = Infinity;
    for (let v = 0; v < HORN_VOICES; v++) {
      const h = this.horns[v * HORN_INST];
      if (h.active && h.note === note && !h.released) return v;
      const score = !h.active ? -1 : h.released ? h.level : 10 - this.hornAge[v] * 1e-9;
      if (score < bestScore) { bestScore = score; best = v; }
    }
    this.hornNote[best] = note; this.hornAge[best] = 0;
    return best;
  }

  // ------------------------------------------------------------ audio

  /**
   * Render `count` (≤ CHUNK) samples of the unit's mono output into `out`
   * (overwritten). `beat`/`beatPrev` are positions in beats for the roll.
   */
  process(out: Float32Array, count: number, p: ParamValues, beat: number, beatPrev: number, cohesionScale: number): void {
    out.fill(0, 0, count);
    this.refreshDesign(p);
    const fs = this.fs;
    // the roll: retrigger the held keys on the march clock
    const roll = ROLL_BEATS[this.p(p, 'Roll') | 0];
    if (roll > 0 && this.held.length > 0) {
      const a = Math.floor(beatPrev / roll), b = Math.floor(beat / roll);
      if (b !== a) {
        this.rollCount++;
        const accent = this.p(p, 'Accent');
        const strong = (b % 4) === 0;          // every fourth hit is the strong one
        const g = strong ? 1 : 1 - accent * 0.6;
        for (let i = 0; i < this.held.length; i++) this.strike(this.held[i], this.heldVel[i] * g, this.heldTouch[i] * (strong ? 1 : 1 - accent * 0.3), p, cohesionScale);
      }
    }
    if (this.isHorn) {
      this.refreshHorn(p);
      const growl = this.hp.growl;
      let any = false;
      for (const h of this.horns) if (h.active) { h.process(out, 0, count, growl); any = true; }
      for (let v = 0; v < HORN_VOICES; v++) this.hornAge[v] += count;
      const g = 0.7 * BODY_GAIN[this.body] * this.p(p, 'Level');
      let lvl = this.level;
      for (let i = 0; i < count; i++) { out[i] *= g; const a = out[i] < 0 ? -out[i] : out[i]; lvl += (a - lvl) * 0.002; }
      this.level = any ? lvl : lvl * 0.9;
      return;
    }
    // stick–slip while the key is held: the blade draw is a random train of tiny pulses; the bow is
    // the same friction locked to the string's own period (Helmholtz motion), so it sings
    const bowed = this.body === BODY_BOWED;
    if ((this.body === BODY_BLADE || bowed) && this.held.length > 0 && (bowed || this.p(p, 'Char') > 0.02)) {
      const press = this.p(p, 'Char');
      const top = this.held[this.held.length - 1];
      const track = this.p(p, 'Track') >= 0.5;
      const rate = bowed
        ? midiToFreq(track ? top : this.p(p, 'Root')) * (1 + 0.004 * this.rng.bi() * (0.3 + press))
        : 30 + 500 * press * press;
      // scrapeTimer is the sample offset (from this chunk's start) of the next pulse; pulses are scheduled at
      // their exact fractional time, so the bow's period is not quantised to the chunk size
      while (this.scrapeTimer < count) {
        const tMs = Math.max(0, this.scrapeTimer) / fs * 1000;
        this.scrapeTimer += bowed ? fs / rate : fs / rate * (0.5 + this.rng.next());
        const b = track ? this.allocBank(top, p) : (bowed ? 0 : (this.rng.next() * BANKS) | 0);
        const amp = bowed ? this.scrapeAmp * 0.035 * (0.6 + 0.6 * press) * (0.85 + 0.3 * this.rng.next()) : this.scrapeAmp * 0.06 * (0.4 + this.rng.next());
        const len = bowed ? 0.15 + 0.25 * (1 - press) : 0.25 + 0.4 * this.rng.next();
        this.push(tMs, amp, bowed ? 0.9 : 0.5 + 0.5 * this.rng.next(), b, len, SHAPE_HANN, bowed ? 0.15 * this.p(p, 'Grit') : 0.6 + 0.4 * this.p(p, 'Grit'));
      }
      this.scrapeTimer -= count;
    }
    // promote pending hits whose time has come
    const A = this.A, B = this.B;
    for (let b = 0; b < BANKS; b++) { A[b].fill(0, 0, count); B[b].fill(0, 0, count); }
    let pending = this.pending;
    for (let i = 0; i < pending;) {
      this.pT[i] -= count;
      if (this.pT[i] <= 0) {
        // start it now (the sub-chunk offset is folded into the phase)
        let slot = -1;
        for (let s = 0; s < MAX_ACTIVE; s++) if (!this.hOn[s]) { slot = s; break; }
        if (slot >= 0) {
          this.hOn[slot] = 1; this.hPhase[slot] = this.pT[i]; this.hLen[slot] = this.pL[i]; this.hAmp[slot] = this.pA[i];
          this.hPos[slot] = this.pP[i]; this.hBank[slot] = this.pB[i]; this.hShape[slot] = this.pS[i]; this.hNoise[slot] = this.pN[i];
        }
        // remove: swap with the last
        pending--;
        this.pT[i] = this.pT[pending]; this.pA[i] = this.pA[pending]; this.pP[i] = this.pP[pending]; this.pB[i] = this.pB[pending];
        this.pL[i] = this.pL[pending]; this.pS[i] = this.pS[pending]; this.pN[i] = this.pN[pending];
      } else i++;
    }
    this.pending = pending;
    this.crowdPending = pending;
    // render the active hits into the accumulators
    const rng = this.rng;
    for (let s = 0; s < MAX_ACTIVE; s++) {
      if (!this.hOn[s]) continue;
      const len = this.hLen[s], amp = this.hAmp[s] / len * 2, pos = this.hPos[s], b = this.hBank[s], noise = this.hNoise[s], shape = this.hShape[s];
      const a = A[b], bb = B[b];
      let ph = this.hPhase[s];
      for (let i = 0; i < count; i++, ph++) {
        if (ph < 0) continue;
        if (ph >= len) { this.hOn[s] = 0; break; }
        const u = ph / len;
        let e: number;
        if (shape === SHAPE_NWAVE) e = (1 - 2 * u) * 3;
        else e = 0.5 - 0.5 * Math.cos(6.283185307 * u);
        const v = amp * e;
        const nz = noise > 0 ? amp * noise * rng.bi() * (0.5 - 0.5 * Math.cos(6.283185307 * u)) * 0.7 : 0;
        a[i] += v + nz;
        bb[i] += (v + nz) * pos;
      }
      this.hPhase[s] = ph;
    }
    // the banks
    for (let b = 0; b < BANKS; b++) {
      const bank = this.banks[b];
      if (bank.n === 0) continue;
      bank.updatePitch();
      bank.process(A[b], B[b], out, 0, count);
      this.bankAge[b] += count;
    }
    // the blasts
    if (this.body === BODY_CANNON) this.renderBlasts(out, count);
    // output gain, with a crowd compressor: massed hits (rolls over long spreads) pile up, and a
    // crowd's dynamics are compressed anyway — the gain eases off as the unit's level rises
    const g = 0.1 * BODY_GAIN[this.body] * this.p(p, 'Level');
    let lvl = this.level;
    for (let i = 0; i < count; i++) {
      out[i] *= g / (1 + 2.5 * lvl);
      const a = out[i] < 0 ? -out[i] : out[i]; lvl += (a - lvl) * 0.002;
    }
    this.level = lvl;
  }
}
