// Small numeric helpers shared by the DSP. C++ port of src/dsp/util.ts.
//
// Porting convention for the whole engine: a TS number is a double, a
// Float32Array element is a float. JS
// does all arithmetic in double, so a float read from a buffer is promoted
// before it is used; stores round back to float exactly where the TS stores
// into a Float32Array. Where the TS evaluates several random draws in one
// expression or argument list, the port draws them into locals in the same
// order (C++ leaves argument order unspecified). That keeps the two engines
// within rounding of each other (see scripts/null-test.ts).
#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <array>
#include <limits>
#include "Params.gen.h"

namespace ftsiege {

constexpr double PI = 3.141592653589793;

using ParamValues = std::array<double, NUM_PARAMS>;

inline ParamValues defaultParams() {
  ParamValues v{};
  for (int i = 0; i < NUM_PARAMS; i++) v[(size_t)i] = PARAMS[i].def;
  return v;
}

/** JS Math.round: to the nearest integer, halves towards +infinity (std::round goes away from zero). */
inline double jsRound(double x) {
  const double f = std::floor(x);
  return x - f >= 0.5 ? f + 1 : f;
}

/** JS `x | 0` for the small values the engine uses: truncate towards zero. */
inline int toInt(double x) { return (int)x; }

/** Rational tanh approximation, good to ~1e-3 over |x| < 3 and clamped beyond. */
inline double tanhf_(double x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const double x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

/** Soft clipper with unit slope at 0 and hard limit at ±1. */
inline double softClip(double x) {
  if (x > 1.5) return 1;
  if (x < -1.5) return -1;
  return x - (x * x * x) * 0.148148;
}

inline double midiToFreq(double note) { return 440 * std::pow(2.0, (note - 69) / 12); }

/** xorshift32; deterministic so offline renders are repeatable. Takes the seed as JS `seed | 0 || 1` would. */
class Rng {
public:
  explicit Rng(uint32_t seed = 0x9e3779b9u) : s(seed ? seed : 1) {}
  double next() {
    uint32_t x = s;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    s = x;
    return x / 4294967296.0;
  }
  /** -1..1 */
  double bi() { return next() * 2 - 1; }
private:
  uint32_t s;
};

/** Fractional-delay read with linear interpolation from a circular buffer. */
inline double readDelay(const float* buf, int len, int writeIdx, double delay) {
  double r = writeIdx - delay;
  while (r < 0) r += len;
  const int i0 = (int)r;
  const double frac = r - i0;
  int i1 = i0 + 1; if (i1 >= len) i1 -= len;
  const double a = buf[i0], b = buf[i1];
  return a + (b - a) * frac;
}

/** DC blocker (first-order high-pass at ~10 Hz). */
class DCBlock {
public:
  explicit DCBlock(double sampleRate, double hz = 10) : r(1 - (2 * PI * hz) / sampleRate) {}
  double tick(double x) {
    const double y = x - x1 + r * y1;
    x1 = x; y1 = y;
    return y;
  }
private:
  double x1 = 0, y1 = 0, r;
};

/** One-pole low-pass, coefficient from a cutoff in Hz. */
struct OnePoleLP {
  double z = 0, a = 0.1;
  OnePoleLP(double sampleRate, double hz) { set(sampleRate, hz); }
  void set(double sampleRate, double hz) { a = 1 - std::exp(-2 * PI * hz / sampleRate); }
  double tick(double x) { return (z += (x - z) * a); }
};

/** A fixed-capacity array with the handful of JS array operations the engine uses. */
template <typename T, int CAP>
struct FixedList {
  T items[CAP];
  int size = 0;
  void clear() { size = 0; }
  bool push(const T& v) { if (size >= CAP) return false; items[size++] = v; return true; }
  void removeAt(int i) { for (int k = i; k < size - 1; k++) items[k] = items[k + 1]; size--; }
  int indexOf(const T& v) const { for (int i = 0; i < size; i++) if (items[i] == v) return i; return -1; }
  bool includes(const T& v) const { return indexOf(v) >= 0; }
  T& operator[](int i) { return items[i]; }
  const T& operator[](int i) const { return items[i]; }
};

} // namespace ftsiege
