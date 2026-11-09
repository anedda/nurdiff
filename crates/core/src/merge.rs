//! Block merge: copies a difference from one side to the other, with undo and
//! saving that preserves the encoding and line ending of the file.
//!
//! `Session` is the type of this module; the rest lives in its files: `document` (a file and its
//! saving), `view` (the row filter), `aligns` (the fixed points), `edits` (merge, edit,
//! undo, save) and `error`. Every file adds its own methods to `Session` with an `impl`.

use std::path::Path;

use serde::Deserialize;

use crate::diff::DiffOptions;
use crate::text::TextError;
use crate::{diff_line_sets, FileDiff};

mod aligns;
mod conflicts;
mod document;
mod edits;
mod error;
mod view;
pub use conflicts::{ConflictSession, ConflictView, Resolution, SegmentView};
pub use document::Document;
use document::Lines;
pub use error::{MergeError, SaveError};
use view::build_view;
pub use view::{RowFilter, FILTER_CONTEXT};

/// How many operations (merges and line edits) can be undone.
pub const MAX_UNDO: usize = 100;

/// Direction of a merge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MergeDirection {
    /// The difference on the left replaces the one on the right.
    LeftToRight,
    /// The difference on the right replaces the one on the left.
    RightToLeft,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Left,
    Right,
}

/// State before a merge.
#[derive(Debug, Clone)]
struct Snapshot {
    left: Lines,
    right: Lines,
}

/// A comparison of two files that can be worked on: merge blocks, undo, save.
#[derive(Debug)]
pub struct Session {
    options: DiffOptions,
    left: Document,
    right: Document,
    diff: FileDiff,
    history: Vec<Snapshot>,
    revision: u64,
    filter: RowFilter,
    /// Fixed points set by hand (rows from 0, increasing on both sides). Merges, edits
    /// and undo reset them: they shift the row numbers.
    aligns: Vec<(usize, usize)>,
    /// Rows of `diff` that the view shows, if a filter hides some of them.
    view: Option<Vec<usize>>,
}

impl Session {
    pub fn load(left: &Path, right: &Path, options: &DiffOptions) -> Result<Self, TextError> {
        Self::load_read_only(left, right, options, false, false)
    }

    /// Like [`Session::load`], but it can declare one or both sides read-only
    /// (the temporary files git creates for the old version). `/dev/null` always is.
    pub fn load_read_only(
        left: &Path,
        right: &Path,
        options: &DiffOptions,
        left_read_only: bool,
        right_read_only: bool,
    ) -> Result<Self, TextError> {
        let mut left = Document::load(left)?;
        let mut right = Document::load(right)?;
        left.read_only |= left_read_only;
        right.read_only |= right_read_only;
        let diff = build_diff(&left, &right, options, &[]);
        Ok(Session {
            options: *options,
            left,
            right,
            diff,
            history: Vec::new(),
            revision: 0,
            filter: RowFilter::All,
            aligns: Vec::new(),
            view: None,
        })
    }

    /// The complete comparison, without a filter (used by the report and the merges).
    pub fn diff(&self) -> &FileDiff {
        &self.diff
    }

    pub fn document(&self, side: Side) -> &Document {
        match side {
            Side::Left => &self.left,
            Side::Right => &self.right,
        }
    }

    /// Changes at every merge or undo: the UI notices and reloads the rows.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn can_undo(&self) -> bool {
        !self.history.is_empty()
    }

    /// After a change to the files: the fixed points are no longer valid and are reset.
    fn rebuild(&mut self) {
        self.aligns.clear();
        self.recompute();
    }

    fn recompute(&mut self) {
        self.diff = build_diff(&self.left, &self.right, &self.options, &self.aligns);
        self.view = build_view(&self.diff.rows, self.filter);
        self.revision += 1;
    }
}

fn build_diff(
    left: &Document,
    right: &Document,
    opts: &DiffOptions,
    aligns: &[(usize, usize)],
) -> FileDiff {
    let l: Vec<&str> = left.lines.iter().map(|s| &**s).collect();
    let r: Vec<&str> = right.lines.iter().map(|s| &**s).collect();
    diff_line_sets(
        &l,
        &r,
        (left.encoding, left.eol),
        (right.encoding, right.eol),
        opts,
        aligns,
    )
}

#[cfg(test)]
mod tests;
