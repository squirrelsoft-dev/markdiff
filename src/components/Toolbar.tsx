import { useEffect, useRef, useState } from "react";

import type { DiffOptions, OverlayMode, Stats, ViewMode } from "../types";
import { CliMenuItem } from "./CliMenuItem";

const VIEWS: { id: ViewMode; label: string; hint: string }[] = [
  { id: "split", label: "Side by side", hint: "Source, aligned (1)" },
  { id: "inline", label: "Inline", hint: "Source, unified (2)" },
  { id: "overlay", label: "Overlay", hint: "Rendered (3)" },
];

const OVERLAYS: { id: OverlayMode; label: string; hint: string }[] = [
  {
    id: "redline",
    label: "Redline",
    hint: "One document with every edit marked in place",
  },
  {
    id: "fade",
    label: "Fade",
    hint: "The two renders stacked, crossfaded by the slider.\nBest when the documents are close to the same length — once\none grows, the layers below the change no longer line up.",
  },
  {
    id: "difference",
    label: "Difference",
    hint: "The two renders stacked with a difference blend, so matching\ntext cancels to black and only changes light up. Same caveat\nas Fade: added or removed lines push the layers out of step.",
  },
];

interface Props {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  overlay: OverlayMode;
  onOverlay: (v: OverlayMode) => void;
  fade: number;
  onFade: (v: number) => void;
  stats: Stats;
  position: { index: number; total: number };
  onStep: (delta: number) => void;
  options: DiffOptions;
  onOptions: (o: DiffOptions) => void;
  collapsed: boolean;
  onCollapsed: (v: boolean) => void;
}

export function Toolbar({
  view,
  onView,
  overlay,
  onOverlay,
  fade,
  onFade,
  stats,
  position,
  onStep,
  options,
  onOptions,
  collapsed,
  onCollapsed,
}: Props) {
  return (
    <div className="toolbar">
      <div className="segmented" role="tablist" aria-label="Diff view">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            type="button"
            aria-selected={view === v.id}
            className={view === v.id ? "seg seg-on" : "seg"}
            title={v.hint}
            onClick={() => onView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "overlay" && (
        <div className="segmented segmented-sub" role="tablist">
          {OVERLAYS.map((o) => (
            <button
              key={o.id}
              role="tab"
              type="button"
              aria-selected={overlay === o.id}
              className={overlay === o.id ? "seg seg-on" : "seg"}
              title={o.hint}
              onClick={() => onOverlay(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {view === "overlay" && overlay === "fade" && (
        <label className="fader">
          <span className="fader-end">A</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={fade}
            aria-label="Crossfade between documents"
            onChange={(e) => onFade(Number(e.target.value))}
          />
          <span className="fader-end">B</span>
        </label>
      )}

      <div className="toolbar-spacer" />

      <div className="stats" title="Added / removed / modified lines">
        <span className="stat stat-add">+{stats.added}</span>
        <span className="stat stat-del">−{stats.removed}</span>
        <span className="stat stat-mod">~{stats.modified}</span>
      </div>

      {/* Stacked overlays have nothing to step through — the changes are
          not discrete elements there, they are the whole picture. */}
      {(view !== "overlay" || overlay === "redline") && (
        <div className="stepper">
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={position.total === 0}
            title="Previous change (p)"
            aria-label="Previous change"
          >
            ‹
          </button>
          <span className="stepper-count">
            {position.total === 0
              ? "no changes"
              : `${position.index} / ${position.total}`}
          </span>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={position.total === 0}
            title="Next change (n)"
            aria-label="Next change"
          >
            ›
          </button>
        </div>
      )}

      <OptionsMenu
        options={options}
        onOptions={onOptions}
        collapsed={collapsed}
        onCollapsed={onCollapsed}
        showCollapse={view !== "overlay"}
      />
    </div>
  );
}

function OptionsMenu({
  options,
  onOptions,
  collapsed,
  onCollapsed,
  showCollapse,
}: {
  options: DiffOptions;
  onOptions: (o: DiffOptions) => void;
  collapsed: boolean;
  onCollapsed: (v: boolean) => void;
  showCollapse: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setOpen(false);
        return;
      }
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  return (
    <div className="menu-root" ref={root}>
      <button
        type="button"
        className={open ? "icon-button icon-button-on" : "icon-button"}
        aria-expanded={open}
        aria-haspopup="true"
        title="Diff options"
        onClick={() => setOpen((v) => !v)}
      >
        ⚙
      </button>

      {open && (
        <div className="menu" role="menu">
          <Check
            label="Ignore whitespace"
            checked={options.ignoreWhitespace}
            onChange={(v) => onOptions({ ...options, ignoreWhitespace: v })}
          />
          <Check
            label="Ignore case"
            checked={options.ignoreCase}
            onChange={(v) => onOptions({ ...options, ignoreCase: v })}
          />
          <Check
            label="Highlight by character"
            checked={options.charLevel}
            onChange={(v) => onOptions({ ...options, charLevel: v })}
          />
          {showCollapse && (
            <>
              <div className="menu-rule" />
              <Check
                label="Collapse unchanged"
                checked={collapsed}
                onChange={onCollapsed}
              />
            </>
          )}
          <CliMenuItem />
        </div>
      )}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="menu-item">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
