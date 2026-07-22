/** Mirrors the shapes serialised by `src-tauri/src/diff.rs`. */

export type LineKind = "equal" | "insert" | "delete" | "replace";
export type SpanKind = "equal" | "insert" | "delete";

export interface Span {
  kind: SpanKind;
  text: string;
}

export interface Cell {
  /** 1-based line number in its own document. */
  no: number;
  kind: LineKind;
  text: string;
  spans?: Span[];
}

export interface Row {
  left?: Cell;
  right?: Cell;
  kind: LineKind;
  /** 0 when unchanged, else the 1-based change block for navigation. */
  block: number;
}

export interface UnifiedLine {
  kind: LineKind;
  oldNo?: number;
  newNo?: number;
  text: string;
  spans?: Span[];
  block: number;
}

export interface Stats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  blocks: number;
  leftLines: number;
  rightLines: number;
}

export interface DiffResult {
  rows: Row[];
  unified: UnifiedLine[];
  redline: string;
  stats: Stats;
  identical: boolean;
}

export interface DiffOptions {
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  charLevel: boolean;
}

export interface Doc {
  path: string;
  name: string;
  content: string;
  bytes: number;
}

export interface CliStatus {
  installed: boolean;
  installedAt: string | null;
  /** Reachable without a password; null when nothing on PATH is writable. */
  target: string | null;
  /** Offered only when `target` is null; costs an administrator prompt. */
  elevatedTarget: string | null;
  available: boolean;
  dismissed: boolean;
}

export type Side = "left" | "right";
export type ViewMode = "split" | "inline" | "overlay";
export type OverlayMode = "redline" | "fade" | "difference";
