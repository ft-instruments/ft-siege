// Offline render / sanity check. Runs the DSP core in Node (no browser),
// writes WAVs and prints level statistics.
//
//   node scripts/render.ts                        -> out/<preset>.wav for every preset (a short phrase each)
//   node scripts/render.ts preset "Taiko Line"    -> out/preset.wav (one preset, the phrase, longer)
//   node scripts/render.ts note 48 100            -> out/note.wav (init patch, one note)
//   node scripts/render.ts body drum 48 100       -> out/body.wav: one body at its defaults, close, dry
//   node scripts/render.ts bench                  -> CPU timing only
//   node scripts/render.ts modes drum             -> print the mode table of a body
//   node scripts/render.ts distance               -> arrival time and spectrum tilt per distance

import { writeFileSync, mkdirSync } from 'node:fs';
import { SiegeEngine } from '../src/dsp/engine.ts';
import { PRESETS, BODIES } from '../src/dsp/params.ts';
import { newDesign, designBody, naturalF0 } from '../src/dsp/modal.ts';

const FS = 48000;
const BLOCK = 128;

type Ev = { t: number; fn: () => void };

function render(e: SiegeEngine, seconds: number, events: Ev[]): [Float32Array, Float32Array] {
  const total = Math.ceil(seconds * FS / BLOCK) * BLOCK;
  const L = new Float32Array(total), R = new Float32Array(total);
  events.sort((a, b) => a.t - b.t);
  let ev = 0;
  for (let off = 0; off < total; off += BLOCK) {
    const t = off / FS;
    while (ev < events.length && events[ev].t <= t) events[ev++].fn();
    e.process(L.subarray(off, off + BLOCK), R.subarray(off, off + BLOCK), BLOCK);
  }
  return [L, R];
}

