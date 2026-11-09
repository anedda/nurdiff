//! Unified view: the rows of the comparison in a single list, like `git diff`.
//!
//! Equal rows are a single row; a block of differences (consecutive rows that are not equal) becomes
//! first all the removed rows (those of the left side, in order) and then all the added ones (those
//! of the right side). A modified row therefore gives two rows, one removed and one added. The list is
//! computed over the rows the view shows (with the filter active), without copying them: what is needed is the
//! total number and the position of each block (`layout`) and a range of rows (`slice`).

use serde::Serialize;

use crate::diff::{DiffOptions, Row, RowKind};
use crate::inline::{inline_marks, Mark};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UnifiedKind {
    Equal,
    Removed,
    Added,
}

/// A row of the unified view.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UnifiedRow {
    pub kind: UnifiedKind,
    /// Row number (from 1) in the left file: missing for added rows.
    pub left: Option<usize>,
    /// Row number (from 1) in the right file: missing for removed rows.
    pub right: Option<usize>,
    pub text: String,
    /// The row of the side-by-side view this one comes from (an equal row, or the row whose left or right line this is):
    /// what the copy of one row needs. `slice` gives the index of the rows it receives; `Session::unified_rows` turns
    /// it into the index among the rows the view shows.
    pub row: usize,
    /// Parts that differ from the other side (removed or added rows that were a modified row).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub marks: Vec<Mark>,
    /// With a filter active: other rows were hidden before this one.
    #[serde(skip_serializing_if = "is_false")]
    pub gap: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// Where a block of differences is in the unified list: rows `[start, end)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct UnifiedSpan {
    pub start: usize,
    pub end: usize,
}

enum Item<'a> {
    Equal(usize, &'a Row),
    /// Consecutive rows that are not equal: a block (each with its index).
    Run(Vec<(usize, &'a Row)>),
}

/// Walks the visible rows (each with its index in the complete comparison) grouping them into
/// equal rows and blocks; `f` also receives whether there is a jump before (hidden rows) and returns
/// false to stop. Two blocks separated by hidden rows stay two blocks.
fn walk<'a>(
    rows: impl Iterator<Item = (usize, &'a Row)>,
    mut f: impl FnMut(Item<'a>, bool) -> bool,
) {
    let mut prev: Option<usize> = None;
    let mut run: Vec<(usize, &Row)> = Vec::new();
    let mut run_gap = false;
    for (real, row) in rows {
        let gap = prev.map_or(real > 0, |p| real > p + 1);
        prev = Some(real);
        if row.kind == RowKind::Equal {
            if !run.is_empty() && !f(Item::Run(std::mem::take(&mut run)), run_gap) {
                return;
            }
            if !f(Item::Equal(real, row), gap) {
                return;
            }
            continue;
        }
        if !run.is_empty() && gap && !f(Item::Run(std::mem::take(&mut run)), run_gap) {
            return;
        }
        if run.is_empty() {
            run_gap = gap;
        }
        run.push((real, row));
    }
    if !run.is_empty() {
        f(Item::Run(run), run_gap);
    }
}

fn counts(run: &[(usize, &Row)]) -> (usize, usize) {
    let left = run.iter().filter(|(_, r)| r.left.is_some()).count();
    let right = run.iter().filter(|(_, r)| r.right.is_some()).count();
    (left, right)
}

/// Number of rows of the unified list and position of each block (in the same order as the blocks
/// of the comparison).
pub fn layout<'a>(rows: impl Iterator<Item = (usize, &'a Row)>) -> (usize, Vec<UnifiedSpan>) {
    let mut total = 0;
    let mut spans = Vec::new();
    walk(rows, |item, _| {
        match item {
            Item::Equal(..) => total += 1,
            Item::Run(run) => {
                let (l, r) = counts(&run);
                spans.push(UnifiedSpan {
                    start: total,
                    end: total + l + r,
                });
                total += l + r;
            }
        }
        true
    });
    (total, spans)
}

/// The unified rows from `start` (included) to `end` (excluded).
pub fn slice<'a>(
    rows: impl Iterator<Item = (usize, &'a Row)>,
    start: usize,
    end: usize,
    options: &DiffOptions,
) -> Vec<UnifiedRow> {
    let mut out = Vec::new();
    let mut at = 0;
    walk(rows, |item, gap| {
        if at >= end {
            return false;
        }
        match item {
            Item::Equal(index, row) => {
                if at >= start {
                    let (l, r) = (row.left.as_ref(), row.right.as_ref());
                    out.push(UnifiedRow {
                        kind: UnifiedKind::Equal,
                        left: l.map(|c| c.number),
                        right: r.map(|c| c.number),
                        text: l.or(r).map(|c| c.text.clone()).unwrap_or_default(),
                        row: index,
                        marks: Vec::new(),
                        gap,
                    });
                }
                at += 1;
            }
            Item::Run(run) => {
                let (nl, nr) = counts(&run);
                let n = nl + nr;
                if at + n > start {
                    // The removed rows are the first `nl` of the block, the added ones the next `nr`.
                    let from = start.saturating_sub(at);
                    let to = (end - at).min(n);
                    let mut first = true;
                    let mut push = |kind: UnifiedKind, index: usize, row: &Row| {
                        let removed = kind == UnifiedKind::Removed;
                        let cell = if removed { &row.left } else { &row.right };
                        // The rows arrive already filtered by side; if the cell is missing there is nothing to add.
                        let Some(cell) = cell.as_ref() else {
                            return;
                        };
                        let marks = match (row.kind, &row.left, &row.right) {
                            (RowKind::Changed, Some(l), Some(r)) => {
                                let (lm, rm) = inline_marks(&l.text, &r.text, options);
                                if removed {
                                    lm
                                } else {
                                    rm
                                }
                            }
                            _ => Vec::new(),
                        };
                        out.push(UnifiedRow {
                            kind,
                            left: if removed { Some(cell.number) } else { None },
                            right: if removed { None } else { Some(cell.number) },
                            text: cell.text.clone(),
                            row: index,
                            marks,
                            gap: gap && std::mem::take(&mut first) && from == 0,
                        });
                    };
                    if from < nl {
                        for row in run
                            .iter()
                            .filter(|(_, r)| r.left.is_some())
                            .skip(from)
                            .take(to.min(nl) - from)
                        {
                            push(UnifiedKind::Removed, row.0, row.1);
                        }
                    }
                    if to > nl {
                        let skip = from.saturating_sub(nl);
                        for row in run
                            .iter()
                            .filter(|(_, r)| r.right.is_some())
                            .skip(skip)
                            .take(to - nl.max(from))
                        {
                            push(UnifiedKind::Added, row.0, row.1);
                        }
                    }
                }
                at += n;
            }
        }
        true
    });
    out
}

#[cfg(test)]
mod tests;
