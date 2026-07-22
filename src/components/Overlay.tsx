import { useMemo, type MouseEvent, type RefObject } from "react";

import { openExternal } from "../lib/api";
import { splitFrontmatter, withoutFrontmatter } from "../lib/frontmatter";
import { renderMarkdown } from "../lib/markdown";
import type { DiffResult, Doc, OverlayMode } from "../types";

interface Props {
  diff: DiffResult;
  left: Doc;
  right: Doc;
  mode: OverlayMode;
  fade: number;
  viewportRef: RefObject<HTMLDivElement | null>;
}

/**
 * The rendered views. Where the other two modes show markdown source,
 * these show the document as a reader would see it:
 *
 * - `redline` — one merged document, edits marked in place.
 * - `fade` — the two renders stacked, crossfaded by the slider.
 * - `difference` — the two renders stacked with a difference blend, so
 *   matching text cancels to black and only changes light up.
 */
export function Overlay({ diff, left, right, mode, fade, viewportRef }: Props) {
  // Front matter is configuration, not prose. It is stripped from what is
  // rendered only — the documents, the diff and the source views all still
  // have it.
  const redline = useMemo(
    () => renderMarkdown(withoutFrontmatter(diff.redline)),
    [diff.redline],
  );
  const leftSplit = useMemo(() => splitFrontmatter(left.content), [left.content]);
  const rightSplit = useMemo(
    () => splitFrontmatter(right.content),
    [right.content],
  );

  const leftHtml = useMemo(
    () => renderMarkdown(leftSplit.body),
    [leftSplit.body],
  );
  const rightHtml = useMemo(
    () => renderMarkdown(rightSplit.body),
    [rightSplit.body],
  );

  // Staying silent about a change we have hidden would misreport the
  // documents: the counts in the toolbar would include edits nothing here
  // can show.
  const hidesAChange =
    (leftSplit.frontmatter ?? "") !== (rightSplit.frontmatter ?? "");

  return (
    <div className="viewport" ref={viewportRef} onClick={interceptLinks}>
      {hidesAChange && (
        <div className="prose-note">
          The front matter differs between these documents and is not shown
          here. Side by side and Inline include it.
        </div>
      )}

      {mode === "redline" ? (
        <article
          className="prose prose-redline"
          dangerouslySetInnerHTML={{ __html: redline }}
        />
      ) : (
        <div className={`stack stack-${mode}`}>
          <article
            className="prose stack-layer"
            style={mode === "fade" ? { opacity: 1 - fade } : undefined}
            dangerouslySetInnerHTML={{ __html: leftHtml }}
          />
          <article
            className="prose stack-layer stack-layer-top"
            style={mode === "fade" ? { opacity: fade } : undefined}
            dangerouslySetInnerHTML={{ __html: rightHtml }}
          />
        </div>
      )}
    </div>
  );
}

/** Rendered documents can contain links; they must not navigate the app. */
function interceptLinks(event: MouseEvent<HTMLDivElement>) {
  const anchor = (event.target as HTMLElement).closest("a");
  const href = anchor?.getAttribute("href");
  if (!href) return;

  event.preventDefault();
  if (/^https?:\/\//i.test(href)) {
    void openExternal(href).catch(() => {});
  }
}
