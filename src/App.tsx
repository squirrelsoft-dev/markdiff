import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { CliBanner } from "./components/CliBanner";
import { EmptyState } from "./components/EmptyState";
import { FileBar } from "./components/FileBar";
import { Inline } from "./components/Inline";
import { Overlay } from "./components/Overlay";
import { SideBySide } from "./components/SideBySide";
import { Toolbar } from "./components/Toolbar";
import {
  computeDiff,
  errorMessage,
  pickDocument,
  pickSavePath,
  readDocument,
  writeDocument,
  startupPaths,
  watchPaths,
} from "./lib/api";
import { sampleDocuments } from "./lib/samples";
import { useEditor, type Editor } from "./lib/useEditor";
import type {
  DiffOptions,
  DiffResult,
  Doc,
  OverlayMode,
  Side,
  ViewMode,
} from "./types";

const CONTEXT_LINES = 3;

/** Keystrokes settle for this long before the diff is recomputed. */
const DIFF_DEBOUNCE_MS = 120;

/** A watcher event this soon after our own write is that write. */
const SELF_WRITE_GRACE_MS = 1500;

const DEFAULT_OPTIONS: DiffOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
  charLevel: false,
};

export default function App() {
  const [left, setLeft] = useState<Doc | null>(null);
  const [right, setRight] = useState<Doc | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("split");
  const [overlay, setOverlay] = useState<OverlayMode>("redline");
  const [fade, setFade] = useState(0.5);

  const [options, setOptions] = useState<DiffOptions>(DEFAULT_OPTIONS);
  const [collapsed, setCollapsed] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dirty, setDirty] = useState({ left: false, right: false });

  const viewportRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  // ---- loading -----------------------------------------------------------

  const loadInto = useCallback(async (side: Side, path: string) => {
    try {
      const doc = await readDocument(path);
      (side === "left" ? setLeft : setRight)(doc);
      setDirty((prev) => ({ ...prev, [side]: false }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const pick = useCallback(
    async (side: Side) => {
      try {
        const path = await pickDocument(
          side === "left" ? "Choose document A" : "Choose document B",
        );
        if (path) await loadInto(side, path);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [loadInto],
  );

  const loadSamples = useCallback(() => {
    const { left: a, right: b } = sampleDocuments();
    setLeft(a);
    setRight(b);
    setDirty({ left: false, right: false });
    setError(null);
  }, []);

  /** Two empty scratch panes, ready to paste into. */
  const startBlank = useCallback(() => {
    setLeft(blankDocument("Untitled A"));
    setRight(blankDocument("Untitled B"));
    setDirty({ left: false, right: false });
    setError(null);
  }, []);

  const clearSide = useCallback((side: Side) => {
    const blank = blankDocument(side === "left" ? "Untitled A" : "Untitled B");
    (side === "left" ? setLeft : setRight)(blank);
    setDirty((prev) => ({ ...prev, [side]: false }));
  }, []);

  // Edits stay in memory until ⌘S; typing never touches the disk.
  const editContent = useCallback((side: Side, content: string) => {
    const update = (doc: Doc | null) =>
      doc === null ? doc : { ...doc, content, bytes: content.length };
    (side === "left" ? setLeft : setRight)(update);
    setDirty((prev) => ({ ...prev, [side]: true }));
  }, []);

  const swap = useCallback(() => {
    setLeft(right);
    setRight(left);
  }, [left, right]);

  // ---- saving ------------------------------------------------------------

  // Paths this app has just written, so the watcher can tell our own save
  // from someone else's edit and not reload on top of the caret.
  const selfWrites = useRef(new Map<string, number>());

  // The content as of this render, for comparing against after an await.
  const contentRef = useRef({ left: "", right: "" });
  contentRef.current = {
    left: left?.content ?? "",
    right: right?.content ?? "",
  };

  const saveSide = useCallback(
    async (side: Side, chooseName = false) => {
      const doc = side === "left" ? left : right;
      if (!doc) return;

      try {
        let path = doc.path;
        if (!path || chooseName) {
          const chosen = await pickSavePath(suggestedName(doc));
          if (!chosen) return; // dialog dismissed
          path = chosen;
        }

        const written = doc.content;
        const saved = await writeDocument(path, written);
        selfWrites.current.set(saved.path, Date.now());

        // Typing may have continued while the write was in flight. Keep
        // the newer text and stay dirty rather than reporting it saved.
        const movedOn = contentRef.current[side] !== written;
        (side === "left" ? setLeft : setRight)((current) =>
          movedOn && current
            ? { ...current, path: saved.path, name: saved.name }
            : saved,
        );
        setDirty((prev) => ({ ...prev, [side]: movedOn }));
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [left, right],
  );

  /** ⌘S acts on the pane holding the caret, else on whatever is unsaved. */
  const saveFocused = useCallback(
    (chooseName = false) => {
      const focusedSide = editorRef.current?.focused?.split(":")[0] as
        | Side
        | undefined;

      if (focusedSide === "left" || focusedSide === "right") {
        void saveSide(focusedSide, chooseName);
        return;
      }
      if (chooseName) return; // Save As needs a definite target
      if (dirty.left) void saveSide("left");
      if (dirty.right) void saveSide("right");
    },
    [saveSide, dirty],
  );

  const editor = useEditor(
    { left: left?.content ?? "", right: right?.content ?? "" },
    editContent,
  );
  editorRef.current = editor;

  // Files named on the command line open straight into the diff.
  useEffect(() => {
    startupPaths()
      .then(([a, b]) => {
        if (a) void loadInto("left", a);
        if (b) void loadInto("right", b);
      })
      .catch(() => {});
  }, [loadInto]);

  // ---- diffing -----------------------------------------------------------

  // Debounced so a burst of keystrokes causes one diff, not one per
  // character. The first diff of a pair runs immediately.
  const settled = useRef(false);

  useEffect(() => {
    if (!left || !right) {
      setDiff(null);
      settled.current = false;
      return;
    }

    let stale = false;
    const run = () => {
      computeDiff(left.content, right.content, options)
        .then((result) => {
          if (stale) return;
          setDiff(result);
          settled.current = true;
          setError(null);
        })
        .catch((err) => {
          if (!stale) setError(errorMessage(err));
        });
    };

    if (!settled.current) {
      run();
      return () => {
        stale = true;
      };
    }

    const timer = setTimeout(run, DIFF_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [left, right, options]);

  // Folding and the change cursor are about a *pair* of documents, so they
  // reset when the documents change — but not on every keystroke, which
  // would collapse the region being typed into.
  useEffect(() => {
    setExpanded(new Set());
    setCursor(0);
  }, [left?.path, right?.path, options]);

  // ---- reload on external edits ------------------------------------------

  // Read through refs so the watcher callback never sees stale values.
  const paths = useRef({ left: "", right: "" });
  paths.current = { left: left?.path ?? "", right: right?.path ?? "" };
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const live = [left?.path, right?.path].filter((p): p is string => !!p);
    void watchPaths(live).catch(() => {});
  }, [left?.path, right?.path]);

  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const unlisten = listen<string>("file-changed", (event) => {
      const changed = event.payload;
      // Editors touch a file several times per save; let it settle.
      clearTimeout(pending.get(changed));
      pending.set(
        changed,
        setTimeout(() => {
          // Our own save fires the watcher too; reloading then would
          // replace the document under the caret for no reason.
          const written = selfWrites.current.get(changed) ?? 0;
          if (Date.now() - written < SELF_WRITE_GRACE_MS) return;

          // Never reload over edits that have not been saved — the whole
          // point of the watcher is convenience, not losing someone's work.
          if (paths.current.left === changed && !dirtyRef.current.left) {
            void loadInto("left", changed);
          }
          if (paths.current.right === changed && !dirtyRef.current.right) {
            void loadInto("right", changed);
          }
        }, 150),
      );
    });

    return () => {
      pending.forEach(clearTimeout);
      void unlisten.then((off) => off());
    };
  }, [loadInto]);

  // ---- drag and drop -----------------------------------------------------

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;

      if (payload.type === "enter" || payload.type === "over") {
        setDragging(true);
        return;
      }
      if (payload.type === "leave") {
        setDragging(false);
        return;
      }

      setDragging(false);
      const [first, second] = payload.paths;
      if (!first) return;

      // Two files at once fill both sides; a single file fills whichever
      // side is empty, replacing A when both are already loaded.
      if (second) {
        void loadInto("left", first);
        void loadInto("right", second);
      } else if (!paths.current.left) {
        void loadInto("left", first);
      } else if (!paths.current.right) {
        void loadInto("right", first);
      } else {
        void loadInto("left", first);
      }
    });

    return () => {
      void unlisten.then((off) => off());
    };
  }, [loadInto]);

  // ---- change navigation -------------------------------------------------

  /** The redline has no block anchors, so it steps through marks instead. */
  const usesMarks = view === "overlay" && overlay === "redline";

  // The position is held in a ref as well as state: `step` must see the
  // real position even when called several times before React re-renders.
  const cursorRef = useRef(0);

  // Marks can only be counted once the redline is in the DOM, so this
  // measures after the view has rendered rather than during it.
  const [markCount, setMarkCount] = useState(0);
  useEffect(() => {
    setMarkCount(usesMarks ? redlineStops(viewportRef.current).length : 0);
    cursorRef.current = 0;
    setCursor(0);
  }, [usesMarks, diff]);

  const total = !diff ? 0 : view === "overlay" ? markCount : diff.stats.blocks;

  const step = useCallback(
    (delta: number) => {
      const root = viewportRef.current;
      if (!root) return;

      const targets = usesMarks
        ? redlineStops(root)
        : firstRowOfEachBlock(root);
      if (targets.length === 0) return;

      const next = wrap(cursorRef.current + delta, targets.length);
      cursorRef.current = next;
      setCursor(next);

      root
        .querySelectorAll(".is-current")
        .forEach((el) => el.classList.remove("is-current"));
      const target = targets[next];
      target.classList.add("is-current");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [usesMarks],
  );

  // ---- keyboard ----------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable);

      if (e.metaKey || e.ctrlKey) {
        if (e.key === "1") {
          e.preventDefault();
          void pick("left");
        }
        if (e.key === "2") {
          e.preventDefault();
          void pick("right");
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveFocused(e.shiftKey);
          return;
        }
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) editor.redo();
          else editor.undo();
        }
        return;
      }
      if (e.altKey) return;

      // The single-letter shortcuts would otherwise be swallowed by, or
      // typed into, whichever line has the caret.
      if (typing) return;

      switch (e.key) {
        case "1":
          setView("split");
          break;
        case "2":
          setView("inline");
          break;
        case "3":
          setView("overlay");
          break;
        case "n":
        case "j":
          step(1);
          break;
        case "p":
        case "k":
          step(-1);
          break;
        case "s":
          if (left && right) swap();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick, step, swap, saveFocused, left, right, editor]);

  // ---- render ------------------------------------------------------------

  const expandGap = useCallback((from: number) => {
    setExpanded((prev) => new Set(prev).add(from));
  }, []);


  const ready = left !== null && right !== null && diff !== null;

  return (
    <div className={dragging ? "app is-dragging" : "app"}>
      <FileBar
        left={left}
        right={right}
        dirty={dirty}
        onPick={pick}
        onClear={clearSide}
        onSwap={swap}
        canSwap={left !== null && right !== null}
      />

      {ready && (
        <Toolbar
          view={view}
          onView={setView}
          overlay={overlay}
          onOverlay={setOverlay}
          fade={fade}
          onFade={setFade}
          stats={diff.stats}
          position={{ index: total === 0 ? 0 : cursor + 1, total }}
          onStep={step}
          options={options}
          onOptions={setOptions}
          collapsed={collapsed}
          onCollapsed={setCollapsed}
        />
      )}

      <CliBanner />

      {error && (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {ready && diff.identical && (
        <div className="banner banner-quiet">
          These documents are identical
          {options.ignoreWhitespace || options.ignoreCase
            ? " under the current options"
            : ""}
          .
        </div>
      )}

      <main className="stage">
        {!ready ? (
          <EmptyState
            left={left}
            right={right}
            onPick={pick}
            onSamples={loadSamples}
            onBlank={startBlank}
          />
        ) : view === "split" ? (
          <SideBySide
            diff={diff}
            leftName={left.name}
            rightName={right.name}
            context={CONTEXT_LINES}
            collapsed={collapsed}
            expanded={expanded}
            onExpand={expandGap}
            viewportRef={viewportRef}
            editor={editor}
          />
        ) : view === "inline" ? (
          <Inline
            diff={diff}
            leftName={left.name}
            rightName={right.name}
            context={CONTEXT_LINES}
            collapsed={collapsed}
            expanded={expanded}
            onExpand={expandGap}
            viewportRef={viewportRef}
          />
        ) : (
          <Overlay
            diff={diff}
            left={left}
            right={right}
            mode={overlay}
            fade={fade}
            viewportRef={viewportRef}
          />
        )}
      </main>

      {dragging && (
        <div className="drop-veil">
          <div className="drop-card">Drop markdown files to compare</div>
        </div>
      )}
    </div>
  );
}

/** A sensible filename to offer when saving a pane that has none. */
function suggestedName(doc: Doc): string {
  if (doc.path) return doc.name;
  const base = doc.name.replace(/[^\w.-]+/g, "-").toLowerCase();
  return /\.\w+$/.test(base) ? base : `${base}.md`;
}

function blankDocument(name: string): Doc {
  return { path: "", name, content: "", bytes: 0 };
}

/** The first row of each change block, in document order. */
function firstRowOfEachBlock(root: HTMLElement): HTMLElement[] {
  const seen = new Set<string>();
  const out: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("[data-block]").forEach((el) => {
    const block = el.dataset.block;
    if (!block || seen.has(block)) return;
    seen.add(block);
    out.push(el);
  });
  return out;
}

/**
 * Stops for stepping through the redline. A deletion immediately followed
 * by an insertion is one edit, so the pair counts once.
 */
function redlineStops(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const marks = Array.from(
    root.querySelectorAll<HTMLElement>(".rl-ins, .rl-del"),
  );
  return marks.filter(
    (mark) =>
      !(
        mark.classList.contains("rl-del") &&
        mark.nextElementSibling?.classList.contains("rl-ins")
      ),
  );
}

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}
