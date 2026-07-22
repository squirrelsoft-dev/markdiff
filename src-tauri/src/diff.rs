//! Line-level diff of two markdown documents, refined with word-level
//! highlights inside lines that changed but stayed recognisably the same.
//!
//! One walk over the diff ops produces all three shapes the UI needs:
//! aligned rows (side-by-side), a unified line list (inline), and a
//! sequence of redline lines that [`crate::redline`] turns into markup.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use similar::{Algorithm, ChangeTag, DiffOp, TextDiff};

use crate::redline::{self, RlKind, RlLine};

/// How alike two lines must be before we show a word-level highlight
/// instead of treating them as an unrelated delete plus insert.
const PAIR_SIMILARITY: f32 = 0.3;
/// Lines longer than this skip inline refinement; the payoff is small and
/// the cost is quadratic in the worst case.
const MAX_INLINE_LEN: usize = 4000;
/// Upper bound on time spent inside the line-level algorithm.
const DIFF_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Equal,
    Insert,
    Delete,
    /// A line present on both sides with different content.
    Replace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpanKind {
    Equal,
    Insert,
    Delete,
}

/// A run of text within a line, tagged by how it changed.
#[derive(Debug, Clone, Serialize)]
pub struct Span {
    pub kind: SpanKind,
    pub text: String,
}

