#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <cmath>
#include <limits>

using namespace ftsiege;

namespace {

// ---- parameters: the same curves and text as src/dsp/params.ts ------------

double fromNorm(const ParamDef& p, double t) {
  t = std::min(1.0, std::max(0.0, t));
  switch (p.scale) {
    case Scale::Log: return p.min * std::pow(p.max / p.min, t);
    case Scale::Int: case Scale::Enum: case Scale::Bool: return std::round(p.min + t * (p.max - p.min));
    default: return p.min + t * (p.max - p.min);
  }
}

double toNorm(const ParamDef& p, double v) {
  v = std::min(p.max, std::max(p.min, v));
  if (p.scale == Scale::Log) return std::log(v / p.min) / std::log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}

bool discrete(const ParamDef& p) { return p.scale == Scale::Int || p.scale == Scale::Enum || p.scale == Scale::Bool; }

juce::String utf8(const char* s) { return juce::String(juce::CharPointer_UTF8(s)); }

juce::String noteName(double n) {
  static const char* names[] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
  const int k = (int)std::round(n);
  return juce::String(names[((k % 12) + 12) % 12]) + juce::String((int)std::floor(k / 12.0) - 1);
}

juce::String format(const ParamDef& p, double v) {
  if (p.labels) {
    const int i = (int)std::round(v);
    return i >= 0 && i < p.numLabels ? utf8(p.labels[i]) : juce::String(v);
  }
  const juce::String id = p.id;
  const juce::String unit = p.unit ? utf8(p.unit) : juce::String();
  if (p.scale == Scale::Bool) return v >= 0.5 ? "on" : "off";
  if (id.endsWith("KeyLo") || id.endsWith("KeyHi") || id.endsWith("Root")) return noteName(v);
  if (id.endsWith("Count")) return juce::String((int)std::round(v));
  if (id.endsWith("Az")) {
    if (std::abs(v) < 0.005) return "ahead";
    return juce::String(v < 0 ? "L " : "R ") + juce::String((int)std::round(std::abs(v) * 80)) + juce::String(juce::CharPointer_UTF8("\xc2\xb0"));
  }
  if (p.scale == Scale::Int) return juce::String((int)std::round(v)) + (unit.isNotEmpty() ? " " + unit : juce::String());
  if (unit == "Hz") return v >= 1000 ? juce::String(v / 1000, 2) + " kHz" : v >= 100 ? juce::String(v, 0) + " Hz" : juce::String(v, 2) + " Hz";
  if (unit == "s") return v >= 1 ? juce::String(v, 2) + " s" : juce::String(v * 1000, 0) + " ms";
  if (unit == "ms") return juce::String(v, 0) + " ms";
  if (unit == "m") return v >= 10 ? juce::String(v, 0) + " m" : juce::String(v, 2) + " m";
  if (p.min < 0) return juce::String(v >= 0 ? "+" : juce::CharPointer_UTF8("\xe2\x88\x92")) + juce::String((int)std::round(std::abs(v) * 100)) + "%";
  if (unit.isNotEmpty() && unit != "%") return juce::String(v, 1) + unit;   // the approach's "from", 1.0x .. 8.0x
  return juce::String((int)std::round(v * 100)) + "%";
}

/** Host-facing name: the unit or module, then the knob ("Unit 3 distance", "Field echoes"). */
juce::String hostName(const ParamDef& p) {
  static const std::pair<const char*, const char*> groups[] = {
    { "march", "March" }, { "field", "Field" }, { "weather", "Weather" }, { "out", "Out" },
  };
  const juce::String name = utf8(p.name);
  const juce::String group = p.group;
  if (group.length() == 2 && group[0] == 'u') return "Unit " + group.substring(1) + " " + name;
  juce::String prefix = group;
  for (auto& [id, gname] : groups) if (group == id) { prefix = gname; break; }
  return prefix + " " + name;
}

/** A float parameter that tells the host when it is really a switch or a list. */
class SiegeParam final : public juce::AudioParameterFloat {
public:
  SiegeParam(const ParamDef& d)
    : AudioParameterFloat(juce::ParameterID { d.id, 1 }, hostName(d),
        juce::NormalisableRange<float>((float)d.min, (float)d.max,
          [&d](float, float, float t) { return (float)fromNorm(d, t); },
          [&d](float, float, float v) { return (float)toNorm(d, v); },
          [&d](float, float, float v) {
            const double c = std::min(d.max, std::max(d.min, (double)v));
            return (float)(discrete(d) ? std::round(c) : c);
          }),
        (float)d.def,
        juce::AudioParameterFloatAttributes()
          .withStringFromValueFunction([&d](float v, int) { return format(d, v); })
          .withLabel(d.unit && !d.labels ? utf8(d.unit) : juce::String())),
      def(d) {}

