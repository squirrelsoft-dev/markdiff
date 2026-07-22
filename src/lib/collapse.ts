/** An unchanged run shorter than this is cheaper to read than to fold. */
const MIN_FOLD = 8;

export interface Banded {
  /** 0 when unchanged. */
  block: number;
}

export type Chunk<T> =
  | { kind: "lines"; from: number; items: T[] }
  | { kind: "gap"; from: number; count: number };

/**
 * Splits a diff into visible runs and collapsed gaps, keeping `context`
 * unchanged lines either side of every change so edits never appear
 * without the text around them.
 *
 * `expanded` holds the `from` index of gaps the user has opened.
 */
export function collapse<T extends Banded>(
  items: T[],
  context: number,
  expanded: ReadonlySet<number>,
): Chunk<T>[] {
  const keep = new Array<boolean>(items.length).fill(false);

  for (let i = 0; i < items.length; i++) {
    if (items[i].block === 0) continue;
    const start = Math.max(0, i - context);
    const end = Math.min(items.length - 1, i + context);
    for (let j = start; j <= end; j++) keep[j] = true;
  }

  const chunks: Chunk<T>[] = [];
  let i = 0;

  while (i < items.length) {
    if (keep[i]) {
      const from = i;
      while (i < items.length && keep[i]) i++;
      chunks.push({ kind: "lines", from, items: items.slice(from, i) });
      continue;
    }

    const from = i;
    while (i < items.length && !keep[i]) i++;
    const count = i - from;

    if (count < MIN_FOLD || expanded.has(from)) {
      chunks.push({ kind: "lines", from, items: items.slice(from, i) });
    } else {
      chunks.push({ kind: "gap", from, count });
    }
  }

  return chunks;
}
