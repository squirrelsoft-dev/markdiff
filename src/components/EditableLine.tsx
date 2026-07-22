import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

import type { Span } from "../types";

interface Props {
  /** Stable identity, `side:lineIndex`. */
  id: string;
  /** The live document text for this line, not the diff's stale copy. */
  text: string;
  spans?: Span[];
  focused: boolean;
  /** Changes when the text was replaced by something other than typing. */
  revision: number;
  /** Where to put the caret when this line takes focus. */
  caret: number;
  onFocus: (id: string, caret: number) => void;
  onBlur: (id: string) => void;
  onInput: (id: string, text: string) => void;
  onKeyDown: (id: string, event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (id: string, text: string, caret: number) => void;
}

/**
 * One editable line of a document, rendered in place inside the diff.
 *
 * React owns the element; this component owns everything inside it. That
 * split is deliberate — React cannot be allowed to render children here.
 * A `contentEditable` node is mutated by the browser as the user types, so
 * React's record of what it put there goes stale, and the next update
 * throws trying to remove children that no longer exist.
 *
 * Two further rules keep the caret alive:
 *
 * 1. Nothing writes to the element while it has focus. The diff runs a
 *    beat behind the keystrokes, and re-rendering the line mid-word would
 *    throw the cursor to the start.
 * 2. The focused line shows plain text instead of the word-level
 *    highlights. Character offsets are identical either way, so the caret
 *    survives the swap; editing inside `<mark>` elements would not.
 */
export function EditableLine({
  id,
  text,
  spans,
  focused,
  revision,
  caret,
  onFocus,
  onBlur,
  onInput,
  onKeyDown,
  onPaste,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const applied = useRef(revision);

  // Show the highlights, but never over the top of someone's typing —
  // unless the text was replaced behind them, as an undo does.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const replaced = revision !== applied.current;
    applied.current = revision;
    const active = document.activeElement === element;

    if (active && !replaced) return;

    if (active) {
      const previous = readCaret(element);
      element.textContent = text;
      placeCaret(element, Math.min(previous, text.length));
      return;
    }

    const html = markup(text, spans);
    if (element.innerHTML !== html) element.innerHTML = html;
  });

  // On arrival, drop to plain text and put the caret where it was aimed.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !focused) return;

    // `textContent` reads the same with or without the highlight marks, so
    // the presence of any child element is what says they are still there.
    if (element.firstElementChild || element.textContent !== text) {
      element.textContent = text;
    }
    if (document.activeElement !== element) element.focus();
    placeCaret(element, caret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  return (
    <div
      ref={ref}
      className="text text-editable"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      data-line={id}
      onMouseDown={() => {
        // Read the caret the click produced, before the marks are swapped
        // for plain text and the offsets it refers to are rebuilt.
        queueMicrotask(() => onFocus(id, readCaret(ref.current)));
      }}
      onFocus={() => onFocus(id, readCaret(ref.current))}
      onBlur={() => onBlur(id)}
      onInput={() => onInput(id, ref.current?.textContent ?? "")}
      onKeyDown={(event) => onKeyDown(id, event)}
      onPaste={(event) => {
        event.preventDefault();
        onPaste(
          id,
          event.clipboardData.getData("text/plain"),
          readCaret(ref.current),
        );
      }}
    />
  );
}

/** The line's HTML, with changed runs wrapped. Text comes from a file we
 *  did not write, so every part of it is escaped. */
function markup(text: string, spans?: Span[]): string {
  if (!spans || spans.length === 0) return escapeHtml(text);
  return spans
    .map((span) =>
      span.kind === "equal"
        ? escapeHtml(span.text)
        : `<mark class="span span-${span.kind}">${escapeHtml(span.text)}</mark>`,
    )
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Character offset of the caret within `element`, flattening any marks. */
export function readCaret(element: HTMLElement | null): number {
  if (!element) return 0;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return 0;

  const measure = range.cloneRange();
  measure.selectNodeContents(element);
  measure.setEnd(range.startContainer, range.startOffset);
  return measure.toString().length;
}

/** Puts the caret `offset` characters into `element`. */
export function placeCaret(element: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }

  // Past the end, or an empty line with no text node at all.
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
