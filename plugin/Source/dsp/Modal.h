// Modal bodies: a bank of second-order resonators standing in for the modes
// of a drum head, a plate, a bell, a bar, a log, the ground under a boot or
// a cannon barrel. C++ port of src/dsp/modal.ts (see there for the physics).
#pragma once

#include "Util.h"

namespace ftsiege {

constexpr int MAX_MODES = 32;

/** Bessel J_m(x) by series; only used at design time. */
inline double besselJ(int m, double x) {
  double term = 1;
  for (int k = 1; k <= m; k++) term *= x / (2 * k);
  double sum = term;
  const double x2 = -(x * x) / 4;
  for (int k = 1; k < 60; k++) {
    term *= x2 / (k * (k + m));
    sum += term;
    if (std::abs(term) < 1e-12 * std::abs(sum)) break;
  }
  return sum;
}

/** mulberry32, as the TS runs it (32-bit wrapping arithmetic). */
struct Mulberry32 {
  uint32_t a;
  explicit Mulberry32(uint32_t seed) : a(seed) {}
  double operator()() {
    a = a + 0x6d2b79f5u;
    uint32_t t = a;
    t = (uint32_t)((t ^ (t >> 15)) * (t | 1u));
    t ^= t + (uint32_t)((t ^ (t >> 7)) * (t | 61u));
    return (t ^ (t >> 14)) / 4294967296.0;
  }
};

struct Design {
  int n = 0;
  double f[MAX_MODES] = {};
  double t60[MAX_MODES] = {};
  double wC[MAX_MODES] = {};
  double wE[MAX_MODES] = {};
  double wo[MAX_MODES] = {};
  int hiFrom = MAX_MODES;
  double tension = 0;
  double bloom = 0;
  int cavity = -1;
};

/**
 * Fill a design for a body. `size` in metres, the rest 0..1. `f0` is the
 * fundamental the body should have (already includes key tracking). `seed`
 * perturbs the mode set so crowd variants are not clones.
 */
inline void designBody(Design& d, int body, double f0, double size, double tension, double damp, double chr, double bend, int seed) {
  Mulberry32 rnd((uint32_t)(seed * 7919 + body * 131 + 17));
  auto jit = [&rnd](double amt) { return 1 + amt * (rnd() * 2 - 1); };
  int n = 0;
  d.hiFrom = MAX_MODES; d.tension = 0; d.bloom = 0; d.cavity = -1;
  const double decay = 1 - damp;
  auto push = [&](double f, double t60, double wC, double wE, double wo) {
    if (n >= MAX_MODES || f < 15 || f > 18000) return;
    d.f[n] = f; d.t60[n] = std::max(0.004, t60); d.wC[n] = wC; d.wE[n] = wE; d.wo[n] = wo; n++;
  };

  switch (body) {
    case BODY_DRUM: {
      const double cav = chr;
      const double t60base = (0.25 + 2.2 * size) * (0.15 + decay * decay) * (1.2 - 0.5 * tension);
      for (int i = 0; i < NUM_MEMBRANE && n < MAX_MODES - 2; i++) {
        const double ratio = MEMBRANE_RATIO[i];
        const int m = MEMBRANE_M[i];
        double f = f0 * ratio * jit(0.012);
        if (m == 0) f *= 1 + 0.32 * cav / ratio;
        const double j0 = besselJ(m, ratio * 2.4048 * 0.12), je = besselJ(m, ratio * 2.4048 * 0.82);
        const double t60 = t60base / (1 + 0.9 * (ratio - 1)) * (1 - 0.35 * cav * (m == 0 ? 0 : 1));
        const double wo = 1 / std::sqrt(ratio);
        push(f, t60, j0, je, wo);
      }
      if (cav > 0.02) {
        d.cavity = n;
        push(f0 * (0.48 + 0.14 * cav), t60base * (0.8 + cav), 0.6 * cav, 0.15 * cav, 1.4);
        push(f0 * 3.9 * jit(0.05), 0.06 + 0.1 * size, 0.25, 0.45, 0.5);
      }
      d.tension = bend * 0.16 * (1.2 - 0.6 * tension);
      break;
    }
    case BODY_TIMPANI: {
      const double kettle = chr;
      const double t60base = (0.8 + 3 * size) * (0.15 + decay * decay);
      const double rows[16][4] = {   // ratio, t60 mult, centre, edge
        { 0.82 - 0.1 * kettle, 0.12, 0.9, 0.3 }, { 1, 1, 0.25, 0.9 }, { 1.5 + 0.05 * (1 - kettle), 0.8, 0.05, 0.85 }, { 1.99 + 0.08 * (1 - kettle), 0.65, 0.0, 0.8 },
        { 2.46 + 0.1 * (1 - kettle), 0.5, 0.0, 0.75 }, { 2.92 + 0.12 * (1 - kettle), 0.4, 0.0, 0.7 }, { 3.38, 0.3, 0, 0.6 }, { 3.83, 0.25, 0, 0.55 },
        { 1.72, 0.3, 0.6, 0.2 }, { 2.35, 0.25, 0.4, 0.3 }, { 2.85, 0.2, 0.3, 0.3 }, { 3.2, 0.18, 0.2, 0.3 }, { 3.6, 0.15, 0.1, 0.3 }, { 4.1, 0.12, 0.1, 0.35 }, { 4.5, 0.1, 0, 0.35 }, { 5.0, 0.08, 0, 0.3 },
      };
      for (auto& row : rows) push(f0 * row[0] * jit(0.004), t60base * row[1], row[2], row[3], 1 / std::sqrt(row[0]));
      push(f0 * 0.55, t60base * 0.6, 0.5 * kettle, 0.15 * kettle, 0.5);
      d.tension = bend * 0.08;
      break;
    }
    case BODY_BARS: {
      const double res = chr;
      const double t60base = (0.4 + 1.6 * size) * (0.15 + decay * decay);
      const double ratios[7] = { 1, 3.95 + 0.1 * tension, 9.9 + 0.3 * tension, 15.2, 21.5, 29.0, 37.0 };
      for (int i = 0; i < 7 && n < MAX_MODES; i++) {
        const double r = ratios[i] * jit(i < 3 ? 0.003 : 0.02);
        push(f0 * r, t60base * (i == 0 ? 1 + 1.5 * res : 1) / (1 + 0.8 * i), 0.9 / (1 + 0.5 * i), 0.5 + 0.5 * std::min(1.0, i * 0.3), (i == 0 ? 1 + 0.8 * res : 1) / std::pow(r, 0.5));
      }
      break;
    }
    case BODY_LYRE: case BODY_BOWED: {
      const bool bowed = body == BODY_BOWED;
      const double B = 0.00003 + 0.0003 * tension;
      const double t60base = (bowed ? 0.6 + 1.2 * size : 1.2 + 3 * size) * (0.1 + decay * decay);
      for (int k = 1; k <= 30 && n < MAX_MODES - 2; k++) {
        const double f = f0 * k * std::sqrt(1 + B * k * k);
        if (f > 16000) break;
        const double t60 = t60base / (1 + 0.12 * k + 0.002 * k * k);
        push(f, t60, std::abs(std::sin(k * PI * 0.5)) / std::sqrt((double)k), std::abs(std::sin(k * PI * 0.09)) * 1.2 / std::pow((double)k, 0.3), 1 / std::pow((double)k, 0.55));
      }
      const double box = chr;
      push(190 * jit(0.05), 0.12, 0.9 * box, 0.9 * box, 1.1);
      push(410 * jit(0.05), 0.09, 0.7 * box, 0.7 * box, 0.8);
      d.tension = bend * (bowed ? 0.02 : 0.06);
      break;
    }
    case BODY_GONG: {
      double modes[35];
      int nm = 0;
      for (int m = 0; m < 7; m++) for (int k = 1; k < 6; k++) {
        const double base = std::pow((m + 2 * k - 0.5) / 1.5, 1.72 - 0.35 * tension);
        modes[nm++] = base * (m == 0 && k == 1 ? 1 : jit(0.03));
      }
      std::sort(modes, modes + nm);
      const double t60base = (0.8 + 4.5 * size) * (0.1 + decay * decay);
      for (int i = 0; i < nm && n < MAX_MODES; i++) {
        const double r = modes[i] / modes[0];
        const double f = f0 * r;
        if (f > 12000) break;
        push(f, t60base / (1 + 0.25 * (r - 1)), 1 / (1 + 0.3 * r), 0.6 + 0.4 * rnd(), 1 / std::sqrt(r));
      }
      d.hiFrom = std::max(4, n >> 2);
      d.bloom = chr;
      d.tension = bend * 0.08;
      break;
    }
    case BODY_BELL: {
      const double t60base = (2 + 8 * size) * (0.05 + decay * decay);
      for (int i = 0; i < NUM_BELL && n < MAX_MODES; i++) {
        const double r = BELL[i] * (i < 5 ? jit(0.004) : jit(0.02));
        const double f = f0 * r;
        const double t60 = t60base * (i == 0 ? 1.6 : 1) / (1 + 0.5 * std::max(0.0, r - 2));
        push(f, t60, i < 6 ? 0.9 : 0.5, i < 6 ? 0.4 : 0.9, i == 0 ? 0.8 : 1 / std::sqrt(std::max(1.0, r)));
      }
      d.hiFrom = 8;
      d.bloom = chr * 0.6;
      d.tension = bend * 0.03;
      break;
    }
    case BODY_SHIELD: {
      double modes[49];
      int nm = 0;
      for (int m = 1; m < 8; m++) for (int k = 1; k < 8; k++) modes[nm++] = (m * m + k * k * (1.4 - 0.5 * tension)) * jit(0.05);
      std::sort(modes, modes + nm);
      const double back = chr;
      const double t60base = (0.12 + 0.9 * size) * (0.08 + decay * decay) * (1 - 0.7 * back);
      for (int i = 0; i < nm && n < MAX_MODES; i++) {
        const double r = modes[i] / modes[0];
        const double f = f0 * r;
        if (f > 14000) break;
        push(f, t60base / (1 + 0.15 * (r - 1)), 0.9 / (1 + 0.1 * r), 0.5 + 0.5 * rnd(), 1 / std::pow(r, 0.35));
      }
      push(f0 * 0.4, 0.05 + 0.2 * size, 0.9 * back, 0.7 * back, 1.6);
      d.hiFrom = n >> 1;
      d.bloom = 0.25;
      d.tension = bend * 0.12;
      break;
    }
    case BODY_ANVIL: {
      const double t60base = (0.4 + 3.5 * size) * (0.1 + decay * decay);
      for (int i = 0; i < 6 && n < MAX_MODES; i++) push(f0 * BAR[i] * jit(0.006), t60base / (1 + 0.4 * i), 1 / (1 + i * 0.5), 0.8, 1 / std::sqrt(BAR[i]));
      const double ring = chr;
      for (int i = 0; i < 18 && n < MAX_MODES; i++) {
        const double r = 3 + i * 1.37 * jit(0.2);
        push(f0 * r, t60base * (0.15 + 0.6 * ring) / (1 + 0.1 * i), 0.5, 0.9, 0.6 / std::pow(r, 0.3));
      }
      d.hiFrom = 6;
      d.bloom = 0.15 + 0.3 * ring;
      break;
    }
    case BODY_BLADE: {
      const double t60base = (0.6 + 2.5 * size) * (0.08 + decay * decay);
      for (int i = 0; i < NUM_BAR && n < MAX_MODES; i++) {
        const double r = BAR[i] * jit(0.004) * (1 + 0.002 * i * tension);
        push(f0 * r, t60base / (1 + 0.3 * i), 0.9 / (1 + 0.3 * i), 0.7, 1 / std::pow(r, 0.4));
      }
      for (int i = 0; i < 10 && n < MAX_MODES; i++) push(f0 * (9 + i * 2.1) * jit(0.1), t60base * 0.08, 0.2, 0.7, 0.3);
      d.hiFrom = 12;
      d.bloom = 0.2;
      break;
    }
    case BODY_LOG: {
      const double hollow = chr;
      const double t60base = (0.05 + 0.5 * size) * (0.1 + decay * decay);
      const double ratios[8] = { 1, 1.83, 2.71, 3.9, 5.2, 6.9, 8.8, 11.2 };
      for (int i = 0; i < 8 && n < MAX_MODES; i++) push(f0 * ratios[i] * jit(0.06), t60base / (1 + 0.5 * i), 0.9 / (1 + 0.4 * i), 0.6, 1 / std::sqrt(ratios[i]));
      push(f0 * 0.62, t60base * (1 + 2 * hollow), 0.9 * hollow, 0.5 * hollow, 1.5);
      d.tension = bend * 0.2;
      break;
    }
    case BODY_FEET: {
      const double t60base = (0.03 + 0.12 * size) * (0.2 + decay);
      push(f0, t60base, 1, 0.8, 1.3);
      push(f0 * 1.7 * jit(0.1), t60base * 0.6, 0.7, 0.9, 0.8);
      push(f0 * 2.9 * jit(0.1), t60base * 0.35, 0.5, 0.9, 0.5);
      push(f0 * 5.1 * jit(0.15), t60base * 0.2, 0.3, 0.9, 0.35);
      d.tension = bend * 0.15;
      break;
    }
    case BODY_HOOVES: {
      const double t60base = (0.03 + 0.1 * size) * (0.2 + decay);
      const double ratios[6] = { 1, 1.5, 2.3, 3.4, 4.9, 7.1 };
      for (int i = 0; i < 6; i++) push(f0 * ratios[i] * jit(0.1), t60base / (1 + 0.5 * i), 1 / (1 + 0.3 * i), 0.9, 1 / std::pow(ratios[i], 0.4));
      d.tension = bend * 0.1;
      break;
    }
    case BODY_CANNON: {
      const double t60base = (0.2 + 0.6 * size) * (0.2 + decay);
      push(f0, t60base, 1, 0, 1.4);
      push(f0 * 1.52 * jit(0.05), t60base * 0.7, 0.8, 0, 1);
      push(f0 * 2.3 * jit(0.05), t60base * 0.5, 0.6, 0, 0.7);
      push(f0 * 3.7 * jit(0.05), t60base * 0.3, 0.4, 0, 0.4);
      for (int i = 0; i < 20 && n < MAX_MODES; i++) {
        const double r = 6 + i * 2.3 * jit(0.3);
        const double t60 = 0.02 + 0.08 * rnd() + 0.05 * size;   // drawn before the edge weight, as the TS argument order
        const double wE = 0.5 + 0.5 * rnd();
        push(f0 * r, t60, 0, wE, 0.6 / std::pow(r, 0.3));
      }
      d.hiFrom = 4;
      d.tension = bend * 0.3;
      break;
    }
    case BODY_GLASS: {
      const double crack = chr;
      const double t60base = (1.5 + 6 * size) * (0.05 + decay * decay) * (1 - 0.6 * crack);
      const double ratios[6] = { 1, 2.32, 4.25, 6.63, 9.38, 12.5 };
      for (int i = 0; i < 6 && n < MAX_MODES - 1; i++) {
        const double r = ratios[i] * jit(0.002);
        push(f0 * r, t60base / (1 + 0.35 * i), 0.9 / (1 + 0.3 * i), 0.7, 1 / std::sqrt(r));
        if (crack > 0.05) push(f0 * r * (1.004 + 0.02 * crack), t60base * 0.7 / (1 + 0.35 * i), 0.6 / (1 + 0.3 * i), 0.5, 0.7 / std::sqrt(r));
      }
      d.hiFrom = 3;
      d.bloom = 0.1;
      d.tension = bend * 0.01;
      break;
    }
    case BODY_MUSICBOX: {
      const double box = chr;
      const double t60base = (0.5 + 2.5 * size) * (0.1 + decay * decay);
      const double ratios[4] = { 1, 6.267, 17.55, 34.39 };
      for (int i = 0; i < 4 && n < MAX_MODES - 4; i++) {
        const double r = ratios[i] * jit(0.002);
        push(f0 * r, t60base / (1 + 1.2 * i), 0.9 / (1 + 0.6 * i), 0.8, 1 / std::pow(r, 0.4));
      }
      push(f0 * 1.0035, t60base * 0.8, 0.35, 0.3, 0.5);
      push(310 * jit(0.05), 0.1, 0.8 * box, 0.8 * box, 1);
      push(680 * jit(0.05), 0.07, 0.6 * box, 0.6 * box, 0.7);
      d.hiFrom = 2;
      d.tension = bend * 0.01;
      break;
    }
    case BODY_HELMET: {
      const double dent = chr;
      const double t60base = (0.15 + 1.2 * size) * (0.08 + decay * decay);
      const double ratios[10] = { 1, 1.58, 2.24, 2.95, 3.78, 4.7, 5.8, 7.0, 8.4, 9.9 };
      for (int i = 0; i < 10 && n < MAX_MODES - 1; i++) {
        const double r = ratios[i] * jit(0.01 + 0.1 * dent);
        push(f0 * r, t60base / (1 + 0.45 * i), 0.9 / (1 + 0.25 * i), 0.7, 1 / std::pow(r, 0.45));
        if (dent > 0.3 && i < 6) push(f0 * r * (1.01 + 0.06 * dent), t60base * 0.5 / (1 + 0.45 * i), 0.5 / (1 + 0.25 * i), 0.4, 0.6 / std::pow(r, 0.45));
      }
      push(f0 * 0.5, 0.05 + 0.1 * size, 0.8, 0.5, 1.2);
      d.hiFrom = n >> 1;
      d.bloom = 0.1;
      d.tension = bend * 0.05;
      break;
    }
    case BODY_RUBBLE: {
      const int dens = 10 + (int)std::floor(chr * 14);
      const double t60base = (0.1 + 0.6 * size) * (0.15 + decay * decay);
      for (int i = 0; i < dens && n < MAX_MODES; i++) {
        const double r = 1 + i * 0.9 + 3 * rnd();
        const double t = t60base * (0.3 + rnd());
        const double wE = 0.4 + 0.6 * rnd();
        push(f0 * r, t / (1 + 0.08 * i), 0.15, wE, 0.8 / std::pow(r, 0.3));
      }
      d.hiFrom = 6;
      d.tension = bend * 0.1;
      break;
    }
    default: break;
  }
  d.n = n;
}

/** The fundamental a body has at its natural size and tension, before key tracking. */
inline double naturalF0(int body, double size, double tension) {
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
 * A bank of up to MAX_MODES resonators, driven per sample by two excitation
 * accumulators: A (all hits' pulses) and B (pulses weighted by their strike
 * position), so per-mode input is wC·A + (wE − wC)·B.
 */
class ModalBank {
public:
  int n = 0;
  int hiFrom = MAX_MODES;
  double tension = 0;
  double bloom = 0;

  explicit ModalBank(double sampleRate) : dt(1 / sampleRate), bloomA(1 - std::exp(-1 / (0.06 * sampleRate))) {}

  void clear() {
    std::fill(std::begin(q1), std::end(q1), 0.0); std::fill(std::begin(q2), std::end(q2), 0.0);
    energy = 0; bloomEnv = 0; lowOut = 0; relax = 0;
  }

  /** Load a design into the bank; ringing modes keep ringing (their state is kept). */
  void load(const Design& d) {
    n = d.n; hiFrom = std::min(d.hiFrom, d.n); tension = d.tension; bloom = d.bloom;
    for (int i = 0; i < d.n; i++) {
      const double w = 2 * PI * d.f[i];
      const double sigma = 6.9078 / d.t60[i];
      const double wdv = std::sqrt(std::max(1.0, w * w - sigma * sigma));
      const double ev = std::exp(-sigma * dt);
      e[i] = ev; wd[i] = wdv * dt;
      a1[i] = 2 * ev * std::cos(wdv * dt);
      a2[i] = -ev * ev;
      const double g = std::sin(wdv * dt);
      gC[i] = g * d.wC[i];
      gD[i] = g * (d.wE[i] - d.wC[i]);
      wo[i] = d.wo[i] * std::min(1.5, std::sqrt(d.f[i] / 120));
    }
    for (int i = d.n; i < MAX_MODES; i++) { q1[i] = 0; q2[i] = 0; }
    lastMult = 1;
  }

  /** Per-chunk: tension modulation from the stored energy, relaxing after each hit. */
  double updatePitch() {
    const double mult = 1 + tension * std::min(1.0, energy * 3) * relax;
    if (std::abs(mult - lastMult) > 2e-4) {
      lastMult = mult;
      for (int i = 0; i < n; i++) a1[i] = 2 * e[i] * std::cos(wd[i] * mult);
    }
    return mult;
  }

  /** Run `count` samples from the excitation accumulators, adding into `out`. */
  void process(const float* A, const float* B, float* out, int off, int count) {
    if (n == 0) return;
    const int hi = hiFrom;
    double en_ = energy, bEnv = bloomEnv, lo = lowOut, rel = relax;
    for (int i = off; i < off + count; i++) {
      const double a = A[i], b = B[i];
      double inj = 0;
      if (bloom > 0) {
        const double x = lo * bloom * 6;
        const double x2 = x * x;
        const double dd = x2 > 9 ? (x > 0 ? x - 3 : x + 3) : x2 * x * 0.111;
        bEnv += ((dd < 0 ? -dd : dd) - bEnv) * bloomA;
        inj = dd * bEnv * 0.5;
      }
      double y = 0, low = 0, en = 0;
      for (int k = 0; k < n; k++) {
        double inp = gC[k] * a + gD[k] * b;
        if (k >= hi) inp += inj * gD[k];
        const double q = a1[k] * q1[k] + a2[k] * q2[k] + inp;
        q2[k] = q1[k]; q1[k] = q;
        const double o = wo[k] * q;
        y += o;
        if (k < 4) { low += o; en += q * q; }
      }
      lo = low;
      en_ += (en - en_) * 0.002;
      if (en > en_ * 1.02) rel = 1; else rel -= rel * 0.0002;
      out[i] = (float)(out[i] + y);
    }
    energy = en_; bloomEnv = bEnv; lowOut = lo; relax = rel;
  }

  double level() const { return std::sqrt(energy); }

private:
  double a1[MAX_MODES] = {}, a2[MAX_MODES] = {}, q1[MAX_MODES] = {}, q2[MAX_MODES] = {};
  double gC[MAX_MODES] = {}, gD[MAX_MODES] = {}, wo[MAX_MODES] = {}, wd[MAX_MODES] = {}, e[MAX_MODES] = {};
  double energy = 0, relax = 0, bloomEnv = 0, lastMult = 1, lowOut = 0;
  const double dt, bloomA;
};

} // namespace ftsiege