function writeWav(path: string, L: Float32Array, R: Float32Array): void {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(FS, 24); buf.writeUInt32LE(FS * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  mkdirSync('out', { recursive: true });
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${(n / FS).toFixed(2)} s)`);
}

const db = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

function stats(L: Float32Array, R: Float32Array, label = ''): boolean {
  let peak = 0, nan = 0, sq = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) nan++;
    if (a > peak) peak = a; if (b > peak) peak = b;
    sq += L[i] * L[i];
  }
  console.log(`${label} peak ${db(peak)} dBFS, rms ${db(Math.sqrt(sq / L.length))} dBFS${nan ? `  !!! ${nan} non-finite samples` : ''}`);
  return nan === 0;
}

function envelope(L: Float32Array, win = 0.25, maxRows = 40): void {
  const w = Math.floor(win * FS);
  const rows: string[] = [];
  for (let off = 0; off + w <= L.length && rows.length < maxRows; off += w) {
    let s = 0;
    for (let i = off; i < off + w; i++) s += L[i] * L[i];
    rows.push(`${(off / FS).toFixed(1)}s ${db(Math.sqrt(s / w)).padStart(6)}`);
  }
  console.log(rows.join(' | '));
}

/** A short phrase that shows a preset off: a low hit, a pair, then a held chord and a run. */
function phrase(e: SiegeEngine, seconds = 9): [Float32Array, Float32Array] {
  const ev: Ev[] = [];
  const play = (t: number, n: number, v: number, dur: number) => {
    ev.push({ t, fn: () => e.noteOn(n, v) });
    ev.push({ t: t + dur, fn: () => e.noteOff(n) });
  };
  play(0.1, 36, 110, 1.2);
  play(1.6, 43, 90, 0.4); play(2.0, 48, 100, 0.4);
  play(2.8, 48, 95, 2.4); play(2.8, 55, 85, 2.4); play(2.82, 60, 90, 2.4);
  play(5.6, 67, 100, 0.5); play(6.0, 65, 90, 0.5); play(6.4, 62, 95, 0.9); play(7.2, 55, 80, 1.2);
  return render(e, seconds, ev);
}

const mode = process.argv[2] ?? 'all';
const outDir = 'out';

if (mode === 'note') {
  const note = Number(process.argv[3] ?? 48), vel = Number(process.argv[4] ?? 100);
  const e = new SiegeEngine(FS);
  const [L, R] = render(e, 4, [
    { t: 0.05, fn: () => e.noteOn(note, vel) },
    { t: 2.0, fn: () => e.noteOff(note) },
  ]);
  stats(L, R, `note ${note} vel ${vel}:`);
  envelope(L, 0.1);
  writeWav(`${outDir}/note.wav`, L, R);
} else if (mode === 'body') {
  const body = BODIES.indexOf(process.argv[3] ?? 'drum');
  if (body < 0) throw new Error(`no body "${process.argv[3]}"`);
  const note = Number(process.argv[4] ?? 48), vel = Number(process.argv[5] ?? 100);
  const e = new SiegeEngine(FS);
  e.setParams({ u1Body: body, u1Level: 0.9, u1Dist: 3, u1Track: 1, tailMix: 0, early: 0, wind: 0, proximity: 0 });
  const [L, R] = render(e, 4, [
    { t: 0.05, fn: () => e.noteOn(note, vel) },
    { t: 2.0, fn: () => e.noteOff(note) },
  ]);
  stats(L, R, `${BODIES[body]} note ${note} vel ${vel}:`);
  envelope(L, 0.1);
  writeWav(`${outDir}/body.wav`, L, R);
} else if (mode === 'preset') {
  const name = process.argv[3] ?? PRESETS[0].name;
  const pr = PRESETS.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
  if (!pr) throw new Error(`no preset matching "${name}"`);
  const e = new SiegeEngine(FS);
  e.loadPreset(pr.values);
  const [L, R] = phrase(e, 12);
  stats(L, R, `${pr.name}:`);
  envelope(L);
  writeWav(`${outDir}/preset.wav`, L, R);
} else if (mode === 'bench') {
  for (const name of ['Battlefield Kit', 'March Of Two Thousand', 'Braam', 'Shield Wall']) {
    const pr = PRESETS.find((p) => p.name === name)!;
    const e = new SiegeEngine(FS);
    e.loadPreset(pr.values);
    const chord = [36, 43, 48, 55, 60, 67, 72, 79];
    for (const n of chord) e.noteOn(n, 100);
    const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
    const blocks = Math.floor(5 * FS / BLOCK);
    const t0 = performance.now();
    for (let i = 0; i < blocks; i++) e.process(L, R, BLOCK);
    const ms = performance.now() - t0;
    console.log(`rendered 5 s of "${name}" with 8 keys held in ${ms.toFixed(0)} ms  => ${(ms / 5000 * 100).toFixed(1)}% of real time`);
  }
} else if (mode === 'modes') {
  const body = BODIES.indexOf(process.argv[3] ?? 'drum');
  if (body < 0) throw new Error(`no body "${process.argv[3]}"`);
  const d = newDesign();
  const f0 = naturalF0(body, 0.8, 0.5);
  designBody(d, body, f0, 0.8, 0.5, 0.3, 0.5, 0.3, 0);
  console.log(`${BODIES[body]}: ${d.n} modes, f0 ${f0.toFixed(1)} Hz, hi from ${d.hiFrom}, tension ${d.tension.toFixed(3)}, bloom ${d.bloom.toFixed(2)}`);
  for (let i = 0; i < d.n; i++) console.log(`  ${String(i).padStart(2)}  ${d.f[i].toFixed(1).padStart(8)} Hz  t60 ${d.t60[i].toFixed(3).padStart(6)} s  centre ${d.wC[i].toFixed(2)}  edge ${d.wE[i].toFixed(2)}  out ${d.wo[i].toFixed(2)}`);
} else if (mode === 'distance') {
  for (const dist of [2, 10, 50, 200, 800]) {
    const e = new SiegeEngine(FS);
    e.setParams({ u1Body: 0, u1Level: 0.9, u1Dist: dist, u1Hard: 0.8, tailMix: 0, early: 0, wind: 0 });
    const [L] = render(e, 4, [{ t: 0, fn: () => e.noteOn(48, 110) }]);
    let first = -1, peak = 0;
    for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]); if (a > peak) peak = a; if (first < 0 && a > 1e-3) first = i; }
    console.log(`${String(dist).padStart(4)} m: first sound at ${(first / FS).toFixed(3)} s (expected ${(dist / 343).toFixed(3)} s), peak ${db(peak)} dBFS`);
  }
} else {
  let ok = true;
  for (const pr of PRESETS) {
    const e = new SiegeEngine(FS);
    e.loadPreset(pr.values);
    const [L, R] = phrase(e, 10);
    ok = stats(L, R, pr.name.padEnd(24)) && ok;
    writeWav(`${outDir}/${pr.name.toLowerCase().replace(/\s+/g, '-')}.wav`, L, R);
  }
  if (!ok) { console.error('non-finite output!'); process.exit(1); }
}
