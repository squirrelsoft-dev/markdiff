import { Fragment } from "react";

import type { Cell, LineKind, Span, Side } from "../types";

/**
 * Renders a line's text, highlighting the runs that changed. Spans arrive
 * pre-filtered per side, so the left never shows insertions.
 */
export function SpanText({ text, spans }: { text: string; spans?: Span[] }) {
  if (!spans || spans.length === 0) {
    // A zero-width space keeps blank lines at full height.
    return <>{text === "" ? "​" : text}</>;
  }
  return (
    <>
      {spans.map((span, i) =>
        span.kind === "equal" ? (
          <Fragment key={i}>{span.text}</Fragment>
        ) : (
          <mark key={i} className={`span span-${span.kind}`}>
            {span.text}
          </mark>
        ),
      )}
    </>
  );
}

/** The `+`/`−` column, in the diff convention. */
export function marker(kind: LineKind | undefined, side: Side): string {
  if (!kind) return "";
  if (kind === "insert") return "+";
  if (kind === "delete") return "−";
  if (kind === "replace") return side === "left" ? "−" : "+";
  return "";
}

export function LineNo({ no }: { no?: number }) {
  return <span className="lineno">{no ?? ""}</span>;
}

export function cellClass(cell: Cell | undefined): string {
  return cell ? `is-${cell.kind}` : "is-absent";
}
