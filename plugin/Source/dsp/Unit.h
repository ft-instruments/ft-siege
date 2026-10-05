// One unit of the army: a body (four modal banks: crowd variants, or voices
// when the body tracks the keys) or a horn (four voices of up to four
// instances), the exciters that strike, scrape or blast it, and the crowd
// scheduler that turns one key into two hundred hits. C++ port of
// src/dsp/unit.ts (see there for the reasoning).
#pragma once

#include <memory>
#include <vector>
#include "Modal.h"
#include "Horn.h"

namespace ftsiege {

constexpr int CHUNK = 32;

class Unit {
public:
  static constexpr int BANKS = 4;
  static constexpr int HORN_VOICES = 4, HORN_INST = 4;
  static constexpr int MAX_PENDING = 1024;
  static constexpr int MAX_EVENTS = 256;
  static constexpr int MAX_ACTIVE = 64;
  static constexpr int SHAPE_HANN = 0, SHAPE_NWAVE = 1;
  static constexpr int MAX_BLASTS = 8;
  static constexpr int MAX_HELD = 128;

  const int idx;
  int body = -1;
  /** meters for the display */
  double level = 0;
  double hits = 0;
  double crowdPending = 0;

  Unit(int index, double sampleRate) : idx(index), ids(UNIT_IDS[index]), rng((uint32_t)(0x1234567 + index * 7919)), fs(sampleRate) {
    for (int b = 0; b < BANKS; b++) banks.push_back(std::make_unique<ModalBank>(sampleRate));
    for (int v = 0; v < HORN_VOICES * HORN_INST; v++) horns.push_back(std::make_unique<HornVoice>(sampleRate, index * 64 + v + 1));
    std::fill(std::begin(bankNote), std::end(bankNote), -1.0);
    std::fill(std::begin(hornNote), std::end(hornNote), -1.0);
    std::fill(std::begin(last), std::end(last), std::numeric_limits<double>::quiet_NaN());
  }

  bool isHorn() const { return body >= 0 && body < NUM_BODIES && IS_TUBE[body]; }

  bool active() const {
    if (pending > 0 || held.size > 0) return true;
    for (int i = 0; i < MAX_ACTIVE; i++) if (hOn[i]) return true;
    for (auto& b : banks) if (b->level() > 1e-5) return true;
    for (auto& h : horns) if (h->active) return true;
    return false;
  }

  void clear() {
    for (auto& b : banks) b->clear();
    for (auto& h : horns) h->kill();
    std::fill(std::begin(hOn), std::end(hOn), (uint8_t)0); pending = 0; held.clear(); heldVel.clear(); heldTouch.clear(); level = 0;
    std::fill(std::begin(bOn), std::end(bOn), (uint8_t)0);
  }

  void noteOn(int note, double vel, double touch, const ParamValues& p, double cohesionScale) {
    refreshDesign(p);
    const int i = held.indexOf(note);
    if (i >= 0) { held.removeAt(i); heldVel.removeAt(i); heldTouch.removeAt(i); }
    held.push(note); heldVel.push(vel); heldTouch.push(touch);
    rollCount = 0;
    strike(note, vel, touch, p, cohesionScale);
  }

  void noteOff(int note) {
    const int i = held.indexOf(note);
    if (i >= 0) { held.removeAt(i); heldVel.removeAt(i); heldTouch.removeAt(i); }
    if (isHorn()) for (auto& h : horns) if (h->active && !h->released && h->note == note) h->noteOff();
  }

  void allNotesOff() {
    int copy[MAX_HELD]; const int n = held.size;
    for (int k = 0; k < n; k++) copy[k] = held[k];
    for (int k = 0; k < n; k++) noteOff(copy[k]);
  }

  void setBend(double mult) {
    if (mult == bendMult) return;
    bendMult = mult;
    if (isHorn()) for (auto& h : horns) if (h->active) h->retune(hp, mult);
  }

