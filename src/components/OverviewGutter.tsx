import { useMemo, type RefObject } from "react";

import type { DiffResult, LineKind } from "../types";

interface Props {
  diff: DiffResult;
  /** The scroll container the markers navigate within. */
  viewportRef: RefObject<HTMLDivElement | null>;
  /** 1-based index of the change the stepper is on, or 0 for none. */
  currentBlock: number;
  onJump: (block: number) => void;
}

interface Marker {
  block: number;
  kind: LineKind;
  /** Fraction down the document, 0..1. */
  at: number;
}

/**
 * A thin overview rail down the right edge: one marker per change block,
 * placed where it falls in the whole document and coloured by what kind of
 * change it is. Unlike the row-by-row diff, every change shows at once —
 * including the ones scrolled off screen — so it doubles as a map and as
 * navigation. Clicking a marker jumps to that change.
 */
export function OverviewGutter({
  diff,
  viewportRef,
  currentBlock,
  onJump,
}: Props) {
  const markers = useMemo(() => collectMarkers(diff), [diff]);

  if (markers.length === 0) return null;

  const jump = (block: number) => {
    onJump(block);
    const root = viewportRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-block="${block}"]`);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div
      className="overview"
      role="navigation"
      aria-label="Change overview"
    >
      {markers.map((m) => (
        <button
          key={m.block}
          type="button"
          className={
            m.block === currentBlock
              ? `overview-mark is-${m.kind} is-current`
              : `overview-mark is-${m.kind}`
          }
          style={{ top: `${(m.at * 100).toFixed(3)}%` }}
          title={`${label(m.kind)} — change ${m.block} of ${markers.length}`}
          aria-label={`${label(m.kind)}, change ${m.block}`}
          onClick={() => jump(m.block)}
        />
      ))}
    </div>
  );
}

/**
 * One marker per block, positioned by the block's first row over the whole
 * document. The kind is the block's first changed row — a block is a run
 * of adjacent changes, and its leading edge is what the eye tracks.
 */
function collectMarkers(diff: DiffResult): Marker[] {
  const total = diff.rows.length;
  if (total === 0) return [];

  const markers: Marker[] = [];
  let seen = 0;

  diff.rows.forEach((row, index) => {
    if (row.block === 0 || row.block === seen) return;
    seen = row.block;
    markers.push({
      block: row.block,
      kind: row.kind === "equal" ? "replace" : row.kind,
      at: index / total,
    });
  });

  return markers;
}

function label(kind: LineKind): string {
  switch (kind) {
    case "insert":
      return "Added";
    case "delete":
      return "Removed";
    default:
      return "Changed";
  }
}
