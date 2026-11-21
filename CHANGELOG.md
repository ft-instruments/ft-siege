# Changelog

All notable changes to ft-siege. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## Unreleased

## [0.1.1] - 2026-11-21

### Changed
- The plugin window is now a wide 16:10 layout (1360 × 850) that fits the screen, scales to the window and never scrolls. A new window opens as large as fits, up to that size. It has three tabs.
- The army shows one big unit at a time, picked from a chip bar, instead of eight units on a long page that scrolled.
- The field map is much larger, with the terrain, air and weather graphs and knobs beside it at a smaller but readable size.
- The plugin header no longer overlaps, and the stats and tempo readouts are fixed width so digits changing no longer shift the layout.
- Knob readouts are fixed width, so the knobs no longer move as values change.

## [0.1.0] - 2026-11-15

First public release.

### Added
- SIEGE, a physically modelled war ensemble: impacts on large bodies, driven tubes, crowds of them and the ground they stand on. An army of eight units, each a body or a horn, a strike, a crowd and a place on the field. Nothing is sampled.
- 18 modal bodies (drum, timpani, gong, bell, shield, anvil, blade, log, bars, lyre, bowed string, feet, hooves, cannon, and the quiet-war glass, music box, helmet and rubble), with tension modulation and gong bloom.
- Waveguide horns driven by a lip valve (partial, natural, lip, rip and growl), a reed pipe and an air-jet flute, crowd scheduling, a field model (distance delay, air absorption, ground reflection, proximity, terrain echoes, wind) and a march clock with rolls, approach and rally.
- Velocity on a dB curve with touch that changes the tone.
- 154 factory presets in a compact, searchable browser, including a quiet-war "elegy" category, plus saved user presets and a real power switch.
- The FT Instrument look: iron plates by firelight, a map of the field you can drag units across, and pictures drawn with the instrument's own maths.
- VST3 (macOS, Windows, Linux), AU (macOS) and standalone builds with JUCE 8, built by a GitHub Actions workflow and attached to each release. The C++ engine is a port of the TypeScript one and differs from it only by libm rounding, at worst 135 dB below peak.
- Bundled fonts (Cinzel, Geist, IBM Plex Mono, a small symbols fallback; SIL OFL): the UI and the plugin make no network connections.
- AGPL-3.0 license, copyright and third-party notices.

[Unreleased]: https://github.com/ft-instruments/ft-siege/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ft-instruments/ft-siege/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ft-instruments/ft-siege/releases/tag/v0.1.0
