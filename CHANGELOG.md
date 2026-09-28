# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- README badge linking to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/quiet-tab/dbcdpffdgfbjmdlomgheeijfkkjkhmma).
- A live city suggestion dropdown in the weather panel: typing two or more
  characters shows matching cities from Open-Meteo's geocoding search;
  selecting one sets the location immediately without a second geocoding
  request. Free-text entry and Save still work exactly as before.

### Changed

- The favorites bar is now a wrapping grid with a configurable number of columns (1–12)
  instead of a single horizontally scrolling row, and can be placed at the top, center
  or bottom of the page (Quick links settings).
- Reordering in the Quick links settings now uses up/down "Move earlier"/"Move later"
  buttons to match the multi-row grid.
- Favorites are stored in a new unified widgets layout (`quietTabWidgetsMeta` /
  `quietTabWidget:<id>`), preparing for weather tiles to join the same grid. Existing
  favorites are migrated automatically on first open; the migration is resumable and
  leaves your data untouched if it fails.
- A wide tile is shown as a square while the grid has a single column.
- The favorites bar keeps clear of the weather panel in every position.

## [0.1.0] - 2026-09-27

### Added

- Initial public release of Quiet Tab: a favorites toolbar and a local
  weather panel on the new tab page. Forked from a personal news-queue
  extension, with the news feature removed entirely and every remaining
  string translated to English.

[0.1.0]: https://github.com/undevy-org/quiet-tab/releases/tag/v0.1.0
