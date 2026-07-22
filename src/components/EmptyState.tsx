import type { Doc, Side } from "../types";

interface Props {
  left: Doc | null;
  right: Doc | null;
  onPick: (side: Side) => void;
  onSamples: () => void;
  onBlank: () => void;
}

export function EmptyState({
  left,
  right,
  onPick,
  onSamples,
  onBlank,
}: Props) {
  return (
    <div className="empty">
      <div className="empty-inner">
        <h1 className="empty-title">Compare two markdown documents</h1>
        <p className="empty-sub">
          Drop files anywhere in this window, choose them below, or start
          blank and paste straight into either side.
        </p>

        <div className="empty-slots">
          <Slot doc={left} side="left" label="Document A" onPick={onPick} />
          <span className="empty-vs">vs</span>
          <Slot doc={right} side="right" label="Document B" onPick={onPick} />
        </div>

        <div className="empty-links">
          <button type="button" className="link-button" onClick={onBlank}>
            start with two blank panes
          </button>
          <span className="empty-sep">·</span>
          <button type="button" className="link-button" onClick={onSamples}>
            load a pair of samples
          </button>
        </div>
      </div>
    </div>
  );
}

function Slot({
  doc,
  side,
  label,
  onPick,
}: {
  doc: Doc | null;
  side: Side;
  label: string;
  onPick: (side: Side) => void;
}) {
  return (
    <button
      type="button"
      className={doc ? "slot slot-filled" : "slot"}
      onClick={() => onPick(side)}
    >
      <span className={`dot dot-${side}`} />
      <span className="slot-label">{label}</span>
      <span className="slot-value">{doc ? doc.name : "Choose file…"}</span>
    </button>
  );
}
