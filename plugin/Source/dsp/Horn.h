// Driven tubes: a waveguide bore driven by a lip valve, a reed, or an air
// jet. C++ port of src/dsp/horn.ts (see there for the physics).
#pragma once

#include <vector>
#include "Util.h"

namespace ftsiege {

constexpr int MAX_RT = 8192;
constexpr double LIP_K = 2, LIP_REST = 0.3, LIP_Z = 0.4, LIP_Q = 4;
inline double sharpCents(double partial, double lipHz) {
  return 100 / std::pow(partial, 0.6) * std::min(2.0, std::max(0.4, std::pow(130 / lipHz, 0.45)));
}
inline double nominalLip(double k) { return 1 - 0.15 / std::sqrt(k); }
inline double jetRatio(double c) { return 0.53 + 0.06 * c; }
inline double fluteSharpCents(double f) { return 15 + 45 * std::sqrt(130 / f); }

struct HornParams {
  bool pipe = false;
  bool flute = false;
  double partial = 2;
  bool natural = false;
  double rootFreq = 110;
  double lip = 1;
  double breath = 0.08;
  double growl = 0;
  double damp = 0.3;
  double chr = 0.5;
  double size = 1;
  double vel = 0.7;
};

class HornVoice {
public:
  bool active = false;
  bool released = false;
  double note = -1;
  double age = 0;
  double level = 0;
  double gain = 1;

  HornVoice(double sampleRate, int seed)
    : bore(MAX_RT, 0.f), jet(MAX_RT, 0.f),
      // JS: new Rng(seed * 2654435761 + 1), whose `| 0` keeps the low 32 bits
      rng((uint32_t)((uint64_t)seed * 2654435761ull + 1ull)),
      bellLP(sampleRate, 1200), radHP(sampleRate, 300), growlLP(sampleRate, 120), fs(sampleRate) {}

  void clear() {
    std::fill(bore.begin(), bore.end(), 0.f); lipY1 = lipY2 = lipDC = 0; breath = 0; dcX = dcY = 0;
    bellLP.z = 0; radHP.z = 0; growlLP.z = 0; level = 0;
  }

  void noteOn(double nt, double freq, const HornParams& p, double det, double onsetMs) {
    active = true; released = false; note = nt; age = 0;
    pipe = p.pipe; flute = p.flute;
    detune = det;
    noteFreq = freq * det;
    onsetDelay = jsRound(onsetMs * 1e-3 * fs);
    retune(p);
    const double rip = p.pipe || p.flute ? 0 : p.chr;
    lipStart = lipTarget * (1 - 0.3 * rip);
    ripT = rip > 0 ? 0 : 1;
    ripRate = 1 / std::max(1.0, p.breath * fs * (0.6 + 0.8 * rip));
    lipFreq = lipStart;
    breathTarget = 0.15 + 1.05 * p.vel;
    if (breath < breathTarget * 0.35) breath = breathTarget * 0.35;
    breathA = 1 - std::exp(-1 / std::max(1.0, p.breath * fs));
    releaseA = 1 - std::exp(-1 / (0.06 * fs));
    reflect = 0.97 - 0.2 * p.damp;
    reedStiff = p.chr;
    lipK = p.pipe ? LIP_K * (1.5 + 1.5 * p.chr) : LIP_K;
    lipRest = p.pipe ? LIP_REST * 0.6 : LIP_REST;
    bellLP.set(fs, p.pipe ? 2500 + 3000 / (0.5 + p.size) : p.flute ? 1800 + 2500 / (0.5 + p.size) : 350 + 2200 / (0.5 + p.size));
    radHP.set(fs, p.pipe ? 200 + 300 / (0.5 + p.size) : 80 + 200 / (0.5 + p.size));
    if (p.flute) { reflect = 0.93 - 0.15 * p.damp; std::fill(jet.begin(), jet.end(), 0.f); }
    lipY1 = lipY2 = 0;
    if (level < 1e-3) {
      const double rt_ = rtTarget;
      const int n = (int)std::min((double)MAX_RT, std::ceil(rt_ * 4));
      const double w = std::max(4.0, rt_ * 0.3);
      for (int i = 0; i < n; i++) {
        const double ph = std::fmod((double)i, rt_);
        bore[(size_t)((widx - 1 - i + MAX_RT * 2) % MAX_RT)] = (float)(ph < w ? 0.3 * (0.5 - 0.5 * std::cos(6.283185307 * ph / w)) : 0);
      }
    }
  }

  void retune(const HornParams& p, double bendMult = 1) {
    const double f = noteFreq * bendMult;
    double tubeF, lipF;
    if (p.natural) {
      tubeF = p.rootFreq * detune;
      const double k = std::max(1.0, jsRound(f / tubeF));
      lipF = f;
      if (std::abs(f / (k * tubeF) - 1) < 0.03) lipF = k * tubeF;
    } else {
      tubeF = f / std::max(1.0, p.partial);
      lipF = f;
    }
    const double k = p.natural ? std::max(1.0, jsRound(f / tubeF)) : std::max(1.0, p.partial);
    partialK = k;
    lipTarget = lipF * p.lip * nominalLip(k);
    if (flute) {
      rtTarget = std::min((double)MAX_RT - 4, fs / tubeF * std::pow(2.0, fluteSharpCents(f) / 1200) - 2);
      jetLen = std::max(2.0, rtTarget * jetRatio(p.chr) / std::max(1.0, k));
    } else rtTarget = std::min((double)MAX_RT - 4, fs / tubeF * std::pow(2.0, sharpCents(k, lipTarget) / 1200) - 3);
    if (age == 0) rt = rtTarget;
    setLip(ripT >= 1 ? lipTarget : lipFreq, p.growl);
  }

