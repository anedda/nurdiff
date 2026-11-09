//! Store of the open comparisons: the UI only receives a summary and asks for the rows in blocks,
//! so a diff of hundreds of thousands of rows does not travel in a single message.
//! Block merges, undo and saving are also run here.

use crate::coded::{Coded, CodedError};
use std::collections::HashMap;
use std::fmt;

use serde::Serialize;

use crate::diff::{Row, RowKind};
use crate::inline::inline_marks;
use crate::merge::{
    ConflictSession, ConflictView, MergeDirection, MergeError, Resolution, RowFilter, SaveError,
    Session, Side,
};
use crate::report::{file_report, ReportFormat, ReportOptions};
use crate::search::SearchResult;
use crate::unified::UnifiedRow;
use crate::DiffSummary;

/// Maximum number of rows returned by a single request.
pub const MAX_SLICE: usize = 5000;

/// Summary of an open comparison, with the identifier to ask for the rows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDiff {
    pub id: u64,
    /// Changes at every merge or undo: the rows already received are no longer valid.
    pub revision: u64,
    pub left_dirty: bool,
    pub right_dirty: bool,
    pub can_undo: bool,
    /// The side cannot be modified (git temporary file or `/dev/null`).
    pub left_read_only: bool,
    pub right_read_only: bool,
    #[serde(flatten)]
    pub summary: DiffSummary,
}

#[derive(Debug)]
pub enum StoreError {
    /// The comparison was closed or never existed.
    Unknown(u64),
    Merge(MergeError),
    Save(SaveError),
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::Unknown(id) => write!(f, "comparison {id} is no longer available"),
            StoreError::Merge(e) => e.fmt(f),
            StoreError::Save(e) => e.fmt(f),
        }
    }
}

impl Coded for StoreError {
    fn coded(&self) -> CodedError {
        match self {
            StoreError::Unknown(id) => CodedError::new("err.store.unknown").with("id", id),
            StoreError::Merge(e) => e.coded(),
            StoreError::Save(e) => e.coded(),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<MergeError> for StoreError {
    fn from(e: MergeError) -> Self {
        StoreError::Merge(e)
    }
}

impl From<SaveError> for StoreError {
    fn from(e: SaveError) -> Self {
        StoreError::Save(e)
    }
}

/// Comparisons kept in memory. It is not thread-safe: the app wraps it in a `Mutex`.
#[derive(Debug, Default)]
pub struct DiffStore {
    next_id: u64,
    sessions: HashMap<u64, Session>,
    /// Files with conflict markers being resolved (`git mergetool`).
    conflicts: HashMap<u64, ConflictSession>,
    /// A file with conflicts was closed before it was finished.
    abandoned_conflicts: bool,
    /// A file with conflicts was opened at least once.
    opened_conflicts: bool,
}

impl DiffStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Keeps the comparison and returns its summary.
    pub fn open(&mut self, session: Session) -> OpenedDiff {
        self.next_id += 1;
        let id = self.next_id;
        let opened = describe(id, &session);
        self.sessions.insert(id, session);
        opened
    }

    fn session(&self, id: u64) -> Result<&Session, StoreError> {
        self.sessions.get(&id).ok_or(StoreError::Unknown(id))
    }

    fn session_mut(&mut self, id: u64) -> Result<&mut Session, StoreError> {
        self.sessions.get_mut(&id).ok_or(StoreError::Unknown(id))
    }

    /// Rows from `start` (included) to `end` (excluded), limited to [`MAX_SLICE`] and to the end of the file.
    pub fn rows(&self, id: u64, start: usize, end: usize) -> Result<Vec<Row>, StoreError> {
        let session = self.session(id)?;
        let diff = session.diff();
        let len = session.visible_len();
        let start = start.min(len);
        let end = end.min(len).min(start.saturating_add(MAX_SLICE)).max(start);
        let mut rows = session.visible_rows(start, end);
        // The diff inside the rows is computed only for those the UI is about to show.
        for row in &mut rows {
            if let (RowKind::Changed, Some(l), Some(r)) = (row.kind, &mut row.left, &mut row.right)
            {
                (l.marks, r.marks) = inline_marks(&l.text, &r.text, &diff.options);
            }
        }
        Ok(rows)
    }

    /// Where `text` appears in the lines of a side of the comparison (see `Session::search`); `None` if cancelled.
    pub fn search(
        &self,
        id: u64,
        side: Side,
        text: &str,
        case_sensitive: bool,
        cancelled: &dyn Fn() -> bool,
    ) -> Result<Option<SearchResult>, StoreError> {
        Ok(self
            .session(id)?
            .search(side, text, case_sensitive, cancelled))
    }

    /// Rows of the unified view from `start` (included) to `end` (excluded), at most [`MAX_SLICE`].
    pub fn unified_rows(
        &self,
        id: u64,
        start: usize,
        end: usize,
    ) -> Result<Vec<UnifiedRow>, StoreError> {
        let end = end.min(start.saturating_add(MAX_SLICE));
        Ok(self.session(id)?.unified_rows(start, end))
    }

    /// Report of the comparison in its current state (including merges not yet saved).
    pub fn report(
        &self,
        id: u64,
        format: ReportFormat,
        options: &ReportOptions,
    ) -> Result<String, StoreError> {
        let session = self.session(id)?;
        let label = |side| session.document(side).path.display().to_string();
        Ok(file_report(
            session.diff(),
            &label(Side::Left),
            &label(Side::Right),
            format,
            options,
        ))
    }

    /// Copies the difference `hunk` in the given direction.
    pub fn apply_hunk(
        &mut self,
        id: u64,
        hunk: usize,
        direction: MergeDirection,
    ) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.apply(hunk, direction)?;
        Ok(describe(id, session))
    }

    /// Copies the row `row` (index among those the view shows) in the given direction (see `Session::apply_row`).
    pub fn apply_row(
        &mut self,
        id: u64,
        row: usize,
        direction: MergeDirection,
    ) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.apply_row(row, direction)?;
        Ok(describe(id, session))
    }

