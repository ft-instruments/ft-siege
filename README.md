# ft-siege

**SIEGE** — a physically modelled war ensemble. Where `ft-mycelia` models
circuits and `ft-vector` models digital systems, Siege models **impacts
on large bodies, driven tubes, crowds of them, and the open ground they
are heard across**. Taiko lines, shield walls, carnyx over a ridge, a
cannon at 800 m, two thousand feet — and the quiet war: a single horn, a
blade drawn. Nothing is sampled. Runs in the browser; the DSP core lifts
straight into a VST3/AU plugin (same shape as the rest of the family).

```
npm install
npm run dev        # open the printed URL in Chrome/Edge (Web MIDI)
npm run build      # static site in dist/
npm run render     # offline render of every preset to out/*.wav, no browser needed
npm run check      # headless Chrome: boots the worklet, plays, screenshots the three views
```

Play with a MIDI keyboard (notes, velocity, pitch bend on the horns,
sustain CC64), the on-screen keys (lower on the key = louder), or the
computer keyboard (`A`…`'` / `Z`…`/`, arrows change octave, Space =
sustain). Drag knobs vertically, `Shift` for fine, double-click to reset.
**muster** nudges the patch and moves a unit; **dispatch** puts the patch
JSON on the clipboard (paste it into `PRESETS` in `params.ts` to keep it).

## The idea

An **army of eight units**. Each unit is a *body* (or a horn), a
*strike*, a *crowd* of them, and a *place* on the field. Every key goes
to every unit whose key range covers it, so one instrument is a drum kit,
a melodic horn, or a whole battle, depending on how the ranges are cut.

```
key ──► unit I   body · strike · crowd ──► path (delay · ground · air · proximity · pan) ─┐
    ──► unit II  …                                                                       ├─► terrain (echoes · tail) ─► wind bed ─► out
    ──► …                                                                                ┘
```

Everything lives in [`src/dsp/`](src/dsp/) and has no browser dependencies.

### 1. Bodies — `modal.ts`

One machine, a bank of up to 32 second-order resonators, and a recipe per
body: mode ratios, damping law, and which modes a strike at the centre or
at the edge reaches.

| body | recipe |
|---|---|
| drum | membrane modes from the Bessel roots (30 of them), strike position via J_m; the **cavity** (character) stiffens the axisymmetric modes and adds the Helmholtz boom; shell knock |
| timpani | a kettledrum: the (1,1) mode is the note, the **kettle** (character) tunes the ring modes to 1 : 1.5 : 2 : 2.5 : 3 and kills the axisymmetric ones — that is what makes it pitched |
| gong | thin circular plate, dense inharmonic pairs, long decay; **bloom** (character) |
| bell | hum, prime, tierce, quint, nominal … 24 partials; the hum rings longest |
| shield | stiff rectangular plate on a wooden **backing** (character), short and gritty |
| anvil | bar partials plus a spray of high plate modes; **ring** (character) |
| blade | free–free bar, near-harmonic; the **draw** (character) is a stick–slip scrape while the key is held |
| log | irregular wood modes; **hollow** (character) opens the cavity |
| bars | wooden bars over resonator tubes, partials tuned 1 : 4 : 10; the **resonator** (character) swells the fundamental |
| lyre | a plucked string: 30 near-harmonic partials with a little stiffness, plucked at the centre or near the bridge (position); **body** (character) adds a soundbox |
| bowed | the same string driven by friction locked to its own period (Helmholtz motion) while the key is held; **bow** (character) is pressure |
| feet / hooves | the ground under a boot: a thud and the earth; **gait** (character) sets the heel–toe / far-hoof split |
| cannon | barrel modes reached by an N-wave blast, plus debris modes reached only by the debris hits that follow; **charge** (character) |

Two cheap nonlinearities the literature says are the signature of big
struck things: **tension modulation** (Avanzini / Bank) — the pitch of a
membrane rises with its energy, so a hard hit starts sharp and glides down
over the attack (`bend`) — and the gong **bloom** (Ducceschi, Poirot) —
the distortion products of the low modes are fed into the high modes
through a slow envelope, so energy cascades upward ~100 ms after a hard
strike.

### 2. Horns — `horn.ts`

