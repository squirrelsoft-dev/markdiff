import DOMPurify, { type Config } from "dompurify";
import MarkdownIt from "markdown-it";

// `html: true` is required for the overlay: the redline arrives as markdown
// with <ins>/<del> woven in. Everything rendered here is then sanitised,
// because the source is a file we did not write.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

const SANITIZE_CONFIG: Config = {
  ADD_TAGS: ["ins", "del"],
  ADD_ATTR: ["class", "data-lang"],
  // Markdown cannot produce these, and a hand-written file should not
  // be able to reach out to the network just by being previewed.
  FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "input"],
};

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), SANITIZE_CONFIG);
}
