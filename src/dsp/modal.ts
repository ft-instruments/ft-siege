// Modal bodies: a bank of second-order resonators standing in for the
// modes of a drum head, a plate, a bell, a bar, a log, the ground under a
// boot or a cannon barrel. Each body type is a recipe — mode frequency
// ratios, damping law, which modes a strike at the centre or the edge
// reaches — and the bank is the same machine for all of them.
//
// Two nonlinearities the literature says are the signature of big struck
// things, both cheap:
//  - tension modulation (Avanzini/Bank): the pitch of a membrane rises
//    with its energy, so a hard hit starts sharp and glides down. Computed
//    once per chunk from the bank's energy.
//  - the gong "bloom" (Ducceschi, Poirot): energy cascades from the low
//    modes into the high ones over ~100 ms after a hard strike. Modelled
//    perceptually: the distortion products of the low modes' output are
//    fed back into the high modes through a slow envelope.

import { BODY_DRUM, BODY_TIMPANI, BODY_GONG, BODY_BELL, BODY_SHIELD, BODY_ANVIL, BODY_BLADE, BODY_LOG, BODY_BARS, BODY_LYRE, BODY_BOWED, BODY_FEET, BODY_HOOVES, BODY_CANNON, BODY_GLASS, BODY_MUSICBOX, BODY_HELMET, BODY_RUBBLE } from './params.ts';

export const MAX_MODES = 32;

/** Roots of J_m (circular membrane), as ratios to the (0,1) mode, with their m. */
export const MEMBRANE: [number, number][] = [
  [1, 0], [1.594, 1], [2.136, 2], [2.296, 0], [2.653, 3], [2.918, 1], [3.156, 4], [3.501, 2], [3.600, 0], [3.652, 5],
  [4.060, 3], [4.154, 6], [4.230, 1], [4.601, 4], [4.646, 7], [4.832, 2], [4.904, 0], [5.131, 8], [5.131, 5], [5.412, 3],
  [5.540, 1], [5.612, 9], [5.650, 6], [5.977, 4], [6.088, 10], [6.146, 2], [6.209, 0], [6.427, 7], [6.520, 5], [6.563, 11],
];
/** Church bell partials (hum, prime, tierce, quint, nominal, ...), as ratios to the prime. */
export const BELL = [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011, 3.36, 3.76, 4.21, 4.5, 5.02, 5.43, 6.18, 6.86, 7.6, 8.5, 9.4, 10.6, 11.9, 13.2, 14.7, 16.3];
/** Free–free bar: near-harmonic, ringing. */
export const BAR = [1, 2.756, 5.404, 8.933, 13.34, 18.64, 24.81, 31.87, 39.8, 48.6, 58.3, 68.9];

