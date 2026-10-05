// The whole instrument: MIDI in, stereo audio out. C++ port of
// src/dsp/engine.ts. Construct with a sample rate (allocates), then feed
// noteOn / noteOff / controlChange / pitchBend and call process(L, R, n)
// with any n; nothing allocates after construction.
//
//   units → paths (delay · ground · air · proximity · pan) → terrain
//   (echoes · tail) → wind bed → volume → DC block → clip
//
// Two additions over the TS, for running inside a host: setHostTempo()
// replaces the tempo knob with the host's, and setHostPosition() drives the
// march clock (the rolls) from the host's song position while it plays.
#pragma once

#include <memory>
#include <vector>
#include "Unit.h"
#include "Space.h"

namespace ftsiege {

class Engine {
public:
  /** The loudness range of the keys at full velocity sensitivity. */
  static constexpr double VEL_RANGE_DB = 40;

  ParamValues p = defaultParams();
  double peakL = 0, peakR = 0;
  /** Recent output for the seismograph; ring buffers. */
  float scopeL[512] = {}, scopeR[512] = {};
  /**
   * Live state for the display, per unit i: [i*3] level, [i*3+1] hits since last read,
   * [i*3+2] distance /4 (0..200); then [24] wind, [25] approach progress, [26] beat phase, [27] rally, [28] active units.
   */
  uint8_t display[32] = {};

  explicit Engine(double sampleRate) : terrain(sampleRate), wind(sampleRate), dcL(sampleRate), dcR(sampleRate), fs(sampleRate) {
    for (int i = 0; i < UNITS; i++) { units.push_back(std::make_unique<Unit>(i, sampleRate)); paths.push_back(std::make_unique<Path>(sampleRate)); }
  }

  int activeVoices() const {
    int c = 0;
    for (auto& u : units) if (u->active()) c++;
    return c;
  }

  // ---------------------------------------------------------------- params

  void setParam(int id, double value) {
    if (id < 0 || id >= NUM_PARAMS) return;
    const ParamDef& def = PARAMS[id];
    p[(size_t)id] = std::min(def.max, std::max(def.min, value));
  }

  /** Replace every parameter (preset load). Missing ids go to their default. */
  void loadPreset(const Preset& pr) {
    ParamValues v = defaultParams();
    for (int i = 0; i < pr.count; i++) v[(size_t)pr.values[i].id] = pr.values[i].value;
    for (int i = 0; i < NUM_PARAMS; i++) setParam(i, v[(size_t)i]);
  }

  // ------------------------------------------------------------- host sync

  /** The host's tempo, or <= 0 to use the tempo knob. */
  void setHostTempo(double bpm) { hostTempo = bpm; }

  /** While the host plays, the march clock follows its position (in quarter notes). */
  void setHostPosition(bool playing, double ppq) {
    hostPlaying = playing;
    if (playing) beat = ppq;
  }

  // ------------------------------------------------------------------ MIDI

  void noteOn(int note, double velocity) {
    if (velocity <= 0) { noteOff(note); return; }
    const double sens = p[P::vel];
    const double v = std::min(1.0, velocity / 127);
    const double vel = std::pow(10.0, (-(1 - v) * sens * VEL_RANGE_DB) / 20);
    const double touch = 1 - sens * (1 - v);
    if (!held.includes(note)) held.push(note);
    const int si = sustained.indexOf(note); if (si >= 0) sustained.removeAt(si);
    for (int i = 0; i < UNITS; i++) {
      const UnitIds& u = UNIT_IDS[i];
      if (p[(size_t)u.level] <= 0) continue;
      if (note < p[(size_t)u.keyLo] || note > p[(size_t)u.keyHi]) continue;
      units[(size_t)i]->noteOn(note, vel, touch, p, cohesionScale());
    }
  }

  void noteOff(int note) {
    const int hi = held.indexOf(note); if (hi >= 0) held.removeAt(hi);
    if (sustain) { if (!sustained.includes(note)) sustained.push(note); return; }
    for (auto& u : units) u->noteOff(note);
  }

  void controlChange(int cc, int value) {
    switch (cc) {
      case 64: {
        const bool on = value >= 64;
        if (on == sustain) break;
        sustain = on;
        if (!on) {
          for (int k = 0; k < sustained.size; k++) for (auto& u : units) u->noteOff(sustained[k]);
          sustained.clear();
        }
        break;
      }
      case 120: case 123: allNotesOff(); break;
      default: break;
    }
  }

  /** -1..1 */
  void pitchBend(double v) { bendNorm = std::max(-1.0, std::min(1.0, v)); }

  void allNotesOff() {
    for (auto& u : units) u->allNotesOff();
    sustained.clear(); held.clear();
  }

