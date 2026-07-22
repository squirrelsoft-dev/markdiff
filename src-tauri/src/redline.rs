//! Turns a diffed line sequence into a single markdown document with the
//! changes marked up as `<ins>`/`<del>`, for the overlay view.
//!
//! The hard part is staying out of markdown's way. Wrapping a whole line
//! (`<del># Heading</del>`) would stop it being a heading, so the block
//! prefix is always left bare and only the content inside it is wrapped.
//! Fenced code and table rows get their own treatment for the same reason.

use std::sync::LazyLock;

use regex::Regex;

use crate::diff::{Span, SpanKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RlKind {
    Equal,
    Ins,
    Del,
    /// One line, edited in place; `spans` holds both sides interleaved.
    Mixed,
}

#[derive(Debug, Clone)]
pub struct RlLine {
    pub kind: RlKind,
    pub old: String,
    pub new: String,
    pub spans: Vec<Span>,
}

/// Leading markdown block markers: indentation, list bullets, blockquote
/// arrows and ATX heading hashes, in any nesting order.
static BLOCK_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+|>[ \t]?|#{1,6}[ \t]+)*)")
        .expect("block prefix pattern is valid")
});

pub fn render(lines: &[RlLine]) -> String {
    let mut out = String::new();
    let mut i = 0;

    while i < lines.len() {
        let text = display_text(&lines[i]);

        if let Some(fence) = FenceMarker::parse(text) {
            // Everything up to the closing fence is code; markdown markup
            // is inert in there, so it becomes an HTML block instead.
            let open = i;
            let mut j = i + 1;
            while j < lines.len() {
                if let Some(close) = FenceMarker::parse(display_text(&lines[j])) {
                    if close.closes(&fence) {
                        break;
                    }
                }
                j += 1;
            }
            out.push_str(&render_code_block(
                &fence.info,
                &lines[open + 1..j.min(lines.len())],
            ));
            // Skip the closing fence too when we found one.
            i = if j < lines.len() { j + 1 } else { j };
            continue;
        }

        out.push_str(&render_prose_line(&lines[i]));
        out.push('\n');
        i += 1;
    }

    out
}

/// The text a line contributes to the merged document.
fn display_text(line: &RlLine) -> &str {
    match line.kind {
        RlKind::Del => &line.old,
        _ => &line.new,
    }
}

fn render_prose_line(line: &RlLine) -> String {
    match line.kind {
        RlKind::Equal => line.new.clone(),
        RlKind::Del => wrap_line(&line.old, "del"),
        RlKind::Ins => wrap_line(&line.new, "ins"),
        RlKind::Mixed => {
            // Rendering spans in place keeps the block prefix outside any
            // tag — but only if the prefix itself survived the edit. When
            // `# x` became `## x` the markers moved, so fall back to
            // showing the old line struck out above the new one.
            let (old_prefix, _) = split_prefix(&line.old);
            let (new_prefix, _) = split_prefix(&line.new);
            if old_prefix == new_prefix {
                render_spans(&line.spans)
            } else {
                format!(
                    "{}\n{}",
                    wrap_line(&line.old, "del"),
                    wrap_line(&line.new, "ins")
                )
            }
        }
    }
}

fn render_spans(spans: &[Span]) -> String {
    let mut out = String::new();
    for span in spans {
        match span.kind {
            SpanKind::Equal => out.push_str(&span.text),
            SpanKind::Insert => {
                if !span.text.trim().is_empty() {
                    out.push_str(&format!("<ins class=\"rl-ins\">{}</ins>", span.text));
                } else {
                    out.push_str(&span.text);
                }
            }
            SpanKind::Delete => {
                if !span.text.trim().is_empty() {
                    out.push_str(&format!("<del class=\"rl-del\">{}</del>", span.text));
                } else {
                    out.push_str(&span.text);
                }
            }
        }
    }
    out
}

/// Wraps a whole line's content in `tag`, leaving anything markdown needs
/// to see at the start of the line untouched.
fn wrap_line(text: &str, tag: &str) -> String {
    let (prefix, content) = split_prefix(text);

    // Blank lines and horizontal rules carry no content to mark up, and a
    // rule wrapped in a tag stops being a rule.
    if content.trim().is_empty() || is_thematic_break(content) {
        return text.to_string();
    }

    if let Some(row) = wrap_table_row(text, tag) {
        return row;
    }

    format!("{prefix}<{tag} class=\"rl-{tag}\">{content}</{tag}>")
}

