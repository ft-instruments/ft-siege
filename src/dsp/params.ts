// The user-facing parameters of the instrument, as a flat list, plus the
// factory presets. `PARAMS` is what a plugin host would see; every value
// is a plain number. The instrument is an army of eight units; each unit
// is a body (or a horn), a strike, a crowd of them and a place on the
// field. The field itself (terrain, air, wind, the march) is global.

export type Scale = 'lin' | 'log' | 'int' | 'enum' | 'bool';

export interface ParamDef {
  id: string;
  name: string;
  group: string;
  min: number;
  max: number;
  def: number;
  scale: Scale;
  unit?: string;
  labels?: string[];   // for enum
}

/** What a unit is. Bodies are modal; horn and pipe are driven tubes. */
export const BODIES = ['drum', 'timpani', 'gong', 'bell', 'shield', 'anvil', 'blade', 'log', 'bars', 'lyre', 'bowed', 'feet', 'hooves', 'cannon', 'horn', 'pipe', 'flute'];
export const BODY_DRUM = 0, BODY_TIMPANI = 1, BODY_GONG = 2, BODY_BELL = 3, BODY_SHIELD = 4, BODY_ANVIL = 5, BODY_BLADE = 6,
  BODY_LOG = 7, BODY_BARS = 8, BODY_LYRE = 9, BODY_BOWED = 10, BODY_FEET = 11, BODY_HOOVES = 12, BODY_CANNON = 13, BODY_HORN = 14, BODY_PIPE = 15, BODY_FLUTE = 16;
/** Bodies that are driven tubes rather than struck things. */
export const TUBES = [BODY_HORN, BODY_PIPE, BODY_FLUTE];
/** Bodies that track the keys by default (melodic). */
export const MELODIC = [BODY_TIMPANI, BODY_BELL, BODY_BARS, BODY_LYRE, BODY_BOWED, BODY_HORN, BODY_PIPE, BODY_FLUTE];
/** What the "character" knob means for each body. */
export const CHARACTER = ['cavity', 'kettle', 'bloom', 'bloom', 'backing', 'ring', 'draw', 'hollow', 'resonator', 'body', 'bow', 'gait', 'gait', 'charge', 'rip', 'reed', 'breathy'];
export const ROLLS = ['off', '1/2', '1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'];
export const ROLL_BEATS = [0, 2, 1, 0.5, 1 / 3, 0.25, 1 / 6, 0.125];
export const TERRAINS = ['field', 'valley', 'walls', 'forest'];

const P = (id: string, name: string, group: string, min: number, max: number, def: number, scale: Scale = 'lin', unit?: string, labels?: string[]): ParamDef =>
  ({ id, name, group, min, max, def, scale, unit, labels });

export const UNITS = 8;
export const UNIT_PREFIX = Array.from({ length: UNITS }, (_, i) => `u${i + 1}`);

function unit(i: number): ParamDef[] {
  const pre = UNIT_PREFIX[i];
  const g = pre;
  return [
    P(`${pre}Body`, 'body', g, 0, BODIES.length - 1, 0, 'enum', undefined, BODIES),
    P(`${pre}Level`, 'level', g, 0, 1, i === 0 ? 0.8 : 0),
    // the body
    P(`${pre}Size`, 'size', g, 0.15, 4, 0.8, 'log', 'm'),
    P(`${pre}Tension`, 'tension', g, 0, 1, 0.5),
    P(`${pre}Damp`, 'damping', g, 0, 1, 0.3),
    P(`${pre}Char`, 'character', g, 0, 1, 0.5),
    // the strike
    P(`${pre}Hard`, 'hardness', g, 0, 1, 0.5),
    P(`${pre}Pos`, 'position', g, 0, 1, 0.35),
    P(`${pre}Grit`, 'grit', g, 0, 1, 0.2),
    P(`${pre}Bend`, 'bend', g, 0, 1, 0.3),
    // the horn (only read by horn / pipe bodies)
    P(`${pre}Partial`, 'partial', g, 1, 6, 2, 'int'),
    P(`${pre}Snap`, 'natural', g, 0, 1, 0, 'bool'),
    P(`${pre}Lip`, 'lip', g, 0.5, 2, 1, 'log'),
    P(`${pre}Breath`, 'breath', g, 0.005, 3, 0.08, 'log', 's'),
    P(`${pre}Growl`, 'growl', g, 0, 1, 0.1),
    // the crowd
    P(`${pre}Count`, 'count', g, 1, 2000, 1, 'log'),
    P(`${pre}Spread`, 'spread', g, 0, 2000, 60, 'lin', 'ms'),
    P(`${pre}Cohesion`, 'cohesion', g, 0, 1, 0.7),
    P(`${pre}Vary`, 'variation', g, 0, 1, 0.3),
    // the place
    P(`${pre}Dist`, 'distance', g, 1, 800, 8, 'log', 'm'),
    P(`${pre}Az`, 'azimuth', g, -1, 1, 0),
    // the keys
    P(`${pre}KeyLo`, 'key low', g, 0, 127, 0, 'int'),
    P(`${pre}KeyHi`, 'key high', g, 0, 127, 127, 'int'),
    P(`${pre}Track`, 'track keys', g, 0, 1, 0, 'bool'),
    P(`${pre}Root`, 'root', g, 24, 96, 48, 'int'),
    P(`${pre}Roll`, 'roll', g, 0, ROLLS.length - 1, 0, 'enum', undefined, ROLLS),
    P(`${pre}Accent`, 'accent', g, 0, 1, 0.3),
  ];
}

export const PARAMS: ParamDef[] = [
  // ---- the army
  ...unit(0), ...unit(1), ...unit(2), ...unit(3), ...unit(4), ...unit(5), ...unit(6), ...unit(7),
  // ---- the march
  P('tempo', 'tempo', 'march', 40, 200, 96, 'int', 'bpm'),
  P('approach', 'approach', 'march', 0, 60, 0, 'lin', 's'),
  P('approachFrom', 'from', 'march', 1, 8, 4, 'lin', '×'),
  P('rally', 'rally', 'march', 0, 30, 0, 'lin', 's'),
  P('vel', 'velocity', 'march', 0, 1, 0.6),
  P('bend', 'bend range', 'march', 0, 24, 2, 'int', 'st'),
  // ---- the field
  P('terrain', 'terrain', 'field', 0, TERRAINS.length - 1, 0, 'enum', undefined, TERRAINS),
  P('early', 'echoes', 'field', 0, 1, 0.5),
  P('tailMix', 'tail', 'field', 0, 1, 0.25),
  P('tailDecay', 'roll-off', 'field', 0.3, 12, 2.5, 'log', 's'),
  P('tailTone', 'tone', 'field', 0, 1, 0.35),
  P('ground', 'ground', 'field', 0, 1, 0.5),
  P('air', 'humidity', 'field', 0, 1, 0.5),
  P('latency', 'arrive late', 'field', 0, 1, 0, 'bool'),
  P('proximity', 'proximity', 'field', 0, 1, 0.5),
  // ---- the weather
  P('wind', 'wind', 'weather', 0, 1, 0.2),
  P('gust', 'gust', 'weather', 0.05, 3, 0.4, 'log', 'Hz'),
  P('windBed', 'wind bed', 'weather', 0, 1, 0),
  // ---- out
  P('volume', 'volume', 'out', 0, 1, 0.7),
];

export type ParamId = string;
export type ParamValues = Record<ParamId, number>;

export const PARAM_BY_ID: Record<string, ParamDef> = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

export function defaults(): ParamValues {
  const v: ParamValues = {};
  for (const p of PARAMS) v[p.id] = p.def;
  return v;
}

/** 0..1 knob position -> value, honouring the parameter's scale. */
export function fromNorm(p: ParamDef, t: number): number {
  t = Math.min(1, Math.max(0, t));
  switch (p.scale) {
    case 'log': return p.min * Math.pow(p.max / p.min, t);
    case 'int': case 'enum': case 'bool': return Math.round(p.min + t * (p.max - p.min));
    default: return p.min + t * (p.max - p.min);
  }
}