A waveguide bore (one delay line for the round trip, a bell that reflects
the lows and radiates the highs) driven by a **lip valve**: a displacement
resonator on the acoustic pressure difference; its displacement plus the
rest opening is the aperture, closed at zero; Bernoulli flow through it
drives the bore. The lips have their own frequency, which is what gives
what samples cannot:

- **partial** — the tube is cut for `f / partial`, the lips buzz at `f`: a
  long horn playing its third partial sounds like a long horn.
- **natural** — the tube is fixed at the root and the lips are asked for
  the note as played: on the harmonic series it speaks (the 7th lands 31
  cents flat, as it should), off the series it cracks to the nearest
  partial.
- **lip** — embouchure: lipping a note up or down, thinner and quieter as
  it strains.
- **rip** (character) — the lips start below the note and glide up over
  the breath; **growl** — unsteady breath.
- **pipe** — the same valve as a stiff, high-Q reed with no bell: buzzy and
  nasal.
- **flute** — an air jet instead of a valve (Cook's model): the jet crosses
  the mouth in about half a period, is bent by the bore's pressure, and its
  sigmoid drives an open pipe; **breathy** (character) lengthens the jet.

A tube is seeded with a standing wave at its period when it starts, and
the breath is tongued, so horns speak within ~10 ms; the swell after that
is the `breath` time.

The valve plays sharp of the bore (as outward-striking reeds do), so the
tube is cut long by a measured amount per partial; `render` checks tuning
to within about ±15 cents over three octaves.

### 3. Crowds — `unit.ts`

The war sound is *number*. A modal bank is linear, so a hundred strikes on
a hundred similar drums is a hundred pulses into a few slightly different
banks, and the bank sums them for free. Each unit has four bank variants
(size perturbed by `variation`); the scheduler spreads a strike's `count`
hits over `spread` × (1 − `cohesion`) milliseconds, varies strength and
position, and normalises loudness so massed hits neither vanish nor clip.
A drum line is cohesion 1; a rout is cohesion 0. Horns get up to four
detuned, staggered instances per voice. Bodies that **track keys** become
melodic and play the key's pitch (timpani, bells, bars, lyre, bowed,
anvils, tubes — these track by default); the rest play their natural pitch
from any key in range.

### 4. The field — `space.ts`

Not a hall. Per unit, a **path**: speed-of-sound delay relative to the
nearest unit (off by default; with **arrive late** on, a drum 400 m behind
the front line arrives 1.2 s after it), 1/r level,
air absorption that darkens with distance and **humidity**, a
**ground**-reflection comb (path difference 2·h·h′/d, so it collapses to
reinforcement far away), a pan, and **proximity** overload for anything
inside 12 m. Because the delay follows the distance, moving a unit *is*
Doppler.

Globally, the **terrain**: sparse early reflections that are the landscape
(open field, valley walls at a few hundred metres, city walls, forest
scattering) and a long, low-density, dark tail — rolling, not diffuse.
**Wind** is a slow random signal that carries and takes the far units'
level and brightness, with an optional audible bed.

### 5. The drill — `engine.ts`

A march clock. Each unit can **roll** (retrigger its held keys on a
division, every fourth hit strong by `accent`). **Approach** starts the
whole army at `from` × its distance when it is first heard after silence
and brings it in over the given seconds — late, dull and wide, then close.
**Rally** starts the crowds ragged and tightens them over time.

`scripts/render.ts` drives the engine in Node: `all`, `preset "Taiko
Line"`, `note 48 100`, `body gong 48 100` (one body, close, dry), `modes
drum` (the mode table), `distance` (arrival time and level per distance),
`bench`. `scripts/check-browser.ts` runs the built site in headless
Chrome, plays, checks the output level and screenshots the three views.

## Presets