  void panic() {
    allNotesOff();
    for (auto& u : units) u->clear();
    for (auto& pth : paths) pth->clear();
    terrain.clear();
  }

  // ---------------------------------------------------------------- audio

  void process(float* L, float* R, int n) {
    if (hostTempo > 0) p[P::tempo] = hostTempo;
    std::fill(L, L + n, 0.f); std::fill(R, R + n, 0.f);
    const double bendMult = std::pow(2.0, bendNorm * p[P::bend] / 12);
    const double beatsPerSample = p[P::tempo] / 60 / fs;
    const bool latency = p[P::latency] >= 0.5;
    for (int off = 0; off < n; off += CHUNK) {
      const int count = std::min(CHUNK, n - off);
      const double dt = count / fs;
      bool anyActive = held.size > 0 || sustained.size > 0;
      if (!anyActive) for (auto& u : units) if (u->active()) { anyActive = true; break; }
      if (anyActive) { armyT += dt; quiet = 0; }
      else { quiet += dt; if (quiet > 1.5) armyT = 0; }
      const double approach = p[P::approach];
      const double approachT = approach > 0 ? std::min(1.0, armyT / approach) : 1;
      const double distMult = 1 + (p[P::approachFrom] - 1) * (1 - approachT);
      const double cs = cohesionScale();
      const double beatPrev = beat;
      beat += beatsPerSample * count;
      const double w = wind.tick(count, p[P::gust]) * p[P::wind];
      double nearest = 800;
      for (int i = 0; i < UNITS; i++) if (p[(size_t)UNIT_IDS[i].level] > 0) nearest = std::min(nearest, p[(size_t)UNIT_IDS[i].dist] * distMult);
      for (int i = 0; i < UNITS; i++) {
        const UnitIds& ids = UNIT_IDS[i];
        Unit& u = *units[(size_t)i];
        if (p[(size_t)ids.level] <= 0 && !u.active()) continue;
        u.setBend(bendMult);
        u.process(mono, count, p, beat, beatPrev, cs);
        double dist = p[(size_t)ids.dist] * distMult; if (dist > 800) dist = 800;
        paths[(size_t)i]->process(mono, count, L, R, off, dist, std::max(0.0, dist - nearest), p[(size_t)ids.az], latency, p[P::air], p[P::ground], p[P::proximity], w);
      }
      wind.bed(L, R, off, count, p[P::windBed]);
    }
    terrain.process(L, R, n, toInt(p[P::terrain]), p[P::early], p[P::tailMix], p[P::tailDecay], p[P::tailTone]);
    const double vol = p[P::volume] * p[P::volume] * 2.4;
    double pl = 0, pr = 0;
    int si = scopeIdx;
    for (int i = 0; i < n; i++) {
      const double l = softClip(dcL.tick(L[i] * vol));
      const double r = softClip(dcR.tick(R[i] * vol));
      L[i] = (float)l; R[i] = (float)r;
      const double al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      if (al > pl) pl = al; if (ar > pr) pr = ar;
      scopeL[si] = (float)l; scopeR[si] = (float)r; si = (si + 1) & 511;
    }
    scopeIdx = si;
    peakL = pl; peakR = pr;
    for (int i = 0; i < UNITS; i++) {
      Unit& u = *units[(size_t)i];
      display[i * 3] = (uint8_t)std::min(255.0, jsRound(u.level * 900));
      display[i * 3 + 1] = (uint8_t)std::min(255.0, u.hits); u.hits = 0;
      display[i * 3 + 2] = (uint8_t)std::min(200.0, jsRound(paths[(size_t)i]->distNow / 4));
    }
    display[24] = (uint8_t)jsRound((wind.value + 1) * 127.5);
    display[25] = (uint8_t)jsRound(std::min(1.0, p[P::approach] > 0 ? armyT / p[P::approach] : 1) * 255);
    display[26] = (uint8_t)jsRound(std::fmod(beat, 4) / 4 * 255);
    display[27] = (uint8_t)jsRound(cohesionScale() * 255);
    display[28] = (uint8_t)activeVoices();
  }

private:
  double cohesionScale() const {
    const double r = p[P::rally];
    return r > 0 ? std::min(1.0, 0.15 + 0.85 * armyT / r) : 1;
  }

  std::vector<std::unique_ptr<Unit>> units;
  std::vector<std::unique_ptr<Path>> paths;
  Terrain terrain;
  Wind wind;
  DCBlock dcL, dcR;
  float mono[CHUNK] = {};
  bool sustain = false;
  FixedList<int, 128> sustained, held;
  double bendNorm = 0;
  double beat = 0;
  double armyT = 0, quiet = 0;
  int scopeIdx = 0;
  double hostTempo = 0;
  bool hostPlaying = false;
  const double fs;
};

} // namespace ftsiege