export function toNorm(p: ParamDef, v: number): number {
  v = Math.min(p.max, Math.max(p.min, v));
  if (p.scale === 'log') return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(n: number): string { n = Math.round(n); return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`; }

export function format(p: ParamDef, v: number): string {
  if (p.labels) return p.labels[Math.round(v)] ?? String(v);
  if (p.scale === 'bool') return v >= 0.5 ? 'on' : 'off';
  if (p.id.endsWith('KeyLo') || p.id.endsWith('KeyHi') || p.id.endsWith('Root')) return noteName(v);
  if (p.id.endsWith('Count')) return String(Math.round(v));
  if (p.id.endsWith('Az')) return Math.abs(v) < 0.005 ? 'ahead' : `${v < 0 ? 'L' : 'R'} ${Math.round(Math.abs(v) * 80)}°`;
  if (p.scale === 'int') return `${Math.round(v)}${p.unit ? ' ' + p.unit : ''}`;
  if (p.unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : v >= 100 ? `${v.toFixed(0)} Hz` : `${v.toFixed(2)} Hz`;
  if (p.unit === 's') return v >= 1 ? `${v.toFixed(2)} s` : `${(v * 1000).toFixed(0)} ms`;
  if (p.unit === 'ms') return `${v.toFixed(0)} ms`;
  if (p.unit === 'm') return v >= 10 ? `${v.toFixed(0)} m` : `${v.toFixed(2)} m`;
  if (p.unit === '×') return `${v.toFixed(1)}×`;
  // plain amounts read as percentages; bipolar ones keep their sign
  if (p.min < 0) return (v >= 0 ? '+' : '−') + `${Math.round(Math.abs(v) * 100)}%`;
  return `${Math.round(v * 100)}%`;
}

export interface Preset {
  name: string;
  tag: string;
  values: Partial<ParamValues>;
}

/** Compact unit definitions for presets: `U(0, { Body: 1, Level: 0.8 })` → `{ u1Body: 1, u1Level: 0.8 }`. */
const U = (i: number, v: Record<string, number>): Partial<ParamValues> =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [`${UNIT_PREFIX[i]}${k}`, x]));

// Presets only list what differs from the defaults. Every preset that uses
// several units gives each a key range; the render script plays C2–G4 so
// they should all speak in that band.
export const PRESETS: Preset[] = [
  // ------------------------------------------------------------ drums
  {
    name: 'Taiko Line', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 1.3, Tension: 0.35, Damp: 0.25, Char: 0.8, Hard: 0.45, Pos: 0.3, Grit: 0.25, Bend: 0.5, Count: 12, Spread: 45, Cohesion: 0.8, Vary: 0.3, Dist: 14, Az: 0 }),
      terrain: 1, early: 0.5, tailMix: 0.3, tailDecay: 3, ground: 0.6, wind: 0.15,
    },
  },
  {
    name: 'War Drum Solo', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.95, Size: 1.6, Tension: 0.3, Damp: 0.2, Char: 0.9, Hard: 0.85, Pos: 0.25, Grit: 0.3, Bend: 0.8, Count: 1, Dist: 4, Az: -0.1 }),
      proximity: 0.8, terrain: 0, early: 0.3, tailMix: 0.2, tailDecay: 2, wind: 0.1,
    },
  },
  {
    name: 'Frame Drum Circle', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.85, Size: 0.45, Tension: 0.7, Damp: 0.4, Char: 0.2, Hard: 0.3, Pos: 0.5, Grit: 0.4, Bend: 0.25, Count: 9, Spread: 80, Cohesion: 0.55, Vary: 0.5, Dist: 6, Az: 0 }),
      terrain: 2, early: 0.6, tailMix: 0.25, tailDecay: 1.2, tailTone: 0.5,
    },
  },
  {
    name: 'Pitched Toms', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 0.6, Tension: 0.55, Damp: 0.35, Char: 0.5, Hard: 0.6, Pos: 0.4, Grit: 0.2, Bend: 0.6, Track: 1, Root: 48, Dist: 5 }),
      terrain: 0, tailMix: 0.15, tailDecay: 1.5,
    },
  },
  {
    name: 'Distant Drums', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 1, Size: 1.4, Tension: 0.35, Damp: 0.2, Char: 0.8, Hard: 0.5, Pos: 0.3, Count: 20, Spread: 120, Cohesion: 0.6, Vary: 0.4, Dist: 420, Az: 0.3 }),
      terrain: 1, early: 0.7, tailMix: 0.45, tailDecay: 5, tailTone: 0.25, ground: 0.4, air: 0.6, wind: 0.5, gust: 0.25, windBed: 0.35,
    },
  },
  {
    name: 'Drums Both Flanks', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.8, Size: 1.2, Tension: 0.4, Damp: 0.25, Char: 0.7, Hard: 0.5, Count: 8, Spread: 60, Cohesion: 0.75, Dist: 60, Az: -0.85, KeyLo: 0, KeyHi: 59 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 0.9, Tension: 0.5, Damp: 0.3, Char: 0.6, Hard: 0.6, Count: 8, Spread: 60, Cohesion: 0.75, Dist: 90, Az: 0.85, KeyLo: 60, KeyHi: 127 }),
      terrain: 1, early: 0.6, tailMix: 0.35, tailDecay: 3.5, wind: 0.3,
    },
  },
  {
    name: 'Drum Roll', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 0.5, Tension: 0.8, Damp: 0.5, Char: 0.3, Hard: 0.7, Pos: 0.45, Grit: 0.3, Bend: 0.2, Count: 4, Spread: 25, Cohesion: 0.5, Vary: 0.4, Dist: 6, Roll: 7, Accent: 0.5 }),
      tempo: 110, terrain: 2, early: 0.5, tailMix: 0.2, tailDecay: 1,
    },
  },
  // ------------------------------------------------------------ metal
  {
    name: 'Shield Wall', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_SHIELD, Level: 0.98, Size: 0.7, Tension: 0.5, Damp: 0.5, Char: 0.6, Hard: 0.7, Pos: 0.5, Grit: 0.6, Count: 200, Spread: 220, Cohesion: 0.75, Vary: 0.5, Dist: 25, Az: 0 }),
      terrain: 0, early: 0.4, tailMix: 0.3, tailDecay: 2, ground: 0.6,
    },
  },
  {
    name: 'Tam-tam', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.42, Size: 1.1, Tension: 0.4, Damp: 0.1, Char: 0.85, Hard: 0.2, Pos: 0.3, Grit: 0.1, Bend: 0.2, Count: 1, Dist: 5 }),
      terrain: 2, early: 0.3, tailMix: 0.35, tailDecay: 4, tailTone: 0.5,
    },
  },
  {
    name: 'Temple Bell', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.8, Size: 0.9, Tension: 0.5, Damp: 0.05, Char: 0.3, Hard: 0.6, Pos: 0.2, Grit: 0.05, Bend: 0.05, Track: 1, Root: 60, Dist: 40, Az: 0.2 }),
      terrain: 1, early: 0.6, tailMix: 0.45, tailDecay: 6, tailTone: 0.4, wind: 0.2,
    },
  },
  {
    name: 'Anvil Chorus', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_ANVIL, Level: 0.45, Size: 0.5, Tension: 0.6, Damp: 0.3, Char: 0.7, Hard: 0.95, Pos: 0.3, Grit: 0.3, Track: 1, Root: 60, Count: 3, Spread: 40, Cohesion: 0.4, Vary: 0.5, Dist: 7 }),
      terrain: 2, early: 0.7, tailMix: 0.3, tailDecay: 1.8, tailTone: 0.6,
    },
  },
  {
    name: 'Blade Draw', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_BLADE, Level: 0.7, Size: 0.9, Tension: 0.5, Damp: 0.3, Char: 0.55, Hard: 0.9, Pos: 0.6, Grit: 0.5, Bend: 0, Track: 1, Root: 72, Dist: 2 }),
      terrain: 0, tailMix: 0.15, tailDecay: 1.2, tailTone: 0.6, proximity: 0.3,
    },
  },
  {
    name: 'Blade Clash', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_BLADE, Level: 0.8, Size: 0.8, Tension: 0.6, Damp: 0.25, Char: 0, Hard: 1, Pos: 0.15, Grit: 0.2, Track: 1, Root: 72, Count: 2, Spread: 12, Cohesion: 0.5, Vary: 0.6, Dist: 3 }),
      ...U(1, { Body: BODY_SHIELD, Level: 0.5, Size: 0.6, Damp: 0.6, Char: 0.5, Hard: 0.8, Grit: 0.5, Count: 1, Dist: 3, KeyLo: 0, KeyHi: 59 }),
      terrain: 2, early: 0.5, tailMix: 0.2, tailDecay: 1.5,
    },
  },
  {
    name: 'Gong Bloom', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.38, Size: 1.6, Tension: 0.3, Damp: 0.05, Char: 1, Hard: 0.1, Pos: 0.5, Grit: 0.05, Bend: 0.3, Dist: 4 }),
      terrain: 3, early: 0.4, tailMix: 0.4, tailDecay: 8, tailTone: 0.45, proximity: 0.4,
    },
  },
  // ------------------------------------------------------------ horns
  {
    name: 'Carnyx Over The Ridge', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 1.6, Damp: 0.3, Char: 0.6, Partial: 3, Snap: 0, Lip: 1, Breath: 0.12, Growl: 0.25, Track: 1, Root: 48, Count: 1, Dist: 600, Az: 0.4 }),
      terrain: 1, early: 0.8, tailMix: 0.5, tailDecay: 6, tailTone: 0.3, air: 0.7, wind: 0.45, gust: 0.3, windBed: 0.3,
    },
  },
  {
    name: 'Natural Horn', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.75, Size: 1.2, Damp: 0.35, Char: 0.4, Partial: 2, Snap: 1, Lip: 1, Breath: 0.05, Growl: 0.05, Track: 1, Root: 43, Dist: 12 }),
      terrain: 3, early: 0.5, tailMix: 0.35, tailDecay: 3, tailTone: 0.4,
    },
  },
  {
    name: 'Braam', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.9, Size: 2.5, Damp: 0.2, Char: 0.9, Partial: 2, Snap: 0, Lip: 0.92, Breath: 0.6, Growl: 0.5, Track: 1, Root: 36, Count: 3, Spread: 90, Cohesion: 0.4, Vary: 0.6, Dist: 30, Az: 0 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.7, Size: 2.2, Tension: 0.2, Damp: 0.15, Char: 1, Hard: 0.3, Bend: 0.7, Count: 6, Spread: 40, Cohesion: 0.9, Dist: 20, KeyLo: 0, KeyHi: 47 }),
      terrain: 2, early: 0.5, tailMix: 0.5, tailDecay: 5, tailTone: 0.3, proximity: 0.7, wind: 0.2,
    },
  },
  {
    name: 'Cracked Signal', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 1, Damp: 0.4, Char: 1, Partial: 4, Snap: 1, Lip: 1.15, Breath: 0.03, Growl: 0.35, Track: 1, Root: 48, Dist: 90, Az: -0.6 }),
      terrain: 1, early: 0.7, tailMix: 0.4, tailDecay: 4, air: 0.5, wind: 0.3,
    },
  },
  {
    name: 'Ship Horn', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.9, Size: 3.5, Damp: 0.15, Char: 0.2, Partial: 1, Snap: 0, Lip: 1, Breath: 0.8, Growl: 0.15, Track: 1, Root: 36, Count: 2, Spread: 30, Cohesion: 0.8, Vary: 0.2, Dist: 250, Az: 0.7 }),
      terrain: 0, early: 0.2, tailMix: 0.4, tailDecay: 7, tailTone: 0.2, air: 0.9, wind: 0.6, gust: 0.15, windBed: 0.5,
    },
  },
  {
    name: 'Pipes And Drones', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_PIPE, Level: 0.7, Size: 0.5, Damp: 0.4, Char: 0.6, Partial: 1, Lip: 1, Breath: 0.02, Growl: 0.1, Track: 1, Root: 60, KeyLo: 55, KeyHi: 127, Dist: 8 }),
      ...U(1, { Body: BODY_PIPE, Level: 0.55, Size: 1, Damp: 0.4, Char: 0.5, Partial: 1, Lip: 1, Breath: 0.4, Growl: 0.05, Track: 1, Root: 48, KeyLo: 0, KeyHi: 54, Count: 3, Spread: 20, Cohesion: 0.9, Vary: 0.3, Dist: 8, Az: 0.3 }),
      terrain: 0, early: 0.3, tailMix: 0.25, tailDecay: 2.5, tailTone: 0.45,
    },
  },
  {
    name: 'Horn Section', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.75, Size: 1.4, Damp: 0.3, Char: 0.3, Partial: 2, Snap: 0, Lip: 1, Breath: 0.15, Growl: 0.1, Track: 1, Root: 48, Count: 6, Spread: 60, Cohesion: 0.7, Vary: 0.3, Dist: 25 }),
      terrain: 2, early: 0.6, tailMix: 0.4, tailDecay: 3, tailTone: 0.4,
    },
  },
  // ------------------------------------------------------------ crowds
  {
    name: 'March Of Two Thousand', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_FEET, Level: 1, Size: 1, Damp: 0.5, Char: 0.4, Hard: 0.4, Grit: 0.7, Count: 2000, Spread: 260, Cohesion: 0.3, Vary: 0.6, Dist: 30, Az: 0, Roll: 3 }),
      tempo: 108, terrain: 0, early: 0.3, tailMix: 0.3, tailDecay: 2.5, ground: 0.7, wind: 0.25,
    },
  },
  {
    name: 'Drill Square', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_FEET, Level: 0.9, Size: 0.8, Damp: 0.6, Char: 0.2, Hard: 0.6, Grit: 0.6, Count: 120, Spread: 40, Cohesion: 0.95, Vary: 0.2, Dist: 15, Roll: 3 }),
      tempo: 120, terrain: 2, early: 0.7, tailMix: 0.2, tailDecay: 1.4, ground: 0.9,
    },
  },
  {
    name: 'Cavalry', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_HOOVES, Level: 0.71, Size: 1, Damp: 0.5, Char: 0.7, Hard: 0.7, Grit: 0.6, Count: 300, Spread: 380, Cohesion: 0.2, Vary: 0.7, Dist: 120, Az: -0.5, Roll: 5 }),
      tempo: 150, terrain: 0, early: 0.2, tailMix: 0.25, tailDecay: 2, ground: 0.8, approach: 25, approachFrom: 5, wind: 0.3,
    },
  },
  {
    name: 'Stampede', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_HOOVES, Level: 0.55, Size: 1.4, Damp: 0.4, Char: 0.5, Hard: 0.5, Grit: 0.8, Count: 800, Spread: 900, Cohesion: 0, Vary: 0.9, Dist: 40, Az: 0.3, Roll: 4 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.22, Size: 2.5, Tension: 0.15, Damp: 0.3, Char: 1, Hard: 0.2, Count: 40, Spread: 700, Cohesion: 0, Dist: 40 }),
      tempo: 140, terrain: 0, early: 0.2, tailMix: 0.3, tailDecay: 3, ground: 0.9, proximity: 0.6, wind: 0.5, windBed: 0.2,
    },
  },
  {
    name: 'Spears On Ground', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.99, Size: 0.5, Damp: 0.5, Char: 0.3, Hard: 0.8, Pos: 0.5, Grit: 0.5, Count: 400, Spread: 90, Cohesion: 0.85, Vary: 0.5, Dist: 30, Roll: 2, Accent: 0.6 }),
      tempo: 84, terrain: 0, early: 0.3, tailMix: 0.3, tailDecay: 2.2, ground: 0.8,
    },
  },
  {
    name: 'Shields Locking', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_SHIELD, Level: 0.63, Size: 0.75, Tension: 0.4, Damp: 0.55, Char: 0.8, Hard: 0.5, Pos: 0.6, Grit: 0.8, Count: 600, Spread: 700, Cohesion: 0.15, Vary: 0.7, Dist: 18 }),
      terrain: 0, early: 0.3, tailMix: 0.25, tailDecay: 2, ground: 0.7,
    },
  },
  {
    name: 'Rout', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_FEET, Level: 0.54, Size: 0.9, Damp: 0.5, Char: 0.6, Hard: 0.5, Grit: 0.8, Count: 500, Spread: 1500, Cohesion: 0, Vary: 0.9, Dist: 25, Az: -0.3, Roll: 5 }),
      ...U(1, { Body: BODY_SHIELD, Level: 0.3, Size: 0.7, Damp: 0.6, Char: 0.5, Hard: 0.6, Grit: 0.7, Count: 60, Spread: 1800, Cohesion: 0, Vary: 0.9, Dist: 30, Az: 0.5 }),
      ...U(2, { Body: BODY_BLADE, Level: 0.24, Size: 0.8, Damp: 0.3, Char: 0, Hard: 1, Count: 20, Spread: 1600, Cohesion: 0, Vary: 0.9, Dist: 35, Az: 0.1, Track: 0, Root: 72 }),
      tempo: 132, terrain: 2, early: 0.6, tailMix: 0.35, tailDecay: 2.5, ground: 0.8, wind: 0.4, gust: 0.8,
    },
  },
  // ------------------------------------------------------------ cannon
  {
    name: 'Cannon 50 m', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 1, Size: 1.2, Damp: 0.3, Char: 0.8, Hard: 0.7, Grit: 0.5, Count: 1, Dist: 50, Az: 0.2 }),
      terrain: 1, early: 0.8, tailMix: 0.5, tailDecay: 6, tailTone: 0.25, ground: 0.6, proximity: 0.9,
    },
  },
  {
    name: 'Cannon 800 m', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 1, Size: 1.5, Damp: 0.2, Char: 1, Hard: 0.6, Grit: 0.4, Count: 1, Dist: 800, Az: -0.4 }),
      terrain: 1, early: 0.9, tailMix: 0.6, tailDecay: 10, tailTone: 0.15, ground: 0.5, air: 0.7, wind: 0.5, gust: 0.2, windBed: 0.4,
    },
  },
  {
    name: 'Battery', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 0.99, Size: 1.1, Damp: 0.3, Char: 0.7, Hard: 0.7, Grit: 0.5, Count: 6, Spread: 500, Cohesion: 0.3, Vary: 0.5, Dist: 200, Az: -0.7, KeyLo: 0, KeyHi: 59 }),
      ...U(1, { Body: BODY_CANNON, Level: 0.99, Size: 0.9, Damp: 0.35, Char: 0.6, Hard: 0.8, Grit: 0.5, Count: 4, Spread: 400, Cohesion: 0.3, Vary: 0.5, Dist: 300, Az: 0.7, KeyLo: 60, KeyHi: 127 }),
      terrain: 1, early: 0.9, tailMix: 0.55, tailDecay: 8, tailTone: 0.2, ground: 0.5, air: 0.6, wind: 0.35,
    },
  },
  {
    name: 'Siege Gate', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.48, Size: 3.5, Damp: 0.25, Char: 0.8, Hard: 0.3, Pos: 0.2, Grit: 0.7, Bend: 0.4, Count: 30, Spread: 900, Cohesion: 0.1, Vary: 0.8, Dist: 12 }),
      ...U(1, { Body: BODY_ANVIL, Level: 0.17, Size: 1.5, Damp: 0.5, Char: 0.3, Hard: 0.9, Grit: 0.4, Count: 15, Spread: 1200, Cohesion: 0, Vary: 0.9, Dist: 12, Az: 0.2 }),
      ...U(2, { Body: BODY_CANNON, Level: 0.29, Size: 2, Damp: 0.4, Char: 0.5, Hard: 0.3, Count: 1, Dist: 12 }),
      terrain: 2, early: 0.7, tailMix: 0.4, tailDecay: 4, tailTone: 0.3, ground: 0.8, proximity: 0.8,
    },
  },
  // ------------------------------------------------------------ the field (kits)
  {
    name: 'Battlefield Kit', tag: 'field',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 1.5, Tension: 0.3, Damp: 0.2, Char: 0.9, Hard: 0.5, Bend: 0.6, Count: 8, Spread: 50, Cohesion: 0.8, Dist: 15, KeyLo: 36, KeyHi: 41 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 0.6, Tension: 0.6, Damp: 0.35, Char: 0.4, Hard: 0.6, Count: 4, Spread: 30, Cohesion: 0.7, Dist: 10, Az: -0.4, KeyLo: 42, KeyHi: 47 }),
      ...U(2, { Body: BODY_SHIELD, Level: 0.7, Size: 0.7, Damp: 0.5, Char: 0.6, Hard: 0.7, Grit: 0.6, Count: 100, Spread: 150, Cohesion: 0.7, Dist: 25, Az: 0.4, KeyLo: 48, KeyHi: 53 }),
      ...U(3, { Body: BODY_FEET, Level: 0.9, Size: 1, Damp: 0.5, Char: 0.3, Hard: 0.4, Grit: 0.7, Count: 800, Spread: 200, Cohesion: 0.4, Dist: 50, KeyLo: 54, KeyHi: 59 }),
      ...U(4, { Body: BODY_HORN, Level: 0.7, Size: 1.6, Damp: 0.3, Char: 0.5, Partial: 3, Lip: 1, Breath: 0.1, Growl: 0.2, Track: 1, Root: 60, Dist: 120, Az: 0.6, KeyLo: 60, KeyHi: 71 }),
      ...U(5, { Body: BODY_ANVIL, Level: 0.6, Size: 0.5, Damp: 0.4, Char: 0.6, Hard: 0.95, Grit: 0.3, Dist: 6, Az: -0.6, KeyLo: 72, KeyHi: 77 }),
      ...U(6, { Body: BODY_CANNON, Level: 0.9, Size: 1.2, Damp: 0.3, Char: 0.8, Hard: 0.7, Grit: 0.5, Dist: 300, Az: -0.2, KeyLo: 78, KeyHi: 83 }),
      ...U(7, { Body: BODY_BELL, Level: 0.6, Size: 1.2, Damp: 0.05, Char: 0.3, Hard: 0.5, Track: 1, Root: 84, Dist: 80, Az: 0.8, KeyLo: 84, KeyHi: 127 }),
      terrain: 1, early: 0.6, tailMix: 0.4, tailDecay: 4, tailTone: 0.3, ground: 0.6, wind: 0.3, windBed: 0.15,
    },
  },
  {
    name: 'Quiet War', tag: 'field',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.7, Size: 1.4, Tension: 0.3, Damp: 0.2, Char: 0.8, Hard: 0.35, Count: 3, Spread: 200, Cohesion: 0.3, Dist: 500, Az: -0.5, KeyLo: 0, KeyHi: 47 }),
      ...U(1, { Body: BODY_HORN, Level: 0.6, Size: 1.5, Damp: 0.35, Char: 0.5, Partial: 3, Lip: 1, Breath: 0.3, Growl: 0.2, Track: 1, Root: 60, Dist: 700, Az: 0.6, KeyLo: 48, KeyHi: 71 }),
      ...U(2, { Body: BODY_BLADE, Level: 0.5, Size: 0.9, Damp: 0.3, Char: 0.35, Hard: 0.9, Grit: 0.4, Track: 1, Root: 84, Dist: 1.5, KeyLo: 72, KeyHi: 127 }),
      terrain: 1, early: 0.8, tailMix: 0.5, tailDecay: 7, tailTone: 0.2, air: 0.7, wind: 0.6, gust: 0.2, windBed: 0.5, proximity: 0.3,
    },
  },
  {
    name: 'Approach', tag: 'field',
    values: {
      ...U(0, { Body: BODY_FEET, Level: 1, Size: 1, Damp: 0.5, Char: 0.4, Hard: 0.4, Grit: 0.7, Count: 1500, Spread: 240, Cohesion: 0.35, Vary: 0.6, Dist: 30, Roll: 3, KeyLo: 0, KeyHi: 59 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.9, Size: 1.3, Tension: 0.35, Damp: 0.25, Char: 0.8, Hard: 0.5, Count: 10, Spread: 50, Cohesion: 0.8, Dist: 30, Roll: 2, Accent: 0.6, KeyLo: 60, KeyHi: 127 }),
      tempo: 104, approach: 40, approachFrom: 8, rally: 20, terrain: 0, early: 0.3, tailMix: 0.35, tailDecay: 3, ground: 0.6, air: 0.5, wind: 0.35,
    },
  },
  {
    name: 'The Charge', tag: 'field',
    values: {
      ...U(0, { Body: BODY_HOOVES, Level: 0.9, Size: 1.1, Damp: 0.45, Char: 0.6, Hard: 0.6, Grit: 0.7, Count: 400, Spread: 300, Cohesion: 0.3, Vary: 0.7, Dist: 25, Roll: 5, KeyLo: 0, KeyHi: 47 }),
      ...U(1, { Body: BODY_HORN, Level: 0.8, Size: 1.2, Damp: 0.3, Char: 0.8, Partial: 3, Snap: 1, Lip: 1.05, Breath: 0.04, Growl: 0.3, Track: 1, Root: 48, Count: 4, Spread: 80, Cohesion: 0.5, Vary: 0.5, Dist: 40, Az: 0.3, KeyLo: 48, KeyHi: 83 }),
      ...U(2, { Body: BODY_SHIELD, Level: 0.6, Size: 0.7, Damp: 0.5, Char: 0.6, Hard: 0.7, Grit: 0.7, Count: 300, Spread: 400, Cohesion: 0.2, Dist: 30, Az: -0.4, KeyLo: 84, KeyHi: 127 }),
      tempo: 160, approach: 15, approachFrom: 4, terrain: 0, early: 0.3, tailMix: 0.3, tailDecay: 2.5, ground: 0.8, proximity: 0.6, wind: 0.4,
    },
  },
  {
    name: 'Night Watch', tag: 'field',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.6, Size: 1.5, Damp: 0.05, Char: 0.2, Hard: 0.4, Pos: 0.2, Track: 1, Root: 72, Dist: 150, Az: -0.7, KeyLo: 60, KeyHi: 127 }),
      ...U(1, { Body: BODY_LOG, Level: 0.6, Size: 0.6, Damp: 0.5, Char: 0.4, Hard: 0.5, Grit: 0.4, Count: 2, Spread: 90, Cohesion: 0.3, Vary: 0.5, Dist: 20, Az: 0.5, KeyLo: 0, KeyHi: 59 }),
      terrain: 2, early: 0.7, tailMix: 0.5, tailDecay: 6, tailTone: 0.35, wind: 0.5, gust: 0.15, windBed: 0.6, air: 0.8,
    },
  },
  {
    name: 'Forge', tag: 'field',
    values: {
      ...U(0, { Body: BODY_ANVIL, Level: 0.6, Size: 0.45, Damp: 0.35, Char: 0.8, Hard: 1, Pos: 0.3, Grit: 0.3, Track: 1, Root: 60, Dist: 3, KeyLo: 60, KeyHi: 127 }),
      ...U(1, { Body: BODY_LOG, Level: 0.6, Size: 0.8, Damp: 0.6, Char: 0.5, Hard: 0.5, Grit: 0.6, Dist: 4, Az: -0.5, KeyLo: 36, KeyHi: 47 }),
      ...U(2, { Body: BODY_PIPE, Level: 0.45, Size: 1.8, Damp: 0.3, Char: 0.9, Partial: 1, Lip: 1, Breath: 1.5, Growl: 0.6, Track: 1, Root: 36, Dist: 3, Az: 0.5, KeyLo: 0, KeyHi: 35 }),
      terrain: 2, early: 0.8, tailMix: 0.3, tailDecay: 1.6, tailTone: 0.5, proximity: 0.5,
    },
  },
  // ------------------------------------------------------------ instruments
  {
    name: 'Timpani', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_TIMPANI, Level: 0.9, Size: 0.75, Tension: 0.5, Damp: 0.2, Char: 0.8, Hard: 0.35, Pos: 0.75, Grit: 0.1, Bend: 0.4, Track: 1, Dist: 6, Az: -0.2 }),
      terrain: 2, early: 0.5, tailMix: 0.3, tailDecay: 2.5, tailTone: 0.4,
    },
  },
  {
    name: 'Timpani Roll', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_TIMPANI, Level: 0.85, Size: 0.8, Tension: 0.5, Damp: 0.25, Char: 0.8, Hard: 0.25, Pos: 0.75, Grit: 0.1, Bend: 0.3, Track: 1, Count: 2, Spread: 30, Cohesion: 0.3, Vary: 0.3, Dist: 8, Roll: 7, Accent: 0.4 }),
      tempo: 100, terrain: 2, early: 0.5, tailMix: 0.35, tailDecay: 3,
    },
  },
  {
    name: 'War Lyre', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.9, Size: 0.6, Tension: 0.3, Damp: 0.2, Char: 0.6, Hard: 0.8, Pos: 0.6, Grit: 0.15, Bend: 0.2, Track: 1, Dist: 2 }),
      terrain: 0, early: 0.3, tailMix: 0.25, tailDecay: 2, tailTone: 0.5, proximity: 0.2,
    },
  },
  {
    name: 'Lament', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.8, Size: 0.9, Tension: 0.2, Damp: 0.15, Char: 0.8, Hard: 0.5, Pos: 0.35, Grit: 0.1, Bend: 0.1, Track: 1, Dist: 4 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.5, Size: 1.6, Tension: 0.3, Damp: 0.2, Char: 0.8, Hard: 0.3, Count: 3, Spread: 200, Cohesion: 0.2, Dist: 300, Az: -0.5, KeyLo: 0, KeyHi: 47 }),
      terrain: 1, early: 0.7, tailMix: 0.5, tailDecay: 6, tailTone: 0.3, air: 0.6, wind: 0.4, gust: 0.2, windBed: 0.25,
    },
  },
  {
    name: 'Hurdy-Gurdy', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.64, Size: 0.7, Tension: 0.3, Damp: 0.3, Char: 0.55, Hard: 0.5, Pos: 0.9, Grit: 0.3, Track: 1, KeyLo: 55, KeyHi: 127, Dist: 3 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.48, Size: 1.2, Tension: 0.3, Damp: 0.3, Char: 0.7, Hard: 0.5, Pos: 0.9, Grit: 0.3, Track: 1, KeyLo: 0, KeyHi: 54, Count: 2, Spread: 40, Cohesion: 0.5, Vary: 0.3, Dist: 3, Az: 0.3 }),
      terrain: 2, early: 0.5, tailMix: 0.3, tailDecay: 2, tailTone: 0.45,
    },
  },
  {
    name: 'Fiddle Over Drums', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.85, Size: 0.45, Tension: 0.5, Damp: 0.35, Char: 0.45, Hard: 0.5, Pos: 0.9, Grit: 0.25, Track: 1, KeyLo: 60, KeyHi: 127, Dist: 3, Az: 0.3 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 0.9, Tension: 0.45, Damp: 0.3, Char: 0.6, Hard: 0.55, Count: 4, Spread: 40, Cohesion: 0.75, Dist: 12, Az: -0.4, KeyLo: 0, KeyHi: 59 }),
      terrain: 3, early: 0.5, tailMix: 0.3, tailDecay: 2.5, tailTone: 0.4,
    },
  },
  {
    name: 'Bone Flute', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_FLUTE, Level: 0.7, Size: 0.35, Damp: 0.3, Char: 0.5, Partial: 1, Lip: 1, Breath: 0.03, Growl: 0.25, Track: 1, Dist: 2 }),
      terrain: 3, early: 0.4, tailMix: 0.35, tailDecay: 3, tailTone: 0.4, wind: 0.15,
    },
  },
  {
    name: 'Flutes Over Water', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_FLUTE, Level: 0.56, Size: 0.5, Damp: 0.25, Char: 0.8, Partial: 1, Lip: 1, Breath: 0.08, Growl: 0.4, Track: 1, Count: 3, Spread: 120, Cohesion: 0.3, Vary: 0.5, Dist: 90, Az: 0.5 }),
      terrain: 1, early: 0.8, tailMix: 0.55, tailDecay: 7, tailTone: 0.3, air: 0.8, wind: 0.5, gust: 0.2, windBed: 0.4,
    },
  },
  {
    name: 'Wooden Bars', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_BARS, Level: 0.9, Size: 0.5, Tension: 0.5, Damp: 0.3, Char: 0.7, Hard: 0.7, Pos: 0.3, Grit: 0.15, Track: 1, Dist: 3 }),
      terrain: 3, early: 0.5, tailMix: 0.3, tailDecay: 2, tailTone: 0.45,
    },
  },
  {
    name: 'Bars And Bells', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_BARS, Level: 0.85, Size: 0.5, Tension: 0.5, Damp: 0.3, Char: 0.8, Hard: 0.6, Pos: 0.3, Track: 1, Dist: 4, Az: -0.4 }),
      ...U(1, { Body: BODY_BELL, Level: 0.45, Size: 0.7, Damp: 0.05, Char: 0.3, Hard: 0.5, Pos: 0.2, Track: 1, Dist: 30, Az: 0.6, KeyLo: 60, KeyHi: 127 }),
      terrain: 2, early: 0.6, tailMix: 0.4, tailDecay: 4, tailTone: 0.45,
    },
  },
  {
    name: 'Court Ensemble', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_TIMPANI, Level: 0.8, Size: 0.85, Damp: 0.25, Char: 0.8, Hard: 0.4, Pos: 0.75, Bend: 0.3, Track: 1, Dist: 8, Az: -0.5, KeyLo: 0, KeyHi: 47 }),
      ...U(1, { Body: BODY_LYRE, Level: 0.8, Size: 0.7, Tension: 0.3, Damp: 0.2, Char: 0.6, Hard: 0.7, Pos: 0.5, Track: 1, Dist: 3, KeyLo: 48, KeyHi: 71 }),
      ...U(2, { Body: BODY_FLUTE, Level: 0.6, Size: 0.4, Damp: 0.3, Char: 0.5, Partial: 1, Breath: 0.04, Growl: 0.2, Track: 1, Dist: 5, Az: 0.5, KeyLo: 72, KeyHi: 127 }),
      terrain: 2, early: 0.6, tailMix: 0.35, tailDecay: 3, tailTone: 0.45,
    },
  },
  {
    name: 'Dirge', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.7, Size: 1.4, Tension: 0.25, Damp: 0.25, Char: 0.8, Hard: 0.5, Pos: 0.9, Grit: 0.35, Track: 1, Count: 3, Spread: 60, Cohesion: 0.4, Vary: 0.4, Dist: 6, KeyLo: 0, KeyHi: 59 }),
      ...U(1, { Body: BODY_HORN, Level: 0.6, Size: 1.8, Damp: 0.3, Char: 0.3, Partial: 2, Breath: 0.4, Growl: 0.15, Track: 1, Dist: 60, Az: 0.5, KeyLo: 60, KeyHi: 127 }),
      ...U(2, { Body: BODY_BELL, Level: 0.4, Size: 2, Damp: 0.03, Char: 0.2, Hard: 0.4, Track: 0, Dist: 120, Az: -0.7, KeyLo: 0, KeyHi: 40 }),
      terrain: 1, early: 0.7, tailMix: 0.5, tailDecay: 7, tailTone: 0.3, wind: 0.35, windBed: 0.2,
    },
  },
  // ------------------------------------------------------------ signals & weird
  {
    name: 'Alarm Bells', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.38, Size: 0.6, Damp: 0.08, Char: 0.5, Hard: 0.8, Pos: 0.25, Track: 1, Root: 72, Count: 5, Spread: 140, Cohesion: 0.2, Vary: 0.6, Dist: 60, Roll: 3 }),
      tempo: 132, terrain: 2, early: 0.7, tailMix: 0.4, tailDecay: 4, tailTone: 0.5, wind: 0.3,
    },
  },
  {
    name: 'War Bells', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.56, Size: 2.2, Damp: 0.03, Char: 0.4, Hard: 0.3, Pos: 0.15, Bend: 0.1, Track: 1, Root: 48, Dist: 30 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.42, Size: 1.8, Tension: 0.25, Damp: 0.2, Char: 0.9, Hard: 0.4, Count: 4, Spread: 30, Cohesion: 0.9, Dist: 30, KeyLo: 0, KeyHi: 47 }),
      terrain: 1, early: 0.6, tailMix: 0.5, tailDecay: 8, tailTone: 0.3, wind: 0.2,
    },
  },
  {
    name: 'Grinding Stone', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_BLADE, Level: 0.7, Size: 1.4, Tension: 0.4, Damp: 0.5, Char: 0.9, Hard: 0.6, Pos: 0.7, Grit: 0.9, Track: 1, Root: 60, Count: 2, Spread: 40, Cohesion: 0.3, Vary: 0.7, Dist: 2 }),
      terrain: 2, early: 0.4, tailMix: 0.15, tailDecay: 1, proximity: 0.5,
    },
  },
  {
    name: 'Bronze Drums', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.8, Size: 0.5, Tension: 0.7, Damp: 0.25, Char: 0.4, Hard: 0.6, Pos: 0.2, Grit: 0.15, Track: 1, Root: 60, Count: 3, Spread: 30, Cohesion: 0.7, Vary: 0.4, Dist: 10 }),
      terrain: 3, early: 0.5, tailMix: 0.3, tailDecay: 2.5, tailTone: 0.45,
    },
  },
  {
    name: 'Gong Wall', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.35, Size: 1.3, Tension: 0.4, Damp: 0.1, Char: 0.9, Hard: 0.25, Pos: 0.4, Bend: 0.3, Count: 24, Spread: 400, Cohesion: 0.3, Vary: 0.6, Dist: 30 }),
      terrain: 2, early: 0.6, tailMix: 0.5, tailDecay: 7, tailTone: 0.35,
    },
  },
  {
    name: 'Thunder Sheet', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_SHIELD, Level: 0.9, Size: 3.5, Tension: 0.15, Damp: 0.15, Char: 0.2, Hard: 0.1, Pos: 0.5, Grit: 0.6, Bend: 0.6, Count: 6, Spread: 300, Cohesion: 0.2, Vary: 0.5, Dist: 3 }),
      terrain: 0, tailMix: 0.4, tailDecay: 4, tailTone: 0.25, proximity: 0.8,
    },
  },
  {
    name: 'Hollow Logs', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.9, Size: 1.1, Damp: 0.3, Char: 0.9, Hard: 0.4, Pos: 0.3, Grit: 0.3, Bend: 0.3, Track: 1, Root: 55, Dist: 5 }),
      terrain: 3, early: 0.6, tailMix: 0.3, tailDecay: 2, tailTone: 0.4,
    },
  },
  {
    name: 'Ridge Echo Test', tag: 'signals',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.9, Size: 0.5, Damp: 0.7, Char: 0.2, Hard: 0.9, Grit: 0.5, Dist: 2 }),
      terrain: 1, early: 1, tailMix: 0.3, tailDecay: 5, tailTone: 0.3, ground: 0.3,
    },
  },
  // ================================================================ second bank
  // After the first bank, so the first bank keeps its numbers. Sounds built to
  // play as well as to stage: pads and drones from bows, reeds and horn choirs,
  // mallets and bells, leads and bass, grooves from one held key (several units
  // rolling on different divisions of the march clock), cinematic hits and fx.
  // ------------------------------------------------------------ drums
  {
    name: 'Talking Drum', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 0.5, Tension: 0.25, Damp: 0.35, Char: 0.45, Hard: 0.55, Pos: 0.35, Grit: 0.15, Bend: 1, Track: 1, Dist: 4, Az: -0.15 }),
      terrain: 3, early: 0.5, tailMix: 0.3, tailDecay: 2.2, tailTone: 0.45, volume: 0.849,
    },
  },
  {
    name: 'Ceremonial Kick', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.95, Size: 2.6, Tension: 0.2, Damp: 0.25, Char: 1, Hard: 0.5, Pos: 0.15, Grit: 0.1, Bend: 0.7, Count: 3, Spread: 18, Cohesion: 0.9, Vary: 0.2, Dist: 9 }),
      terrain: 1, early: 0.45, tailMix: 0.35, tailDecay: 4, tailTone: 0.3, ground: 0.7, proximity: 0.6, volume: 0.821,
    },
  },
  {
    name: 'Hand Drums', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.85, Size: 0.35, Tension: 0.65, Damp: 0.45, Char: 0.55, Hard: 0.4, Pos: 0.6, Grit: 0.35, Bend: 0.35, Track: 1, Count: 2, Spread: 22, Cohesion: 0.5, Vary: 0.4, Dist: 3, Az: 0.25 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.7, Size: 0.7, Tension: 0.4, Damp: 0.4, Char: 0.8, Hard: 0.3, Pos: 0.2, Grit: 0.2, Bend: 0.5, Track: 1, Dist: 3, Az: -0.3, KeyLo: 0, KeyHi: 52 }),
      terrain: 3, early: 0.55, tailMix: 0.28, tailDecay: 1.8, tailTone: 0.5, volume: 0.792,
    },
  },
  {
    name: 'Tom Cascade', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.85, Size: 0.75, Tension: 0.5, Damp: 0.3, Char: 0.65, Hard: 0.6, Pos: 0.35, Grit: 0.2, Bend: 0.55, Track: 1, Count: 3, Spread: 260, Cohesion: 0.2, Vary: 0.5, Dist: 10, Az: -0.2 }),
      terrain: 2, early: 0.55, tailMix: 0.32, tailDecay: 2.4, tailTone: 0.4, volume: 0.815,
    },
  },
  {
    name: 'Iron Kit', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 1.7, Tension: 0.3, Damp: 0.3, Char: 1, Hard: 0.55, Pos: 0.2, Bend: 0.7, Dist: 5, KeyLo: 0, KeyHi: 47 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 0.45, Tension: 0.85, Damp: 0.55, Char: 0.2, Hard: 0.8, Pos: 0.55, Grit: 0.7, Bend: 0.2, Count: 2, Spread: 8, Cohesion: 0.6, Dist: 5, Az: 0.15, KeyLo: 48, KeyHi: 59 }),
      ...U(2, { Body: BODY_SHIELD, Level: 0.55, Size: 0.35, Tension: 0.7, Damp: 0.7, Char: 0.3, Hard: 0.9, Pos: 0.7, Grit: 0.5, Track: 1, Dist: 5, Az: 0.4, KeyLo: 60, KeyHi: 71 }),
      ...U(3, { Body: BODY_GONG, Level: 0.35, Size: 0.45, Tension: 0.8, Damp: 0.3, Char: 0.6, Hard: 0.7, Pos: 0.6, Grit: 0.2, Track: 1, Dist: 6, Az: -0.4, KeyLo: 72, KeyHi: 127 }),
      terrain: 2, early: 0.5, tailMix: 0.25, tailDecay: 1.6, tailTone: 0.5, volume: 0.878,
    },
  },
  {
    name: 'Drums In The Valley', tag: 'drums',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.95, Size: 1.5, Tension: 0.35, Damp: 0.25, Char: 0.85, Hard: 0.5, Pos: 0.3, Grit: 0.2, Bend: 0.55, Count: 16, Spread: 70, Cohesion: 0.7, Vary: 0.4, Dist: 60, Az: -0.35 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.7, Size: 0.8, Tension: 0.5, Damp: 0.3, Char: 0.6, Hard: 0.6, Count: 10, Spread: 60, Cohesion: 0.7, Vary: 0.4, Dist: 110, Az: 0.45 }),
      terrain: 1, early: 0.8, tailMix: 0.45, tailDecay: 5.5, tailTone: 0.3, ground: 0.5, air: 0.55, wind: 0.3, gust: 0.3, volume: 0.946,
    },
  },
  // ------------------------------------------------------------ rhythms: a groove from one held key
  {
    name: 'War March Groove', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 1.6, Tension: 0.3, Damp: 0.3, Char: 0.9, Hard: 0.5, Pos: 0.25, Bend: 0.6, Count: 6, Spread: 30, Cohesion: 0.85, Dist: 14, Roll: 1, Accent: 0.4 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.6, Size: 0.5, Tension: 0.8, Damp: 0.5, Char: 0.25, Hard: 0.75, Pos: 0.55, Grit: 0.6, Bend: 0.2, Count: 8, Spread: 25, Cohesion: 0.8, Vary: 0.4, Dist: 12, Az: 0.3, Roll: 2, Accent: 0.8 }),
      ...U(2, { Body: BODY_FEET, Level: 0.55, Size: 1, Damp: 0.5, Char: 0.3, Hard: 0.45, Grit: 0.7, Count: 300, Spread: 120, Cohesion: 0.6, Vary: 0.6, Dist: 25, Az: -0.3, Roll: 3, Accent: 0.5 }),
      tempo: 92, terrain: 1, early: 0.5, tailMix: 0.35, tailDecay: 3.5, tailTone: 0.35, ground: 0.6, wind: 0.2, volume: 0.656,
    },
  },
  {
    name: 'Gallop', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_HOOVES, Level: 0.8, Size: 1, Damp: 0.45, Char: 0.55, Hard: 0.65, Grit: 0.6, Count: 40, Spread: 90, Cohesion: 0.6, Vary: 0.6, Dist: 20, Az: -0.2, Roll: 4, Accent: 0.6 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 1.3, Tension: 0.35, Damp: 0.3, Char: 0.8, Hard: 0.5, Bend: 0.5, Count: 4, Spread: 25, Cohesion: 0.9, Dist: 15, Roll: 2, Accent: 0.5 }),
      tempo: 128, terrain: 0, early: 0.35, tailMix: 0.3, tailDecay: 2.5, ground: 0.8, wind: 0.3, volume: 0.679,
    },
  },
  {
    name: 'Galley Oars', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.9, Size: 1.9, Tension: 0.25, Damp: 0.25, Char: 1, Hard: 0.45, Pos: 0.2, Bend: 0.6, Dist: 6, Roll: 1, Accent: 0.3 }),
      ...U(1, { Body: BODY_LOG, Level: 0.6, Size: 0.9, Damp: 0.5, Char: 0.5, Hard: 0.6, Pos: 0.5, Grit: 0.5, Count: 60, Spread: 110, Cohesion: 0.8, Vary: 0.5, Dist: 12, Az: 0.4, Roll: 1, Accent: 0 }),
      ...U(2, { Body: BODY_BLADE, Level: 0.2, Size: 1.2, Damp: 0.5, Char: 0, Hard: 0.7, Grit: 0.6, Count: 6, Spread: 200, Cohesion: 0.3, Vary: 0.8, Dist: 8, Az: -0.5, Roll: 2, Accent: 0.6 }),
      tempo: 66, terrain: 2, early: 0.6, tailMix: 0.35, tailDecay: 2.8, tailTone: 0.35, wind: 0.15, windBed: 0.15, volume: 0.739,
    },
  },
  {
    name: 'Forge Rhythm', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_ANVIL, Level: 0.45, Size: 0.5, Damp: 0.35, Char: 0.75, Hard: 0.95, Pos: 0.3, Grit: 0.25, Track: 1, Dist: 4, Az: 0.3, Roll: 3, Accent: 0.75 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 1.2, Tension: 0.4, Damp: 0.35, Char: 0.7, Hard: 0.5, Bend: 0.4, Dist: 6, Az: -0.2, Roll: 2, Accent: 0.4 }),
      ...U(2, { Body: BODY_LOG, Level: 0.5, Size: 0.6, Damp: 0.6, Char: 0.4, Hard: 0.7, Grit: 0.5, Dist: 5, Az: -0.45, Roll: 5, Accent: 0.8 }),
      tempo: 100, terrain: 2, early: 0.65, tailMix: 0.28, tailDecay: 1.6, tailTone: 0.5, proximity: 0.4, volume: 0.547,
    },
  },
  {
    name: 'Ritual Toms', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.85, Size: 0.8, Tension: 0.45, Damp: 0.3, Char: 0.7, Hard: 0.45, Pos: 0.35, Grit: 0.2, Bend: 0.5, Track: 1, Count: 2, Spread: 30, Cohesion: 0.5, Vary: 0.4, Dist: 8, Roll: 6, Accent: 0.7 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.7, Size: 2, Tension: 0.25, Damp: 0.25, Char: 1, Hard: 0.4, Bend: 0.6, Dist: 10, Az: -0.3, Roll: 1, Accent: 0 }),
      tempo: 84, terrain: 3, early: 0.55, tailMix: 0.4, tailDecay: 3.5, tailTone: 0.35, volume: 0.65,
    },
  },
  {
    name: 'Bell Ostinato', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.42, Size: 0.7, Damp: 0.12, Char: 0.3, Hard: 0.55, Pos: 0.2, Track: 1, Dist: 20, Az: 0.3, Roll: 3, Accent: 0.65 }),
      ...U(1, { Body: BODY_BARS, Level: 0.6, Size: 0.6, Tension: 0.5, Damp: 0.35, Char: 0.8, Hard: 0.55, Pos: 0.3, Track: 1, Dist: 6, Az: -0.35, Roll: 5, Accent: 0.8 }),
      tempo: 96, terrain: 2, early: 0.55, tailMix: 0.42, tailDecay: 4, tailTone: 0.45, volume: 0.746,
    },
  },
  {
    name: 'Marimba Pulse', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_BARS, Level: 0.8, Size: 0.55, Tension: 0.5, Damp: 0.35, Char: 0.85, Hard: 0.6, Pos: 0.3, Grit: 0.1, Track: 1, Dist: 4, Az: 0.2, Roll: 5, Accent: 0.75 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.7, Size: 1.4, Tension: 0.35, Damp: 0.35, Char: 0.9, Hard: 0.45, Bend: 0.5, Dist: 8, Az: -0.2, Roll: 2, Accent: 0.3, KeyLo: 0, KeyHi: 59 }),
      tempo: 112, terrain: 3, early: 0.5, tailMix: 0.3, tailDecay: 2.2, tailTone: 0.45, volume: 0.568,
    },
  },
  {
    name: 'Clockwork Siege', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.718, Size: 0.4, Damp: 0.65, Char: 0.3, Hard: 0.85, Grit: 0.4, Track: 1, Dist: 5, Az: 0.4, Roll: 5, Accent: 0.9 }),
      ...U(1, { Body: BODY_ANVIL, Level: 0.308, Size: 0.3, Damp: 0.5, Char: 0.5, Hard: 1, Track: 1, Dist: 5, Az: -0.4, Roll: 2, Accent: 0.5 }),
      ...U(2, { Body: BODY_DRUM, Level: 0.769, Size: 2.2, Tension: 0.2, Damp: 0.3, Char: 1, Hard: 0.4, Bend: 0.7, Dist: 12, Roll: 1, Accent: 0.2 }),
      ...U(3, { Body: BODY_SHIELD, Level: 0.359, Size: 0.6, Damp: 0.6, Char: 0.6, Hard: 0.7, Grit: 0.7, Count: 30, Spread: 60, Cohesion: 0.8, Dist: 15, Az: 0.15, Roll: 3, Accent: 0.95 }),
      tempo: 104, terrain: 2, early: 0.55, tailMix: 0.3, tailDecay: 2, tailTone: 0.4, volume: 0.747,
    },
  },
  {
    name: 'Camp Fire Dance', tag: 'rhythms',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.8, Size: 0.4, Tension: 0.7, Damp: 0.45, Char: 0.4, Hard: 0.45, Pos: 0.55, Grit: 0.35, Bend: 0.3, Count: 2, Spread: 15, Cohesion: 0.6, Vary: 0.4, Dist: 5, Az: 0.3, Roll: 6, Accent: 0.85 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.75, Size: 1.1, Tension: 0.4, Damp: 0.35, Char: 0.75, Hard: 0.45, Bend: 0.45, Dist: 6, Az: -0.25, Roll: 2, Accent: 0.5 }),
      ...U(2, { Body: BODY_FEET, Level: 0.4, Size: 0.7, Damp: 0.6, Char: 0.2, Hard: 0.5, Grit: 0.8, Count: 12, Spread: 60, Cohesion: 0.5, Vary: 0.7, Dist: 7, Roll: 4, Accent: 0.6 }),
      tempo: 118, terrain: 3, early: 0.5, tailMix: 0.3, tailDecay: 2, tailTone: 0.45, wind: 0.2, windBed: 0.1, volume: 0.62,
    },
  },
  // ------------------------------------------------------------ metal
  {
    name: 'Singing Steel', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_BLADE, Level: 0.6, Size: 0.7, Tension: 0.4, Damp: 0.15, Char: 0.35, Hard: 0.6, Pos: 0.5, Grit: 0.2, Track: 1, Dist: 3, Az: -0.2 }),
      ...U(1, { Body: BODY_BLADE, Level: 0.45, Size: 0.9, Tension: 0.5, Damp: 0.2, Char: 0.25, Hard: 0.5, Pos: 0.6, Grit: 0.2, Track: 1, Dist: 5, Az: 0.35 }),
      terrain: 2, early: 0.5, tailMix: 0.45, tailDecay: 5, tailTone: 0.55, volume: 0.659,
    },
  },
  {
    name: 'Bell Tree', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.35, Size: 0.3, Tension: 0.5, Damp: 0.1, Char: 0.2, Hard: 0.7, Pos: 0.3, Count: 14, Spread: 900, Cohesion: 0.1, Vary: 0.8, Dist: 5, Az: 0.2 }),
      terrain: 2, early: 0.5, tailMix: 0.4, tailDecay: 4, tailTone: 0.6, volume: 0.909,
    },
  },
  {
    name: 'Chain Mail', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_SHIELD, Level: 0.6, Size: 0.2, Tension: 0.8, Damp: 0.6, Char: 0.1, Hard: 0.95, Pos: 0.7, Grit: 0.5, Count: 120, Spread: 450, Cohesion: 0.25, Vary: 0.8, Dist: 3 }),
      terrain: 2, early: 0.4, tailMix: 0.2, tailDecay: 1.2, tailTone: 0.6, volume: 0.895,
    },
  },
  {
    name: 'Bronze Cymbal', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.32, Size: 0.4, Tension: 0.9, Damp: 0.25, Char: 0.9, Hard: 0.65, Pos: 0.7, Grit: 0.3, Bend: 0.1, Dist: 5, Az: 0.3 }),
      terrain: 2, early: 0.45, tailMix: 0.35, tailDecay: 3, tailTone: 0.6, volume: 0.421,
    },
  },
  {
    name: 'Great Gong', tag: 'metal',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.4, Size: 2.4, Tension: 0.3, Damp: 0.05, Char: 0.95, Hard: 0.15, Pos: 0.15, Grit: 0.05, Bend: 0.4, Dist: 7 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.4, Size: 2.8, Tension: 0.15, Damp: 0.3, Char: 1, Hard: 0.25, Bend: 0.4, Dist: 8 }),
      terrain: 1, early: 0.5, tailMix: 0.45, tailDecay: 9, tailTone: 0.35, proximity: 0.5, volume: 0.387,
    },
  },
  // ------------------------------------------------------------ horns
  {
    name: 'Lur Pair', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.75, Size: 1.8, Damp: 0.3, Char: 0.35, Partial: 3, Lip: 1, Breath: 0.18, Growl: 0.1, Track: 1, Root: 48, Dist: 45, Az: -0.7 }),
      ...U(1, { Body: BODY_HORN, Level: 0.7, Size: 1.7, Damp: 0.32, Char: 0.3, Partial: 3, Lip: 1, Breath: 0.22, Growl: 0.12, Track: 1, Root: 48, Count: 2, Spread: 70, Cohesion: 0.6, Vary: 0.25, Dist: 70, Az: 0.7 }),
      terrain: 1, early: 0.75, tailMix: 0.5, tailDecay: 6, tailTone: 0.35, air: 0.6, wind: 0.3, gust: 0.25, volume: 0.764,
    },
  },
  {
    name: 'Conch', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 0.45, Damp: 0.45, Char: 0.45, Partial: 1, Lip: 0.95, Breath: 0.25, Growl: 0.35, Track: 1, Dist: 12, Az: 0.2 }),
      terrain: 3, early: 0.6, tailMix: 0.42, tailDecay: 4, tailTone: 0.4, wind: 0.25, windBed: 0.15, volume: 0.652,
    },
  },
  {
    name: 'Alphorn Valley', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.85, Size: 3.2, Damp: 0.25, Char: 0.25, Partial: 4, Snap: 1, Lip: 1, Breath: 0.3, Growl: 0.06, Track: 1, Root: 36, Dist: 260, Az: -0.4 }),
      terrain: 1, early: 0.9, tailMix: 0.5, tailDecay: 7, tailTone: 0.3, air: 0.6, wind: 0.35, gust: 0.2, windBed: 0.2, volume: 0.992,
    },
  },
  {
    name: 'Horn Chorale', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.7, Size: 2.4, Damp: 0.3, Char: 0.15, Partial: 2, Lip: 1, Breath: 0.35, Growl: 0.05, Track: 1, Count: 3, Spread: 80, Cohesion: 0.6, Vary: 0.25, Dist: 30, Az: -0.5, KeyLo: 0, KeyHi: 54 }),
      ...U(1, { Body: BODY_HORN, Level: 0.65, Size: 1.6, Damp: 0.3, Char: 0.15, Partial: 3, Lip: 1, Breath: 0.3, Growl: 0.05, Track: 1, Count: 3, Spread: 80, Cohesion: 0.6, Vary: 0.25, Dist: 30, Az: 0.05, KeyLo: 55, KeyHi: 66 }),
      ...U(2, { Body: BODY_HORN, Level: 0.6, Size: 1.1, Damp: 0.32, Char: 0.2, Partial: 4, Lip: 1, Breath: 0.3, Growl: 0.06, Track: 1, Count: 3, Spread: 80, Cohesion: 0.6, Vary: 0.25, Dist: 30, Az: 0.55, KeyLo: 67, KeyHi: 127 }),
      terrain: 1, early: 0.6, tailMix: 0.5, tailDecay: 5, tailTone: 0.35, air: 0.5, volume: 0.979,
    },
  },
  {
    name: 'Rams Horn', tag: 'horns',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 0.7, Damp: 0.5, Char: 0.8, Partial: 2, Snap: 1, Lip: 1.1, Breath: 0.05, Growl: 0.45, Track: 1, Root: 55, Dist: 25, Az: 0.3 }),
      terrain: 2, early: 0.65, tailMix: 0.4, tailDecay: 3.5, tailTone: 0.4, volume: 0.942,
    },
  },
  // ------------------------------------------------------------ instruments
  {
    name: 'Harp Of The Hall', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.85, Size: 1, Tension: 0.25, Damp: 0.12, Char: 0.7, Hard: 0.55, Pos: 0.3, Grit: 0.08, Bend: 0.05, Track: 1, Dist: 3, Az: -0.25 }),
      ...U(1, { Body: BODY_LYRE, Level: 0.45, Size: 1.2, Tension: 0.3, Damp: 0.15, Char: 0.5, Hard: 0.4, Pos: 0.6, Grit: 0.05, Track: 1, Dist: 6, Az: 0.4 }),
      terrain: 2, early: 0.55, tailMix: 0.42, tailDecay: 4, tailTone: 0.5, volume: 0.554,
    },
  },
  {
    name: 'Kantele', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.85, Size: 0.7, Tension: 0.5, Damp: 0.2, Char: 0.35, Hard: 0.85, Pos: 0.8, Grit: 0.12, Bend: 0.1, Track: 1, Dist: 2.5, Az: 0.1 }),
      terrain: 3, early: 0.45, tailMix: 0.35, tailDecay: 3.2, tailTone: 0.5, wind: 0.1,
    },
  },
  {
    name: 'Viol Consort', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.6, Size: 1.4, Tension: 0.3, Damp: 0.25, Char: 0.6, Hard: 0.5, Pos: 0.9, Grit: 0.15, Track: 1, Dist: 4, Az: -0.5, KeyLo: 0, KeyHi: 52 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.6, Size: 0.9, Tension: 0.3, Damp: 0.25, Char: 0.55, Hard: 0.5, Pos: 0.9, Grit: 0.15, Track: 1, Dist: 4, Az: 0, KeyLo: 53, KeyHi: 64 }),
      ...U(2, { Body: BODY_BOWED, Level: 0.55, Size: 0.55, Tension: 0.35, Damp: 0.3, Char: 0.5, Hard: 0.5, Pos: 0.9, Grit: 0.15, Track: 1, Dist: 4, Az: 0.5, KeyLo: 65, KeyHi: 127 }),
      terrain: 2, early: 0.55, tailMix: 0.42, tailDecay: 3.5, tailTone: 0.45, volume: 0.774,
    },
  },
  {
    name: 'Lyre And Drone', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.85, Size: 0.7, Tension: 0.3, Damp: 0.18, Char: 0.6, Hard: 0.7, Pos: 0.55, Grit: 0.1, Track: 1, Dist: 3, Az: 0.2 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.38, Size: 2.397, Tension: 0.3, Damp: 0.25, Char: 0.5, Hard: 0.5, Pos: 0.9, Grit: 0.25, Track: 0, Root: 38, Dist: 6, Az: -0.35 }),
      terrain: 3, early: 0.5, tailMix: 0.42, tailDecay: 4, tailTone: 0.4, wind: 0.15, volume: 0.634,
    },
  },
  {
    name: 'Psaltery', tag: 'instruments',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.8, Size: 0.5, Tension: 0.7, Damp: 0.12, Char: 0.25, Hard: 0.95, Pos: 0.9, Grit: 0.1, Track: 1, Count: 2, Spread: 18, Cohesion: 0.4, Vary: 0.4, Dist: 3, Az: -0.15 }),
      terrain: 2, early: 0.5, tailMix: 0.4, tailDecay: 3.5, tailTone: 0.55, volume: 0.66,
    },
  },
  // ------------------------------------------------------------ mallets & bells
  {
    name: 'Bronze Marimba', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_BARS, Level: 0.85, Size: 0.75, Tension: 0.5, Damp: 0.22, Char: 0.95, Hard: 0.45, Pos: 0.3, Grit: 0.05, Track: 1, Dist: 3, Az: -0.2 }),
      ...U(1, { Body: BODY_BARS, Level: 0.4, Size: 0.9, Tension: 0.55, Damp: 0.25, Char: 0.8, Hard: 0.35, Pos: 0.4, Track: 1, Dist: 6, Az: 0.4 }),
      terrain: 2, early: 0.5, tailMix: 0.35, tailDecay: 2.8, tailTone: 0.5, volume: 0.557,
    },
  },
  {
    name: 'Glass Bells', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.643, Size: 0.35, Tension: 0.5, Damp: 0.1, Char: 0.15, Hard: 0.6, Pos: 0.25, Track: 1, Dist: 4, Az: 0.2 }),
      ...U(1, { Body: BODY_BLADE, Level: 0.45, Size: 0.5, Tension: 0.4, Damp: 0.2, Char: 0, Hard: 0.4, Pos: 0.5, Track: 1, Dist: 6, Az: -0.35 }),
      terrain: 2, early: 0.5, tailMix: 0.45, tailDecay: 4.5, tailTone: 0.6, volume: 1,
    },
  },
  {
    name: 'Carillon', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.55, Size: 1.6, Tension: 0.5, Damp: 0.05, Char: 0.35, Hard: 0.75, Pos: 0.15, Bend: 0.05, Track: 1, Dist: 110, Az: -0.25 }),
      terrain: 1, early: 0.8, tailMix: 0.5, tailDecay: 7, tailTone: 0.35, air: 0.55, wind: 0.25, gust: 0.2, volume: 0.922,
    },
  },
  {
    name: 'Keep Music Box', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_ANVIL, Level: 0.35, Size: 0.2, Tension: 0.5, Damp: 0.3, Char: 0.8, Hard: 0.55, Pos: 0.3, Grit: 0.05, Track: 1, Dist: 3, Az: 0.15 }),
      ...U(1, { Body: BODY_BARS, Level: 0.4, Size: 0.35, Tension: 0.6, Damp: 0.3, Char: 0.5, Hard: 0.7, Track: 1, Dist: 5, Az: -0.3 }),
      terrain: 2, early: 0.55, tailMix: 0.45, tailDecay: 3.5, tailTone: 0.6, volume: 0.755,
    },
  },
  {
    name: 'Court Gamelan', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_GONG, Level: 0.55, Size: 0.45, Tension: 0.75, Damp: 0.2, Char: 0.35, Hard: 0.55, Pos: 0.2, Grit: 0.1, Track: 1, Dist: 6, Az: -0.3 }),
      ...U(1, { Body: BODY_BARS, Level: 0.55, Size: 0.6, Tension: 0.7, Damp: 0.2, Char: 0.6, Hard: 0.7, Pos: 0.3, Track: 1, Dist: 5, Az: 0.35 }),
      ...U(2, { Body: BODY_GONG, Level: 0.35, Size: 1.3, Tension: 0.4, Damp: 0.1, Char: 0.5, Hard: 0.3, Pos: 0.3, Track: 0, Dist: 10, KeyLo: 0, KeyHi: 47 }),
      terrain: 3, early: 0.55, tailMix: 0.4, tailDecay: 4, tailTone: 0.45, volume: 0.725,
    },
  },
  {
    name: 'Tremolo Bells', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.898, Size: 0.6, Tension: 0.5, Damp: 0.1, Char: 0.2, Hard: 0.35, Pos: 0.2, Track: 1, Dist: 15, Az: 0.25, Roll: 6, Accent: 0.3 }),
      tempo: 96, terrain: 2, early: 0.5, tailMix: 0.5, tailDecay: 5, tailTone: 0.5, volume: 1,
    },
  },
  {
    name: 'Wooden Kalimba', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_BARS, Level: 0.85, Size: 0.25, Tension: 0.7, Damp: 0.45, Char: 0.3, Hard: 0.85, Pos: 0.15, Grit: 0.1, Track: 1, Dist: 2, Az: 0.1 }),
      ...U(1, { Body: BODY_LOG, Level: 0.35, Size: 0.3, Damp: 0.4, Char: 0.8, Hard: 0.7, Track: 1, Dist: 2, Az: -0.2 }),
      terrain: 3, early: 0.45, tailMix: 0.3, tailDecay: 2, tailTone: 0.5, volume: 0.928,
    },
  },
  {
    name: 'Iron Vibes', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_ANVIL, Level: 0.4, Size: 0.7, Tension: 0.5, Damp: 0.1, Char: 0.9, Hard: 0.25, Pos: 0.3, Track: 1, Dist: 5, Az: -0.2 }),
      ...U(1, { Body: BODY_BELL, Level: 0.25, Size: 0.5, Damp: 0.15, Char: 0.1, Hard: 0.3, Pos: 0.2, Track: 1, Dist: 8, Az: 0.35 }),
      terrain: 2, early: 0.5, tailMix: 0.45, tailDecay: 4.5, tailTone: 0.5, volume: 0.327,
    },
  },
  {
    name: 'Temple Mallets', tag: 'mallets',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.4, Size: 1, Tension: 0.5, Damp: 0.08, Char: 0.3, Hard: 0.4, Pos: 0.2, Track: 1, Dist: 25, Az: 0.4, KeyLo: 60, KeyHi: 127 }),
      ...U(1, { Body: BODY_BARS, Level: 0.7, Size: 0.7, Tension: 0.5, Damp: 0.25, Char: 0.9, Hard: 0.5, Track: 1, Dist: 5, Az: -0.2 }),
      ...U(2, { Body: BODY_LOG, Level: 0.5, Size: 0.9, Damp: 0.35, Char: 0.9, Hard: 0.45, Track: 1, Dist: 6, Az: -0.45, KeyLo: 0, KeyHi: 59 }),
      terrain: 3, early: 0.55, tailMix: 0.42, tailDecay: 4, tailTone: 0.45, volume: 0.644,
    },
  },
  // ------------------------------------------------------------ pads & drones
  {
    name: 'Cathedral Of Strings', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.55, Size: 0.6, Tension: 0.3, Damp: 0.2, Char: 0.55, Hard: 0.5, Pos: 0.9, Grit: 0.12, Track: 1, Dist: 8, Az: -0.6 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.55, Size: 0.95, Tension: 0.3, Damp: 0.2, Char: 0.6, Hard: 0.5, Pos: 0.9, Grit: 0.12, Track: 1, Dist: 10, Az: 0.05 }),
      ...U(2, { Body: BODY_BOWED, Level: 0.5, Size: 1.4, Tension: 0.3, Damp: 0.2, Char: 0.65, Hard: 0.5, Pos: 0.9, Grit: 0.12, Track: 1, Dist: 12, Az: 0.6 }),
      terrain: 3, early: 0.6, tailMix: 0.55, tailDecay: 6, tailTone: 0.4, volume: 0.615,
    },
  },
  {
    name: 'Horn Choir', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.6, Size: 1.6, Damp: 0.35, Char: 0.1, Partial: 2, Lip: 1, Breath: 0.7, Growl: 0.04, Track: 1, Count: 4, Spread: 150, Cohesion: 0.5, Vary: 0.35, Dist: 30, Az: -0.5 }),
      ...U(1, { Body: BODY_HORN, Level: 0.5, Size: 1.2, Damp: 0.38, Char: 0.1, Partial: 3, Lip: 1, Breath: 0.9, Growl: 0.04, Track: 1, Count: 4, Spread: 150, Cohesion: 0.5, Vary: 0.35, Dist: 40, Az: 0.5 }),
      terrain: 1, early: 0.55, tailMix: 0.55, tailDecay: 6, tailTone: 0.35, air: 0.5, volume: 0.819,
    },
  },
  {
    name: 'Reed Organ Drone', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_PIPE, Level: 0.55, Size: 0.8, Damp: 0.35, Char: 0.3, Partial: 1, Lip: 1, Breath: 0.5, Growl: 0.04, Track: 1, Count: 4, Spread: 60, Cohesion: 0.7, Vary: 0.3, Dist: 10, Az: -0.45 }),
      ...U(1, { Body: BODY_PIPE, Level: 0.45, Size: 1.3, Damp: 0.4, Char: 0.2, Partial: 1, Lip: 1, Breath: 0.7, Growl: 0.04, Track: 1, Count: 4, Spread: 60, Cohesion: 0.7, Vary: 0.3, Dist: 12, Az: 0.45 }),
      terrain: 2, early: 0.5, tailMix: 0.5, tailDecay: 5, tailTone: 0.4, volume: 0.722,
    },
  },
  {
    name: 'Flute Mist', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_FLUTE, Level: 0.6, Size: 0.5, Damp: 0.3, Char: 0.85, Partial: 1, Lip: 1, Breath: 0.45, Growl: 0.15, Track: 1, Count: 4, Spread: 200, Cohesion: 0.4, Vary: 0.4, Dist: 35, Az: -0.4 }),
      ...U(1, { Body: BODY_FLUTE, Level: 0.45, Size: 0.7, Damp: 0.3, Char: 0.7, Partial: 1, Lip: 1, Breath: 0.6, Growl: 0.1, Track: 1, Count: 3, Spread: 200, Cohesion: 0.4, Vary: 0.4, Dist: 50, Az: 0.5 }),
      terrain: 1, early: 0.7, tailMix: 0.55, tailDecay: 7, tailTone: 0.35, air: 0.6, wind: 0.3, gust: 0.2, windBed: 0.2, volume: 0.996,
    },
  },
  {
    name: 'Strings And Gong', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.55, Size: 0.8, Tension: 0.3, Damp: 0.2, Char: 0.6, Hard: 0.5, Pos: 0.9, Grit: 0.1, Track: 1, Dist: 8, Az: -0.4 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.45, Size: 1.2, Tension: 0.3, Damp: 0.2, Char: 0.55, Hard: 0.5, Pos: 0.9, Grit: 0.1, Track: 1, Dist: 10, Az: 0.45 }),
      ...U(2, { Body: BODY_GONG, Level: 0.25, Size: 1, Tension: 0.4, Damp: 0.05, Char: 0.6, Hard: 0.1, Pos: 0.3, Track: 1, Dist: 15, Az: 0.1 }),
      terrain: 3, early: 0.55, tailMix: 0.55, tailDecay: 7, tailTone: 0.4, volume: 0.723,
    },
  },
  {
    name: 'Hurdy Drone Field', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.6, Size: 0.7, Tension: 0.3, Damp: 0.25, Char: 0.6, Hard: 0.5, Pos: 0.9, Grit: 0.3, Track: 1, Dist: 4, Az: 0.25 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.4, Size: 2.691, Tension: 0.3, Damp: 0.25, Char: 0.7, Hard: 0.5, Pos: 0.9, Grit: 0.35, Track: 0, Root: 36, Dist: 5, Az: -0.4 }),
      ...U(2, { Body: BODY_BOWED, Level: 0.3, Size: 1.796, Tension: 0.3, Damp: 0.25, Char: 0.6, Hard: 0.5, Pos: 0.9, Grit: 0.3, Track: 0, Root: 43, Dist: 5, Az: -0.1 }),
      terrain: 0, early: 0.4, tailMix: 0.45, tailDecay: 4.5, tailTone: 0.4, wind: 0.3, gust: 0.2, windBed: 0.2, volume: 0.585,
    },
  },
  {
    name: 'Ancestral Drone', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.929, Size: 3.2, Damp: 0.25, Char: 0.05, Partial: 1, Lip: 1, Breath: 1.6, Growl: 0.12, Track: 1, Count: 4, Spread: 400, Cohesion: 0.4, Vary: 0.2, Dist: 55, Az: 0 }),
      terrain: 1, early: 0.6, tailMix: 0.55, tailDecay: 8, tailTone: 0.25, air: 0.6, wind: 0.35, gust: 0.15, windBed: 0.25, volume: 1,
    },
  },
  {
    name: 'Long Night', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 1, Size: 1, Tension: 0.3, Damp: 0.2, Char: 0.55, Hard: 0.5, Pos: 0.9, Grit: 0.1, Track: 1, Dist: 140, Az: -0.4 }),
      ...U(1, { Body: BODY_FLUTE, Level: 1, Size: 0.6, Damp: 0.3, Char: 0.8, Partial: 1, Lip: 1, Breath: 0.6, Growl: 0.1, Track: 1, Count: 2, Spread: 150, Cohesion: 0.5, Vary: 0.3, Dist: 200, Az: 0.5 }),
      terrain: 1, early: 0.75, tailMix: 0.6, tailDecay: 9, tailTone: 0.3, air: 0.75, wind: 0.5, gust: 0.15, windBed: 0.4, volume: 1,
    },
  },
  {
    name: 'Ember Choir', tag: 'pads',
    values: {
      ...U(0, { Body: BODY_FLUTE, Level: 0.5, Size: 0.6, Damp: 0.3, Char: 0.6, Partial: 1, Lip: 1, Breath: 0.5, Growl: 0.06, Track: 1, Count: 4, Spread: 120, Cohesion: 0.5, Vary: 0.3, Dist: 15, Az: -0.35 }),
      ...U(1, { Body: BODY_PIPE, Level: 0.32, Size: 1.1, Damp: 0.45, Char: 0.1, Partial: 1, Lip: 1, Breath: 0.6, Growl: 0.03, Track: 1, Count: 3, Spread: 120, Cohesion: 0.5, Vary: 0.3, Dist: 18, Az: 0.4 }),
      ...U(2, { Body: BODY_BOWED, Level: 0.35, Size: 1.2, Tension: 0.3, Damp: 0.2, Char: 0.5, Pos: 0.9, Grit: 0.08, Track: 1, Dist: 20, Az: 0 }),
      terrain: 3, early: 0.55, tailMix: 0.55, tailDecay: 6, tailTone: 0.35, volume: 0.979,
    },
  },
  // ------------------------------------------------------------ leads
  {
    name: 'Ridge Horn Lead', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 1.3, Damp: 0.3, Char: 0.35, Partial: 3, Lip: 1, Breath: 0.06, Growl: 0.15, Track: 1, Dist: 18, Az: 0.1 }),
      bend: 2, terrain: 1, early: 0.65, tailMix: 0.42, tailDecay: 4.5, tailTone: 0.4, air: 0.5,
    },
  },
  {
    name: 'Bone Whistle', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_FLUTE, Level: 0.75, Size: 0.25, Damp: 0.3, Char: 0.4, Partial: 1, Lip: 1, Breath: 0.02, Growl: 0.2, Track: 1, Dist: 4, Az: -0.1 }),
      bend: 2, terrain: 3, early: 0.5, tailMix: 0.42, tailDecay: 3.5, tailTone: 0.45, wind: 0.15, volume: 0.627,
    },
  },
  {
    name: 'Highland Pipes', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_PIPE, Level: 0.65, Size: 0.45, Damp: 0.35, Char: 0.75, Partial: 1, Lip: 1, Breath: 0.03, Growl: 0.08, Track: 1, Count: 2, Spread: 10, Cohesion: 0.9, Vary: 0.12, Dist: 12, Az: 0.2, KeyLo: 55, KeyHi: 127 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.4, Size: 1.6, Tension: 0.3, Damp: 0.3, Char: 0.8, Pos: 0.9, Grit: 0.45, Track: 0, Root: 45, Dist: 12, Az: -0.3, KeyLo: 55, KeyHi: 127 }),
      ...U(2, { Body: BODY_BOWED, Level: 0.3, Size: 0.8, Tension: 0.3, Damp: 0.3, Char: 0.75, Pos: 0.9, Grit: 0.4, Track: 0, Root: 57, Dist: 12, Az: -0.1, KeyLo: 55, KeyHi: 127 }),
      terrain: 1, early: 0.65, tailMix: 0.4, tailDecay: 4, tailTone: 0.4, wind: 0.25, volume: 0.865,
    },
  },
  {
    name: 'Fiddle Lead', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.85, Size: 0.4, Tension: 0.4, Damp: 0.25, Char: 0.62, Hard: 0.5, Pos: 0.9, Grit: 0.28, Track: 1, Dist: 3, Az: 0.15 }),
      terrain: 2, early: 0.5, tailMix: 0.35, tailDecay: 2.8, tailTone: 0.45, volume: 0.803,
    },
  },
  {
    name: 'Brass Cry', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.75, Size: 1, Damp: 0.35, Char: 0.6, Partial: 4, Lip: 1.06, Breath: 0.04, Growl: 0.4, Track: 1, Dist: 10, Az: -0.15 }),
      bend: 3, terrain: 2, early: 0.6, tailMix: 0.38, tailDecay: 3.5, tailTone: 0.4, proximity: 0.5, volume: 0.818,
    },
  },
  {
    name: 'Shawm', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_PIPE, Level: 0.6, Size: 0.35, Damp: 0.4, Char: 0.95, Partial: 1, Lip: 1, Breath: 0.03, Growl: 0.2, Track: 1, Dist: 6, Az: 0.1 }),
      terrain: 2, early: 0.6, tailMix: 0.35, tailDecay: 3, tailTone: 0.45, volume: 0.597,
    },
  },
  {
    name: 'Signal Trumpet', tag: 'leads',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 0.9, Damp: 0.35, Char: 0.45, Partial: 4, Snap: 1, Lip: 1, Breath: 0.03, Growl: 0.12, Track: 1, Root: 48, Dist: 140, Az: 0.45 }),
      terrain: 1, early: 0.85, tailMix: 0.5, tailDecay: 6, tailTone: 0.35, air: 0.55, wind: 0.3, gust: 0.25, volume: 0.828,
    },
  },
  // ------------------------------------------------------------ bass
  {
    name: 'War 808', tag: 'bass',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.95, Size: 1.6, Tension: 0.3, Damp: 0.08, Char: 0.95, Hard: 0.55, Pos: 0.15, Grit: 0.1, Bend: 0.9, Track: 1, Dist: 4 }),
      terrain: 2, early: 0.2, tailMix: 0.15, tailDecay: 1.5, tailTone: 0.3, proximity: 0.7, volume: 0.566,
    },
  },
  {
    name: 'Deep Horn Bass', tag: 'bass',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.85, Size: 3, Damp: 0.3, Char: 0.05, Partial: 1, Lip: 1, Breath: 0.03, Growl: 0.1, Track: 1, Dist: 6 }),
      terrain: 2, early: 0.35, tailMix: 0.2, tailDecay: 2, tailTone: 0.3, proximity: 0.6, volume: 0.496,
    },
  },
  {
    name: 'Timpani Bass', tag: 'bass',
    values: {
      ...U(0, { Body: BODY_TIMPANI, Level: 0.95, Size: 1.3, Tension: 0.4, Damp: 0.2, Char: 0.9, Hard: 0.5, Pos: 0.75, Grit: 0.05, Bend: 0.5, Track: 1, Dist: 5 }),
      terrain: 2, early: 0.4, tailMix: 0.25, tailDecay: 2.5, tailTone: 0.35, proximity: 0.5,
    },
  },
  {
    name: 'Log Bass', tag: 'bass',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.9, Size: 1.6, Damp: 0.35, Char: 0.85, Hard: 0.55, Pos: 0.3, Grit: 0.2, Bend: 0.3, Track: 1, Dist: 3 }),
      terrain: 3, early: 0.35, tailMix: 0.2, tailDecay: 1.6, tailTone: 0.4, volume: 0.923,
    },
  },
  {
    name: 'Gut String Bass', tag: 'bass',
    values: {
      ...U(0, { Body: BODY_LYRE, Level: 0.9, Size: 1.5, Tension: 0.2, Damp: 0.35, Char: 0.9, Hard: 0.6, Pos: 0.3, Grit: 0.1, Bend: 0.15, Track: 1, Dist: 2.5 }),
      terrain: 2, early: 0.35, tailMix: 0.2, tailDecay: 1.8, tailTone: 0.4, volume: 0.659,
    },
  },
  {
    name: 'Bowed Bass', tag: 'bass',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.85, Size: 1.8, Tension: 0.25, Damp: 0.25, Char: 0.7, Hard: 0.5, Pos: 0.9, Grit: 0.22, Track: 1, Dist: 4, Az: -0.1 }),
      terrain: 2, early: 0.45, tailMix: 0.3, tailDecay: 3, tailTone: 0.35, volume: 0.574,
    },
  },
  // ------------------------------------------------------------ crowds
  {
    name: 'Pilgrims', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_FEET, Level: 1, Size: 1.1, Damp: 0.55, Char: 0.6, Hard: 0.3, Grit: 0.6, Count: 300, Spread: 500, Cohesion: 0.2, Vary: 0.7, Dist: 40, Az: -0.2, Roll: 2 }),
      ...U(1, { Body: BODY_BELL, Level: 1, Size: 0.5, Damp: 0.1, Char: 0.2, Hard: 0.4, Count: 3, Spread: 600, Cohesion: 0.1, Vary: 0.6, Dist: 50, Az: 0.3, Roll: 1 }),
      tempo: 72, terrain: 1, early: 0.6, tailMix: 0.45, tailDecay: 5, tailTone: 0.35, ground: 0.6, air: 0.5, wind: 0.35, windBed: 0.2, volume: 1,
    },
  },
  {
    name: 'Army Camp At Dusk', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_ANVIL, Level: 0.48, Size: 0.5, Damp: 0.4, Char: 0.6, Hard: 0.9, Count: 4, Spread: 1500, Cohesion: 0, Vary: 0.8, Dist: 80, Az: -0.6 }),
      ...U(1, { Body: BODY_LOG, Level: 0.768, Size: 0.6, Damp: 0.6, Char: 0.4, Hard: 0.6, Grit: 0.5, Count: 10, Spread: 1800, Cohesion: 0, Vary: 0.9, Dist: 50, Az: 0.4 }),
      ...U(2, { Body: BODY_HOOVES, Level: 0.672, Size: 1, Damp: 0.5, Char: 0.8, Hard: 0.4, Grit: 0.6, Count: 8, Spread: 1200, Cohesion: 0, Vary: 0.8, Dist: 60, Az: 0.7 }),
      ...U(3, { Body: BODY_HORN, Level: 0.959, Size: 1.5, Damp: 0.35, Char: 0.4, Partial: 3, Breath: 0.2, Growl: 0.15, Track: 1, Dist: 400, Az: -0.3, KeyLo: 60, KeyHi: 127 }),
      terrain: 1, early: 0.7, tailMix: 0.5, tailDecay: 6, tailTone: 0.3, air: 0.65, wind: 0.45, gust: 0.2, windBed: 0.45, volume: 1,
    },
  },
  {
    name: 'Phalanx Advance', tag: 'crowds',
    values: {
      ...U(0, { Body: BODY_SHIELD, Level: 1, Size: 0.75, Damp: 0.5, Char: 0.6, Hard: 0.65, Grit: 0.6, Pos: 0.5, Count: 80, Spread: 60, Cohesion: 0.95, Vary: 0.4, Dist: 10, Roll: 2, Accent: 0.6 }),
      ...U(1, { Body: BODY_FEET, Level: 1, Size: 1, Damp: 0.5, Char: 0.3, Hard: 0.5, Grit: 0.7, Count: 1000, Spread: 160, Cohesion: 0.7, Vary: 0.6, Dist: 12, Roll: 3, Accent: 0.4 }),
      tempo: 96, approach: 12, approachFrom: 3, terrain: 0, early: 0.35, tailMix: 0.3, tailDecay: 2.5, ground: 0.7, wind: 0.25, volume: 0.903,
    },
  },
  // ------------------------------------------------------------ cannon & siege
  {
    name: 'Musket Volley', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 1, Size: 0.3, Damp: 0.4, Char: 0.1, Hard: 0.9, Grit: 0.6, Count: 40, Spread: 350, Cohesion: 0.55, Vary: 0.7, Dist: 120, Az: 0.2 }),
      terrain: 1, early: 0.85, tailMix: 0.5, tailDecay: 5, tailTone: 0.3, ground: 0.5, air: 0.55, wind: 0.3, volume: 1,
    },
  },
  {
    name: 'Mortar Line', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 1, Size: 1.8, Damp: 0.25, Char: 1, Hard: 0.5, Grit: 0.4, Count: 3, Spread: 1600, Cohesion: 0.1, Vary: 0.6, Dist: 420, Az: -0.3 }),
      terrain: 1, early: 0.9, tailMix: 0.6, tailDecay: 10, tailTone: 0.2, ground: 0.5, air: 0.7, wind: 0.45, gust: 0.2, windBed: 0.3, volume: 1,
    },
  },
  {
    name: 'Bombardment', tag: 'cannon',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 0.9, Size: 1.4, Damp: 0.3, Char: 0.8, Hard: 0.6, Grit: 0.5, Count: 5, Spread: 2000, Cohesion: 0, Vary: 0.7, Dist: 250, Az: -0.6 }),
      ...U(1, { Body: BODY_CANNON, Level: 0.9, Size: 1.1, Damp: 0.3, Char: 0.7, Hard: 0.6, Grit: 0.5, Count: 4, Spread: 2000, Cohesion: 0, Vary: 0.7, Dist: 500, Az: 0.5 }),
      ...U(2, { Body: BODY_LOG, Level: 0.3, Size: 2.5, Damp: 0.4, Char: 0.6, Hard: 0.3, Grit: 0.8, Count: 40, Spread: 2000, Cohesion: 0, Vary: 0.9, Dist: 60 }),
      terrain: 1, early: 0.85, tailMix: 0.55, tailDecay: 9, tailTone: 0.2, ground: 0.6, air: 0.6, wind: 0.4, windBed: 0.25, volume: 0.982,
    },
  },
  // ------------------------------------------------------------ cinematic
  {
    name: 'Trailer Hit', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.95, Size: 2.8, Tension: 0.2, Damp: 0.2, Char: 1, Hard: 0.6, Pos: 0.15, Grit: 0.2, Bend: 0.8, Count: 8, Spread: 20, Cohesion: 0.95, Vary: 0.3, Dist: 8 }),
      ...U(1, { Body: BODY_GONG, Level: 0.25, Size: 1.6, Tension: 0.3, Damp: 0.08, Char: 0.9, Hard: 0.3, Pos: 0.4, Dist: 10, Az: 0.3 }),
      ...U(2, { Body: BODY_SHIELD, Level: 0.45, Size: 0.8, Damp: 0.5, Char: 0.6, Hard: 0.8, Grit: 0.6, Count: 100, Spread: 40, Cohesion: 0.9, Dist: 12, Az: -0.3 }),
      ...U(3, { Body: BODY_CANNON, Level: 0.4, Size: 1.6, Damp: 0.3, Char: 0.6, Hard: 0.5, Dist: 15 }),
      terrain: 1, early: 0.55, tailMix: 0.5, tailDecay: 6, tailTone: 0.3, proximity: 0.7, volume: 0.436,
    },
  },
  {
    name: 'Braam Wall', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 0.8, Size: 3, Damp: 0.2, Char: 0.85, Partial: 2, Lip: 0.94, Breath: 0.5, Growl: 0.55, Track: 1, Count: 4, Spread: 80, Cohesion: 0.5, Vary: 0.5, Dist: 25, Az: -0.5 }),
      ...U(1, { Body: BODY_HORN, Level: 0.7, Size: 2.4, Damp: 0.22, Char: 0.8, Partial: 3, Lip: 0.96, Breath: 0.55, Growl: 0.5, Track: 1, Count: 4, Spread: 80, Cohesion: 0.5, Vary: 0.5, Dist: 25, Az: 0.5 }),
      ...U(2, { Body: BODY_DRUM, Level: 0.7, Size: 2.5, Tension: 0.2, Damp: 0.2, Char: 1, Hard: 0.4, Bend: 0.7, Count: 8, Spread: 30, Cohesion: 0.9, Dist: 15 }),
      terrain: 2, early: 0.5, tailMix: 0.5, tailDecay: 6, tailTone: 0.3, proximity: 0.7,
    },
  },
  {
    name: 'Doom Pulse', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.95, Size: 2.4, Tension: 0.2, Damp: 0.25, Char: 1, Hard: 0.45, Pos: 0.15, Bend: 0.7, Count: 4, Spread: 15, Cohesion: 0.95, Dist: 10, Roll: 1, Accent: 0.5 }),
      ...U(1, { Body: BODY_HORN, Level: 0.55, Size: 3.2, Damp: 0.25, Char: 0.2, Partial: 1, Breath: 1.2, Growl: 0.3, Track: 1, Count: 3, Spread: 200, Cohesion: 0.5, Vary: 0.3, Dist: 40 }),
      tempo: 70, terrain: 1, early: 0.6, tailMix: 0.5, tailDecay: 6, tailTone: 0.25, proximity: 0.6, volume: 0.834,
    },
  },
  {
    name: 'The Approach Riser', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_DRUM, Level: 0.85, Size: 0.9, Tension: 0.45, Damp: 0.3, Char: 0.6, Hard: 0.55, Grit: 0.3, Bend: 0.3, Count: 8, Spread: 30, Cohesion: 0.7, Vary: 0.4, Dist: 20, Roll: 5, Accent: 0.5 }),
      ...U(1, { Body: BODY_DRUM, Level: 0.8, Size: 2, Tension: 0.25, Damp: 0.25, Char: 1, Hard: 0.45, Bend: 0.6, Count: 6, Spread: 20, Cohesion: 0.9, Dist: 20, Roll: 2, Accent: 0.3 }),
      ...U(2, { Body: BODY_SHIELD, Level: 0.4, Size: 0.7, Damp: 0.5, Char: 0.6, Hard: 0.7, Grit: 0.6, Count: 60, Spread: 60, Cohesion: 0.8, Dist: 25, Az: 0.3, Roll: 3, Accent: 0.6 }),
      tempo: 120, approach: 12, approachFrom: 8, rally: 10, terrain: 1, early: 0.55, tailMix: 0.4, tailDecay: 4, tailTone: 0.35, ground: 0.6, volume: 0.905,
    },
  },
  {
    name: 'Low Strings Omen', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.65, Size: 2, Tension: 0.25, Damp: 0.2, Char: 0.75, Hard: 0.5, Pos: 0.9, Grit: 0.3, Track: 1, Count: 2, Spread: 40, Cohesion: 0.5, Dist: 20, Az: -0.5 }),
      ...U(1, { Body: BODY_BOWED, Level: 0.6, Size: 1.6, Tension: 0.25, Damp: 0.2, Char: 0.7, Hard: 0.5, Pos: 0.9, Grit: 0.25, Track: 1, Dist: 25, Az: 0.5 }),
      ...U(2, { Body: BODY_DRUM, Level: 0.5, Size: 2.6, Tension: 0.15, Damp: 0.2, Char: 1, Hard: 0.3, Bend: 0.5, Dist: 60, KeyLo: 0, KeyHi: 47 }),
      terrain: 1, early: 0.65, tailMix: 0.55, tailDecay: 7, tailTone: 0.25, air: 0.5, wind: 0.3, windBed: 0.2, volume: 0.901,
    },
  },
  {
    name: 'Impact And Bloom', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_CANNON, Level: 0.8, Size: 1.5, Damp: 0.3, Char: 0.7, Hard: 0.6, Grit: 0.4, Dist: 30 }),
      ...U(1, { Body: BODY_GONG, Level: 0.35, Size: 1.8, Tension: 0.3, Damp: 0.05, Char: 1, Hard: 0.25, Pos: 0.4, Bend: 0.3, Track: 1, Dist: 12, Az: -0.2 }),
      terrain: 1, early: 0.6, tailMix: 0.55, tailDecay: 8, tailTone: 0.3, proximity: 0.6, volume: 0.538,
    },
  },
  {
    name: 'Tension Bed', tag: 'cinematic',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.507, Size: 0.45, Tension: 0.4, Damp: 0.25, Char: 0.45, Hard: 0.5, Pos: 0.9, Grit: 0.35, Track: 1, Count: 2, Spread: 50, Cohesion: 0.4, Dist: 15, Az: 0.4 }),
      ...U(1, { Body: BODY_BLADE, Level: 0.456, Size: 1.2, Tension: 0.5, Damp: 0.3, Char: 0.3, Hard: 0.5, Grit: 0.6, Track: 1, Dist: 8, Az: -0.4 }),
      terrain: 2, early: 0.55, tailMix: 0.5, tailDecay: 6, tailTone: 0.35, wind: 0.4, gust: 0.3, windBed: 0.3, volume: 1,
    },
  },
  // ------------------------------------------------------------ fx
  {
    name: 'Iron Whale', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_BOWED, Level: 0.754, Size: 4, Tension: 0.1, Damp: 0.15, Char: 0.8, Hard: 0.5, Pos: 0.9, Grit: 0.2, Bend: 0.6, Track: 1, Dist: 30 }),
      ...U(1, { Body: BODY_GONG, Level: 0.323, Size: 2.5, Tension: 0.2, Damp: 0.05, Char: 0.8, Hard: 0.1, Bend: 0.6, Track: 1, Dist: 40, Az: 0.4 }),
      bend: 12, terrain: 1, early: 0.7, tailMix: 0.6, tailDecay: 10, tailTone: 0.25, air: 0.6, volume: 1,
    },
  },
  {
    name: 'Ghost Signal', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_HORN, Level: 1, Size: 1.4, Damp: 0.35, Char: 0.5, Partial: 3, Lip: 1.04, Breath: 0.3, Growl: 0.4, Track: 1, Count: 2, Spread: 300, Cohesion: 0.3, Vary: 0.6, Dist: 450, Az: 0.6 }),
      terrain: 1, early: 1, tailMix: 0.65, tailDecay: 11, tailTone: 0.2, air: 0.9, wind: 0.8, gust: 0.12, windBed: 0.5, volume: 1,
    },
  },
  {
    name: 'Storm Front', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_SHIELD, Level: 1, Size: 4, Tension: 0.1, Damp: 0.15, Char: 0.1, Hard: 0.1, Pos: 0.5, Grit: 0.7, Bend: 0.7, Count: 8, Spread: 1200, Cohesion: 0, Vary: 0.6, Dist: 150 }),
      ...U(1, { Body: BODY_CANNON, Level: 1, Size: 2.5, Damp: 0.2, Char: 1, Hard: 0.3, Grit: 0.3, Dist: 700, Az: -0.5 }),
      terrain: 1, early: 0.9, tailMix: 0.6, tailDecay: 11, tailTone: 0.2, air: 0.8, wind: 0.8, gust: 0.35, windBed: 0.7, volume: 1,
    },
  },
  {
    name: 'Glass Wind', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_BLADE, Level: 0.627, Size: 0.5, Tension: 0.4, Damp: 0.15, Char: 0.2, Hard: 0.4, Pos: 0.5, Grit: 0.3, Track: 1, Dist: 20, Az: -0.4 }),
      ...U(1, { Body: BODY_BELL, Level: 0.251, Size: 0.3, Damp: 0.1, Char: 0.2, Hard: 0.4, Count: 6, Spread: 1500, Cohesion: 0, Vary: 0.8, Dist: 30, Az: 0.5 }),
      terrain: 2, early: 0.55, tailMix: 0.6, tailDecay: 8, tailTone: 0.55, wind: 0.7, gust: 0.3, windBed: 0.6, volume: 1,
    },
  },
  {
    name: 'Broken Bells', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_BELL, Level: 0.35, Size: 1.2, Tension: 0.3, Damp: 0.1, Char: 1, Hard: 0.85, Pos: 0.6, Grit: 0.5, Bend: 0.5, Count: 5, Spread: 300, Cohesion: 0.2, Vary: 1, Dist: 30, Az: 0.2 }),
      terrain: 2, early: 0.6, tailMix: 0.5, tailDecay: 6, tailTone: 0.35, volume: 0.489,
    },
  },
  {
    name: 'Earthquake', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_LOG, Level: 0.669, Size: 4, Damp: 0.3, Char: 0.9, Hard: 0.2, Grit: 0.9, Bend: 0.6, Count: 120, Spread: 2000, Cohesion: 0, Vary: 0.9, Dist: 30 }),
      ...U(1, { Body: BODY_CANNON, Level: 0.669, Size: 3, Damp: 0.2, Char: 1, Hard: 0.2, Grit: 0.2, Dist: 60 }),
      terrain: 1, early: 0.6, tailMix: 0.5, tailDecay: 7, tailTone: 0.15, ground: 0.9, proximity: 0.8, volume: 0.964,
    },
  },
  {
    name: 'Rusted Gate', tag: 'fx',
    values: {
      ...U(0, { Body: BODY_BLADE, Level: 0.6, Size: 2, Tension: 0.3, Damp: 0.35, Char: 0.85, Hard: 0.4, Pos: 0.7, Grit: 0.95, Track: 1, Dist: 5, Az: -0.3 }),
      ...U(1, { Body: BODY_LOG, Level: 0.5, Size: 2.5, Damp: 0.3, Char: 0.8, Hard: 0.3, Grit: 0.6, Dist: 6, Az: 0.2 }),
      terrain: 2, early: 0.65, tailMix: 0.4, tailDecay: 3.5, tailTone: 0.35, volume: 0.73,
    },
  },
  // ------------------------------------------------------------ init
  {
    name: 'Init', tag: 'init',
    values: {},
  },
];