58, grouped in a searchable browser (click the preset name or press `` ` ``, `Esc` closes); `< >` step through them in browser order.

| category | presets |
|---|---|
| drums | Taiko Line (12) · War Drum Solo · Frame Drum Circle · Pitched Toms · Distant Drums (420 m) · Drums Both Flanks · Drum Roll |
| metal | Shield Wall (200) · Tam-tam · Temple Bell · Anvil Chorus · Blade Draw · Blade Clash · Gong Bloom |
| horns | Carnyx Over The Ridge (600 m) · Natural Horn · Braam (three cracked horns and a drum) · Cracked Signal · Ship Horn · Pipes And Drones · Horn Section |
| instruments | Timpani · Timpani Roll · War Lyre · Lament · Hurdy-Gurdy · Fiddle Over Drums · Bone Flute · Flutes Over Water · Wooden Bars · Bars And Bells · Court Ensemble · Dirge |
| crowds | March Of Two Thousand · Drill Square · Cavalry (approaching) · Stampede · Spears On Ground · Shields Locking · Rout |
| cannon & siege | Cannon 50 m · Cannon 800 m · Battery · Siege Gate |
| the field | Battlefield Kit (eight units across the keys) · Quiet War · Approach · The Charge · Night Watch · Forge |
| signals | Alarm Bells · War Bells · Grinding Stone · Bronze Drums · Gong Wall · Thunder Sheet · Hollow Logs · Ridge Echo Test |

## UI

The FT Instrument look (`src/ft.css`, shared with Mycelia and Vector) in
Siege's skin (`src/style.css`): iron plates by firelight. The room is a
night field with a fortress black against the fires on the horizon and
embers going up; the modules are smoked-iron plates cut at both top
corners like a battlement, studded at the foot and numbered in Roman;
titles are cut in Cinzel and glow with their module's heat (ember for the
units, bronze for horns, bone for the map, moss for the terrain, steel for
the air, blood for the drill), exposed as `--accent` / `--accent-rgb`,
which every canvas reads. The name takes a blow on every preset load.

Three views (`1`–`3`): **army** (the eight units — a unit folds to one line
when its level is 0; each shows its body, deforming on hits, with its body
picker and main knobs large, then the strike or the horn controls depending
on what it is), **field** (the map across the full width: the listener at
the bottom, distance rings on a log scale to 800 m, each unit a formation
at its bearing and distance — drag to move it; then terrain, air and
weather), **drill** (the march clock and the rolls; lanes for units that
are off dim). Modules carry a picture of what they do, drawn with the
field's own maths (`src/ui/viz.ts`): the terrain's echo taps and tail, air
absorption at 10, 100 and 800 m, twenty seconds of gusts, the march with
its approach and rally, one bar of every roll. The header carries a
seismograph of the output and the master volume.

Presets: the browser (`` ` ``) has a category sidebar; **save** (⌘S) names
the current sound and keeps it in this browser under *yours* (delete with
×). The power button raises the army and stands it down.

## Porting to a plugin (JUCE)

- `SiegeEngine(sampleRate)` ↔ `prepareToPlay`
- `noteOn / noteOff / controlChange / pitchBend` ↔ the MIDI buffer in `processBlock`
- `process(L, R, n)` ↔ the audio buffer (any `n`; it chunks internally in 32s)
- `setParam(id, value)` ↔ `AudioProcessorValueTreeState`, using `PARAMS` as the list
- the march clock runs from `tempo`; in a plugin, feed it the host tempo instead

No allocation on the audio thread (typed arrays and scalars). About 8 % of
one core for the heaviest preset with eight keys held at 48 kHz in V8; the
modal banks are the cost and are trivially SIMD-able in C++.

## Known limitations / next steps

- Bodies are linear apart from the two modelled nonlinearities; a blade
  clash is two bars, not contact between them.
- The horn is a single bore; no valves, no hand-stopping, one bell filter.
- Crowd variants are four per unit; the timing spread carries the rest.
- The N-wave is a shape, not a propagation model; the far boom comes from
  the air and the terrain.
- Saved presets live in this browser's storage only; *dispatch* copies a
  patch as JSON to move it elsewhere.

## Sources consulted

- Avanzini, Marogna, Bank — energy-based tension modulation in membranes (JASA 2012)
- Ducceschi et al. — real-time gong synthesis and simplified mode coupling (DAFx 2023)
- Poirot et al. — a perceptual model of mode coupling in plates (JAES)
- J. O. Smith — physical modelling update: lip reeds and waveguide brass (CCRMA)
- Cook / STK `Brass` — the squared lip valve this one started from and departed
- ISO 9613 — atmospheric absorption and ground effect, in spirit
- Farnell — procedural footsteps and crowds, for the statistics of many
