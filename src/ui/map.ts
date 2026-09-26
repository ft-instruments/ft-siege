// The displays: the seismograph strip in the header, a body view per unit
// (the drum head, plate, bell, bar, boots, barrel or horn, flashing on
// hits), the field map (units as formations at their distance and
// bearing, draggable), and the beat lamps. All draw in their window's
// accent colour (--accent-rgb).

import { BODIES, BODY_DRUM, BODY_TIMPANI, BODY_GONG, BODY_BELL, BODY_SHIELD, BODY_ANVIL, BODY_BLADE, BODY_LOG, BODY_BARS, BODY_LYRE, BODY_BOWED, BODY_FEET, BODY_HOOVES, BODY_CANNON, BODY_HORN, BODY_PIPE, BODY_FLUTE } from '../dsp/params.ts';

function accent(el: HTMLElement): string {
  return getComputedStyle(el).getPropertyValue('--accent-rgb').trim() || '255,122,26';
}

function setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { W: number; H: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W: r.width, H: r.height };
}

/** A strip chart of the output level, drawn right to left like a seismograph. */
export class Seismograph {
  private ctx: CanvasRenderingContext2D;
  private hist = new Float32Array(240);
  private idx = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);
  }
  update(scope: Float32Array, peak: number): void {
    // three samples per update: the block's peak, and the two half-block rms values, for a busier trace
    let s1 = 0, s2 = 0;
    for (let i = 0; i < 256; i++) { s1 += scope[i] * scope[i]; s2 += scope[256 + i] * scope[256 + i]; }
    this.push(Math.sqrt(s1 / 256) * 2); this.push(peak); this.push(Math.sqrt(s2 / 256) * 2);
    this.draw();
  }
  private push(v: number): void { this.hist[this.idx] = Math.min(1, v); this.idx = (this.idx + 1) % this.hist.length; }
  draw(): void {
    const { W, H } = setupCanvas(this.canvas, this.ctx);
    const ctx = this.ctx, ac = accent(this.canvas);
    ctx.clearRect(0, 0, W, H);
    // paper lines
    ctx.strokeStyle = `rgba(${ac},0.12)`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0.5; y < H; y += 8) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    const n = this.hist.length, cy = H / 2;
    ctx.strokeStyle = `rgba(${ac},0.9)`; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = this.hist[(this.idx + i) % n];
      const x = (i / (n - 1)) * W;
      const y = cy + (i & 1 ? 1 : -1) * v * (H / 2 - 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const last = this.hist[(this.idx + n - 1) % n];
    ctx.fillStyle = last > 0.95 ? 'rgba(220,40,40,0.9)' : `rgba(${ac},0.6)`;
    ctx.fillRect(W - 3, H - 3 - (H - 6) * last, 3, (H - 6) * last + 3);
  }
}

