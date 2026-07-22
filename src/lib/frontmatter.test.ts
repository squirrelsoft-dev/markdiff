import { describe, expect, it } from "vitest";

import { splitFrontmatter, withoutFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("removes a YAML block from the top", () => {
    const { frontmatter, body } = splitFrontmatter(
      "---\ntitle: Notes\ntags: [a, b]\n---\n# Heading\n\nBody.\n",
    );
    expect(frontmatter).toBe("---\ntitle: Notes\ntags: [a, b]\n---");
    expect(body).toBe("# Heading\n\nBody.\n");
  });

  it("removes a TOML block", () => {
    const { body } = splitFrontmatter('+++\ntitle = "Notes"\n+++\n# Heading\n');
    expect(body).toBe("# Heading\n");
  });

  it("accepts `...` as a YAML terminator", () => {
    const { body } = splitFrontmatter("---\ntitle: Notes\n...\nBody.\n");
    expect(body).toBe("Body.\n");
  });

  it("leaves a document with no front matter alone", () => {
    const text = "# Heading\n\nBody.\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });

  it("does not eat the document when nothing closes the delimiter", () => {
    // A lone `---` is a horizontal rule; treating it as an unterminated
    // front matter block would blank the whole page.
    const text = "---\n\n# Heading\n\nBody.\n";
    expect(splitFrontmatter(text).frontmatter).toBeNull();
    expect(splitFrontmatter(text).body).toBe(text);
  });

  it("ignores a rule that appears further down", () => {
    const text = "# Heading\n\n---\n\nMore.\n";
    expect(splitFrontmatter(text).frontmatter).toBeNull();
  });

  it("keeps a setext underline intact", () => {
    // `Heading\n---` underlines the heading; the `---` is not on line one,
    // so it must not be mistaken for an opening delimiter.
    const text = "Heading\n---\n\nBody.\n";
    expect(splitFrontmatter(text).frontmatter).toBeNull();
  });

  it("requires the delimiter at the very start of the line", () => {
    expect(splitFrontmatter("  ---\ntitle: x\n---\nBody\n").frontmatter).toBeNull();
  });

  it("tolerates trailing whitespace and CRLF on the delimiters", () => {
    const { body } = splitFrontmatter("---  \r\ntitle: x\r\n--- \r\nBody.\r\n");
    expect(body).toBe("Body.\r\n");
  });

  it("tolerates a byte-order mark", () => {
    const { body } = splitFrontmatter("﻿---\ntitle: x\n---\nBody.\n");
    expect(body).toBe("Body.\n");
  });

  it("handles an empty block", () => {
    expect(splitFrontmatter("---\n---\nBody.\n").body).toBe("Body.\n");
  });

  it("does not close on a `+++` inside a YAML block", () => {
    const { body } = splitFrontmatter("---\nsig: +++\n---\nBody.\n");
    expect(body).toBe("Body.\n");
  });

  it("copes with an empty document", () => {
    expect(splitFrontmatter("")).toEqual({ frontmatter: null, body: "" });
  });

  it("strips redline markup's front matter, delimiters intact", () => {
    // The redline wraps changed values but leaves `---` alone, so the
    // block is still recognisable after the diff has marked it up.
    const redline =
      '---\ntitle: <del class="rl-del">Old</del><ins class="rl-ins">New</ins>\n---\n# Heading\n';
    expect(withoutFrontmatter(redline)).toBe("# Heading\n");
  });
});