  /** Render `count` (≤ CHUNK) samples of the unit's mono output into `out` (overwritten). */
  void process(float* out, int count, const ParamValues& p, double beat, double beatPrev, double cohesionScale) {
    std::fill(out, out + count, 0.f);
    refreshDesign(p);
    // the roll: retrigger the held keys on the march clock
    const double roll = ROLL_BEATS[toInt(P_(p, ids.roll))];
    if (roll > 0 && held.size > 0) {
      const double a = std::floor(beatPrev / roll), b = std::floor(beat / roll);
      if (b != a) {
        rollCount++;
        const double accent = P_(p, ids.accent);
        const bool strong = std::fmod(b, 4) == 0;
        const double g = strong ? 1 : 1 - accent * 0.6;
        for (int i = 0; i < held.size; i++) strike(held[i], heldVel[i] * g, heldTouch[i] * (strong ? 1 : 1 - accent * 0.3), p, cohesionScale);
      }
    }
    if (isHorn()) {
      refreshHorn(p);
      const double growl = hp.growl;
      bool any = false;
      for (auto& h : horns) if (h->active) { h->process(out, 0, count, growl); any = true; }
      for (int v = 0; v < HORN_VOICES; v++) hornAge[v] += count;
      const double g = 0.7 * BODY_GAIN[body] * P_(p, ids.level);
      double lvl = level;
      for (int i = 0; i < count; i++) { out[i] = (float)(out[i] * g); const double a = out[i] < 0 ? -(double)out[i] : (double)out[i]; lvl += (a - lvl) * 0.002; }
      level = any ? lvl : lvl * 0.9;
      return;
    }
    // stick–slip while the key is held: the blade draw, and the bow locked to the string's period
    const bool bowed = body == BODY_BOWED;
    if ((body == BODY_BLADE || bowed) && held.size > 0 && (bowed || P_(p, ids.chr) > 0.02)) {
      const double press = P_(p, ids.chr);
      const int top = held[held.size - 1];
      const bool track = P_(p, ids.track) >= 0.5;
      const double rate = bowed
        ? midiToFreq(track ? top : P_(p, ids.root)) * (1 + 0.004 * rng.bi() * (0.3 + press))
        : 30 + 500 * press * press;
      while (scrapeTimer < count) {
        const double tMs = std::max(0.0, scrapeTimer) / fs * 1000;
        scrapeTimer += bowed ? fs / rate : fs / rate * (0.5 + rng.next());
        const int b = track ? allocBank(top, p) : (bowed ? 0 : toInt(rng.next() * BANKS));
        const double amp = bowed ? scrapeAmp * 0.035 * (0.6 + 0.6 * press) * (0.85 + 0.3 * rng.next()) : scrapeAmp * 0.06 * (0.4 + rng.next());
        const double len = bowed ? 0.15 + 0.25 * (1 - press) : 0.25 + 0.4 * rng.next();
        const double pos = bowed ? 0.9 : 0.5 + 0.5 * rng.next();
        push(tMs, amp, pos, b, len, SHAPE_HANN, bowed ? 0.15 * P_(p, ids.grit) : 0.6 + 0.4 * P_(p, ids.grit));
      }
      scrapeTimer -= count;
    }
    // promote pending hits whose time has come
    for (int b = 0; b < BANKS; b++) { std::fill(A[b], A[b] + count, 0.f); std::fill(B[b], B[b] + count, 0.f); }
    int pend = pending;
    for (int i = 0; i < pend;) {
      pT[i] -= count;
      if (pT[i] <= 0) {
        int slot = -1;
        for (int s = 0; s < MAX_ACTIVE; s++) if (!hOn[s]) { slot = s; break; }
        if (slot >= 0) {
          hOn[slot] = 1; hPhase[slot] = pT[i]; hLen[slot] = pL[i]; hAmp[slot] = pA[i];
          hPos[slot] = pP[i]; hBank[slot] = pB[i]; hShape[slot] = pS[i]; hNoise[slot] = pN[i];
        }
        pend--;
        pT[i] = pT[pend]; pA[i] = pA[pend]; pP[i] = pP[pend]; pB[i] = pB[pend];
        pL[i] = pL[pend]; pS[i] = pS[pend]; pN[i] = pN[pend];
      } else i++;
    }
    pending = pend;
    crowdPending = pend;
    // render the active hits into the accumulators
    for (int s = 0; s < MAX_ACTIVE; s++) {
      if (!hOn[s]) continue;
      const double len = hLen[s], amp = (double)hAmp[s] / len * 2, pos = hPos[s], noise = hNoise[s];
      const int b = hBank[s], shape = hShape[s];
      float* a = A[b];
      float* bb = B[b];
      double ph = hPhase[s];
      for (int i = 0; i < count; i++, ph++) {
        if (ph < 0) continue;
        if (ph >= len) { hOn[s] = 0; break; }
        const double u = ph / len;
        double e;
        if (shape == SHAPE_NWAVE) e = (1 - 2 * u) * 3;
        else e = 0.5 - 0.5 * std::cos(6.283185307 * u);
        const double v = amp * e;
        const double nz = noise > 0 ? amp * noise * rng.bi() * (0.5 - 0.5 * std::cos(6.283185307 * u)) * 0.7 : 0;
        a[i] = (float)(a[i] + (v + nz));
        bb[i] = (float)(bb[i] + (v + nz) * pos);
      }
      hPhase[s] = ph;
    }
    // the banks
    for (int b = 0; b < BANKS; b++) {
      ModalBank& bank = *banks[(size_t)b];
      if (bank.n == 0) continue;
      bank.updatePitch();
      bank.process(A[b], B[b], out, 0, count);
      bankAge[b] += count;
    }
    if (body == BODY_CANNON) renderBlasts(out, count);
    // output gain, with a crowd compressor
    const double g = 0.1 * BODY_GAIN[body] * P_(p, ids.level);
    double lvl = level;
    for (int i = 0; i < count; i++) {
      out[i] = (float)(out[i] * (g / (1 + 2.5 * lvl)));
      const double a = out[i] < 0 ? -(double)out[i] : (double)out[i]; lvl += (a - lvl) * 0.002;
    }
    level = lvl;
  }

private:
  static double P_(const ParamValues& p, int id) { return p[(size_t)id]; }

