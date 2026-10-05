// The field: a path per unit (delay, level, air, ground, proximity, pan),
// the terrain (echoes and a long dark tail) and the wind. C++ port of
// src/dsp/space.ts (see there for the acoustics).
#pragma once

#include <vector>
#include "Util.h"

namespace ftsiege {

constexpr double C_SOUND = 343;
constexpr double MAX_DIST = 800;
constexpr double LISTENER_H = 1.7, SOURCE_H = 1.2;

class Path {
public:
  double panL = 1, panR = 1;
  double distNow = 8;

  explicit Path(double sampleRate)
    : buf((size_t)std::ceil(MAX_DIST / C_SOUND * sampleRate * 1.05) + 64, 0.f), gbuf(1024, 0.f),
      airLP(sampleRate, 20000), thumpLP(sampleRate, 70), fs(sampleRate) {}

  void clear() { std::fill(buf.begin(), buf.end(), 0.f); std::fill(gbuf.begin(), gbuf.end(), 0.f); airLP.z = 0; thumpLP.z = 0; }

  void process(const float* input, int count, float* L, float* R, int off,
               double dist, double lateBy, double az, bool latency, double air, double ground, double proximity, double wind) {
    const int len = (int)buf.size();
    float* b = buf.data();
    distNow = dist;
    const double far = std::min(1.0, dist / 150);
    const double targetDelay = latency ? std::min((double)len - 8, lateBy / C_SOUND * fs) : 0;
    const double targetGain = std::pow(6 / std::max(6.0, dist), 0.6) * (1 + 0.35 * wind * far);
    double cut = 20000 / (1 + dist / 40 * (0.35 + 0.9 * air)) * (1 + 0.5 * wind * far);
    if (cut < 200) cut = 200; else if (cut > 20000) cut = 20000;
    airLP.set(fs, cut);
    const double dpath = 2 * SOURCE_H * LISTENER_H / std::max(1.0, dist);
    double gDelay = dpath / C_SOUND * fs; if (gDelay < 1) gDelay = 1; else if (gDelay > 1000) gDelay = 1000;
    const double gCoef = ground * (dist < 3 ? 0.25 : 0.7) * (0.5 + 0.5 * far);
    const double near = dist < 12 ? proximity * (12 - dist) / 12 : 0;
    const double drive = 1 + 4 * near, unDrive = 1 / (1 + 1.4 * near);
    const double ang = (az + 1) * 0.25 * PI;
    const double pL = std::cos(ang), pR = std::sin(ang);
    double d = delay;
    double sil = silent;
    for (int i = 0; i < count; i++) { const double a = input[i]; if (a > 1e-6 || a < -1e-6) { sil = 0; break; } }
    if (sil > 0) sil += count;
    if (sil > 0.25 * fs && std::abs(targetDelay - d) > 1) { d = targetDelay; std::fill(buf.begin(), buf.end(), 0.f); }
    silent = sil;
    const double maxStep = 0.08 * count;
    double dd = targetDelay - d; if (dd > maxStep) dd = maxStep; else if (dd < -maxStep) dd = -maxStep;
    const double dStep = dd / count;
    double g = gain; const double gStep = (targetGain - g) / count;
    int wi = widx, gi = gidx;
    float* gb = gbuf.data();
    for (int i = 0; i < count; i++) {
      b[wi] = input[i];
      d += dStep; g += gStep;
      double x = d < 1 ? (double)input[i] : readDelay(b, len, wi, d);
      if (++wi >= len) wi = 0;
      gb[gi] = (float)x;
      x += gCoef * readDelay(gb, 1024, gi, gDelay);
      if (++gi >= 1024) gi = 0;
      x = airLP.tick(x) * g;
      if (near > 0) x = tanhf_(x * drive) * unDrive + thumpLP.tick(x) * near * 1.5;
      L[off + i] = (float)(L[off + i] + x * pL);
      R[off + i] = (float)(R[off + i] + x * pR);
    }
    widx = wi; gidx = gi; delay = d; gain = g;
    panL = pL; panR = pR;
  }

private:
  std::vector<float> buf, gbuf;
  int widx = 0, gidx = 0;
  double delay = 0, gain = 0;
  double silent = 1e9;
  OnePoleLP airLP, thumpLP;
  const double fs;
};

class Terrain {
public:
  explicit Terrain(double sampleRate) : ebuf((size_t)std::ceil(1.2 * sampleRate) + 8, 0.f), fs(sampleRate) {
    for (int i = 0; i < TAIL_LINES; i++) lines[i].assign((size_t)std::ceil(TAIL_BASE[i] * 2.4 * sampleRate) + 8, 0.f);
    setup(0, 2.5);
  }

  void clear() {
    std::fill(ebuf.begin(), ebuf.end(), 0.f); std::fill(std::begin(tapLP), std::end(tapLP), 0.f);
    for (auto& l : lines) std::fill(l.begin(), l.end(), 0.f);
    std::fill(std::begin(lp), std::end(lp), 0.f); std::fill(std::begin(hp), std::end(hp), 0.f);
  }

