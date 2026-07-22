import { useMemo, type RefObject } from "react";

import { collapse } from "../lib/collapse";
import { lineId, type Editor } from "../lib/useEditor";
import type { Cell, DiffResult, Row, Side } from "../types";
import { EditableLine } from "./EditableLine";
import { Gap } from "./Gap";
import { LineNo, SpanText, cellClass, marker } from "./Line";

interface Props {
  diff: DiffResult;
  leftName: string;
  rightName: string;
  context: number;
  collapsed: boolean;
  expanded: ReadonlySet<number>;
  onExpand: (from: number) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Present when the panes are editable. */
  editor?: Editor;
}

/**
 * Both documents in one scroll container. Each row holds both sides, so
 * they stay aligned by construction and there is only ever one scrollbar
 * to keep in sync.
 */
export function SideBySide({
  diff,
  leftName,
  rightName,
  context,
  collapsed,
  expanded,
  onExpand,
  viewportRef,
  editor,
}: Props) {
  const rows = useMemo(() => {
    const base = diff.rows.length > 0 ? diff.rows : [BLANK_ROW];
    if (!editor) return base;

    // A side with no lines at all has no cells, and therefore nowhere to
    // click — which is exactly the state you are in before pasting into
    // it. Give the empty side a cell on the first row.
    const needLeft = editor.lineCount("left") === 0;
    const needRight = editor.lineCount("right") === 0;
    if (!needLeft && !needRight) return base;

    const first = { ...base[0] };
    if (needLeft && !first.left) {
      first.left = { no: 1, kind: "equal", text: "" };
    }
    if (needRight && !first.right) {
      first.right = { no: 1, kind: "equal", text: "" };
    }
    return [first, ...base.slice(1)];
  }, [diff.rows, editor]);

  const chunks = useMemo(
    () =>
      collapsed
        ? collapse(rows, context, expanded)
        : [{ kind: "lines" as const, from: 0, items: rows }],
    [rows, context, collapsed, expanded],
  );

  return (
    <div className="viewport" ref={viewportRef}>
      <div className="split-header">
        <div className="split-header-cell">
          <span className="dot dot-left" />
          {leftName}
        </div>
        <div className="split-header-cell">
          <span className="dot dot-right" />
          {rightName}
        </div>
      </div>

      <div className="rows rows-split">
        {chunks.map((chunk) =>
          chunk.kind === "gap" ? (
            <Gap
              key={`gap-${chunk.from}`}
              count={chunk.count}
              onExpand={() => onExpand(chunk.from)}
            />
          ) : (
            chunk.items.map((row, i) => (
              <SplitRow
                key={rowKey(row, chunk.from + i)}
                row={row}
                editor={editor}
              />
            ))
          ),
        )}
      </div>
    </div>
  );
}

/** An empty pair, so a blank document still has somewhere to type. */
const BLANK_ROW: Row = {
  left: { no: 1, kind: "equal", text: "" },
  right: { no: 1, kind: "equal", text: "" },
  kind: "equal",
  block: 0,
};

/**
 * Keyed on the line numbers rather than position, so plain typing leaves
 * the DOM nodes — and the caret inside one of them — untouched.
 */
function rowKey(row: Row, index: number): string {
  return `${row.left?.no ?? "_"}-${row.right?.no ?? "_"}-${index}`;
}

function SplitRow({ row, editor }: { row: Row; editor?: Editor }) {
  return (
    <div
      className={`row row-${row.kind}`}
      data-block={row.block === 0 ? undefined : row.block}
    >
      <Half cell={row.left} side="left" editor={editor} />
      <Half cell={row.right} side="right" editor={editor} />
    </div>
  );
}

function Half({
  cell,
  side,
  editor,
}: {
  cell?: Cell;
  side: Side;
  editor?: Editor;
}) {
  return (
    <div className={`half half-${side} ${cellClass(cell)}`}>
      <LineNo no={cell?.no} />
      <span className="marker">{marker(cell?.kind, side)}</span>
      {cell && editor ? (
        <EditableCell cell={cell} side={side} editor={editor} />
      ) : (
        <span className="text">
          {cell ? <SpanText text={cell.text} spans={cell.spans} /> : null}
        </span>
      )}
    </div>
  );
}

function EditableCell({
  cell,
  side,
  editor,
}: {
  cell: Cell;
  side: Side;
  editor: Editor;
}) {
  const index = cell.no - 1;
  const id = lineId(side, index);

  return (
    <EditableLine
      id={id}
      // The live document, not the diff's copy: while typing the diff is
      // a moment behind, and this line must show what was actually typed.
      text={editor.lineText(side, index)}
      spans={cell.spans}
      focused={editor.focused === id}
      revision={editor.revision}
      caret={editor.caretFor(id)}
      onFocus={editor.onFocus}
      onBlur={editor.onBlur}
      onInput={editor.onInput}
      onKeyDown={editor.onKeyDown}
      onPaste={editor.onPaste}
    />
  );
}
