import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  editableLines,
  insertText,
  mergeWithNext,
  mergeWithPrevious,
  replaceLine,
  splitLine,
  toLines,
  type Caret,
} from "./edit";
import { placeCaret, readCaret } from "../components/EditableLine";
import type { Side } from "../types";

/** How long consecutive typing folds into a single undo step. */
const UNDO_COALESCE_MS = 600;

/** Renders to wait for a moved caret's line to appear before giving up. */
const MAX_CARET_ATTEMPTS = 40;

export interface Contents {
  left: string;
  right: string;
}

export interface Editor {
  focused: string | null;
  /** Bumped when the text changes from something other than typing, so a
   *  focused line knows to refresh itself. */
  revision: number;
  caretFor: (id: string) => number;
  lineText: (side: Side, index: number) => string;
  lineCount: (side: Side) => number;
  onFocus: (id: string, caret: number) => void;
  onBlur: (id: string) => void;
  onInput: (id: string, text: string) => void;
  onKeyDown: (id: string, event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (id: string, text: string, caret: number) => void;
  undo: () => void;
  redo: () => void;
}

export function lineId(side: Side, index: number): string {
  return `${side}:${index}`;
}

function parseId(id: string): { side: Side; index: number } {
  const [side, index] = id.split(":");
  return { side: side as Side, index: Number(index) };
}

/**
 * Turns key and paste events on the diff's cells into document edits.
 *
 * Structural edits (Enter, joining lines, multi-line paste) move the caret
 * to a different line, so they record where it should land; the caller
 * cannot restore it itself because the rows only exist after the next diff.
 */
export function useEditor(
  contents: Contents,
  onChange: (side: Side, content: string) => void,
): Editor {
  const [focused, setFocused] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const caretRef = useRef(0);
  const pending = useRef<{ side: Side; caret: Caret } | null>(null);

  // Read through a ref: key handlers are attached once but must always
  // act on the document as it is now, not as it was when they were made.
  const live = useRef(contents);
  live.current = contents;

  const history = useRef<Contents[]>([]);
  const future = useRef<Contents[]>([]);
  const lastEditAt = useRef(0);
  const lastEditId = useRef<string | null>(null);

  const record = useCallback((id: string | null, coalesce: boolean) => {
    const now = Date.now();
    const continues =
      coalesce &&
      id !== null &&
      id === lastEditId.current &&
      now - lastEditAt.current < UNDO_COALESCE_MS;

    if (!continues) {
      history.current.push({ ...live.current });
      if (history.current.length > 200) history.current.shift();
      future.current = [];
    }
    lastEditAt.current = now;
    lastEditId.current = id;
  }, []);

  const contentOf = (side: Side) =>
    side === "left" ? live.current.left : live.current.right;

  const lineText = useCallback((side: Side, index: number) => {
    return editableLines(contentOf(side))[index] ?? "";
  }, []);

  /** The document's real line count — `editableLines` invents one for a
   *  blank document, which would hide the fact that it is empty. */
  const lineCount = useCallback((side: Side) => {
    return toLines(contentOf(side)).length;
  }, []);

  const caretFor = useCallback((id: string) => {
    return focused === id ? caretRef.current : 0;
  }, [focused]);

  // True while the caret is being moved programmatically, so the focus
  // event that follows does not overwrite the position we are restoring.
  const restoring = useRef(false);

  const onFocus = useCallback((id: string, caret: number) => {
    if (!restoring.current) caretRef.current = caret;
    setFocused((current) => (current === id ? current : id));
  }, []);

  /**
   * Only the line that still holds focus may clear it. Moving between
   * lines fires the old line's blur *after* the new line's focus, and
   * React batches both — an unconditional clear would land last and leave
   * nothing focused, so React would re-render over the caret.
   */
  const onBlur = useCallback((id: string) => {
    setFocused((current) => (current === id ? null : current));
  }, []);

  const onInput = useCallback(
    (id: string, text: string) => {
      const { side, index } = parseId(id);
      record(id, true);
      onChange(side, replaceLine(contentOf(side), index, text));
    },
    [onChange, record],
  );

  /** Queues a caret position for after the next render. */
  const settle = useCallback((side: Side, caret: Caret) => {
    pending.current = { side, caret };
  }, []);

  const onPaste = useCallback(
    (id: string, text: string, caret: number) => {
      const { side, index } = parseId(id);
      record(id, false);
      const edit = insertText(contentOf(side), index, caret, text);
      onChange(side, edit.content);
      settle(side, edit.caret);
    },
    [onChange, record, settle],
  );

  const onKeyDown = useCallback(
    (id: string, event: KeyboardEvent<HTMLDivElement>) => {
      const { side, index } = parseId(id);
      const element = event.currentTarget;
      // Read the caret from the selection rather than from what focus last
      // recorded: clicking or arrowing inside an already-focused line moves
      // it without any focus event, and a stale value would split, join or
      // paste at the wrong column.
      const caret = readCaret(element);
      const text = element.textContent ?? "";

      if (event.key === "Enter") {
        event.preventDefault();
        record(id, false);
        // Take the line from the DOM: the model may not have caught up
        // with the last keystroke yet.
        const current = replaceLine(contentOf(side), index, text);
        const edit = splitLine(current, index, caret);
        onChange(side, edit.content);
        settle(side, edit.caret);
        return;
      }

      if (event.key === "Backspace" && caret === 0 && isCollapsed()) {
        const edit = mergeWithPrevious(
          replaceLine(contentOf(side), index, text),
          index,
        );
        if (!edit) return; // first line: nothing above to join onto
        event.preventDefault();
        record(id, false);
        onChange(side, edit.content);
        settle(side, edit.caret);
        return;
      }

      if (
        event.key === "Delete" &&
        caret === text.length &&
        isCollapsed()
      ) {
        const edit = mergeWithNext(
          replaceLine(contentOf(side), index, text),
          index,
        );
        if (!edit) return;
        event.preventDefault();
        record(id, false);
        onChange(side, edit.content);
        settle(side, edit.caret);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const next = index + (event.key === "ArrowUp" ? -1 : 1);
        const lines = editableLines(contentOf(side));
        if (next < 0 || next >= lines.length) return;
        event.preventDefault();
        // Keep the column where possible, as a text editor would.
        settle(side, { line: next, offset: Math.min(caret, lines[next].length) });
        flush(pending, setFocused, caretRef);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        record(id, false);
        const edit = insertText(
          replaceLine(contentOf(side), index, text),
          index,
          caret,
          "  ",
        );
        onChange(side, edit.content);
        settle(side, edit.caret);
      }
    },
    [onChange, record, settle],
  );

  const swap = useCallback(
    (from: React.RefObject<Contents[]>, to: React.RefObject<Contents[]>) => {
      const snapshot = from.current.pop();
      if (!snapshot) return;
      to.current.push({ ...live.current });
      lastEditId.current = null;
      // The line under the caret is otherwise left alone as the user
      // types; an undo has to be allowed to replace it.
      setRevision((n) => n + 1);
      if (snapshot.left !== live.current.left) onChange("left", snapshot.left);
      if (snapshot.right !== live.current.right) {
        onChange("right", snapshot.right);
      }
    },
    [onChange],
  );

  const undo = useCallback(() => swap(history, future), [swap]);
  const redo = useCallback(() => swap(future, history), [swap]);

  // Restore the caret once the rows for the new content exist.
  //
  // A structural edit adds or removes lines, but the rows come from the
  // diff, which is debounced — so on the render straight after the edit
  // the target line has no element yet. Hold the request and retry on
  // each render until the diff lands, rather than dropping the caret.
  const attempts = useRef(0);

  useLayoutEffect(() => {
    const target = pending.current;
    if (!target) return;

    const id = lineId(target.side, target.caret.line);
    const element = document.querySelector<HTMLElement>(`[data-line="${id}"]`);

    if (!element) {
      // Bounded, so a line that never appears cannot wedge the caret.
      if (++attempts.current > MAX_CARET_ATTEMPTS) {
        pending.current = null;
        attempts.current = 0;
      }
      return;
    }

    pending.current = null;
    attempts.current = 0;
    caretRef.current = target.caret.offset;

    restoring.current = true;
    setFocused(id);
    element.focus();
    placeCaret(element, target.caret.offset);
    restoring.current = false;
  });

  return {
    focused,
    revision,
    caretFor,
    lineText,
    lineCount,
    onFocus,
    onBlur,
    onInput,
    onKeyDown,
    onPaste,
    undo,
    redo,
  };
}

function isCollapsed(): boolean {
  const selection = window.getSelection();
  return !selection || selection.isCollapsed;
}

/** Applies a queued caret move immediately, for edits that change nothing. */
function flush(
  pending: React.RefObject<{ side: Side; caret: Caret } | null>,
  setFocused: (id: string) => void,
  caretRef: React.RefObject<number>,
) {
  const target = pending.current;
  if (!target) return;
  pending.current = null;

  const id = lineId(target.side, target.caret.line);
  const element = document.querySelector<HTMLElement>(`[data-line="${id}"]`);
  if (!element) return;

  caretRef.current = target.caret.offset;
  setFocused(id);
  element.focus();
  placeCaret(element, target.caret.offset);
}