  /** Re-design the banks when the body-defining parameters change. */
  void refreshDesign(const ParamValues& p) {
    const int b = toInt(P_(p, ids.body));
    const double key[8] = { (double)b, P_(p, ids.size), P_(p, ids.tension), P_(p, ids.damp), P_(p, ids.chr), P_(p, ids.bend), P_(p, ids.vary), P_(p, ids.root) };
    bool same = true;
    for (int i = 0; i < 8; i++) if (!(key[i] == last[i])) { same = false; last[i] = key[i]; }
    if (same) return;
    if (b != body) {
      body = b;
      for (auto& bk : banks) bk->clear();
      for (auto& h : horns) h->kill();
      std::fill(std::begin(bankNote), std::end(bankNote), -1.0); std::fill(std::begin(hornNote), std::end(hornNote), -1.0);
      std::fill(std::begin(hOn), std::end(hOn), (uint8_t)0); pending = 0;
    }
    if (isHorn()) return;
    const bool track = P_(p, ids.track) >= 0.5;
    for (int k = 0; k < BANKS; k++) {
      if (track) {
        if (bankNote[k] >= 0) designBank(p, k, bankNote[k]);
      } else designBank(p, k, -1);
    }
  }

  void designBank(const ParamValues& p, int b, double note) {
    const double size = P_(p, ids.size), tension = P_(p, ids.tension), vary = P_(p, ids.vary);
    const double spread = b == 0 ? 0 : (std::fmod(b * 0.37 + 0.11, 1.0) - 0.5) * 2;
    const double dev = 1 + vary * (note >= 0 ? 0.006 : 0.16) * spread;
    const double f0 = note >= 0 ? midiToFreq(note) * dev : naturalF0(body, size * dev, tension);
    designBody(designs[b], body, f0, size * dev, tension, P_(p, ids.damp), P_(p, ids.chr), P_(p, ids.bend), idx * 4 + b);
    banks[(size_t)b]->load(designs[b]);
  }

  void refreshHorn(const ParamValues& p) {
    hp.pipe = body == BODY_PIPE; hp.flute = body == BODY_FLUTE;
    hp.partial = toInt(P_(p, ids.partial));
    hp.natural = P_(p, ids.snap) >= 0.5;
    hp.rootFreq = midiToFreq(P_(p, ids.root));
    hp.lip = P_(p, ids.lip); hp.breath = P_(p, ids.breath); hp.growl = P_(p, ids.growl);
    hp.damp = P_(p, ids.damp); hp.chr = P_(p, ids.chr); hp.size = P_(p, ids.size);
  }

