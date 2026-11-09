//! The side-by-side view with a filter: which rows are shown (all, only the different ones, the different ones with context),
//! the visible rows in blocks, the unified rows and the summary of what is seen.

use serde::Deserialize;

use super::{Document, Session, Side};
use crate::diff::{Row, RowKind};
use crate::search::{search_lines, Needle, SearchResult};
use crate::unified::{self, UnifiedRow};
use crate::{classify_lines, DiffSummary, Format, MinorCauses};

/// Which rows of the side-by-side view are shown.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RowFilter {
    /// All the rows.
    #[default]
    All,
    /// Only the different rows.
    Diffs,
    /// The different rows with [`FILTER_CONTEXT`] equal rows around them.
    Context,
}

/// Equal rows shown before and after each difference with [`RowFilter::Context`].
pub const FILTER_CONTEXT: usize = 3;

/// Indexes of the rows to show (`None` = all). The different rows and the fixed points set by
/// hand are always there.
pub(super) fn build_view(rows: &[Row], filter: RowFilter) -> Option<Vec<usize>> {
    let context = match filter {
        RowFilter::All => return None,
        RowFilter::Diffs => 0,
        RowFilter::Context => FILTER_CONTEXT,
    };
    let mut keep = vec![false; rows.len()];
    for (i, row) in rows.iter().enumerate() {
        if row.kind != RowKind::Equal || row.aligned {
            let from = i.saturating_sub(context);
            let to = (i + context + 1).min(rows.len());
            keep[from..to].fill(true);
        }
    }
    Some(
        keep.iter()
            .enumerate()
            .filter_map(|(i, k)| k.then_some(i))
            .collect(),
    )
}

impl Session {
    pub fn filter(&self) -> RowFilter {
        self.filter
    }

    /// Changes the rows shown. The merges, the history and the files do not change; the revision does,
    /// because the rows the UI already received are no longer valid.
    pub fn set_filter(&mut self, filter: RowFilter) {
        if filter == self.filter {
            return;
        }
        self.filter = filter;
        self.view = build_view(&self.diff.rows, filter);
        self.revision += 1;
    }

    /// Rows that the view shows.
    pub fn visible_len(&self) -> usize {
        self.view.as_ref().map_or(self.diff.rows.len(), Vec::len)
    }

    /// Visible rows from `start` to `end` (excluded, within the end); `gap` marks the rows
    /// preceded by others hidden by the filter.
    pub fn visible_rows(&self, start: usize, end: usize) -> Vec<Row> {
        let len = self.visible_len();
        let (start, end) = (start.min(len), end.min(len));
        let Some(view) = &self.view else {
            return self.diff.rows[start..end.max(start)].to_vec();
        };
        (start..end.max(start))
            .map(|i| {
                let real = view[i];
                let before = if i == 0 { None } else { Some(view[i - 1]) };
                let mut row = self.diff.rows[real].clone();
                row.gap = match before {
                    None => real > 0,
                    Some(prev) => real > prev + 1,
                };
                row
            })
            .collect()
    }

    /// The visible rows, each with its index in the complete comparison.
    fn visible_iter(&self) -> Box<dyn Iterator<Item = (usize, &Row)> + '_> {
        let rows = &self.diff.rows;
        match &self.view {
            Some(view) => Box::new(view.iter().map(move |&i| (i, &rows[i]))),
            None => Box::new(rows.iter().enumerate()),
        }
    }

    /// Where `text` appears in the lines of a side, over the rows that the view shows (`row` is the position
    /// among them). It looks at the current text: the merges and the edits not yet saved are in it.
    /// `None` if `cancelled` became true while it looked (a newer search made this one useless).
    pub fn search(
        &self,
        side: Side,
        text: &str,
        case_sensitive: bool,
        cancelled: &dyn Fn() -> bool,
    ) -> Option<SearchResult> {
        let Some(needle) = Needle::new(text, case_sensitive) else {
            return Some(SearchResult {
                hits: Vec::new(),
                truncated: false,
            });
        };
        let lines = self.visible_iter().enumerate().map(|(at, (_, row))| {
            let cell = match side {
                Side::Left => &row.left,
                Side::Right => &row.right,
            };
            (at, cell.as_ref().map(|c| c.text.as_str()))
        });
        search_lines(lines, &needle, cancelled)
    }

    /// Unified rows from `start` to `end` (excluded), over the rows that the view shows.
    pub fn unified_rows(&self, start: usize, end: usize) -> Vec<UnifiedRow> {
        let mut rows = unified::slice(self.visible_iter(), start, end, &self.options);
        // `slice` gives the index in the complete comparison: the copy of a row wants the one among the visible rows.
        if let Some(view) = &self.view {
            for row in &mut rows {
                row.row = view.binary_search(&row.row).unwrap_or_else(|p| p);
            }
        }
        rows
    }

    pub fn summary(&self) -> DiffSummary {
        let mut summary = self.diff.summary();
        summary.aligns = self.aligns();
        (summary.unified_total, summary.unified_hunks) = unified::layout(self.visible_iter());
        summary.minor = self.minor_causes();
        if let Some(view) = &self.view {
            // The different rows are always visible and a block stays contiguous: it is enough to shift it.
            summary.total_rows = view.len();
            for hunk in &mut summary.hunks {
                let at = view.binary_search(&hunk.start).unwrap_or_else(|p| p);
                hunk.end = at + (hunk.end - hunk.start);
                hunk.start = at;
            }
        }
        summary
    }

    /// Whether the two current texts differ only in minor things: `Some` with at least one cause,
    /// even when the rows match but the format (line ending, encoding) does not.
    fn minor_causes(&self) -> Option<MinorCauses> {
        let format = |d: &Document| Format {
            encoding: d.encoding,
            eol: d.eol,
            final_newline: d.ends_with_newline,
        };
        classify_lines(
            &self.left.lines,
            &self.right.lines,
            format(&self.left),
            format(&self.right),
        )
        .filter(MinorCauses::any)
    }

    /// Index (from 0) of the row of the side-by-side view that shows the row `number` (from 1) of the side.
    pub fn row_of_line(&self, side: Side, number: usize) -> Option<usize> {
        let real = self.diff.rows.iter().position(|r| {
            let cell = match side {
                Side::Left => &r.left,
                Side::Right => &r.right,
            };
            cell.as_ref().is_some_and(|c| c.number == number)
        })?;
        // With a filter active the row may be hidden.
        match &self.view {
            None => Some(real),
            Some(view) => view.binary_search(&real).ok(),
        }
    }
}
