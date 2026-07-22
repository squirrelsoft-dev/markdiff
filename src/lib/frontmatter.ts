/**
 * Separates a document's front matter from its body.
 *
 * Only used for the rendered views: the source views and the diff itself
 * always show the whole file, front matter included. A reader looking at
 * the rendered document does not want a stray horizontal rule and a
 * paragraph of YAML at the top.
 */

/** Opening delimiter to the delimiters that may close it. */
const DELIMITERS: Record<string, readonly string[]> = {
  // YAML, where `...` is also a legal end-of-document marker.
  "---": ["---", "..."],
  // TOML, as used by Hugo.
  "+++": ["+++"],
};

export interface Split {
  /** The raw block including its delimiters, or null if there was none. */
  frontmatter: string | null;
  /** Everything else, unchanged. */
  body: string;
}

export function splitFrontmatter(markdown: string): Split {
  // A byte-order mark would stop the first line matching.
  const source =
    markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown;

  const lines = source.split("\n");
  const closers = DELIMITERS[(lines[0] ?? "").trimEnd()];
  if (!closers) return { frontmatter: null, body: markdown };

  for (let i = 1; i < lines.length; i++) {
    if (closers.includes(lines[i].trimEnd())) {
      return {
        frontmatter: lines.slice(0, i + 1).join("\n"),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }

  // An opening delimiter with nothing closing it is not front matter — it
  // is a horizontal rule. Swallowing the whole document would be worse
  // than rendering one stray rule.
  return { frontmatter: null, body: markdown };
}

/** The body alone, for handing straight to the renderer. */
export function withoutFrontmatter(markdown: string): string {
  return splitFrontmatter(markdown).body;
}