  /** Fire the unit for a note: the whole crowd. */
  void strike(int note, double vel, double touch, const ParamValues& p, double cohesionScale) {
    const double count = std::max(1.0, jsRound(P_(p, ids.count)));
    const double spread = P_(p, ids.spread);
    const double cohesion = std::min(1.0, P_(p, ids.cohesion) * cohesionScale);
    const double vary = P_(p, ids.vary);
    hits++;
    if (isHorn()) {
      refreshHorn(p);
      const double freq = midiToFreq(note);
      const int inst = (int)std::min((double)HORN_INST, count);
      const int v = allocHorn(note);
      hp.vel = touch;
      for (int k = 0; k < inst; k++) {
        HornVoice& h = *horns[(size_t)(v * HORN_INST + k)];
        const double detune = k == 0 ? 1 : 1 + vary * 0.025 * rng.bi();
        const double onset = k == 0 ? 0 : spread * (1 - cohesion) * rng.next();
        h.gain = (0.6 + 0.4 / std::sqrt((double)inst)) / std::sqrt((double)inst) * vel;
        h.noteOn(note, freq, hp, detune, onset);
        h.retune(hp, bendMult);
      }
      return;
    }
    const bool track = P_(p, ids.track) >= 0.5;
    const double hard = std::max(0.0, std::min(1.0, P_(p, ids.hard) + (touch - 0.8) * 0.75));
    const double grit = std::min(1.0, P_(p, ids.grit) * (0.45 + 0.7 * touch));
    const double pos = P_(p, ids.pos), chr = P_(p, ids.chr);
    int bank0 = 0, nb = BANKS;
    if (track) { bank0 = allocBank(note, p); nb = 1; }
    const int events = (int)std::min(std::min((double)(MAX_PENDING - pending), (double)MAX_EVENTS), count);
    if (events <= 0) return;
    const double per = std::sqrt(count / events);
    const double spreadMs = spread * (1 - cohesion);
    const double overlap = count * std::min(1.0, 15 / (spreadMs + 1));
    const double ampAll = std::min(std::pow(count, -0.5) * (1 + 0.9 * std::log10(count)), 8 / overlap) * per;
    double lenMs = (0.35 + 11.5 * (1 - hard) * (1 - hard)) * BODY_CONTACT[body];
    int shape = SHAPE_HANN;
    if (body == BODY_CANNON) { shape = SHAPE_NWAVE; lenMs = 2 + 14 * chr; }
    const double velCurve = body == BODY_GONG ? 0.15 : body == BODY_BELL ? 0.6 : body == BODY_SHIELD || body == BODY_ANVIL ? 0.85 : 1;
    for (int i = 0; i < events; i++) {
      const double u = i == 0 ? 0 : rng.next();
      const double t = spreadMs * u + (i == 0 ? 0 : rng.next() * 2);
      const double a = std::pow(vel, velCurve) * ampAll * (1 + vary * 0.8 * rng.bi()) * (body == BODY_CANNON ? 0.4 + 0.8 * chr : 1);
      const double ps = std::max(0.0, std::min(1.0, pos + vary * 0.4 * rng.bi()));
      const int b = bank0 + (nb > 1 ? i % nb : 0);
      const double len = lenMs * (1 + vary * 0.3 * rng.bi());
      push(t, a, shape == SHAPE_NWAVE ? 0 : ps, b, len, shape, grit);
      if (body == BODY_FEET) push(t + 30 + 90 * chr, a * 0.55, std::min(1.0, ps + 0.3), b, lenMs * 0.7, shape, grit * 1.3);
      else if (body == BODY_HOOVES) { push(t + 18 + 55 * chr, a * 0.75, ps, b, lenMs * 0.8, shape, grit); push(t + 40 + 130 * chr, a * 0.5, ps, b, lenMs, shape, grit); }
      else if (body == BODY_CANNON) {
        for (int k = 0; k < MAX_BLASTS; k++) if (!bOn[k]) {
          bOn[k] = 1; bT[k] = -t * 1e-3 * fs; bAmp[k] = (float)(a * 3); bCharge[k] = (float)chr; bLP[k] = 0; bLP2[k] = 0; bPh[k] = 0; break;
        }
        for (int k = 0; k < 10; k++) {
          // three draws, in the TS argument order
          const double dt_ = t + 120 + rng.next() * (400 + 1200 * chr);
          const double da = a * (0.04 + 0.1 * rng.next());
          const double dl = 0.3 + rng.next() * 1.5;
          push(dt_, da, 1, b, dl, SHAPE_HANN, 0.8);
        }
      }
    }
    if (body == BODY_BLADE || body == BODY_BOWED) { scrapeAmp = vel; scrapeTimer = 0; }
  }