/** Bessel J_m(x) by series; only used at design time. */
function besselJ(m: number, x: number): number {
  let term = 1;
  for (let k = 1; k <= m; k++) term *= x / (2 * k);
  let sum = term;
  const x2 = -(x * x) / 4;
  for (let k = 1; k < 60; k++) {
    term *= x2 / (k * (k + m));
    sum += term;
    if (Math.abs(term) < 1e-12 * Math.abs(sum)) break;
  }
  return sum;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Design {
  /** number of modes */
  n: number;
  /** frequencies in Hz */
  f: Float64Array;
  /** decay time to -60 dB, seconds */
  t60: Float64Array;
  /** input weight for a strike at the centre / at the edge */
  wC: Float64Array;
  wE: Float64Array;
  /** output weight */
  wo: Float64Array;
  /** index from which the "high" modes begin (bloom target) */
  hiFrom: number;
  /** tension-modulation strength (pitch rise per unit energy) */
  tension: number;
  /** bloom strength */
  bloom: number;
  /** extra: a Helmholtz cavity mode index (drums) or -1 */
  cavity: number;
}

export function newDesign(): Design {
  return {
    n: 0, f: new Float64Array(MAX_MODES), t60: new Float64Array(MAX_MODES), wC: new Float64Array(MAX_MODES), wE: new Float64Array(MAX_MODES),
    wo: new Float64Array(MAX_MODES), hiFrom: MAX_MODES, tension: 0, bloom: 0, cavity: -1,
  };
}

/**
 * Fill a design for a body. `size` in metres, the rest 0..1. `f0` is
 * the fundamental the body should have (already includes key tracking).
 * `seed` perturbs the mode set so crowd variants are not clones.
 */
export function designBody(d: Design, body: number, f0: number, size: number, tension: number, damp: number, char: number, bend: number, seed: number): void {
  const rnd = mulberry32(seed * 7919 + body * 131 + 17);
  const jit = (amt: number) => 1 + amt * (rnd() * 2 - 1);
  let n = 0;
  d.hiFrom = MAX_MODES; d.tension = 0; d.bloom = 0; d.cavity = -1;
  const decay = 1 - damp;
  const push = (f: number, t60: number, wC: number, wE: number, wo: number) => {
    if (n >= MAX_MODES || f < 15 || f > 18000) return;
    d.f[n] = f; d.t60[n] = Math.max(0.004, t60); d.wC[n] = wC; d.wE[n] = wE; d.wo[n] = wo; n++;
  };

  switch (body) {
    case BODY_DRUM: {
      // membrane over a shell; the cavity stiffens the axisymmetric modes and adds the boom
      const cav = char;
      const t60base = (0.25 + 2.2 * size) * (0.15 + decay * decay) * (1.2 - 0.5 * tension);
      for (let i = 0; i < MEMBRANE.length && n < MAX_MODES - 2; i++) {
        const [ratio, m] = MEMBRANE[i];
        let f = f0 * ratio * jit(0.012);
        if (m === 0) f *= 1 + 0.32 * cav / ratio;                  // cavity loading on the (0,n) modes
        const j0 = besselJ(m, ratio * 2.4048 * 0.12), je = besselJ(m, ratio * 2.4048 * 0.82);
        const t60 = t60base / (1 + 0.9 * (ratio - 1)) * (1 - 0.35 * cav * (m === 0 ? 0 : 1));
        const wo = 1 / Math.sqrt(ratio);
        push(f, t60, j0, je, wo);
      }
      if (cav > 0.02) {
        // Helmholtz boom of the enclosed air; low, slow, only reached from the centre
        d.cavity = n;
        push(f0 * (0.48 + 0.14 * cav), t60base * (0.8 + cav), 0.6 * cav, 0.15 * cav, 1.4);
        // shell knock
        push(f0 * 3.9 * jit(0.05), 0.06 + 0.1 * size, 0.25, 0.45, 0.5);
      }
      d.tension = bend * 0.16 * (1.2 - 0.6 * tension);
      break;
    }
    case BODY_TIMPANI: {
      // a kettledrum: the (1,1) mode is the note; the kettle tunes the ring modes (m,1) to near 1 : 1.5 : 2 : 2.5 : 3
      // and kills the axisymmetric (0,n) modes, which is what makes a timpani sound pitched
      const kettle = char;
      const t60base = (0.8 + 3 * size) * (0.15 + decay * decay);
      const rows: [number, number, number, number][] = [   // ratio, t60 mult, centre, edge
        [0.82 - 0.1 * kettle, 0.12, 0.9, 0.3], [1, 1, 0.25, 0.9], [1.5 + 0.05 * (1 - kettle), 0.8, 0.05, 0.85], [1.99 + 0.08 * (1 - kettle), 0.65, 0.0, 0.8],
        [2.46 + 0.1 * (1 - kettle), 0.5, 0.0, 0.75], [2.92 + 0.12 * (1 - kettle), 0.4, 0.0, 0.7], [3.38, 0.3, 0, 0.6], [3.83, 0.25, 0, 0.55],
        [1.72, 0.3, 0.6, 0.2], [2.35, 0.25, 0.4, 0.3], [2.85, 0.2, 0.3, 0.3], [3.2, 0.18, 0.2, 0.3], [3.6, 0.15, 0.1, 0.3], [4.1, 0.12, 0.1, 0.35], [4.5, 0.1, 0, 0.35], [5.0, 0.08, 0, 0.3],
      ];
      for (const [r, tm, c, e] of rows) push(f0 * r * jit(0.004), t60base * tm, c, e, 1 / Math.sqrt(r));
      push(f0 * 0.55, t60base * 0.6, 0.5 * kettle, 0.15 * kettle, 0.5);      // the kettle's air
      d.tension = bend * 0.08;
      break;
    }
    case BODY_BARS: {
      // wooden bars over resonator tubes (marimba-like): partials tuned 1 : 4 : 10, the tube swells the fundamental
      const res = char;
      const t60base = (0.4 + 1.6 * size) * (0.15 + decay * decay);
      const ratios = [1, 3.95 + 0.1 * tension, 9.9 + 0.3 * tension, 15.2, 21.5, 29.0, 37.0];
      for (let i = 0; i < ratios.length && n < MAX_MODES; i++) {
        const r = ratios[i] * jit(i < 3 ? 0.003 : 0.02);
        push(f0 * r, t60base * (i === 0 ? 1 + 1.5 * res : 1) / (1 + 0.8 * i), 0.9 / (1 + 0.5 * i), 0.5 + 0.5 * Math.min(1, i * 0.3), (i === 0 ? 1 + 0.8 * res : 1) / Math.pow(r, 0.5));
      }
      break;
    }
    case BODY_LYRE: case BODY_BOWED: {
      // a string: 32 near-harmonic partials (a little stiffness), damping rising with frequency;
      // struck/plucked at the centre (odd partials) or near the bridge (all of them, bright).
      // `body` adds a soundbox: two fixed low resonances that colour every note.
      const bowed = body === BODY_BOWED;
      const B = 0.00003 + 0.0003 * tension;
      const t60base = (bowed ? 0.6 + 1.2 * size : 1.2 + 3 * size) * (0.1 + decay * decay);
      for (let k = 1; k <= 30 && n < MAX_MODES - 2; k++) {
        const f = f0 * k * Math.sqrt(1 + B * k * k);
        if (f > 16000) break;
        const t60 = t60base / (1 + 0.12 * k + 0.002 * k * k);
        push(f, t60, Math.abs(Math.sin(k * Math.PI * 0.5)) / Math.sqrt(k), Math.abs(Math.sin(k * Math.PI * 0.09)) * 1.2 / Math.pow(k, 0.3), 1 / Math.pow(k, 0.55));
      }
      const box = char;
      push(190 * jit(0.05), 0.12, 0.9 * box, 0.9 * box, 1.1);
      push(410 * jit(0.05), 0.09, 0.7 * box, 0.7 * box, 0.8);
      d.tension = bend * (bowed ? 0.02 : 0.06);
      break;
    }
    case BODY_GONG: {
      // thin circular plate, dense inharmonic set, long decay, bloom into the high modes
      const modes: number[] = [];
      for (let m = 0; m < 7; m++) for (let k = 1; k < 6; k++) {
        const r = Math.pow((m + 2 * k - 0.5) / 1.5, 1.72 - 0.35 * tension) * (m === 0 && k === 1 ? 1 : jit(0.03));
        modes.push(r);
      }
      modes.sort((a, b) => a - b);
      const t60base = (0.8 + 4.5 * size) * (0.1 + decay * decay);
      for (let i = 0; i < modes.length && n < MAX_MODES; i++) {
        const r = modes[i] / modes[0];
        const f = f0 * r;
        if (f > 12000) break;
        push(f, t60base / (1 + 0.25 * (r - 1)), 1 / (1 + 0.3 * r), 0.6 + 0.4 * rnd(), 1 / Math.sqrt(r));
      }
      d.hiFrom = Math.max(4, n >> 2);
      d.bloom = char;
      d.tension = bend * 0.08;
      break;
    }
    case BODY_BELL: {
      const t60base = (2 + 8 * size) * (0.05 + decay * decay);
      for (let i = 0; i < BELL.length && n < MAX_MODES; i++) {
        const r = BELL[i] * (i < 5 ? jit(0.004) : jit(0.02));
        const f = f0 * r;
        // the strike-note partials ring longest; the hum rings longest of all
        const t60 = t60base * (i === 0 ? 1.6 : 1) / (1 + 0.5 * Math.max(0, r - 2));
        push(f, t60, i < 6 ? 0.9 : 0.5, i < 6 ? 0.4 : 0.9, i === 0 ? 0.8 : 1 / Math.sqrt(Math.max(1, r)));
      }
      d.hiFrom = 8;
      d.bloom = char * 0.6;
      d.tension = bend * 0.03;
      break;
    }
    case BODY_SHIELD: {
      // a stiff rectangular plate on a wooden backing: bright, short, a lot of grit
      const modes: number[] = [];
      for (let m = 1; m < 8; m++) for (let k = 1; k < 8; k++) modes.push((m * m + k * k * (1.4 - 0.5 * tension)) * jit(0.05));
      modes.sort((a, b) => a - b);
      const back = char;
      const t60base = (0.12 + 0.9 * size) * (0.08 + decay * decay) * (1 - 0.7 * back);
      for (let i = 0; i < modes.length && n < MAX_MODES; i++) {
        const r = modes[i] / modes[0];
        const f = f0 * r;
        if (f > 14000) break;
        push(f, t60base / (1 + 0.15 * (r - 1)), 0.9 / (1 + 0.1 * r), 0.5 + 0.5 * rnd(), 1 / Math.pow(r, 0.35));
      }
      // the backing thud
      push(f0 * 0.4, 0.05 + 0.2 * size, 0.9 * back, 0.7 * back, 1.6);
      d.hiFrom = n >> 1;
      d.bloom = 0.25;
      d.tension = bend * 0.12;
      break;
    }
    case BODY_ANVIL: {
      // a steel bar with a plate-ish body: near-harmonic bar partials plus a spray of high plate modes
      const t60base = (0.4 + 3.5 * size) * (0.1 + decay * decay);
      for (let i = 0; i < 6 && n < MAX_MODES; i++) push(f0 * BAR[i] * jit(0.006), t60base / (1 + 0.4 * i), 1 / (1 + i * 0.5), 0.8, 1 / Math.sqrt(BAR[i]));
      const ring = char;
      for (let i = 0; i < 18 && n < MAX_MODES; i++) {
        const r = 3 + i * 1.37 * jit(0.2);
        push(f0 * r, t60base * (0.15 + 0.6 * ring) / (1 + 0.1 * i), 0.5, 0.9, 0.6 / Math.pow(r, 0.3));
      }
      d.hiFrom = 6;
      d.bloom = 0.15 + 0.3 * ring;
      break;
    }
    case BODY_BLADE: {
      // a long thin bar: harmonic-ish partials, ringing; the draw (scrape) is the exciter
      const t60base = (0.6 + 2.5 * size) * (0.08 + decay * decay);
      for (let i = 0; i < BAR.length && n < MAX_MODES; i++) {
        const r = BAR[i] * jit(0.004) * (1 + 0.002 * i * tension);
        push(f0 * r, t60base / (1 + 0.3 * i), 0.9 / (1 + 0.3 * i), 0.7, 1 / Math.pow(r, 0.4));
      }
      for (let i = 0; i < 10 && n < MAX_MODES; i++) push(f0 * (9 + i * 2.1) * jit(0.1), t60base * 0.08, 0.2, 0.7, 0.3);
      d.hiFrom = 12;
      d.bloom = 0.2;
      break;
    }
    case BODY_LOG: {
      // hollow wood: few irregular modes, short; "hollow" opens the cavity resonance
      const hollow = char;
      const t60base = (0.05 + 0.5 * size) * (0.1 + decay * decay);
      const ratios = [1, 1.83, 2.71, 3.9, 5.2, 6.9, 8.8, 11.2];
      for (let i = 0; i < ratios.length && n < MAX_MODES; i++) push(f0 * ratios[i] * jit(0.06), t60base / (1 + 0.5 * i), 0.9 / (1 + 0.4 * i), 0.6, 1 / Math.sqrt(ratios[i]));
      push(f0 * 0.62, t60base * (1 + 2 * hollow), 0.9 * hollow, 0.5 * hollow, 1.5);
      d.tension = bend * 0.2;
      break;
    }
    case BODY_FEET: {
      // the ground under a boot: a thud and the earth, very short; gait sets the heel-toe split (handled by the unit)
      const t60base = (0.03 + 0.12 * size) * (0.2 + decay);
      push(f0, t60base, 1, 0.8, 1.3);
      push(f0 * 1.7 * jit(0.1), t60base * 0.6, 0.7, 0.9, 0.8);
      push(f0 * 2.9 * jit(0.1), t60base * 0.35, 0.5, 0.9, 0.5);
      push(f0 * 5.1 * jit(0.15), t60base * 0.2, 0.3, 0.9, 0.35);
      d.tension = bend * 0.15;
      break;
    }
    case BODY_HOOVES: {
      const t60base = (0.03 + 0.1 * size) * (0.2 + decay);
      const ratios = [1, 1.5, 2.3, 3.4, 4.9, 7.1];
      for (let i = 0; i < ratios.length; i++) push(f0 * ratios[i] * jit(0.1), t60base / (1 + 0.5 * i), 1 / (1 + 0.3 * i), 0.9, 1 / Math.pow(ratios[i], 0.4));
      d.tension = bend * 0.1;
      break;
    }
    case BODY_CANNON: {
      // the barrel and the muzzle: low modes reached by the blast (centre weights);
      // a spray of debris modes reached only by the debris hits (edge weights)
      const t60base = (0.2 + 0.6 * size) * (0.2 + decay);
      push(f0, t60base, 1, 0, 1.4);
      push(f0 * 1.52 * jit(0.05), t60base * 0.7, 0.8, 0, 1);
      push(f0 * 2.3 * jit(0.05), t60base * 0.5, 0.6, 0, 0.7);
      push(f0 * 3.7 * jit(0.05), t60base * 0.3, 0.4, 0, 0.4);
      for (let i = 0; i < 20 && n < MAX_MODES; i++) {
        const r = 6 + i * 2.3 * jit(0.3);
        push(f0 * r, 0.02 + 0.08 * rnd() + 0.05 * size, 0, 0.5 + 0.5 * rnd(), 0.6 / Math.pow(r, 0.3));
      }
      d.hiFrom = 4;
      d.tension = bend * 0.3;
      break;
    }
    case BODY_GLASS: {
      // a wine glass / glass harmonica: a thin shell, few clean partials, very long ring.
      // "fracture" splits every mode into a beating pair and shortens the ring: a cracked glass.
      const crack = char;
      const t60base = (1.5 + 6 * size) * (0.05 + decay * decay) * (1 - 0.6 * crack);
      const ratios = [1, 2.32, 4.25, 6.63, 9.38, 12.5];
      for (let i = 0; i < ratios.length && n < MAX_MODES - 1; i++) {
        const r = ratios[i] * jit(0.002);
        push(f0 * r, t60base / (1 + 0.35 * i), 0.9 / (1 + 0.3 * i), 0.7, 1 / Math.sqrt(r));
        if (crack > 0.05) push(f0 * r * (1.004 + 0.02 * crack), t60base * 0.7 / (1 + 0.35 * i), 0.6 / (1 + 0.3 * i), 0.5, 0.7 / Math.sqrt(r));
      }
      d.hiFrom = 3;
      d.bloom = 0.1;
      d.tension = bend * 0.01;
      break;
    }
    case BODY_MUSICBOX: {
      // steel comb tines (cantilever bars: 1 : 6.27 : 17.6 : 34.4) on a small wooden box;
      // a second, slightly sharp tine gives the plucked shimmer
      const box = char;
      const t60base = (0.5 + 2.5 * size) * (0.1 + decay * decay);
      const ratios = [1, 6.267, 17.55, 34.39];
      for (let i = 0; i < ratios.length && n < MAX_MODES - 4; i++) {
        const r = ratios[i] * jit(0.002);
        push(f0 * r, t60base / (1 + 1.2 * i), 0.9 / (1 + 0.6 * i), 0.8, 1 / Math.pow(r, 0.4));
      }
      push(f0 * 1.0035, t60base * 0.8, 0.35, 0.3, 0.5);
      push(310 * jit(0.05), 0.1, 0.8 * box, 0.8 * box, 1);
      push(680 * jit(0.05), 0.07, 0.6 * box, 0.6 * box, 0.7);
      d.hiFrom = 2;
      d.tension = bend * 0.01;
      break;
    }
    case BODY_HELMET: {
      // a dented steel shell: a dull thud and a short, irregular ping; "dent" detunes and splits the modes
      const dent = char;
      const t60base = (0.15 + 1.2 * size) * (0.08 + decay * decay);
      const ratios = [1, 1.58, 2.24, 2.95, 3.78, 4.7, 5.8, 7.0, 8.4, 9.9];
      for (let i = 0; i < ratios.length && n < MAX_MODES - 1; i++) {
        const r = ratios[i] * jit(0.01 + 0.1 * dent);
        push(f0 * r, t60base / (1 + 0.45 * i), 0.9 / (1 + 0.25 * i), 0.7, 1 / Math.pow(r, 0.45));
        if (dent > 0.3 && i < 6) push(f0 * r * (1.01 + 0.06 * dent), t60base * 0.5 / (1 + 0.45 * i), 0.5 / (1 + 0.25 * i), 0.4, 0.6 / Math.pow(r, 0.45));
      }
      push(f0 * 0.5, 0.05 + 0.1 * size, 0.8, 0.5, 1.2);                // the padding's thud
      d.hiFrom = n >> 1;
      d.bloom = 0.1;
      d.tension = bend * 0.05;
      break;
    }
    case BODY_RUBBLE: {
      // brick, stone and splinters settling: many short, unrelated modes reached mostly off-centre
      const dens = 10 + Math.floor(char * 14);
      const t60base = (0.1 + 0.6 * size) * (0.15 + decay * decay);
      for (let i = 0; i < dens && n < MAX_MODES; i++) {
        const r = 1 + i * 0.9 + 3 * rnd();
        const t = t60base * (0.3 + rnd());
        const wE = 0.4 + 0.6 * rnd();
        push(f0 * r, t / (1 + 0.08 * i), 0.15, wE, 0.8 / Math.pow(r, 0.3));
      }
      d.hiFrom = 6;
      d.tension = bend * 0.1;
      break;
    }
    default: break;
  }
  d.n = n;
}

/** Contact-time multiplier per body (metal is struck with a hard, short contact; skins and wood longer). */
export const BODY_CONTACT = [1, 1.2, 1.4, 0.4, 0.5, 0.15, 0.2, 0.6, 0.45, 0.25, 0.3, 1.2, 0.5, 1, 1, 1, 1, 0.25, 0.15, 0.3, 0.5];
/** Output gain per body, so every body speaks at a similar level for a similar strike. */
export const BODY_GAIN = [5, 4, 0.45, 0.35, 2.2, 3.5, 3, 2.5, 3, 3.5, 5, 6, 4.5, 3, 1, 1, 0.25, 2.5, 3, 3, 6];

/** The fundamental a body has at its natural size and tension, before key tracking. */
export function naturalF0(body: number, size: number, tension: number): number {
  switch (body) {
    case BODY_DRUM: return (52 / size) * (0.6 + 0.8 * tension);
    case BODY_TIMPANI: return (95 / size) * (0.6 + 0.8 * tension);
    case BODY_BARS: return (240 / size) * (0.8 + 0.4 * tension);
    case BODY_LYRE: case BODY_BOWED: return (200 / size) * (0.7 + 0.6 * tension);
    case BODY_GONG: return (75 / size) * (0.7 + 0.6 * tension);
    case BODY_BELL: return (330 / size) * (0.8 + 0.4 * tension);
    case BODY_SHIELD: return (140 / size) * (0.6 + 0.9 * tension);
    case BODY_ANVIL: return (900 / size) * (0.7 + 0.6 * tension);
    case BODY_BLADE: return (620 / size) * (0.7 + 0.6 * tension);
    case BODY_LOG: return (110 / size) * (0.7 + 0.6 * tension);
    case BODY_FEET: return 62 / size;
    case BODY_HOOVES: return 150 / size;
    case BODY_CANNON: return 42 / size;
    case BODY_GLASS: return (440 / size) * (0.8 + 0.4 * tension);
    case BODY_MUSICBOX: return (520 / size) * (0.8 + 0.4 * tension);
    case BODY_HELMET: return (380 / size) * (0.7 + 0.6 * tension);
    case BODY_RUBBLE: return 300 / size;
    default: return 110 / size;
  }
}

/**
 * A bank of up to MAX_MODES resonators. Driven per sample by two scalar
 * excitation accumulators — A (all hits' pulses) and B (pulses weighted by
 * their strike position) — so per-mode input is wC·A + (wE − wC)·B, and
 * any number of simultaneous hits costs nothing extra.
 */
export class ModalBank {
  n = 0;
  private a1 = new Float64Array(MAX_MODES);
  private a2 = new Float64Array(MAX_MODES);
  private q1 = new Float64Array(MAX_MODES);
  private q2 = new Float64Array(MAX_MODES);
  private gC = new Float64Array(MAX_MODES);      // input gain at the centre
  private gD = new Float64Array(MAX_MODES);      // edge − centre
  private wo = new Float64Array(MAX_MODES);
  private wd = new Float64Array(MAX_MODES);      // damped angular frequency × dt
  private e = new Float64Array(MAX_MODES);       // per-sample decay
  hiFrom = MAX_MODES;
  tension = 0;
  bloom = 0;
  private energy = 0;
  private relax = 0;         // 1 right after a hit, decaying over ~100 ms: the glide belongs to the attack
  private bloomEnv = 0;
  private lastMult = 1;
  private readonly dt: number;
  private readonly bloomA: number;
  /** most recent low-mode output, for the bloom feedback */
  private lowOut = 0;

  constructor(sampleRate: number) {
    this.dt = 1 / sampleRate;
    this.bloomA = 1 - Math.exp(-1 / (0.06 * sampleRate));
  }

  clear(): void { this.q1.fill(0); this.q2.fill(0); this.energy = 0; this.bloomEnv = 0; this.lowOut = 0; this.relax = 0; }

  /** Load a design into the bank; ringing modes keep ringing (their state is kept). */
  load(d: Design): void {
    const dt = this.dt;
    this.n = d.n; this.hiFrom = Math.min(d.hiFrom, d.n); this.tension = d.tension; this.bloom = d.bloom;
    for (let i = 0; i < d.n; i++) {
      const w = 2 * Math.PI * d.f[i];
      const sigma = 6.9078 / d.t60[i];                     // ln(1000)/t60
      const wd = Math.sqrt(Math.max(1, w * w - sigma * sigma));
      const e = Math.exp(-sigma * dt);
      this.e[i] = e; this.wd[i] = wd * dt;
      this.a1[i] = 2 * e * Math.cos(wd * dt);
      this.a2[i] = -e * e;
      // input gain such that a unit impulse rings the mode at amplitude ~1 whatever its frequency
      // (the exciter pulses are unit-area, so a mode's response is the pulse spectrum at its frequency)
      const g = Math.sin(wd * dt);
      this.gC[i] = g * d.wC[i];
      this.gD[i] = g * (d.wE[i] - d.wC[i]);
      // radiated pressure rises with frequency; a gentle tilt so the lowest modes do not swamp the rest
      this.wo[i] = d.wo[i] * Math.min(1.5, Math.sqrt(d.f[i] / 120));
    }
    for (let i = d.n; i < MAX_MODES; i++) { this.q1[i] = 0; this.q2[i] = 0; }
    this.lastMult = 1;
  }

  /** Per-chunk: tension modulation from the stored energy, relaxing after each hit. Returns the pitch multiplier. */
  updatePitch(): number {
    const mult = 1 + this.tension * Math.min(1, this.energy * 3) * this.relax;
    if (Math.abs(mult - this.lastMult) > 2e-4) {
      this.lastMult = mult;
      for (let i = 0; i < this.n; i++) this.a1[i] = 2 * this.e[i] * Math.cos(this.wd[i] * mult);
    }
    return mult;
  }

  /**
   * Run `count` samples. A/B are the excitation accumulators; output is added
   * into `out`. Returns nothing; energy and bloom are tracked inside.
   */
  process(A: Float32Array, B: Float32Array, out: Float32Array, off: number, count: number): void {
    const n = this.n;
    if (n === 0) return;
    const a1 = this.a1, a2 = this.a2, q1 = this.q1, q2 = this.q2, gC = this.gC, gD = this.gD, wo = this.wo;
    const hi = this.hiFrom, bloom = this.bloom;
    let energy = this.energy, bloomEnv = this.bloomEnv, lowOut = this.lowOut, relax = this.relax;
    const bloomA = this.bloomA;
    for (let i = off; i < off + count; i++) {
      const a = A[i], b = B[i];
      // bloom: cubic distortion products of the low modes, through a 60 ms envelope, into the high modes
      let inj = 0;
      if (bloom > 0) {
        const x = lowOut * bloom * 6;
        const x2 = x * x;
        const d = x2 > 9 ? (x > 0 ? x - 3 : x + 3) : x2 * x * 0.111;
        bloomEnv += ((d < 0 ? -d : d) - bloomEnv) * bloomA;
        inj = d * bloomEnv * 0.5;
      }
      let y = 0, low = 0, en = 0;
      for (let k = 0; k < n; k++) {
        let inp = gC[k] * a + gD[k] * b;
        if (k >= hi) inp += inj * gD[k];
        const q = a1[k] * q1[k] + a2[k] * q2[k] + inp;
        q2[k] = q1[k]; q1[k] = q;
        const o = wo[k] * q;
        y += o;
        if (k < 4) { low += o; en += q * q; }
      }
      lowOut = low;
      energy += (en - energy) * 0.002;
      // the attack: while the energy is still rising the glide is fully on; then it relaxes over ~100 ms
      if (en > energy * 1.02) relax = 1; else relax -= relax * 0.0002;
      out[i] += y;
    }
    this.energy = energy; this.bloomEnv = bloomEnv; this.lowOut = lowOut; this.relax = relax;
  }

  get level(): number { return Math.sqrt(this.energy); }
}
