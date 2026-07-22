import { useMemo, type RefObject } from "react";

import { collapse } from "../lib/collapse";
import type { DiffResult, UnifiedLine } from "../types";
import { Gap } from "./Gap";
import { LineNo, SpanText } from "./Line";

interface Props {
  diff: DiffResult;
  leftName: string;
  rightName: string;
  context: number;
  collapsed: boolean;
  expanded: ReadonlySet<number>;
  onExpand: (from: number) => void;
  viewportRef: RefObject<HTMLDivElement | null>;
}

/** The unified view: one column, removals above the additions that replaced them. */
export function Inline({
  diff,
  leftName,
  rightName,
  context,
  collapsed,
  expanded,
  onExpand,
  viewportRef,
}: Props) {
  const chunks = useMemo(
    () =>
      collapsed
        ? collapse(diff.unified, context, expanded)
        : [{ kind: "lines" as const, from: 0, items: diff.unified }],
    [diff.unified, context, collapsed, expanded],
  );

  return (
    <div className="viewport" ref={viewportRef}>
      <div className="inline-header">
        <span className="dot dot-left" />
        {leftName}
        <span className="inline-header-arrow">→</span>
        <span className="dot dot-right" />
        {rightName}
      </div>

      <div className="rows rows-inline">
        {chunks.map((chunk) =>
          chunk.kind === "gap" ? (
            <Gap
              key={`gap-${chunk.from}`}
              count={chunk.count}
              onExpand={() => onExpand(chunk.from)}
            />
          ) : (
            chunk.items.map((line, i) => (
              <InlineRow key={chunk.from + i} line={line} />
            ))
          ),
        )}
      </div>
    </div>
  );
}

function InlineRow({ line }: { line: UnifiedLine }) {
  const sign = line.kind === "insert" ? "+" : line.kind === "delete" ? "−" : "";
  return (
    <div
      className={`row row-inline is-${line.kind}`}
      data-block={line.block === 0 ? undefined : line.block}
    >
      <LineNo no={line.oldNo} />
      <LineNo no={line.newNo} />
      <span className="marker">{sign}</span>
      <span className="text">
        <SpanText text={line.text} spans={line.spans} />
      </span>
    </div>
  );
}