/** The body of a unit, drawn schematically, flashing and deforming on hits. */
export class BodyView {
  private ctx: CanvasRenderingContext2D;
  private flash = 0;
  private body = 0;
  private level = 0;
  private count = 1;
  private raf = 0;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);
  }
  set(body: number, count: number): void { if (body !== this.body || count !== this.count) { this.body = body; this.count = count; this.draw(); } }
  hit(strength: number, level: number): void {
    this.level = level;
    if (strength > 0) this.flash = Math.min(1, this.flash + 0.5 + strength * 0.1);
    this.draw();
    if (this.flash > 0.02 && !this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.flash *= 0.8; this.draw(); });
  }
  draw(): void {
    const { W, H } = setupCanvas(this.canvas, this.ctx);
    const ctx = this.ctx, ac = accent(this.canvas);
    ctx.clearRect(0, 0, W, H);
    const f = this.flash, cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.42;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${ac},${0.55 + 0.45 * f})`;
    ctx.fillStyle = `rgba(${ac},${0.08 + 0.35 * f})`;
    ctx.shadowColor = `rgba(${ac},${f})`; ctx.shadowBlur = 12 * f;
    const b = this.body;
    ctx.beginPath();
    switch (b) {
      case BODY_DRUM: {
        // the head seen at an angle, with the shell below it
        ctx.ellipse(cx, cy - s * 0.15, s * 1.9, s * (0.75 - 0.1 * f), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - s * 1.9, cy - s * 0.15); ctx.lineTo(cx - s * 1.9, cy + s * 0.6); ctx.moveTo(cx + s * 1.9, cy - s * 0.15); ctx.lineTo(cx + s * 1.9, cy + s * 0.6);
        ctx.ellipse(cx, cy + s * 0.6, s * 1.9, s * 0.6, 0, 0, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.15, s * 0.6, s * 0.24 * (1 - 0.5 * f), 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case BODY_TIMPANI: {
        // the kettle: a bowl under the head
        ctx.ellipse(cx, cy - s * 0.4, s * 1.6, s * (0.5 - 0.08 * f), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - s * 1.6, cy - s * 0.4); ctx.quadraticCurveTo(cx, cy + s * 1.6, cx + s * 1.6, cy - s * 0.4); ctx.stroke();
        break;
      }
      case BODY_BARS: {
        for (let i = 0; i < 7; i++) { const w = s * 0.34, h = s * (1.9 - i * 0.18); ctx.beginPath(); ctx.rect(cx - s * 1.5 + i * w * 1.3, cy - h / 2 + (i === 3 ? f * 3 : 0), w, h); ctx.fill(); ctx.stroke(); }
        break;
      }
      case BODY_LYRE: case BODY_BOWED: {
        // a frame with strings; the bow crosses them
        ctx.moveTo(cx - s * 1.2, cy + s * 0.9); ctx.quadraticCurveTo(cx - s * 1.3, cy - s * 1.2, cx - s * 0.6, cy - s * 0.9);
        ctx.lineTo(cx + s * 0.6, cy - s * 0.9); ctx.quadraticCurveTo(cx + s * 1.3, cy - s * 1.2, cx + s * 1.2, cy + s * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const x = cx - s * 0.9 + i * s * 0.36; ctx.moveTo(x, cy - s * 0.9); ctx.lineTo(x + (i === 2 ? f * 4 : 0), cy + s * 0.9); }
        ctx.stroke();
        if (b === BODY_BOWED) { ctx.beginPath(); ctx.moveTo(cx - s * 1.5, cy + s * 0.2 + f * 6); ctx.lineTo(cx + s * 1.5, cy - s * 0.2 + f * 6); ctx.stroke(); }
        break;
      }
      case BODY_FLUTE: {
        ctx.roundRect(cx - s * 1.8, cy - s * 0.25, s * 3.6, s * 0.5, s * 0.1); ctx.fill(); ctx.stroke();
        ctx.beginPath(); for (let i = 0; i < 5; i++) ctx.arc(cx - s * 0.6 + i * s * 0.5, cy, s * 0.1 + (f * (i === 1 ? 2 : 0)), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case BODY_GONG: {
        ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, s * (0.45 + 0.1 * f), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case BODY_BELL: {
        ctx.moveTo(cx - s * 0.25, cy - s); ctx.lineTo(cx + s * 0.25, cy - s);
        ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.3, cx + s * 0.9, cy + s * 0.7); ctx.lineTo(cx - s * 0.9, cy + s * 0.7);
        ctx.quadraticCurveTo(cx - s * 0.3, cy + s * 0.3, cx - s * 0.25, cy - s); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy + s * 0.75, s * 0.12 + f * 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case BODY_SHIELD: {
        ctx.moveTo(cx - s * 0.8, cy - s * 0.8); ctx.lineTo(cx + s * 0.8, cy - s * 0.8); ctx.lineTo(cx + s * 0.8, cy + s * 0.2);
        ctx.quadraticCurveTo(cx, cy + s * 1.1, cx - s * 0.8, cy + s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy - s * 0.1, s * 0.18 + f * 4, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case BODY_ANVIL: {
        ctx.moveTo(cx - s, cy - s * 0.3); ctx.lineTo(cx + s * 0.9, cy - s * 0.3); ctx.lineTo(cx + s * 0.5, cy + s * 0.1);
        ctx.lineTo(cx + s * 0.3, cy + s * 0.1); ctx.lineTo(cx + s * 0.4, cy + s * 0.7); ctx.lineTo(cx - s * 0.4, cy + s * 0.7);
        ctx.lineTo(cx - s * 0.3, cy + s * 0.1); ctx.lineTo(cx - s * 0.6, cy + s * 0.1); ctx.lineTo(cx - s, cy - s * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case BODY_BLADE: {
        ctx.moveTo(cx - s, cy + s * 0.5); ctx.lineTo(cx + s * 0.7, cy - s * 0.6 - f * 4); ctx.lineTo(cx + s, cy - s * 0.9);
        ctx.lineTo(cx + s * 0.75, cy - s * 0.3); ctx.lineTo(cx - s * 0.85, cy + s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case BODY_LOG: {
        ctx.roundRect(cx - s, cy - s * 0.4, s * 2, s * 0.8, s * 0.4); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx + s * 0.6, cy, s * 0.22, s * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case BODY_FEET: case BODY_HOOVES: {
        const n = Math.min(12, 2 + Math.round(Math.log2(this.count + 1)));
        for (let i = 0; i < n; i++) {
          const x = cx - s + (i % 6) * (s * 0.4) + (i >= 6 ? s * 0.2 : 0), y = cy - s * 0.4 + (i >= 6 ? s * 0.8 : 0) + (f * ((i & 1) ? 3 : -3));
          ctx.beginPath();
          if (b === BODY_FEET) ctx.ellipse(x, y, s * 0.12, s * 0.25, 0.2, 0, Math.PI * 2);
          else { ctx.arc(x, y, s * 0.16, Math.PI, 2 * Math.PI); ctx.lineTo(x + s * 0.16, y + s * 0.1); ctx.lineTo(x - s * 0.16, y + s * 0.1); ctx.closePath(); }
          ctx.fill(); ctx.stroke();
        }
        break;
      }
      case BODY_CANNON: {
        ctx.moveTo(cx - s, cy - s * 0.2); ctx.lineTo(cx + s * 0.9, cy - s * 0.35); ctx.lineTo(cx + s, cy + s * 0.05);
        ctx.lineTo(cx - s, cy + s * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx - s * 0.5, cy + s * 0.5, s * 0.32, 0, Math.PI * 2); ctx.stroke();
        if (f > 0.05) { ctx.beginPath(); ctx.arc(cx + s * 1.05, cy - s * 0.15, s * f * 0.8, 0, Math.PI * 2); ctx.fillStyle = `rgba(${ac},${f * 0.8})`; ctx.fill(); }
        break;
      }
      case BODY_HORN: case BODY_PIPE: {
        ctx.moveTo(cx - s, cy + s * 0.6); ctx.quadraticCurveTo(cx - s * 0.2, cy + s * 0.5, cx + s * 0.3, cy - s * 0.2);
        ctx.lineTo(cx + s, cy - s * 0.9 - f * 3); ctx.lineTo(cx + s, cy - s * 0.1); ctx.lineTo(cx + s * 0.4, cy + s * 0.05);
        ctx.quadraticCurveTo(cx - s * 0.2, cy + s * 0.75, cx - s, cy + s * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      default: ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // level bar
    ctx.fillStyle = `rgba(${ac},0.7)`;
    ctx.fillRect(0, H - 2, W * Math.min(1, this.level), 2);
  }
}

export interface MapUnit { body: number; count: number; dist: number; az: number; level: number; on: boolean }

/**
 * The field: the listener at the bottom, distance rings on a log scale up
 * to 800 m, each unit a formation of dots at its bearing and distance.
 * Drag a unit to move it; the callback gets the new distance and azimuth.
 */
export class FieldMap {
  private ctx: CanvasRenderingContext2D;
  private units: MapUnit[] = [];
  private terrain = 0;
  private wind = 0;
  private approach = 1;
  private dragging = -1;
  private hover = -1;
  constructor(private canvas: HTMLCanvasElement, private onMove: (i: number, dist: number, az: number) => void, private onSelect: (i: number) => void) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => {
      const i = this.pick(e.offsetX, e.offsetY);
      if (i >= 0) { this.dragging = i; canvas.setPointerCapture(e.pointerId); this.onSelect(i); this.move(e); }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging >= 0) this.move(e);
      else { const h = this.pick(e.offsetX, e.offsetY); if (h !== this.hover) { this.hover = h; canvas.style.cursor = h >= 0 ? 'grab' : 'default'; this.draw(); } }
    });
    const end = (e: PointerEvent) => { if (this.dragging >= 0) { canvas.releasePointerCapture(e.pointerId); this.dragging = -1; this.draw(); } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  setUnits(units: MapUnit[]): void { this.units = units; this.draw(); }
  setField(terrain: number, wind: number, approach: number): void { this.terrain = terrain; this.wind = wind; this.approach = approach; this.draw(); }

  // geometry: the listener at (W/2, H - 14); distance on a log scale 1..800 → 0..R; azimuth −1..1 → −80°..+80°
  private geom(): { ox: number; oy: number; R: number } {
    const r = this.canvas.getBoundingClientRect();
    return { ox: r.width / 2, oy: r.height - 16, R: Math.min(r.height - 46, r.width * 0.48) };
  }
  private toXY(dist: number, az: number): [number, number] {
    const { ox, oy, R } = this.geom();
    const rr = R * Math.log(Math.max(1, dist)) / Math.log(800);
    const a = az * 1.4;
    return [ox + Math.sin(a) * rr, oy - Math.cos(a) * rr];
  }
  private fromXY(x: number, y: number): [number, number] {
    const { ox, oy, R } = this.geom();
    const dx = x - ox, dy = oy - y;
    const rr = Math.max(0, Math.min(R, Math.hypot(dx, dy)));
    const dist = Math.exp(rr / R * Math.log(800));
    const az = Math.max(-1, Math.min(1, Math.atan2(dx, Math.max(1e-3, dy)) / 1.4));
    return [Math.max(1, Math.min(800, dist)), az];
  }
  private pick(x: number, y: number): number {
    let best = -1, bd = 22;
    this.units.forEach((u, i) => {
      if (!u.on) return;
      const [ux, uy] = this.toXY(u.dist, u.az);
      const d = Math.hypot(ux - x, uy - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  private move(e: PointerEvent): void {
    const [dist, az] = this.fromXY(e.offsetX, e.offsetY);
    const u = this.units[this.dragging];
    u.dist = dist; u.az = az;
    this.onMove(this.dragging, dist, az);
    this.draw();
  }

  draw(): void {
    const { W, H } = setupCanvas(this.canvas, this.ctx);
    if (W < 40 || H < 40) return;                      // hidden tab
    const ctx = this.ctx, ac = accent(this.canvas);
    const { ox, oy, R } = this.geom();
    ctx.clearRect(0, 0, W, H);
    // terrain backdrop
    ctx.save();
    ctx.strokeStyle = `rgba(${ac},0.2)`; ctx.fillStyle = `rgba(${ac},0.05)`; ctx.lineWidth = 1;
    switch (this.terrain) {
      case 1: { // valley: two slopes
        ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(W * 0.3, H * 0.55); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(W, 8); ctx.lineTo(W * 0.7, H * 0.55); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
        break;
      }
      case 2: { // walls: crenellations across the top
        ctx.beginPath(); ctx.moveTo(0, 26);
        for (let x = 0; x < W; x += 18) { ctx.lineTo(x, x % 36 ? 26 : 14); ctx.lineTo(x + 18, x % 36 ? 26 : 14); }
        ctx.lineTo(W, 32); ctx.lineTo(0, 32); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
      case 3: { // forest: tree marks
        for (let i = 0; i < 60; i++) {
          const x = ((i * 137.5) % W), y = 10 + ((i * 89.7) % (H * 0.6));
          ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + 4, y); ctx.lineTo(x + 8, y + 8); ctx.closePath(); ctx.fill();
        }
        break;
      }
      default: { // open field: a horizon
        ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(W, 18); ctx.stroke();
      }
    }
    ctx.restore();
    // distance rings
    ctx.strokeStyle = `rgba(${ac},0.25)`; ctx.fillStyle = `rgba(${ac},0.5)`; ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'left';
    for (const d of [3, 10, 30, 100, 300, 800]) {
      const rr = R * Math.log(d) / Math.log(800);
      ctx.beginPath(); ctx.arc(ox, oy, rr, Math.PI * 1.03, Math.PI * 1.97); ctx.stroke();
      ctx.fillText(`${d} m`, ox + rr * 0.05 + 3, oy - rr + 10);
    }
    // bearing lines
    ctx.beginPath();
    for (const a of [-1, -0.5, 0, 0.5, 1]) { ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.sin(a * 1.4) * R, oy - Math.cos(a * 1.4) * R); }
    ctx.stroke();
    // wind streaks
    if (Math.abs(this.wind) > 0.02) {
      ctx.strokeStyle = `rgba(${ac},${0.15 + 0.3 * Math.abs(this.wind)})`;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const y = 30 + i * 12, len = 20 + 40 * Math.abs(this.wind); const x0 = W - 30 - i * 9; ctx.moveTo(x0 - len, y); ctx.lineTo(x0, y); }
      ctx.stroke();
    }
    // approach progress: the army's line
    if (this.approach < 1) {
      ctx.strokeStyle = `rgba(${ac},0.5)`; ctx.setLineDash([4, 4]);
      const rr = R * (1 - this.approach * 0.8);
      ctx.beginPath(); ctx.arc(ox, oy, rr, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.setLineDash([]);
    }
    // the listener
    ctx.fillStyle = `rgba(${ac},0.9)`;
    ctx.beginPath(); ctx.moveTo(ox - 7, oy + 6); ctx.lineTo(ox, oy - 8); ctx.lineTo(ox + 7, oy + 6); ctx.closePath(); ctx.fill();
    // units
    this.units.forEach((u, i) => {
      if (!u.on) return;
      const [x, y] = this.toXY(u.dist, u.az);
      const sel = i === this.dragging || i === this.hover;
      const n = Math.min(64, Math.max(1, Math.round(1 + Math.log2(u.count) * 4)));
      const cols = Math.ceil(Math.sqrt(n));
      const cell = Math.max(3, 8 - cols);
      const w = cols * cell;
      const glow = Math.min(1, u.level * 3);
      ctx.shadowColor = `rgba(${ac},${glow})`; ctx.shadowBlur = 14 * glow;
      ctx.fillStyle = `rgba(${ac},${0.55 + 0.45 * glow})`;
      for (let k = 0; k < n; k++) {
        const c = k % cols, r = (k / cols) | 0;
        ctx.fillRect(x - w / 2 + c * cell, y - w / 2 + r * cell, cell - 1, cell - 1);
      }
      ctx.shadowBlur = 0;
      if (sel) { ctx.strokeStyle = `rgba(${ac},0.9)`; ctx.strokeRect(x - w / 2 - 4, y - w / 2 - 4, w + 8, w + 8); }
      ctx.fillStyle = `rgba(${ac},0.85)`; ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${'I II III IV V VI VII VIII'.split(' ')[i]} · ${BODIES[u.body]}${u.count > 1 ? ' ×' + u.count : ''}`, x, y + w / 2 + 12);
      ctx.fillStyle = `rgba(${ac},0.5)`;
      ctx.fillText(`${u.dist >= 10 ? u.dist.toFixed(0) : u.dist.toFixed(1)} m`, x, y - w / 2 - 6);
    });
  }
}

/** Four lamps for the march clock. */
export class BeatLamps {
  el: HTMLElement;
  private lamps: HTMLElement[] = [];
  private last = -1;
  constructor() {
    const el = document.createElement('div'); el.className = 'lamps';
    const l = document.createElement('span'); l.className = 'label'; l.textContent = 'beat'; el.append(l);
    for (let i = 0; i < 4; i++) { const d = document.createElement('i'); el.append(d); this.lamps.push(d); }
    this.el = el;
  }
  set(phase: number): void {
    const b = Math.floor(phase * 4) & 3;
    if (b === this.last) return;
    this.last = b;
    this.lamps.forEach((d, i) => d.classList.toggle('on', i === b));
  }
}
