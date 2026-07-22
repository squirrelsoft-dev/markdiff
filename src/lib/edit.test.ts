import { describe, expect, it } from "vitest";

import {
  deleteRange,
  editableLines,
  fromLines,
  insertText,
  mergeWithNext,
  mergeWithPrevious,
  replaceLine,
  splitLine,
  toLines,
} from "./edit";

describe("line splitting", () => {
  it("matches the diff engine on a trailing newline", () => {
    // src-tauri/src/diff.rs drops the phantom final line; if these two
    // disagree, every edit below the fold lands on the wrong line.
    expect(toLines("a\nb\n")).toEqual(["a", "b"]);
    expect(toLines("a\nb")).toEqual(["a", "b"]);
  });

  it("treats an empty document as having no lines", () => {
    expect(toLines("")).toEqual([]);
  });

  it("keeps interior blank lines", () => {
    expect(toLines("a\n\nb\n")).toEqual(["a", "", "b"]);
  });

  it("strips carriage returns", () => {
    expect(toLines("a\r\nb\r\n")).toEqual(["a", "b"]);
  });

  it("round-trips", () => {
    for (const text of ["a\nb\n", "one\n", "a\n\nb\n", ""]) {
      expect(fromLines(toLines(text))).toBe(text);
    }
  });

  it("gives a blank document one line to type into", () => {
    expect(editableLines("")).toEqual([""]);
    expect(editableLines("x\n")).toEqual(["x"]);
  });
});

describe("replaceLine", () => {
  it("replaces in place", () => {
    expect(replaceLine("a\nb\nc\n", 1, "B")).toBe("a\nB\nc\n");
  });

  it("works on the first line of a blank document", () => {
    expect(replaceLine("", 0, "typed")).toBe("typed\n");
  });

  it("ignores an out-of-range index", () => {
    expect(replaceLine("a\n", 5, "x")).toBe("a\n");
  });
});

describe("splitLine (Enter)", () => {
  it("breaks at the caret and lands on the new line", () => {
    const { content, caret } = splitLine("hello world\n", 0, 5);
    expect(content).toBe("hello\n world\n");
    expect(caret).toEqual({ line: 1, offset: 0 });
  });

  it("at end of line inserts a blank line below", () => {
    expect(splitLine("abc\n", 0, 3).content).toBe("abc\n\n");
  });

  it("at start of line pushes the text down", () => {
    expect(splitLine("abc\n", 0, 0).content).toBe("\nabc\n");
  });
});

describe("mergeWithPrevious (Backspace at column 0)", () => {
  it("joins onto the line above, caret at the seam", () => {
    const edit = mergeWithPrevious("ab\ncd\n", 1)!;
    expect(edit.content).toBe("abcd\n");
    expect(edit.caret).toEqual({ line: 0, offset: 2 });
  });

  it("refuses on the first line", () => {
    expect(mergeWithPrevious("a\nb\n", 0)).toBeNull();
  });

  it("removes a blank line cleanly", () => {
    expect(mergeWithPrevious("a\n\nb\n", 1)!.content).toBe("a\nb\n");
  });
});

describe("mergeWithNext (Delete at end of line)", () => {
  it("pulls the next line up", () => {
    const edit = mergeWithNext("ab\ncd\n", 0)!;
    expect(edit.content).toBe("abcd\n");
    expect(edit.caret).toEqual({ line: 0, offset: 2 });
  });

  it("refuses on the last line", () => {
    expect(mergeWithNext("a\nb\n", 1)).toBeNull();
  });
});

describe("insertText (paste)", () => {
  it("inserts within a line", () => {
    const edit = insertText("hello world\n", 0, 5, ",");
    expect(edit.content).toBe("hello, world\n");
    expect(edit.caret).toEqual({ line: 0, offset: 6 });
  });

  it("spreads a multi-line paste across lines", () => {
    const edit = insertText("start end\n", 0, 6, "one\ntwo\nthree");
    expect(edit.content).toBe("start one\ntwo\nthreeend\n");
    expect(edit.caret).toEqual({ line: 2, offset: 5 });
  });

  it("pastes a whole document into a blank side without a phantom line", () => {
    const edit = insertText("", 0, 0, "# Title\n\nBody text.\n");
    expect(edit.content).toBe("# Title\n\nBody text.\n");
    expect(toLines(edit.content)).toEqual(["# Title", "", "Body text."]);
    // The caret belongs at the end of the pasted text, not on a new line.
    expect(edit.caret).toEqual({ line: 2, offset: 10 });
  });

  it("keeps interior blank lines when pasting", () => {
    const edit = insertText("", 0, 0, "a\n\n\nb\n");
    expect(toLines(edit.content)).toEqual(["a", "", "", "b"]);
  });

  it("normalises CRLF from the clipboard", () => {
    const edit = insertText("", 0, 0, "a\r\nb\r\n");
    expect(edit.content).toBe("a\nb\n");
  });

  it("normalises lone carriage returns", () => {
    expect(insertText("", 0, 0, "a\rb").content).toBe("a\nb\n");
  });

  it("clamps an offset past the end of the line", () => {
    expect(insertText("ab\n", 0, 99, "!").content).toBe("ab!\n");
  });
});

describe("deleteRange (selection delete)", () => {
  it("removes within one line", () => {
    const edit = deleteRange("hello world\n", { line: 0, offset: 5 }, { line: 0, offset: 11 });
    expect(edit.content).toBe("hello\n");
    expect(edit.caret).toEqual({ line: 0, offset: 5 });
  });

  it("removes across lines, joining the ends", () => {
    const edit = deleteRange(
      "one\ntwo\nthree\n",
      { line: 0, offset: 2 },
      { line: 2, offset: 2 },
    );
    expect(edit.content).toBe("onree\n");
  });

  it("accepts a backwards selection", () => {
    const forwards = deleteRange("abcdef\n", { line: 0, offset: 1 }, { line: 0, offset: 4 });
    const backwards = deleteRange("abcdef\n", { line: 0, offset: 4 }, { line: 0, offset: 1 });
    expect(backwards).toEqual(forwards);
  });
});