  int getNumSteps() const override {
    return discrete(def) ? (int)std::round(def.max - def.min) + 1 : juce::AudioProcessor::getDefaultNumParameterSteps();
  }
  bool isDiscrete() const override { return discrete(def); }
  bool isBoolean() const override { return def.scale == Scale::Bool; }

private:
  const ParamDef& def;
};

juce::AudioProcessorValueTreeState::ParameterLayout makeLayout() {
  juce::AudioProcessorValueTreeState::ParameterLayout layout;
  for (int i = 0; i < NUM_PARAMS; i++) layout.add(std::make_unique<SiegeParam>(PARAMS[i]));
  return layout;
}

} // namespace

// ============================================================================

SiegeProcessor::SiegeProcessor()
  : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
    apvts(*this, nullptr, "SIEGE", makeLayout()) {
  for (int i = 0; i < NUM_PARAMS; i++) {
    params[(size_t)i] = apvts.getParameter(PARAMS[i].id);
    raw[(size_t)i] = apvts.getRawParameterValue(PARAMS[i].id);
    jassert(params[(size_t)i] != nullptr && raw[(size_t)i] != nullptr);
  }
  pushed.fill(std::numeric_limits<float>::quiet_NaN());
  // a new instance starts on the first factory sound, like the web page does
  loadFactory(0);
}

void SiegeProcessor::prepareToPlay(double sr, int) {
  sampleRate = sr;
  engine = std::make_unique<Engine>(sr);
  hitsPending.fill(0);
  pushed.fill(std::numeric_limits<float>::quiet_NaN());   // push every parameter on the next block
}

bool SiegeProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
  const auto out = layouts.getMainOutputChannelSet();
  return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

void SiegeProcessor::handleMidi(const juce::MidiMessage& m) {
  if (m.isNoteOn()) {
    engine->noteOn(m.getNoteNumber(), m.getVelocity());
    pushNote(m.getNoteNumber(), m.getVelocity(), 0);
  } else if (m.isNoteOff()) {
    engine->noteOff(m.getNoteNumber());
    pushNote(m.getNoteNumber(), 0, 1);
  } else if (m.isPitchWheel()) {
    engine->pitchBend((m.getPitchWheelValue() - 8192) / 8192.0);
  } else if (m.isController()) {
    engine->controlChange(m.getControllerNumber(), m.getControllerValue());
  }
}

void SiegeProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
  juce::ScopedNoDenormals noDenormals;
  const int n = buffer.getNumSamples();
  const auto t0 = juce::Time::getHighResolutionTicks();
  if (!engine || n == 0) { buffer.clear(); return; }

  // parameters that moved since the last block
  for (int i = 0; i < NUM_PARAMS; i++) {
    const float v = raw[(size_t)i]->load(std::memory_order_relaxed);
    if (!(v == pushed[(size_t)i])) { engine->setParam(i, v); pushed[(size_t)i] = v; }
  }

  // the host's clock: its tempo always (when it has one), its position while it plays
  double bpm = 0;
  bool playing = false;
  double ppq = 0;
  if (auto* ph = getPlayHead()) {
    if (auto pos = ph->getPosition()) {
      if (auto b = pos->getBpm()) bpm = *b;
      playing = pos->getIsPlaying();
      if (auto q = pos->getPpqPosition()) ppq = *q; else playing = false;
    }
  }
  engine->setHostTempo(bpm);
  hostTempo.store(bpm, std::memory_order_relaxed);
  const double beatsPerSample = bpm > 0 ? bpm / (60 * sampleRate) : 0;

  // what the on-screen keyboard played
  {
    const auto rd = uiFifo.read(uiFifo.getNumReady());
    auto play = [this](int start, int count) {
      for (int k = start; k < start + count; k++) {
        const auto& m = uiMsgs[(size_t)k];
        switch (m.type) {
          case UiEvent::NoteOn: engine->noteOn(m.a, m.b); break;
          case UiEvent::NoteOff: engine->noteOff(m.a); break;
          case UiEvent::Controller: engine->controlChange(m.a, (int)m.b); break;
          case UiEvent::Bend: engine->pitchBend(m.b); break;
          case UiEvent::Panic: engine->panic(); break;
        }
      }
    };
    play(rd.startIndex1, rd.blockSize1);
    play(rd.startIndex2, rd.blockSize2);
  }

  // render between MIDI events, so every note lands on its sample
  float* L = buffer.getWritePointer(0);
  float* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
  float monoR[512];
  double blockPeakL = 0, blockPeakR = 0;
  auto run = [&](float* l, float* r, int start, int count) {
    // the march clock follows the host's position while it plays
    engine->setHostPosition(playing && bpm > 0, ppq + start * beatsPerSample);
    engine->process(l, r, count);
    // each call hands over the hits it fired: keep them for the display
    for (int u = 0; u < UNITS; u++) hitsPending[(size_t)u] += engine->display[u * 3 + 1];
    blockPeakL = std::max(blockPeakL, engine->peakL); blockPeakR = std::max(blockPeakR, engine->peakR);
  };
  auto render = [&](int start, int count) {
    if (count <= 0) return;
    if (R) { run(L + start, R + start, start, count); return; }
    // mono out: render in pieces and fold
    for (int off = 0; off < count; off += 512) {
      const int c = std::min(512, count - off);
      run(L + start + off, monoR, start + off, c);
      for (int k = 0; k < c; k++) L[start + off + k] = 0.5f * (L[start + off + k] + monoR[k]);
    }
  };
  int pos = 0;
  for (const auto meta : midi) {
    const int t = juce::jlimit(0, n, meta.samplePosition);
    render(pos, t - pos);
    pos = std::max(pos, t);
    handleMidi(meta.getMessage());
  }
  render(pos, n - pos);
  for (int ch = 2; ch < buffer.getNumChannels(); ch++) buffer.clear(ch, 0, n);

  // meters for the UI
  voices.store(engine->activeVoices(), std::memory_order_relaxed);
  if (blockPeakL > peakL.load(std::memory_order_relaxed)) peakL.store((float)blockPeakL, std::memory_order_relaxed);
  if (blockPeakR > peakR.load(std::memory_order_relaxed)) peakR.store((float)blockPeakR, std::memory_order_relaxed);
  {
    const juce::SpinLock::ScopedTryLockType lock(scopeLock);
    if (lock.isLocked()) {
      std::copy(std::begin(engine->scopeL), std::end(engine->scopeL), scope.begin());
      std::copy(std::begin(engine->scopeR), std::end(engine->scopeR), scope.begin() + 512);
      // everything but the hits is the latest state; the hits add up until the editor takes them
      for (int k = 0; k < (int)display.size(); k++) if (k >= UNITS * 3 || k % 3 != 1) display[(size_t)k] = engine->display[k];
      for (int u = 0; u < UNITS; u++) {
        display[(size_t)(u * 3 + 1)] = (uint8_t)std::min(255, display[(size_t)(u * 3 + 1)] + hitsPending[(size_t)u]);
        hitsPending[(size_t)u] = 0;
      }
    }
  }
  const double took = juce::Time::highResolutionTicksToSeconds(juce::Time::getHighResolutionTicks() - t0);
  const float l = (float)(took / (n / sampleRate));
  load.store(0.9f * load.load(std::memory_order_relaxed) + 0.1f * l, std::memory_order_relaxed);
}

// ---- UI traffic ------------------------------------------------------------

void SiegeProcessor::pushUiEvent(UiEvent type, int a, float b) {
  const auto w = uiFifo.write(1);
  if (w.blockSize1 > 0) uiMsgs[(size_t)w.startIndex1] = { type, a, b };
}

void SiegeProcessor::pushNote(int note, int velocity, uint8_t kind) {
  const auto w = noteFifo.write(1);
  if (w.blockSize1 > 0) notes[(size_t)w.startIndex1] = { (int16_t)note, (uint8_t)velocity, kind };
}

