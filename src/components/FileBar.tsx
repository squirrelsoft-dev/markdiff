import type { Doc, Side } from "../types";

interface Props {
  left: Doc | null;
  right: Doc | null;
  dirty: { left: boolean; right: boolean };
  onPick: (side: Side) => void;
  onClear: (side: Side) => void;
  onSwap: () => void;
  canSwap: boolean;
}

export function FileBar({
  left,
  right,
  dirty,
  onPick,
  onClear,
  onSwap,
  canSwap,
}: Props) {
  return (
    <header className="filebar">
      <div className="brand">
        <span className="brand-mark">◧</span>
        <span className="brand-name">markdiff</span>
      </div>

      <FileChip
        doc={left}
        side="left"
        dirty={dirty.left}
        onPick={() => onPick("left")}
        onClear={() => onClear("left")}
      />

      <button
        type="button"
        className="icon-button"
        onClick={onSwap}
        disabled={!canSwap}
        title="Swap sides (s)"
        aria-label="Swap sides"
      >
        ⇄
      </button>

      <FileChip
        doc={right}
        side="right"
        dirty={dirty.right}
        onPick={() => onPick("right")}
        onClear={() => onClear("right")}
      />
    </header>
  );
}

function FileChip({
  doc,
  side,
  dirty,
  onPick,
  onClear,
}: {
  doc: Doc | null;
  side: Side;
  dirty: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  const shortcut = side === "left" ? "⌘1" : "⌘2";
  const scratch = doc !== null && doc.path === "";

  return (
    <div className={doc ? "chip chip-loaded" : "chip"}>
      <button
        type="button"
        className="chip-open"
        onClick={onPick}
        title={
          doc
            ? `${doc.path || "Not saved to a file"}\nClick to open a file here (${shortcut})`
            : `Open a file (${shortcut})`
        }
      >
        <span className={`dot dot-${side}`} />
        <span className="chip-name">
          {doc ? doc.name : `Choose file ${side === "left" ? "A" : "B"}`}
        </span>
        {dirty && (
          <span
            className="chip-dirty"
            title={
              scratch
                ? "Unsaved — ⌘S will ask where to put it"
                : "Unsaved changes — ⌘S to write them to the file"
            }
          >
            ●
          </span>
        )}
      </button>

      {doc && (
        <>
          <span className="chip-meta">{formatBytes(doc.bytes)}</span>
          <button
            type="button"
            className="chip-clear"
            onClick={onClear}
            title="Empty this side"
            aria-label="Empty this side"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