/// One side of a side-by-side row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cell {
    /// 1-based line number in its own document.
    pub no: usize,
    pub kind: LineKind,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spans: Option<Vec<Span>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<Cell>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<Cell>,
    pub kind: LineKind,
    /// 0 for unchanged rows, otherwise the 1-based index of the change
    /// block this row belongs to. Drives next/previous-change navigation.
    pub block: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedLine {
    pub kind: LineKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_no: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_no: Option<usize>,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spans: Option<Vec<Span>>,
    pub block: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub added: usize,
    pub removed: usize,
    pub modified: usize,
    pub unchanged: usize,
    pub blocks: usize,
    pub left_lines: usize,
    pub right_lines: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub rows: Vec<Row>,
    pub unified: Vec<UnifiedLine>,
    /// Markdown with `<ins>`/`<del>` woven in, for the overlay view.
    pub redline: String,
    pub stats: Stats,
    pub identical: bool,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiffOptions {
    /// Compare lines with runs of whitespace collapsed.
    pub ignore_whitespace: bool,
    pub ignore_case: bool,
    /// Refine changed lines by character rather than by word.
    pub char_level: bool,
}

pub fn diff_markdown(old: &str, new: &str, opts: DiffOptions) -> DiffResult {
    let old_lines = split_lines(old);
    let new_lines = split_lines(new);

    // Diff over normalised copies so the ignore-* options affect matching,
    // but every string we hand back to the UI is the untouched original.
    let old_keys: Vec<String> = old_lines.iter().map(|l| normalize(l, &opts)).collect();
    let new_keys: Vec<String> = new_lines.iter().map(|l| normalize(l, &opts)).collect();
    let old_refs: Vec<&str> = old_keys.iter().map(String::as_str).collect();
    let new_refs: Vec<&str> = new_keys.iter().map(String::as_str).collect();

    let diff = TextDiff::configure()
        .algorithm(Algorithm::Patience)
        .timeout(DIFF_TIMEOUT)
        .diff_slices(&old_refs, &new_refs);

    let mut rows: Vec<Row> = Vec::new();
    let mut unified: Vec<UnifiedLine> = Vec::new();
    let mut rl: Vec<RlLine> = Vec::new();
    let mut stats = Stats {
        left_lines: old_lines.len(),
        right_lines: new_lines.len(),
        ..Stats::default()
    };
    let mut block = 0usize;
    let mut in_change = false;

    for op in diff.ops() {
        match *op {
            DiffOp::Equal {
                old_index,
                new_index,
                len,
            } => {
                in_change = false;
                for i in 0..len {
                    let l = old_lines[old_index + i];
                    let r = new_lines[new_index + i];
                    rows.push(Row {
                        left: Some(Cell {
                            no: old_index + i + 1,
                            kind: LineKind::Equal,
                            text: l.to_string(),
                            spans: None,
                        }),
                        right: Some(Cell {
                            no: new_index + i + 1,
                            kind: LineKind::Equal,
                            text: r.to_string(),
                            spans: None,
                        }),
                        kind: LineKind::Equal,
                        block: 0,
                    });
                    unified.push(UnifiedLine {
                        kind: LineKind::Equal,
                        old_no: Some(old_index + i + 1),
                        new_no: Some(new_index + i + 1),
                        text: r.to_string(),
                        spans: None,
                        block: 0,
                    });
                    rl.push(RlLine::equal(r));
                }
                stats.unchanged += len;
            }

            DiffOp::Delete {
                old_index, old_len, ..
            } => {
                open_block(&mut block, &mut in_change);
                for i in 0..old_len {
                    let l = old_lines[old_index + i];
                    rows.push(Row {
                        left: Some(Cell {
                            no: old_index + i + 1,
                            kind: LineKind::Delete,
                            text: l.to_string(),
                            spans: None,
                        }),
                        right: None,
                        kind: LineKind::Delete,
                        block,
                    });
                    unified.push(UnifiedLine {
                        kind: LineKind::Delete,
                        old_no: Some(old_index + i + 1),
                        new_no: None,
                        text: l.to_string(),
                        spans: None,
                        block,
                    });
                    rl.push(RlLine::del(l));
                }
                stats.removed += old_len;
            }

            DiffOp::Insert {
                new_index, new_len, ..
            } => {
                open_block(&mut block, &mut in_change);
                for i in 0..new_len {
                    let r = new_lines[new_index + i];
                    rows.push(Row {
                        left: None,
                        right: Some(Cell {
                            no: new_index + i + 1,
                            kind: LineKind::Insert,
                            text: r.to_string(),
                            spans: None,
                        }),
                        kind: LineKind::Insert,
                        block,
                    });
                    unified.push(UnifiedLine {
                        kind: LineKind::Insert,
                        old_no: None,
                        new_no: Some(new_index + i + 1),
                        text: r.to_string(),
                        spans: None,
                        block,
                    });
                    rl.push(RlLine::ins(r));
                }
                stats.added += new_len;
            }

            DiffOp::Replace {
                old_index,
                old_len,
                new_index,
                new_len,
            } => {
                open_block(&mut block, &mut in_change);

                // Unified output keeps the conventional shape: every removed
                // line of the hunk, then every added line.
                let mut dels: Vec<UnifiedLine> = Vec::new();
                let mut inss: Vec<UnifiedLine> = Vec::new();

                let paired = old_len.min(new_len);
                for i in 0..paired {
                    let l = old_lines[old_index + i];
                    let r = new_lines[new_index + i];
                    let refined = refine(l, r, &opts);

                    let (lspans, rspans) = match &refined {
                        Some(r) => (Some(r.left.clone()), Some(r.right.clone())),
                        None => (None, None),
                    };

                    rows.push(Row {
                        left: Some(Cell {
                            no: old_index + i + 1,
                            kind: LineKind::Replace,
                            text: l.to_string(),
                            spans: lspans.clone(),
                        }),
                        right: Some(Cell {
                            no: new_index + i + 1,
                            kind: LineKind::Replace,
                            text: r.to_string(),
                            spans: rspans.clone(),
                        }),
                        kind: LineKind::Replace,
                        block,
                    });
                    dels.push(UnifiedLine {
                        kind: LineKind::Delete,
                        old_no: Some(old_index + i + 1),
                        new_no: None,
                        text: l.to_string(),
                        spans: lspans,
                        block,
                    });
                    inss.push(UnifiedLine {
                        kind: LineKind::Insert,
                        old_no: None,
                        new_no: Some(new_index + i + 1),
                        text: r.to_string(),
                        spans: rspans,
                        block,
                    });

                    match refined {
                        // Close enough to read as one edited line.
                        Some(refined) => rl.push(RlLine::mixed(l, refined.merged)),
                        // Too different — show the old line struck out above
                        // the new one rather than a confetti of word spans.
                        None => {
                            rl.push(RlLine::del(l));
                            rl.push(RlLine::ins(r));
                        }
                    }
                }

                for i in paired..old_len {
                    let l = old_lines[old_index + i];
                    rows.push(Row {
                        left: Some(Cell {
                            no: old_index + i + 1,
                            kind: LineKind::Delete,
                            text: l.to_string(),
                            spans: None,
                        }),
                        right: None,
                        kind: LineKind::Delete,
                        block,
                    });
                    dels.push(UnifiedLine {
                        kind: LineKind::Delete,
                        old_no: Some(old_index + i + 1),
                        new_no: None,
                        text: l.to_string(),
                        spans: None,
                        block,
                    });
                    rl.push(RlLine::del(l));
                }
                for i in paired..new_len {
                    let r = new_lines[new_index + i];
                    rows.push(Row {
                        left: None,
                        right: Some(Cell {
                            no: new_index + i + 1,
                            kind: LineKind::Insert,
                            text: r.to_string(),
                            spans: None,
                        }),
                        kind: LineKind::Insert,
                        block,
                    });
                    inss.push(UnifiedLine {
                        kind: LineKind::Insert,
                        old_no: None,
                        new_no: Some(new_index + i + 1),
                        text: r.to_string(),
                        spans: None,
                        block,
                    });
                    rl.push(RlLine::ins(r));
                }

                unified.extend(dels);
                unified.extend(inss);

                stats.modified += paired;
                stats.removed += old_len - paired;
                stats.added += new_len - paired;
            }
        }
    }

    stats.blocks = block;
    let identical = block == 0;

    DiffResult {
        redline: redline::render(&rl),
        rows,
        unified,
        stats,
        identical,
    }
}

fn open_block(block: &mut usize, in_change: &mut bool) {
    if !*in_change {
        *block += 1;
        *in_change = true;
    }
}

/// Spans for a pair of lines that changed together.
struct Refined {
    left: Vec<Span>,
    right: Vec<Span>,
    /// Left and right interleaved in reading order, for the redline.
    merged: Vec<Span>,
}

/// Returns `None` when the two lines are too dissimilar for a word-level
/// highlight to communicate anything.
fn refine(a: &str, b: &str, opts: &DiffOptions) -> Option<Refined> {
    if a.len() > MAX_INLINE_LEN || b.len() > MAX_INLINE_LEN {
        return None;
    }

    let cfg = TextDiff::configure();
    let d = if opts.char_level {
        cfg.diff_chars(a, b)
    } else {
        cfg.diff_unicode_words(a, b)
    };

    let mut left = Vec::new();
    let mut right = Vec::new();
    let mut merged = Vec::new();
    for change in d.iter_all_changes() {
        let text = change.value();
        match change.tag() {
            ChangeTag::Equal => {
                push_span(&mut left, SpanKind::Equal, text);
                push_span(&mut right, SpanKind::Equal, text);
                push_span(&mut merged, SpanKind::Equal, text);
            }
            ChangeTag::Delete => {
                push_span(&mut left, SpanKind::Delete, text);
                push_span(&mut merged, SpanKind::Delete, text);
            }
            ChangeTag::Insert => {
                push_span(&mut right, SpanKind::Insert, text);
                push_span(&mut merged, SpanKind::Insert, text);
            }
        }
    }

    if similarity(&merged) < PAIR_SIMILARITY {
        return None;
    }

    Some(Refined {
        left,
        right,
        merged,
    })
}

/// Share of the pair's substance that survived the edit, in the range 0..=1.
///
/// Deliberately ignores whitespace: the tokenizer emits the gaps between
/// words as tokens of their own, and two lines with nothing in common
/// still match on every space, which is enough to clear a naive threshold.
fn similarity(merged: &[Span]) -> f32 {
    let weigh = |kind: SpanKind| -> usize {
        merged
            .iter()
            .filter(|s| s.kind == kind)
            .map(|s| s.text.chars().filter(|c| !c.is_whitespace()).count())
            .sum()
    };

    let equal = weigh(SpanKind::Equal);
    let changed = weigh(SpanKind::Delete) + weigh(SpanKind::Insert);

    match 2 * equal + changed {
        0 => 0.0,
        total => (2 * equal) as f32 / total as f32,
    }
}

/// Appends `text`, merging into the previous span when the tag matches so
/// the UI renders one highlight per run instead of one per token.
fn push_span(spans: &mut Vec<Span>, kind: SpanKind, text: &str) {
    if text.is_empty() {
        return;
    }
    if let Some(last) = spans.last_mut() {
        if last.kind == kind {
            last.text.push_str(text);
            return;
        }
    }
    spans.push(Span {
        kind,
        text: text.to_string(),
    });
}

fn normalize(line: &str, opts: &DiffOptions) -> String {
    let mut s = if opts.ignore_whitespace {
        line.split_whitespace().collect::<Vec<_>>().join(" ")
    } else {
        line.to_string()
    };
    if opts.ignore_case {
        s = s.to_lowercase();
    }
    s
}

/// Splits into lines without terminators, tolerating CRLF. A trailing
/// newline does not produce a phantom final line.
fn split_lines(text: &str) -> Vec<&str> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<&str> = text
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect();
    if lines.len() > 1 && lines.last() == Some(&"") {
        lines.pop();
    }
    lines
}