    /// Copies the block of rows `first..=last` (index among those the view shows) in the given direction (see
    /// `Session::apply_rows`).
    pub fn apply_rows(
        &mut self,
        id: u64,
        first: usize,
        last: usize,
        direction: MergeDirection,
    ) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.apply_rows(first, last, direction)?;
        Ok(describe(id, session))
    }

    /// Replaces `remove` rows of the side from `start` with `lines` (see `Session::edit_lines`).
    pub fn edit_lines(
        &mut self,
        id: u64,
        side: Side,
        start: usize,
        remove: usize,
        lines: &[String],
    ) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.edit_lines(side, start, remove, lines)?;
        Ok(describe(id, session))
    }

    /// Changes which rows the comparison shows (all, only the different ones, with context).
    pub fn set_filter(&mut self, id: u64, filter: RowFilter) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.set_filter(filter);
        Ok(describe(id, session))
    }

    /// Places by hand the row `left` of the left side next to the row `right` of the right side (numbers from 1).
    pub fn align(&mut self, id: u64, left: usize, right: usize) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.align(left, right)?;
        Ok(describe(id, session))
    }

    /// Removes the fixed point that goes through the row `left` of the left side; without one, nothing changes.
    pub fn unalign(&mut self, id: u64, left: usize) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.unalign(left);
        Ok(describe(id, session))
    }

    /// Removes all the fixed points.
    pub fn clear_aligns(&mut self, id: u64) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.clear_aligns();
        Ok(describe(id, session))
    }

    /// Index of the row of the view that shows the row `number` (from 1) of the side.
    pub fn locate_line(
        &self,
        id: u64,
        side: Side,
        number: usize,
    ) -> Result<Option<usize>, StoreError> {
        Ok(self.session(id)?.row_of_line(side, number))
    }

    /// Undoes the last merge or edit.
    pub fn undo(&mut self, id: u64) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.undo()?;
        Ok(describe(id, session))
    }

    /// Saves a side to its file.
    pub fn save(&mut self, id: u64, side: Side) -> Result<OpenedDiff, StoreError> {
        let session = self.session_mut(id)?;
        session.save(side)?;
        Ok(describe(id, session))
    }

    /// Frees the memory of a comparison. Closing an unknown id is not an error.
    pub fn release(&mut self, id: u64) {
        self.sessions.remove(&id);
        if let Some(session) = self.conflicts.remove(&id) {
            self.abandoned_conflicts |= session.unresolved() > 0 || session.is_dirty();
        }
    }

    /// Keeps a file with conflicts and returns it as the UI shows it.
    pub fn open_conflicts(&mut self, session: ConflictSession) -> ConflictView {
        self.next_id += 1;
        let id = self.next_id;
        let view = session.view(id);
        self.conflicts.insert(id, session);
        self.opened_conflicts = true;
        view
    }

    fn conflict_session(&mut self, id: u64) -> Result<&mut ConflictSession, StoreError> {
        self.conflicts.get_mut(&id).ok_or(StoreError::Unknown(id))
    }

    /// Chooses what goes in place of the conflict `index` (from 0).
    pub fn resolve_conflict(
        &mut self,
        id: u64,
        index: usize,
        resolution: Resolution,
    ) -> Result<ConflictView, StoreError> {
        let session = self.conflict_session(id)?;
        session.resolve(index, resolution)?;
        Ok(session.view(id))
    }

    pub fn undo_conflicts(&mut self, id: u64) -> Result<ConflictView, StoreError> {
        let session = self.conflict_session(id)?;
        session.undo()?;
        Ok(session.view(id))
    }

    pub fn save_conflicts(&mut self, id: u64) -> Result<ConflictView, StoreError> {
        let session = self.conflict_session(id)?;
        session.save()?;
        Ok(session.view(id))
    }

    /// Some file with conflicts is not finished: a conflict without a choice or a choice not saved, or no file
    /// was ever opened (it could not be read, or the window was closed first). It decides the exit code of the app
    /// launched by `git mergetool`.
    pub fn conflicts_pending(&self) -> bool {
        !self.opened_conflicts
            || self.abandoned_conflicts
            || self
                .conflicts
                .values()
                .any(|s| s.unresolved() > 0 || s.is_dirty())
    }

    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }
}

fn describe(id: u64, session: &Session) -> OpenedDiff {
    OpenedDiff {
        id,
        revision: session.revision(),
        left_dirty: session.document(Side::Left).is_dirty(),
        right_dirty: session.document(Side::Right).is_dirty(),
        can_undo: session.can_undo(),
        left_read_only: session.document(Side::Left).read_only,
        right_read_only: session.document(Side::Right).read_only,
        summary: session.summary(),
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod coded_tests {
    use super::*;
    use crate::coded::Coded;

    #[test]
    fn errors_carry_a_code_and_parameters() {
        let e = StoreError::Merge(MergeError::NoSuchHunk(4));
        assert_eq!(e.coded().code, "err.merge.noSuchHunk");
        assert_eq!(e.coded().params["n"], "5");
        assert_eq!(StoreError::Unknown(7).coded().params["id"], "7");
        let s = StoreError::Save(SaveError::ChangedOnDisk("/x/y".into())).coded();
        assert_eq!(
            (s.code, s.params["path"].as_str()),
            ("err.save.changed", "/x/y")
        );
    }
}