fn split_prefix(text: &str) -> (&str, &str) {
    match BLOCK_PREFIX.find(text) {
        Some(m) => (&text[..m.end()], &text[m.end()..]),
        None => ("", text),
    }
}

fn is_thematic_break(content: &str) -> bool {
    let t = content.trim();
    if t.len() < 3 {
        return false;
    }
    ['-', '*', '_', '=']
        .iter()
        .any(|c| t.chars().all(|ch| ch == *c))
}

/// Wraps each cell of a pipe-table row individually; wrapping the row
/// itself would swallow the pipes and collapse the table.
fn wrap_table_row(text: &str, tag: &str) -> Option<String> {
    let trimmed = text.trim_start();
    if !trimmed.starts_with('|') || trimmed.matches('|').count() < 2 {
        return None;
    }

    let indent = &text[..text.len() - trimmed.len()];

    // The `|---|:--|` alignment row has no prose to mark up.
    if trimmed
        .chars()
        .all(|c| matches!(c, '|' | '-' | ':' | ' ' | '\t'))
    {
        return Some(text.to_string());
    }

    let cells: Vec<&str> = trimmed.split('|').collect();
    let last = cells.len() - 1;
    let wrapped: Vec<String> = cells
        .iter()
        .enumerate()
        .map(|(i, cell)| {
            if i == 0 || i == last || cell.trim().is_empty() {
                cell.to_string()
            } else {
                format!(" <{tag} class=\"rl-{tag}\">{}</{tag}> ", cell.trim())
            }
        })
        .collect();

    Some(format!("{indent}{}", wrapped.join("|")))
}

struct FenceMarker {
    ch: char,
    len: usize,
    info: String,
}

impl FenceMarker {
    fn parse(text: &str) -> Option<Self> {
        let trimmed = text.trim_start();
        // More than three leading spaces makes it an indented code block,
        // not a fence.
        if text.len() - trimmed.len() > 3 {
            return None;
        }
        let ch = trimmed.chars().next().filter(|c| *c == '`' || *c == '~')?;
        let len = trimmed.chars().take_while(|c| *c == ch).count();
        if len < 3 {
            return None;
        }
        let info = trimmed[len..].trim().to_string();
        // Backtick fences cannot carry a backtick in the info string.
        if ch == '`' && info.contains('`') {
            return None;
        }
        Some(FenceMarker { ch, len, info })
    }

    fn closes(&self, open: &FenceMarker) -> bool {
        self.ch == open.ch && self.len >= open.len && self.info.is_empty()
    }
}

fn render_code_block(info: &str, body: &[RlLine]) -> String {
    let mut out = String::from("<pre class=\"rl-code\"");
    if !info.is_empty() {
        out.push_str(&format!(" data-lang=\"{}\"", escape_html(info)));
    }
    out.push_str("><code>");

    for line in body {
        let (class, inner) = match line.kind {
            RlKind::Equal => ("rl-code-eq", escape_html(&line.new)),
            RlKind::Ins => ("rl-code-ins", escape_html(&line.new)),
            RlKind::Del => ("rl-code-del", escape_html(&line.old)),
            RlKind::Mixed => ("rl-code-mixed", escape_code_spans(&line.spans)),
        };
        // No newline between spans: they are block-level, and a <pre>
        // would honour the literal newline too and double the spacing.
        out.push_str(&format!(
            "<span class=\"rl-code-line {class}\">{inner}</span>"
        ));
    }

    out.push_str("</code></pre>\n");
    out
}

fn escape_code_spans(spans: &[Span]) -> String {
    let mut out = String::new();
    for span in spans {
        let text = escape_html(&span.text);
        match span.kind {
            SpanKind::Equal => out.push_str(&text),
            SpanKind::Insert => out.push_str(&format!("<span class=\"rl-ins\">{text}</span>")),
            SpanKind::Delete => out.push_str(&format!("<span class=\"rl-del\">{text}</span>")),
        }
    }
    out
}

fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn del(text: &str) -> RlLine {
        RlLine {
            kind: RlKind::Del,
            old: text.into(),
            new: String::new(),
            spans: vec![],
        }
    }
    fn ins(text: &str) -> RlLine {
        RlLine {
            kind: RlKind::Ins,
            old: String::new(),
            new: text.into(),
            spans: vec![],
        }
    }
    fn eq(text: &str) -> RlLine {
        RlLine {
            kind: RlKind::Equal,
            old: String::new(),
            new: text.into(),
            spans: vec![],
        }
    }
    fn mixed(old: &str, new: &str, spans: Vec<Span>) -> RlLine {
        RlLine {
            kind: RlKind::Mixed,
            old: old.into(),
            new: new.into(),
            spans,
        }
    }
    fn span(kind: SpanKind, text: &str) -> Span {
        Span {
            kind,
            text: text.into(),
        }
    }

    #[test]
    fn heading_marker_stays_outside_the_tag() {
        let out = render(&[del("## Old Heading")]);
        assert_eq!(out.trim(), "## <del class=\"rl-del\">Old Heading</del>");
    }

    #[test]
    fn list_bullet_stays_outside_the_tag() {
        let out = render(&[ins("- a new item")]);
        assert_eq!(out.trim(), "- <ins class=\"rl-ins\">a new item</ins>");
    }

    #[test]
    fn nested_quote_and_bullet_prefix_is_preserved() {
        let out = render(&[del("> - quoted item")]);
        assert_eq!(out.trim(), "> - <del class=\"rl-del\">quoted item</del>");
    }

    #[test]
    fn thematic_break_is_left_alone() {
        assert_eq!(render(&[del("---")]).trim(), "---");
    }

    #[test]
    fn blank_line_is_not_wrapped() {
        assert_eq!(render(&[del("")]).trim(), "");
    }

    #[test]
    fn table_cells_are_wrapped_individually() {
        let out = render(&[ins("| alpha | beta |")]);
        assert!(out.contains("<ins class=\"rl-ins\">alpha</ins>"));
        assert!(out.contains("<ins class=\"rl-ins\">beta</ins>"));
        assert_eq!(out.matches('|').count(), 3, "pipes must survive: {out}");
    }

    #[test]
    fn table_alignment_row_is_left_alone() {
        assert_eq!(render(&[del("|---|:--:|")]).trim(), "|---|:--:|");
    }

    #[test]
    fn edited_line_renders_spans_in_place() {
        let out = render(&[mixed(
            "The cat sat",
            "The dog sat",
            vec![
                span(SpanKind::Equal, "The "),
                span(SpanKind::Delete, "cat"),
                span(SpanKind::Insert, "dog"),
                span(SpanKind::Equal, " sat"),
            ],
        )]);
        assert_eq!(
            out.trim(),
            "The <del class=\"rl-del\">cat</del><ins class=\"rl-ins\">dog</ins> sat"
        );
    }

    #[test]
    fn changed_heading_level_falls_back_to_two_lines() {
        let out = render(&[mixed(
            "# Title",
            "## Title",
            vec![
                span(SpanKind::Insert, "#"),
                span(SpanKind::Equal, "# Title"),
            ],
        )]);
        assert!(out.contains("# <del class=\"rl-del\">Title</del>"));
        assert!(out.contains("## <ins class=\"rl-ins\">Title</ins>"));
    }

    #[test]
    fn fenced_code_becomes_an_html_block() {
        let out = render(&[
            eq("```rust"),
            eq("let a = 1;"),
            del("let b = 2;"),
            eq("```"),
            eq("after"),
        ]);
        assert!(out.contains("<pre class=\"rl-code\" data-lang=\"rust\">"));
        assert!(out.contains("rl-code-del\">let b = 2;"));
        assert!(!out.contains("```"), "fence markers should be consumed");
        assert!(out.trim_end().ends_with("after"));
    }

    #[test]
    fn code_content_is_html_escaped() {
        let out = render(&[eq("```"), ins("<script>alert(1)</script>"), eq("```")]);
        assert!(out.contains("&lt;script&gt;"));
        assert!(!out.contains("<script>"));
    }

    #[test]
    fn unterminated_fence_still_renders() {
        let out = render(&[eq("```"), ins("dangling")]);
        assert!(out.contains("rl-code-ins\">dangling"));
    }

    #[test]
    fn tilde_fence_is_not_closed_by_backticks() {
        let out = render(&[eq("~~~"), eq("```"), eq("~~~"), eq("done")]);
        assert_eq!(out.matches("<pre").count(), 1);
        assert!(out.trim_end().ends_with("done"));
    }

    #[test]
    fn equal_lines_pass_through_untouched() {
        let out = render(&[eq("# Kept"), eq(""), eq("Body text.")]);
        assert_eq!(out, "# Kept\n\nBody text.\n");
    }
}