impl RlLine {
    fn equal(text: &str) -> Self {
        RlLine {
            kind: RlKind::Equal,
            old: String::new(),
            new: text.to_string(),
            spans: Vec::new(),
        }
    }
    fn del(text: &str) -> Self {
        RlLine {
            kind: RlKind::Del,
            old: text.to_string(),
            new: String::new(),
            spans: Vec::new(),
        }
    }
    fn ins(text: &str) -> Self {
        RlLine {
            kind: RlKind::Ins,
            old: String::new(),
            new: text.to_string(),
            spans: Vec::new(),
        }
    }
    fn mixed(old: &str, spans: Vec<Span>) -> Self {
        let new: String = spans
            .iter()
            .filter(|s| s.kind != SpanKind::Delete)
            .map(|s| s.text.as_str())
            .collect();
        RlLine {
            kind: RlKind::Mixed,
            old: old.to_string(),
            new,
            spans,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> DiffOptions {
        DiffOptions::default()
    }

    #[test]
    fn identical_documents_report_no_changes() {
        let d = diff_markdown("# Hi\n\nSame.\n", "# Hi\n\nSame.\n", opts());
        assert!(d.identical);
        assert_eq!(d.stats.blocks, 0);
        assert_eq!(d.stats.unchanged, 3);
        assert_eq!(d.rows.len(), 3);
    }

    #[test]
    fn trailing_newline_does_not_add_a_line() {
        let d = diff_markdown("a\nb\n", "a\nb", opts());
        assert!(d.identical);
        assert_eq!(d.stats.left_lines, 2);
        assert_eq!(d.stats.right_lines, 2);
    }

    #[test]
    fn edited_line_pairs_with_word_spans() {
        let d = diff_markdown("The cat sat down.\n", "The dog sat down.\n", opts());
        assert_eq!(d.stats.modified, 1);
        let row = &d.rows[0];
        assert_eq!(row.kind, LineKind::Replace);
        let left = row.left.as_ref().unwrap().spans.as_ref().unwrap();
        assert!(left
            .iter()
            .any(|s| s.kind == SpanKind::Delete && s.text.contains("cat")));
        let right = row.right.as_ref().unwrap().spans.as_ref().unwrap();
        assert!(right
            .iter()
            .any(|s| s.kind == SpanKind::Insert && s.text.contains("dog")));
    }

    #[test]
    fn unrelated_lines_are_not_word_refined() {
        // These share nothing but the spaces between their words, which is
        // exactly the case a token-count similarity ratio gets wrong.
        let d = diff_markdown("Alpha beta gamma\n", "Nothing alike here\n", opts());
        let row = &d.rows[0];
        assert!(row.left.as_ref().unwrap().spans.is_none());
        assert!(row.right.as_ref().unwrap().spans.is_none());
    }

    #[test]
    fn mostly_shared_lines_are_still_refined() {
        let d = diff_markdown(
            "Install the package and run the server.\n",
            "Install the package and start the server.\n",
            opts(),
        );
        assert!(d.rows[0].left.as_ref().unwrap().spans.is_some());
    }

    #[test]
    fn whitespace_only_difference_still_refines() {
        let d = diff_markdown("- item one\n", "-   item one\n", opts());
        assert_eq!(d.stats.modified, 1);
    }

    #[test]
    fn pure_insert_and_delete_are_single_sided() {
        let d = diff_markdown("a\nc\n", "a\nb\nc\n", opts());
        assert_eq!(d.stats.added, 1);
        let inserted = d.rows.iter().find(|r| r.kind == LineKind::Insert).unwrap();
        assert!(inserted.left.is_none());
        assert_eq!(inserted.right.as_ref().unwrap().text, "b");
    }

    #[test]
    fn unified_lists_removals_before_additions() {
        let d = diff_markdown("one\ntwo\n", "uno\ndos\n", opts());
        let kinds: Vec<LineKind> = d.unified.iter().map(|l| l.kind).collect();
        assert_eq!(
            kinds,
            vec![
                LineKind::Delete,
                LineKind::Delete,
                LineKind::Insert,
                LineKind::Insert
            ]
        );
    }

    #[test]
    fn consecutive_changes_form_one_navigable_block() {
        let d = diff_markdown("a\nb\nc\nd\n", "a\nB\nC\nd\n", opts());
        assert_eq!(d.stats.blocks, 1);
        let separated = diff_markdown("a\nb\nc\nd\n", "A\nb\nc\nD\n", opts());
        assert_eq!(separated.stats.blocks, 2);
    }

    #[test]
    fn ignore_whitespace_option_collapses_runs() {
        let text_a = "hello   world\n";
        let text_b = "hello world\n";
        assert!(!diff_markdown(text_a, text_b, opts()).identical);
        let lenient = DiffOptions {
            ignore_whitespace: true,
            ..opts()
        };
        assert!(diff_markdown(text_a, text_b, lenient).identical);
    }

    #[test]
    fn ignore_case_option_matches_across_case() {
        let lenient = DiffOptions {
            ignore_case: true,
            ..opts()
        };
        assert!(diff_markdown("# Title\n", "# TITLE\n", lenient).identical);
    }

    #[test]
    fn empty_against_content_is_all_insert() {
        let d = diff_markdown("", "new line\n", opts());
        assert_eq!(d.stats.added, 1);
        assert_eq!(d.stats.removed, 0);
    }

    #[test]
    fn crlf_matches_lf() {
        assert!(diff_markdown("a\r\nb\r\n", "a\nb\n", opts()).identical);
    }
}