int SiegeProcessor::popNotes(NoteEvent* dest, int max) {
  const auto r = noteFifo.read(std::min(max, noteFifo.getNumReady()));
  int c = 0;
  for (int k = 0; k < r.blockSize1; k++) dest[c++] = notes[(size_t)(r.startIndex1 + k)];
  for (int k = 0; k < r.blockSize2; k++) dest[c++] = notes[(size_t)(r.startIndex2 + k)];
  return c;
}

SiegeProcessor::Stats SiegeProcessor::takeStats() {
  return { voices.load(), load.load(), peakL.exchange(0), peakR.exchange(0) };
}

void SiegeProcessor::copyScope(float* scope1024, uint8_t* display32) {
  const juce::SpinLock::ScopedLockType lock(scopeLock);
  std::copy(scope.begin(), scope.end(), scope1024);
  std::copy(display.begin(), display.end(), display32);
  for (int u = 0; u < UNITS; u++) display[(size_t)(u * 3 + 1)] = 0;   // taken
}

void SiegeProcessor::setParamFromUi(int i, double value) {
  auto* p = params[(size_t)i];
  const float norm = p->convertTo0to1((float)value);
  if (std::abs(norm - p->getValue()) < 1e-7f) return;
  p->beginChangeGesture();
  p->setValueNotifyingHost(norm);
  p->endChangeGesture();
}

void SiegeProcessor::loadValues(const std::array<double, NUM_PARAMS>& values, const juce::String& name) {
  for (int i = 0; i < NUM_PARAMS; i++) setParamFromUi(i, values[(size_t)i]);
  setPresetName(name);
}

void SiegeProcessor::setPresetName(const juce::String& name) {
  const juce::ScopedLock l(nameLock);
  current = name;
  if (name.isNotEmpty()) lastLoaded = name;
}

// ---- programs --------------------------------------------------------------

void SiegeProcessor::loadFactory(int index) {
  if (index < 0 || index >= NUM_PRESETS) return;
  std::array<double, NUM_PARAMS> v {};
  for (int i = 0; i < NUM_PARAMS; i++) v[(size_t)i] = PARAMS[i].def;
  const Preset& pr = PRESETS[index];
  for (int k = 0; k < pr.count; k++) v[(size_t)pr.values[k].id] = pr.values[k].value;
  for (int i = 0; i < NUM_PARAMS; i++) params[(size_t)i]->setValueNotifyingHost(params[(size_t)i]->convertTo0to1((float)v[(size_t)i]));
  currentProgram = index;
  setPresetName(utf8(pr.name));
}

void SiegeProcessor::setCurrentProgram(int index) {
  if (index < 0 || index >= NUM_PRESETS) return;
  loadFactory(index);
  stateVersion++;
}

const juce::String SiegeProcessor::getProgramName(int index) {
  return index >= 0 && index < NUM_PRESETS ? utf8(PRESETS[index].name) : juce::String();
}

// ---- state -----------------------------------------------------------------

void SiegeProcessor::getStateInformation(juce::MemoryBlock& destData) {
  auto state = apvts.copyState();
  state.setProperty("preset", presetName(), nullptr);
  state.setProperty("lastPreset", lastPresetName(), nullptr);
  state.setProperty("program", currentProgram, nullptr);
  state.setProperty("editorW", editorW.load(), nullptr);
  state.setProperty("editorH", editorH.load(), nullptr);
  if (auto xml = state.createXml()) copyXmlToBinary(*xml, destData);
}

void SiegeProcessor::setStateInformation(const void* data, int sizeInBytes) {
  auto xml = getXmlFromBinary(data, sizeInBytes);
  if (!xml || !xml->hasTagName(apvts.state.getType())) return;
  auto state = juce::ValueTree::fromXml(*xml);
  apvts.replaceState(state);
  {
    const juce::ScopedLock l(nameLock);
    current = state.getProperty("preset").toString();
    lastLoaded = state.getProperty("lastPreset").toString();
  }
  currentProgram = state.getProperty("program", 0);
  editorW = (int)state.getProperty("editorW", 0);
  editorH = (int)state.getProperty("editorH", 0);
  stateVersion++;
}

juce::File SiegeProcessor::userPresetFile() {
#if JUCE_MAC
  auto dir = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("Application Support");
#else
  auto dir = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory);
#endif
  return dir.getChildFile("FT").getChildFile("Siege").getChildFile("user-presets.json");
}

juce::AudioProcessorEditor* SiegeProcessor::createEditor() { return new SiegeEditor(*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new SiegeProcessor(); }