  void noteOff() { released = true; }
  void kill() { active = false; released = false; clear(); }

  void process(float* out, int off, int count, double growl) {
    if (!active) return;
    float* bo = bore.data();
    int wi = widx; double rt_ = rt;
    const double rtT = rtTarget;
    double br = breath;
    const double target = released ? 0 : breathTarget;
    const double bA = released ? releaseA : breathA;
    double y1 = lipY1, y2 = lipY2, ldc = lipDC;
    double lf = lipFreq, rT = ripT;
    float* jt = jet.data();
    // the jet's length is a JS number used as an array bound: compare as a double
    const double jl = jetLen; int ji = jetIdx;
    double dx = dcX, dy = dcY;
    double lvl = level;
    double onset = onsetDelay;
    for (int i = off; i < off + count; i++) {
      if (onset > 0) { onset--; continue; }
      br += (target - br) * bA;
      const double g = growlLP.tick(rng.bi());
      const double mouth = br * (1 + growl * g * 2.5);
      if (rT < 1) {
        rT += ripRate; if (rT > 1) rT = 1;
        const double s = rT * rT * (3 - 2 * rT);
        lf = lipStart + (lipTarget - lipStart) * s;
        if ((i & 15) == 0) setLip(lf, growl);
      }
      rt_ += (rtT - rt_) * 0.002;
      double r = wi - rt_; if (r < 0) r += MAX_RT;
      const int i0 = (int)r; const double frac = r - i0;
      int i1 = i0 + 1; if (i1 >= MAX_RT) i1 -= MAX_RT;
      const double b0 = bo[i0], b1 = bo[i1];
      const double boreOut = b0 + (b1 - b0) * frac;
      const double low = bellLP.tick(boreOut);
      const double borePressure = low * reflect;
      double inject;
      if (flute) {
        const double jetIn = mouth * 0.25 * (1 + growl * 0.4 + 0.15 * rng.bi()) - borePressure * 0.5;
        const double jd = jt[ji]; jt[ji] = (float)jetIn; if (++ji >= jl) ji = 0;
        double jx = jd; if (jx > 1) jx = 1; else if (jx < -1) jx = -1;
        const double air = br * 2 > 1 ? 1 : br * 2;
        inject = (jx - jx * jx * jx) * 0.9 * air + borePressure;
      } else {
        const double x = mouth - borePressure;
        ldc += (x - ldc) * 0.001;
        const double y = lipG * (x - ldc) + 2 * lipR * lipCos * y1 - lipR * lipR * y2;
        y2 = y1; y1 = y;
        double open = lipRest * (0.3 + 0.7 * br) + y * lipK;
        if (open < 0) open = 0; else if (open > 1) open = 1;
        const double flow = open * (x < 0 ? -std::sqrt(-x) : std::sqrt(x));
        inject = borePressure + flow * LIP_Z;
      }
      const double dcOut = inject - dx + 0.995 * dy; dx = inject; dy = dcOut;
      bo[wi] = (float)dcOut;
      if (++wi >= MAX_RT) wi = 0;
      const double o = ((boreOut - radHP.tick(boreOut)) * 0.9 + low * 0.25) * gain;
      out[i] = (float)(out[i] + o);
      const double ay = o < 0 ? -o : o;
      lvl += (ay - lvl) * 0.001;
    }
    onsetDelay = onset; jetIdx = ji;
    widx = wi; rt = rt_; breath = br;
    lipY1 = y1; lipY2 = y2; lipDC = ldc; lipFreq = lf; ripT = rT;
    dcX = dx; dcY = dy; level = lvl;
    age += count;
    if (released && br < 1e-4 && lvl < 1e-5) { active = false; clear(); }
  }

private:
  void setLip(double freq, double loose) {
    const double th = 2 * PI * std::min(0.45 * fs, freq) / fs;
    lipCos = std::cos(th);
    const double q = (pipe ? 10 + 8 * reedStiff : LIP_Q * (1 + 0.3 * (partialK - 1))) * (1 - 0.4 * loose);
    lipR = std::exp(-PI * freq / (q * fs));
    lipG = 1 - 2 * lipR * lipCos + lipR * lipR;
  }

  std::vector<float> bore, jet;
  int widx = 0;
  double rt = 100, rtTarget = 100;
  double lipY1 = 0, lipY2 = 0, lipDC = 0;
  double lipCos = 0, lipR = 0.997, lipG = 0.03;
  double lipFreq = 220, lipTarget = 220, lipStart = 220;
  double ripT = 1, ripRate = 0;
  double breath = 0, breathTarget = 0;
  double breathA = 0.001, releaseA = 0.001;
  Rng rng;
  OnePoleLP bellLP, radHP, growlLP;
  double dcX = 0, dcY = 0;
  const double fs;
  double reflect = 0.9;
  bool pipe = false, flute = false;
  int jetIdx = 0;
  double jetLen = 40;
  double reedStiff = 0.3;
  double partialK = 1;
  double lipK = LIP_K, lipRest = LIP_REST;
  double noteFreq = 220, detune = 1;
  double onsetDelay = 0;
};

} // namespace ftsiege