  void process(float* L, float* R, int n, int terrain, double early, double tailMix, double decay, double tone) {
    setup(terrain, decay);
    const Tap* taps = TERRAIN_TAPS[terrain];
    const int nt = TERRAIN_NUM_TAPS[terrain];
    const int elen = (int)ebuf.size();
    float* eb = ebuf.data();
    const double lpA = 1 - std::exp(-2 * PI * (350 + tone * 5000) / fs);
    const double hpA = 1 - std::exp(-2 * PI * 45 / fs);
    const double twoOverN = 2.0 / TAIL_LINES;
    const double wet = tailMix * 0.8;
    int ei = eidx;
    for (int i = 0; i < n; i++) {
      const double xl = L[i], xr = R[i];
      const double mono = (xl + xr) * 0.5;
      eb[ei] = (float)mono;
      double eL = 0, eR = 0, eSum = 0;
      if (early > 0) {
        for (int t = 0; t < nt; t++) {
          const Tap& tp = taps[t];
          int r = ei - tapDelay[t]; if (r < 0) r += elen;
          const double v = eb[r];
          tapLP[t] = (float)(tapLP[t] + (v - tapLP[t]) * (0.08 + tp.bright * 0.6));
          const double y = (double)tapLP[t] * tp.g * early;
          eSum += y;
          if (tp.side > 0) { eL += y * 0.8; eR += y * 0.35; } else { eL += y * 0.35; eR += y * 0.8; }
        }
      }
      if (++ei >= elen) ei = 0;
      double outL = 0, outR = 0;
      if (wet > 0) {
        const double x = mono * 0.6 + eSum * 0.5;
        double sum = 0;
        for (int j = 0; j < TAIL_LINES; j++) {
          const double v = readDelay(lines[j].data(), (int)lines[j].size(), idx[j], lengths[j]);
          tmp[j] = (float)v; sum += v;
          if (j & 1) outR += (j & 2) ? v : -v; else outL += (j & 2) ? v : -v;
        }
        const double s = sum * twoOverN;
        for (int j = 0; j < TAIL_LINES; j++) {
          double v = ((double)tmp[j] - s) * gains[j] + ((j & 1) ? -x : x);
          lp[j] = (float)(lp[j] + (v - lp[j]) * lpA);
          hp[j] = (float)(hp[j] + ((double)lp[j] - hp[j]) * hpA);
          v = (double)lp[j] - hp[j];
          auto& line = lines[j];
          line[(size_t)idx[j]] = (float)v;
          if (++idx[j] >= (int)line.size()) idx[j] = 0;
        }
      }
      L[i] = (float)(xl + eL + outL * wet);
      R[i] = (float)(xr + eR + outR * wet);
    }
    eidx = ei;
  }

private:
  void setup(int terrain, double decay) {
    if (terrain == curTerrain && decay == curDecay) return;
    curTerrain = terrain; curDecay = decay;
    const int nt = TERRAIN_NUM_TAPS[terrain];
    for (int t = 0; t < nt; t++) tapDelay[t] = (int)jsRound(TERRAIN_TAPS[terrain][t].ms * 1e-3 * fs);
    const double scale = TERRAIN_TAIL_SCALE[terrain];
    for (int i = 0; i < TAIL_LINES; i++) {
      lengths[i] = std::min((double)lines[i].size() - 4, TAIL_BASE[i] * scale * fs);
      gains[i] = (float)std::pow(10.0, (-3 * lengths[i]) / (decay * fs));
    }
  }

  std::vector<float> ebuf;
  int eidx = 0;
  float tapLP[MAX_TAPS] = {};
  int tapDelay[MAX_TAPS] = {};
  std::vector<float> lines[TAIL_LINES];
  int idx[TAIL_LINES] = {};
  double lengths[TAIL_LINES] = {};
  float gains[TAIL_LINES] = {}, lp[TAIL_LINES] = {}, hp[TAIL_LINES] = {}, tmp[TAIL_LINES] = {};
  const double fs;
  int curTerrain = -1; double curDecay = -1;
};

class Wind {
public:
  double value = 0;

  explicit Wind(double sampleRate) : bedLP(sampleRate, 500), bedHP(sampleRate, 120), fs(sampleRate) {}

  /** Advance one chunk of `count` samples; the gust rate in Hz. */
  double tick(int count, double gustHz) {
    const double a = 1 - std::exp(-2 * PI * gustHz * count / fs);
    s1 += (noise() * 6 - s1) * a;
    s2 += (s1 - s2) * a;
    double v = s2; if (v > 1) v = 1; else if (v < -1) v = -1;
    value = v;
    return v;
  }

  /** The audible bed: filtered noise breathing with the gusts, added into L/R. */
  void bed(float* L, float* R, int off, int count, double level) {
    if (level <= 0) return;
    const double w = value;
    bedLP.set(fs, 300 + 500 * (w + 1));
    const double g = level * 0.05 * (0.55 + 0.45 * w);
    for (int i = off; i < off + count; i++) {
      const double n = noise();
      const double x = bedLP.tick(n) - bedHP.tick(n) * 0.9;
      L[i] = (float)(L[i] + x * g);
      const double n2 = noise();
      R[i] = (float)(R[i] + (x * g * 0.9 + n2 * g * 0.15));
    }
  }

private:
  double noise() {
    uint32_t x = seed; x ^= x << 13; x ^= x >> 17; x ^= x << 5; seed = x;
    return (x / 4294967296.0) * 2 - 1;
  }
  double s1 = 0, s2 = 0;
  uint32_t seed = 0x2545f491u;
  OnePoleLP bedLP, bedHP;
  const double fs;
};

} // namespace ftsiege
