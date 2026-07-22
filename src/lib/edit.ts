/**
 * Line-level edits on a document's text.
 *
 * Every function is pure and returns the new content plus where the caret
 * should end up, so the view can restore the cursor after the diff has
 * been recomputed and the rows have moved underneath it.
 *
 * `toLines` must agree exactly with `split_lines` in `src-tauri/src/diff.rs`
 * — the indices here are the same 1-based line numbers the diff reports,
 * and the two drifting apart would put edits on the wrong line.
 */

export interface Caret {
  /** 0-based index into the side's lines. */
  line: number;
  /** UTF-16 offset within that line. */
  offset: number;
}

export interface Edit {
  content: string;
  caret: Caret;
}

export function toLines(content: string): string[] {
  if (content === "") return [];
  const lines = content
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  // A trailing newline terminates the last line, it does not start a new one.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function fromLines(lines: string[]): string {
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** Lines as the editor shows them: a blank document still needs one row. */
export function editableLines(content: string): string[] {
  const lines = toLines(content);
  return lines.length === 0 ? [""] : lines;
}

export function replaceLine(
  content: string,
  index: number,
  text: string,
): string {
  const lines = editableLines(content);
  if (index < 0 || index >= lines.length) return content;
  lines[index] = text;
  return fromLines(lines);
}

/** Enter: breaks a line in two at the caret. */
export function splitLine(
  content: string,
  index: number,
  offset: number,
): Edit {
  const lines = editableLines(content);
  const line = lines[index] ?? "";
  const at = clamp(offset, 0, line.length);

  lines.splice(index, 1, line.slice(0, at), line.slice(at));
  return {
    content: fromLines(lines),
    caret: { line: index + 1, offset: 0 },
  };
}

/**
 * Backspace at the start of a line: joins it onto the one above, leaving
 * the caret at the seam. Returns null on the first line, where there is
 * nothing to join onto.
 */
export function mergeWithPrevious(content: string, index: number): Edit | null {
  const lines = editableLines(content);
  if (index <= 0 || index >= lines.length) return null;

  const previous = lines[index - 1];
  const merged = previous + lines[index];
  lines.splice(index - 1, 2, merged);

  return {
    content: fromLines(lines),
    caret: { line: index - 1, offset: previous.length },
  };
}

/** Delete at the end of a line: pulls the next line up onto it. */
export function mergeWithNext(content: string, index: number): Edit | null {
  const lines = editableLines(content);
  if (index < 0 || index >= lines.length - 1) return null;

  const current = lines[index];
  lines.splice(index, 2, current + lines[index + 1]);

  return {
    content: fromLines(lines),
    caret: { line: index, offset: current.length },
  };
}

/**
 * Paste: splices text in at the caret, spreading it over as many lines as
 * it contains. This is the path that matters most — dropping a whole
 * document into one side is the point of editing here.
 */
export function insertText(
  content: string,
  index: number,
  offset: number,
  inserted: string,
): Edit {
  const lines = editableLines(content);
  const line = lines[index] ?? "";
  const at = clamp(offset, 0, line.length);
  const before = line.slice(0, at);
  const after = line.slice(at);

  // Normalise the clipboard's line endings; a Windows document pasted in
  // would otherwise leave a stray \r on the end of every line.
  //
  // A single trailing newline is dropped because this module treats one as
  // terminating the last line rather than starting a new one — the same
  // rule `toLines` applies to the document itself. Without this, pasting a
  // whole file into a blank side leaves a phantom empty line at the end,
  // which then shows up as a difference against the other side.
  const normalised = inserted.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const chunks = normalised.split("\n");

  if (chunks.length === 1) {
    lines[index] = before + chunks[0] + after;
    return {
      content: fromLines(lines),
      caret: { line: index, offset: before.length + chunks[0].length },
    };
  }

  const last = chunks[chunks.length - 1];
  const replacement = [
    before + chunks[0],
    ...chunks.slice(1, -1),
    last + after,
  ];
  lines.splice(index, 1, ...replacement);

  return {
    content: fromLines(lines),
    caret: {
      line: index + chunks.length - 1,
      offset: last.length,
    },
  };
}

/** Removes a span covering whole or partial lines, as a selection delete. */
export function deleteRange(
  content: string,
  from: Caret,
  to: Caret,
): Edit {
  const lines = editableLines(content);
  const [start, end] = orderCarets(from, to);

  const startLine = lines[start.line] ?? "";
  const endLine = lines[end.line] ?? "";
  const head = startLine.slice(0, clamp(start.offset, 0, startLine.length));
  const tail = endLine.slice(clamp(end.offset, 0, endLine.length));

  lines.splice(start.line, end.line - start.line + 1, head + tail);
  return {
    content: fromLines(lines),
    caret: { line: start.line, offset: head.length },
  };
}

function orderCarets(a: Caret, b: Caret): [Caret, Caret] {
  if (a.line !== b.line) return a.line < b.line ? [a, b] : [b, a];
  return a.offset <= b.offset ? [a, b] : [b, a];
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
