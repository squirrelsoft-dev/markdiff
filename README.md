# markdiff

[![CI](https://github.com/squirrelsoft-dev/markdiff/actions/workflows/ci.yml/badge.svg)](https://github.com/squirrelsoft-dev/markdiff/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/squirrelsoft-dev/markdiff?sort=semver)](https://github.com/squirrelsoft-dev/markdiff/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A desktop app for comparing two markdown files. Tauri 2 + React, with the
diff engine in Rust.

Three ways to read a diff — aligned source, unified source, and the
rendered document with the edits marked in place — and the side-by-side
view is editable, so you can paste two drafts in and work on them.

## Download

**[Latest release →](https://github.com/squirrelsoft-dev/markdiff/releases/latest)**

| Platform | File | Notes |
|---|---|---|
| macOS 10.15+ | `markdiff_<version>_universal.dmg` | One download for Apple Silicon and Intel. Signed and notarised. |
| Windows 10+ | `markdiff_<version>_x64-setup.exe` or `_x64_en-US.msi` | Unsigned — see below. |
| Linux (x86_64) | `.AppImage`, `.deb` or `.rpm` | Unsigned, as is normal outside distribution repositories. |

Or build it yourself — see [Development](#development).

### On the warnings

The macOS build is signed with a Developer ID certificate and notarised
by Apple, so it opens without complaint.

The Windows build is not signed. SmartScreen will show "Windows protected
your PC" on first run until the download earns reputation; **More info →
Run anyway** gets past it. Signing this properly needs a paid EV
certificate, which is not worth it yet. Say so in an issue if it is
blocking you.

## Views

**Side by side** (`1`) — both documents in one scroll container, aligned
row by row. Because each row holds both sides, the two columns cannot
drift out of sync and long lines wrap without breaking the alignment.

**Inline** (`2`) — the unified view: one column, removals above the
additions that replaced them.

Both show markdown *source*, with line-level tinting and a word-level
highlight inside lines that were edited rather than rewritten. Runs of
eight or more unchanged lines fold away, with three lines of context kept
around every change; click a fold to open it.

**Overlay** (`3`) — the *rendered* document, in three flavours:

| Mode | What it shows |
|---|---|
| Redline | One merged document, edits marked in place: insertions underlined, deletions struck through. Headings stay headings, tables stay tables, code blocks keep their structure. |
| Fade | Both renders stacked, crossfaded by a slider. |
| Difference | Both renders stacked with a difference blend, so matching text cancels to black and only the changes light up. |

Fade and Difference are literal superimpositions, so they read best when
the two documents are close to the same length — adding or removing lines
pushes everything below out of step. Redline is the one to reach for when
the documents have diverged structurally.

All three drop a document's front matter, YAML (`---`) or TOML (`+++`),
because it is configuration rather than prose and renders as a stray rule
and a paragraph of keys. Only the rendering is affected: the files, the
diff and the two source views all still have it. When the front matter is
one of the things that changed, the overlay says so — otherwise the
toolbar would count edits that nothing on screen could show.

A delimiter with nothing closing it is a horizontal rule, not front
matter, and is left alone; the same goes for the `---` under a setext
heading.

## Editing

The side-by-side view is editable in place. Click any line and type — the
diff recomputes as you go, so the highlights, the counts and the fold
points all follow along. There is no separate text box: the cells of the
diff *are* the editor.

Start from **two blank panes** on the empty screen and paste a document
into each side, or edit files you have opened. Enter splits a line,
Backspace at the start of a line joins it to the one above, Tab indents,
and ⌘Z / ⇧⌘Z undo and redo. Pasting multi-line text spreads it across as
many lines as it contains.

The line you are typing in shows plain text rather than the word-level
highlights, and switches back the moment you leave it. Character offsets
are identical either way, so the caret does not move.

Typing never touches the disk. **⌘S saves the pane holding the caret**;
a pane that has no file behind it asks where to put one, and ⇧⌘S always
asks. With the caret nowhere, ⌘S saves every pane with unsaved changes.
A dot on the file name marks those.

Saves are atomic — the content is written beside the target and renamed
over it, so an interrupted write cannot leave a truncated file where a
good one was. Existing permissions are preserved. The file watcher
ignores the app's own writes, and never reloads over unsaved edits.

Inline and Overlay are read-only for now.

## Other behaviour

- **Drag and drop** files anywhere in the window. Two at once fill both
  sides; one fills whichever side is empty.
- **Live reload** — both files are watched, so saving in your editor
  updates the diff. Unsaved edits in markdiff are never overwritten.
- **Command line** — `markdiff old.md new.md` opens straight into the
  diff. See [Installing the CLI](#installing-the-cli).
- **Change overview** — a rail down the right edge marks every change in
  the whole document, coloured by kind (blue changed, green added, red
  removed). Click a marker to jump to it; it tracks the current change.
- **Theme** — dark or light, following the OS by default. The ☀/☾ toggle
  in the toolbar sets an explicit choice that is remembered.
- **Options** (⚙) — ignore whitespace, ignore case, highlight by
  character instead of by word, and turn folding off.

## Installing the CLI

Dragging `markdiff.app` into Applications does not put anything on your
`PATH` — the executable lives inside the bundle. So the app offers, once,
on first launch:

> Use markdiff from the terminal? This links `markdiff` into
> `/usr/local/bin`.  **Install** · Not now · Never

Choosing **Install** symlinks a directory on your PATH to the launcher
inside the bundle. If you dismiss the offer — including with **Never** —
the same action stays available under the ⚙ menu.

### Where it goes

The first of these that is on your PATH *and* accepts writes:

| Directory | Why |
|---|---|
| `/usr/local/bin` | The only one `/etc/paths` ships, so it is on PATH for every account with no setup. Often root-owned on Apple Silicon. |
| `~/.local/bin` | Always user-writable, no password, same on Linux. Used only when it is *already* on your PATH. |
| `~/bin` | Same, for people who keep one. |

If none of them qualify, the app offers `/usr/local/bin` behind the
standard macOS administrator prompt — clearly labelled, and never as a
surprise from a plain **Install** button.

Two things it deliberately will not do. It never writes to Homebrew's
prefix (`/opt/homebrew/bin`): that namespace belongs to Homebrew, and
`brew doctor` reports foreign files there. And it never edits your shell
profile to put a directory on your PATH — it only uses directories that
already are, which is why `~/.local/bin` is a fallback rather than the
default despite needing no password. It also never overwrites a file it
did not create, and re-installing just re-points the existing symlink.

There is also a script, for installing without launching the app:

```sh
./scripts/install-cli.sh            # pick a directory automatically
./scripts/install-cli.sh ~/bin      # or name one
```

### Why a symlink to a script

The link points at `Contents/Resources/markdiff`, a launcher script, not
at the executable. Both are symlinks, so both survive the app being
replaced by a newer copy — but linking the executable directly would tie
the app to the terminal that started it: the prompt would block until you
quit, app logs would land in your shell, and Ctrl-C would kill the
window. The launcher uses `open` instead, which detaches and brings the
window to the front.

That has one consequence worth knowing about. An app started through
LaunchServices begins life in `/` rather than in your shell's directory,
so `markdiff notes.md` would not find the file. The launcher resolves
every argument to an absolute path before handing it over. It also passes
`-n`, so a second invocation opens a second comparison rather than just
focusing the first window.

Finding the PATH is a similar story: an app launched from Finder inherits
launchd's minimal `PATH`, which never contains any of the candidate
directories. The app asks your login shell for the real one instead.

## Keyboard

| Key | Action |
|---|---|
| `1` `2` `3` | Side by side / Inline / Overlay |
| `n` / `j` | Next change |
| `p` / `k` | Previous change |
| `s` | Swap the two documents |
| `⌘1` / `⌘2` | Open document A / B |
| `⌘Z` / `⇧⌘Z` | Undo / redo an edit |
| `⌘S` | Save the focused pane |
| `⇧⌘S` | Save the focused pane somewhere new |

The single-letter shortcuts are suppressed while the caret is in a line,
so they can be typed.

## Development

```sh
npm install
npm run tauri dev            # run the app
npm run tauri build          # bundle it

npm test                                                 # frontend logic
cargo test --lib --manifest-path src-tauri/Cargo.toml    # diff engine, saving
npx tsc --noEmit                                         # typecheck the UI
```

To see the engine's raw output for a pair of files:

```sh
cargo run --manifest-path src-tauri/Cargo.toml --example diff-json -- old.md new.md
```

## How the diff works

`src-tauri/src/diff.rs` runs a Patience diff over the lines, then refines
each replaced pair with a word-level (or character-level) diff. A pair is
only refined when enough of its substance survived the edit — similarity
is measured over non-whitespace characters, because the word tokenizer
emits the gaps between words as tokens, and two unrelated lines otherwise
score highly just for sharing spaces.

`src-tauri/src/redline.rs` renders the redline. The work there is staying
out of markdown's way: wrapping a whole line would stop `# Heading` being
a heading, so block prefixes are always left bare and only the content
inside them is wrapped. Table rows are marked up cell by cell so the pipes
survive, and fenced code — where markdown markup is inert — becomes an
HTML block with per-line tinting instead.

The rendered HTML is sanitised before it reaches the DOM; these are files
the app did not write.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). It lists the checks CI runs and,
more usefully, the handful of places in the code that look odd until you
know what they are defending against.

Bugs and ideas both go in [issues](https://github.com/squirrelsoft-dev/markdiff/issues).
Security problems should go through
[private reporting](https://github.com/squirrelsoft-dev/markdiff/security/advisories/new)
instead — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © SquirrelSoft LLC
