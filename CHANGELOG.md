# Changelog

All notable changes to ft-siege. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## Unreleased

## [0.1.1] - 2026-11-02

### Added
- AGPL-3.0 license, a Download section in the README and a GitHub Actions workflow that builds the plugin for macOS, Windows and Linux.

### Changed
- Fonts (Cinzel, Geist, IBM Plex Mono; SIL OFL) are bundled in `src/fonts/` instead of loaded from Google Fonts: the UI and the plugin make no network connections.
- `plugin/CMakeLists.txt`: `SIEGE_INSTALL` option (off in CI) and `NEEDS_WEBVIEW2` with static WebView2 linking for Windows.
- Linux: the editor's WebView renders on the GPU (`plugin/patch-juce.cmake` flips JUCE's WebKit acceleration policy; the editor forces shared-memory frames so it also works on NVIDIA). JUCE 8.0.9 to 8.0.15.

### Fixed
- Linux: arrows and key symbols would show as tofu with the bundled Latin fonts; a small `FT Symbols` fallback (subset of Noto Sans Symbols 1/2, SIL OFL) ships with the UI.
- Linux: the editor could show `Â·` instead of `·` (the WebView misread the text encoding); the plugin serves its pages as UTF-8 explicitly and the built UI is pure ASCII.

## [0.1.0] - 2026-10-06

First tracked release. The version file already said 0.1.0, so this tags the project as it stands today.

### Added
- A physically modelled war ensemble: impacts on large bodies, driven tubes, crowds of them and the ground they stand on.
- FT Instrument look, saved presets and a real power switch; the shared UI is unified with Mycelia and Vector.
- Velocity that plays: a dB curve, and touch that changes the tone.
- Compact preset browser and a second bank of 81 presets.
- Siege as a VST3 / AU plugin under `plugin/`.
- The header width stays steady as the DSP readout changes digits.

[Unreleased]: https://github.com/filipefthomaz-gd/ft-siege/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/filipefthomaz-gd/ft-siege/releases/tag/v0.1.0