  /** A gun going off, at the muzzle: the crack, the whump and the sub boom. */
  void renderBlasts(float* out, int count) {
    for (int k = 0; k < MAX_BLASTS; k++) {
      if (!bOn[k]) continue;
      double t = bT[k];
      const double amp = bAmp[k], charge = bCharge[k];
      const double shockLen = (0.0015 + 0.004 * charge) * fs;
      const double crackTau = (0.006 + 0.02 * charge) * fs, whumpTau = (0.12 + 0.25 * charge) * fs, boomTau = (0.35 + 0.6 * charge) * fs;
      double lp = bLP[k], lp2 = bLP2[k], ph = bPh[k];
      for (int i = 0; i < count; i++, t++) {
        if (t < 0) continue;
        if (t > boomTau * 5) { bOn[k] = 0; break; }
        const double n = rng.bi();
        const double shock = t < shockLen ? (1 - 2 * t / shockLen) * 2.5 : 0;
        const double crack = n * std::exp(-t / crackTau) * 3;
        const double fc = 60 + 2400 * std::exp(-t / (whumpTau * 0.35));
        const double a = 1 - std::exp(-6.283185307 * fc / fs);
        lp += (n - lp) * a; lp2 += (lp - lp2) * a;
        const double whump = lp2 * std::exp(-t / whumpTau) * 3.5;
        const double f = 35 + 55 * std::exp(-t / (boomTau * 0.35));
        ph += f / fs; if (ph >= 1) ph -= 1;
        const double boom = std::sin(6.283185307 * ph) * (1 - std::exp(-t / (0.004 * fs))) * std::exp(-t / boomTau) * (0.5 + 0.5 * charge);
        out[i] = (float)(out[i] + amp * (shock + crack + whump + boom));
      }
      bT[k] = t; bLP[k] = (float)lp; bLP2[k] = (float)lp2; bPh[k] = (float)ph;
    }
  }

  void push(double tMs, double amp, double pos, int bank, double lenMs, int shape, double noise) {
    if (pending >= MAX_PENDING) return;
    const int i = pending++;
    pT[i] = tMs * 1e-3 * fs; pA[i] = (float)amp; pP[i] = (float)pos; pB[i] = (uint8_t)bank;
    pL[i] = (float)std::max(2.0, lenMs * 1e-3 * fs); pS[i] = (uint8_t)shape; pN[i] = (float)noise;
  }

  int allocBank(int note, const ParamValues& p) {
    int best = -1; double bestScore = std::numeric_limits<double>::infinity();
    for (int b = 0; b < BANKS; b++) {
      if (bankNote[b] == note) { best = b; break; }
      const double score = banks[(size_t)b]->level() + bankAge[b] * 1e-9;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    if (bankNote[best] != note) { bankNote[best] = note; designBank(p, best, note); }
    bankAge[best] = 0;
    return best;
  }

  int allocHorn(int note) {
    int best = 0; double bestScore = std::numeric_limits<double>::infinity();
    for (int v = 0; v < HORN_VOICES; v++) {
      const HornVoice& h = *horns[(size_t)(v * HORN_INST)];
      if (h.active && h.note == note && !h.released) return v;
      const double score = !h.active ? -1 : h.released ? h.level : 10 - hornAge[v] * 1e-9;
      if (score < bestScore) { bestScore = score; best = v; }
    }
    hornNote[best] = note; hornAge[best] = 0;
    return best;
  }

  const UnitIds ids;
  std::vector<std::unique_ptr<ModalBank>> banks;
  Design designs[BANKS];
  double bankNote[BANKS], bankAge[BANKS] = {};
  std::vector<std::unique_ptr<HornVoice>> horns;
  double hornNote[HORN_VOICES], hornAge[HORN_VOICES] = {};
  // pending hits: when (samples), amplitude, position, bank, pulse length, shape, noise
  double pT[MAX_PENDING] = {};
  float pA[MAX_PENDING] = {}, pP[MAX_PENDING] = {}, pL[MAX_PENDING] = {}, pN[MAX_PENDING] = {};
  uint8_t pB[MAX_PENDING] = {}, pS[MAX_PENDING] = {};
  int pending = 0;
  // active hits
  double hPhase[MAX_ACTIVE] = {};
  float hLen[MAX_ACTIVE] = {}, hAmp[MAX_ACTIVE] = {}, hPos[MAX_ACTIVE] = {}, hNoise[MAX_ACTIVE] = {};
  uint8_t hBank[MAX_ACTIVE] = {}, hShape[MAX_ACTIVE] = {}, hOn[MAX_ACTIVE] = {};
  float A[BANKS][CHUNK] = {}, B[BANKS][CHUNK] = {};
  FixedList<int, MAX_HELD> held;
  FixedList<double, MAX_HELD> heldVel, heldTouch;
  // blasts (cannon)
  double bT[MAX_BLASTS] = {};
  float bAmp[MAX_BLASTS] = {}, bCharge[MAX_BLASTS] = {}, bLP[MAX_BLASTS] = {}, bLP2[MAX_BLASTS] = {}, bPh[MAX_BLASTS] = {};
  uint8_t bOn[MAX_BLASTS] = {};
  double scrapeTimer = 0, scrapeAmp = 0;
  Rng rng;
  const double fs;
  double last[8];
  HornParams hp;
  double bendMult = 1;
  double rollCount = 0;
};

} // namespace ftsiege
