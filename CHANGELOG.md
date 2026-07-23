# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] — 2026-07-22

### Added

- **Light and dark themes**, in GitHub Primer colours, with a toggle in
  the toolbar. The theme follows the OS by default and tracks OS changes
  live; the toggle sets an explicit choice that is remembered and applied
  before the first paint, so the window never flashes the wrong theme.
- **Change overview rail** down the right edge of the side-by-side and
  inline views: one marker per change, placed by its position in the whole
  document and coloured by kind. Every change shows at once, and clicking a
  marker jumps to it.

### Changed

- Recoloured both themes to the GitHub Primer palette.

## [0.1.0] — 2026-07-22

First release.

### Added

- **Side-by-side view.** Both documents in one scroll container, aligned
  row by row, so the columns cannot drift out of sync.
- **Inline view.** The unified diff: removals above the additions that
  replaced them.
- **Overlay views** over the rendered document — Redline (edits marked in
  place), Fade (crossfade), and Difference (difference blend). Front
  matter is dropped from the rendering.
- **In-place editing** in the side-by-side view, with the diff
  recomputing as you type. Paste into either side, start from blank
  panes, undo and redo.
- **Saving** with `⌘S`, written atomically and preserving permissions.
- Word-level highlights inside lines that were edited rather than
  rewritten, measured over non-whitespace characters.
- Folding of unchanged runs, with next/previous-change navigation.
- Drag and drop, live reload when files change on disk, and a
  `markdiff old.md new.md` command line.
- An offer, on first launch, to put `markdiff` on your PATH.

[Unreleased]: https://github.com/squirrelsoft-dev/markdiff/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/squirrelsoft-dev/markdiff/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/squirrelsoft-dev/markdiff/releases/tag/v0.1.0
