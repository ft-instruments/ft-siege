// The plugin: host parameters, MIDI and the host's clock in, the engine's
// audio out. The editor (a WebView running the web UI) talks to it through
// two lock-free queues and a few atomics; nothing here blocks the audio thread.
#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>
#include <memory>
#include "dsp/Engine.h"

class SiegeProcessor final : public juce::AudioProcessor {
public:
  SiegeProcessor();
  ~SiegeProcessor() override = default;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override {}
  bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
  void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
  using AudioProcessor::processBlock;

  juce::AudioProcessorEditor* createEditor() override;
  bool hasEditor() const override { return true; }

  const juce::String getName() const override { return JucePlugin_Name; }
  bool acceptsMidi() const override { return true; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 15.0; }   // the terrain tail runs to 12 s, the farthest path 2.4 s late

  // the factory bank, so the host's preset menu (Logic's, Reaper's) lists it
  int getNumPrograms() override { return ftsiege::NUM_PRESETS; }
  int getCurrentProgram() override { return currentProgram; }
  void setCurrentProgram(int index) override;
  const juce::String getProgramName(int index) override;
  void changeProgramName(int, const juce::String&) override {}

  void getStateInformation(juce::MemoryBlock& destData) override;
  void setStateInformation(const void* data, int sizeInBytes) override;

  // ---- for the editor (message thread) ------------------------------------

  juce::RangedAudioParameter* param(int i) const { return params[(size_t)i]; }
  float paramValue(int i) const { return raw[(size_t)i]->load(); }
  /** Set a parameter as if a person moved it (one gesture). */
  void setParamFromUi(int i, double value);
  /** Load a whole sound: every parameter, missing ones to their default. */
  void loadValues(const std::array<double, ftsiege::NUM_PARAMS>& values, const juce::String& name);

  /** The preset the UI shows: its name while unedited, and the last one loaded. */
  juce::String presetName() const { const juce::ScopedLock l(nameLock); return current; }
  juce::String lastPresetName() const { const juce::ScopedLock l(nameLock); return lastLoaded; }
  void setPresetName(const juce::String& name);

  /** Bumped whenever the whole state changes under the UI (session load, program change). */
  std::atomic<int> stateVersion { 0 };
  std::atomic<double> hostTempo { 0 };
  /** The editor's size once someone has resized it (0 = fit the screen), kept with the session. */
  std::atomic<int> editorW { 0 }, editorH { 0 };

  enum class UiEvent : uint8_t { NoteOn, NoteOff, Controller, Bend, Panic };
  /** From the on-screen / computer keyboard; played at the start of the next block. */
  void pushUiEvent(UiEvent type, int a, float b);

  struct NoteEvent { int16_t note; uint8_t velocity; uint8_t kind; };   // kind: 0 on, 1 off
  /** Notes for the UI to light up; returns how many were copied. */
  int popNotes(NoteEvent* dest, int max);

  struct Stats { int voices; float load, peakL, peakR; };
  Stats takeStats();
  /** The seismograph (512 left, then 512 right) and the army's display (32 bytes, see Engine::display); hits since the last call. */
  void copyScope(float* scope1024, uint8_t* display32);

  static juce::File userPresetFile();

private:
  void pushNote(int note, int velocity, uint8_t kind);
  void handleMidi(const juce::MidiMessage& m);
  void loadFactory(int index);

  std::unique_ptr<ftsiege::Engine> engine;
  juce::AudioProcessorValueTreeState apvts;
  std::array<juce::RangedAudioParameter*, ftsiege::NUM_PARAMS> params {};
  std::array<std::atomic<float>*, ftsiege::NUM_PARAMS> raw {};
  std::array<float, ftsiege::NUM_PARAMS> pushed {};   // last value given to the engine
  int currentProgram = 0;

  juce::CriticalSection nameLock;
  juce::String current, lastLoaded;

  struct UiMsg { UiEvent type; int a; float b; };
  juce::AbstractFifo uiFifo { 512 };
  std::array<UiMsg, 512> uiMsgs {};

  juce::AbstractFifo noteFifo { 512 };
  std::array<NoteEvent, 512> notes {};

  std::atomic<int> voices { 0 };
  std::atomic<float> peakL { 0 }, peakR { 0 }, load { 0 };
  juce::SpinLock scopeLock;
  std::array<float, 1024> scope {};
  std::array<uint8_t, 32> display {};
  std::array<int, ftsiege::UNITS> hitsPending {};   // audio thread: hits not yet handed to the display
  double sampleRate = 48000;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SiegeProcessor)
};
