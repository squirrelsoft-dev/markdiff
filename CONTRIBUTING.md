# Contributing to markdiff

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

You will need [Node](https://nodejs.org) 20+, [Rust](https://rustup.rs)
1.80+ (for `std::sync::LazyLock`), and the Tauri v2
[prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```sh
npm install
npm run tauri dev
```

`markdiff old.md new.md` works in development too — pass the files
through: `npm run tauri dev -- -- old.md new.md`.

## Before opening a pull request

```sh
npm test                                                 # frontend logic
npx tsc --noEmit                                         # typecheck the UI
cargo test  --lib      --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --manifest-path src-tauri/Cargo.toml
cargo fmt              --manifest-path src-tauri/Cargo.toml
```

CI runs all of these. They are quick — the whole suite is under a second
once things are compiled.

## Where things live

| Path | What it does |
|---|---|
| `src-tauri/src/diff.rs` | Line diff, word-level refinement, the three output shapes |
| `src-tauri/src/redline.rs` | Turns a diffed line sequence into marked-up markdown |
| `src-tauri/src/watch.rs` | Reloads documents edited outside the app |
| `src-tauri/src/cli_install.rs` | The `markdiff` command install offer |
| `src/lib/edit.ts` | Pure line-editing primitives |
| `src/lib/useEditor.ts` | Key and paste events → document edits |
| `src/components/EditableLine.tsx` | One editable line inside the diff |

## Things worth knowing before you change them

A few pieces look odd until you know what they are defending against.
The comments explain each in place; this is the short list.

- **`toLines` in `src/lib/edit.ts` must match `split_lines` in
  `diff.rs`.** They are the same 1-based line numbers on both sides of
  the IPC boundary. If they drift, edits land on the wrong line.
- **`EditableLine` renders no React children.** A `contentEditable`
  element is mutated by the browser as the user types, so React's record
  of what it put there goes stale and the next update throws. React owns
  the element; the component owns everything inside it.
- **Nothing writes to a focused line.** The diff runs a beat behind the
  keystrokes; re-rendering mid-word would throw the caret to the start.
  Programmatic changes such as undo go through the `revision` counter.
- **Line similarity is measured over non-whitespace characters.** The
  word tokenizer emits the gaps between words as tokens, so two unrelated
  lines score highly just for sharing spaces. See `similarity` in
  `diff.rs`.
- **The redline keeps block prefixes outside its tags.** Wrapping a whole
  line would stop `# Heading` being a heading. Table rows are marked up
  cell by cell, and fenced code becomes an HTML block.

## Tests

Logic that is easy to get subtly wrong should come with tests, especially
anything touching line indices, caret positions, or the markdown the
redline emits. Frontend tests live beside their subject as `*.test.ts`;
Rust tests are in a `mod tests` at the foot of each file.

To see the diff engine's raw output for a pair of files:

```sh
cargo run --manifest-path src-tauri/Cargo.toml --example diff-json -- old.md new.md
```

## Style

Rust is `cargo fmt` default. TypeScript and CSS follow what is already
there — two-space indent, double quotes, trailing commas.

Comments should explain *why*, not restate the code. If something is
surprising, say what would go wrong otherwise.
