// AudioWorklet wrapper around the DSP engine: forwards messages, calls
// engine.process(), and posts meters / scope data back for the UI.

import { SiegeEngine } from '../dsp/engine.ts';
import type { ParamId } from '../dsp/params.ts';

export type WorkletMessage =
  | { type: 'noteOn'; note: number; velocity: number }
  | { type: 'noteOff'; note: number }
  | { type: 'cc'; cc: number; value: number }
  | { type: 'bend'; value: number }
  | { type: 'param'; id: ParamId; value: number }
  | { type: 'params'; values: Partial<Record<ParamId, number>> }
  | { type: 'preset'; values: Partial<Record<ParamId, number>> }
  | { type: 'panic' };

export interface WorkletNote { type: 'note'; note: number; velocity: number }

export interface WorkletStats {
  type: 'stats';
  voices: number;
  load: number;       // fraction of the block period spent in process()
  peakL: number;
  peakR: number;
  scope: Float32Array;    // 512 L then 512 R, for the seismograph
  display: Uint8Array;    // unit levels, hits, distances, wind, approach … see SiegeEngine.display
}

class SiegeProcessor extends AudioWorkletProcessor {
  private engine = new SiegeEngine(sampleRate);
  private blockCount = 0;
  private busy = 0;
  private samples = 0;
  private peakL = 0; private peakR = 0;
  private hits = new Uint8Array(8);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<WorkletMessage>) => this.handle(e.data);
  }

  private handle(m: WorkletMessage): void {
    const e = this.engine;
    switch (m.type) {
      case 'noteOn': e.noteOn(m.note, m.velocity); break;
      case 'noteOff': e.noteOff(m.note); break;
      case 'cc': e.controlChange(m.cc, m.value); break;
      case 'bend': e.pitchBend(m.value); break;
      case 'param': e.setParam(m.id, m.value); break;
      case 'params': e.setParams(m.values); break;
      case 'preset': e.loadPreset(m.values); break;
      case 'panic': e.panic(); break;
    }
  }

  private scopeCopy(): Float32Array {
    const s = new Float32Array(1024);
    s.set(this.engine.scopeL, 0); s.set(this.engine.scopeR, 512);
    return s;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const L = out[0];
    const R = out[1] ?? out[0];
    const n = L.length;
    const t0 = Date.now();
    this.engine.process(L, R, n);
    this.busy += Date.now() - t0;
    this.samples += n;
    if (this.engine.peakL > this.peakL) this.peakL = this.engine.peakL;
    if (this.engine.peakR > this.peakR) this.peakR = this.engine.peakR;
    // hits are counted per block; accumulate them between stats
    for (let i = 0; i < 8; i++) this.hits[i] = Math.min(255, this.hits[i] + this.engine.display[i * 3 + 1]);
    if (++this.blockCount % 12 === 0) {
      const period = (this.samples / sampleRate) * 1000;
      const display = this.engine.display.slice();
      for (let i = 0; i < 8; i++) { display[i * 3 + 1] = this.hits[i]; this.hits[i] = 0; }
      const msg: WorkletStats = {
        type: 'stats',
        voices: this.engine.activeVoices,
        load: this.busy / period,
        peakL: this.peakL, peakR: this.peakR,
        scope: this.scopeCopy(),
        display,
      };
      this.port.postMessage(msg, [msg.scope.buffer, msg.display.buffer]);
      this.busy = 0; this.samples = 0; this.peakL = this.peakR = 0;
    }
    return true;
  }
}

registerProcessor('ft-siege', SiegeProcessor);
