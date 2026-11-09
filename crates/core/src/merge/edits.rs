//! The operations that change the files of a comparison: merge a block, edit rows, undo, save.
//! The first two enter the same history, which `undo` walks back.

use std::sync::Arc;

use super::{MergeDirection, MergeError, SaveError, Session, Side, Snapshot};
use crate::diff::{compute_hunks, RowKind};

impl Session {
    /// Remembers the two texts before a change, so it can be undone (at most `MAX_UNDO`).
    fn remember(&mut self) {
        self.history.push(Snapshot {
            left: Arc::clone(&self.left.lines),
            right: Arc::clone(&self.right.lines),
        });
        if self.history.len() > super::MAX_UNDO {
            self.history.remove(0);
        }
    }

    /// Copies the difference `hunk` (index in the list of blocks) in the given direction.
    ///
    /// The rows of the block on the destination side are replaced with those of the source
    /// side: if the source side has none, the block is removed from the destination.
    pub fn apply(&mut self, hunk: usize, direction: MergeDirection) -> Result<(), MergeError> {
        let hunks = compute_hunks(&self.diff.rows);
        let h = *hunks.get(hunk).ok_or(MergeError::NoSuchHunk(hunk))?;
        let target = match direction {
            MergeDirection::LeftToRight => Side::Right,
            MergeDirection::RightToLeft => Side::Left,
        };
        if self.document(target).read_only {
            return Err(MergeError::ReadOnly(target));
        }
        let rows = &self.diff.rows;

        // The rows before a block are equal (they have both sides): the number of the
        // row that precedes the block is how many there are before it, on each side.
        let (left_before, right_before) = match h.start.checked_sub(1).map(|i| &rows[i]) {
            Some(prev) => (
                prev.left.as_ref().map_or(0, |c| c.number),
                prev.right.as_ref().map_or(0, |c| c.number),
            ),
            None => (0, 0),
        };
        let block = &rows[h.start..h.end];
        let left_count = block.iter().filter(|r| r.left.is_some()).count();
        let right_count = block.iter().filter(|r| r.right.is_some()).count();

        let (src, src_at, src_n, dst, dst_at, dst_n) = match direction {
            MergeDirection::LeftToRight => (
                &self.left.lines,
                left_before,
                left_count,
                &self.right.lines,
                right_before,
                right_count,
            ),
            MergeDirection::RightToLeft => (
                &self.right.lines,
                right_before,
                right_count,
                &self.left.lines,
                left_before,
                left_count,
            ),
        };
        if src_at + src_n > src.len() || dst_at + dst_n > dst.len() {
            return Err(MergeError::Inconsistent);
        }
        let mut merged: Vec<Arc<str>> = Vec::with_capacity(dst.len() - dst_n + src_n);
        merged.extend_from_slice(&dst[..dst_at]);
        merged.extend_from_slice(&src[src_at..src_at + src_n]);
        merged.extend_from_slice(&dst[dst_at + dst_n..]);

        self.remember();
        match direction {
            MergeDirection::LeftToRight => self.right.lines = Arc::new(merged),
            MergeDirection::RightToLeft => self.left.lines = Arc::new(merged),
        }
        self.rebuild();
        Ok(())
    }

    /// Copies one row, `row` being its index among those the view shows, from one side to the other: a changed
    /// row replaces the line of the destination, a row that exists only on the source side is inserted after the
    /// last destination line above it. A row that is equal, or that exists only on the destination side, has
    /// nothing to copy. It enters the history like any edit. Returns `false` if nothing changed.
    pub fn apply_row(&mut self, row: usize, direction: MergeDirection) -> Result<bool, MergeError> {
        let real = match &self.view {
            Some(view) => *view.get(row).ok_or(MergeError::NoSuchRow(row))?,
            None => row,
        };
        let r = self.diff.rows.get(real).ok_or(MergeError::NoSuchRow(row))?;
        let (from, to) = match direction {
            MergeDirection::LeftToRight => (Side::Left, Side::Right),
            MergeDirection::RightToLeft => (Side::Right, Side::Left),
        };
        let number_of = |r: &crate::diff::Row, side| match side {
            Side::Left => r.left.as_ref().map(|c| c.number),
            Side::Right => r.right.as_ref().map(|c| c.number),
        };
        if r.kind == RowKind::Equal {
            return Err(MergeError::NothingToCopy);
        }
        let number = number_of(r, from).ok_or(MergeError::NothingToCopy)?;
        let line = self
            .document(from)
            .lines
            .get(number - 1)
            .ok_or(MergeError::Inconsistent)?
            .to_string();
        let (start, remove) = match number_of(r, to) {
            Some(n) => (n - 1, 1),
            // The destination has no line here: it goes after the last one above (0 = at the top).
            None => (
                self.diff.rows[..real]
                    .iter()
                    .rev()
                    .find_map(|r| number_of(r, to))
                    .unwrap_or(0),
                0,
            ),
        };
        self.edit_lines(to, start, remove, &[line])
    }

    /// Copies a block of rows (indexes among those the view shows, in either order) from one side to the other: the
    /// lines the destination has in those rows are replaced by the lines the source has there, so the region becomes
    /// equal to the source one (what a merge of a difference does, and so it also removes the lines only the destination
    /// has). If the destination has no line there, they go after the last one above. Returns `false` if nothing changed;
    /// it is an error if the source has no line in those rows.
    pub fn apply_rows(
        &mut self,
        first: usize,
        last: usize,
        direction: MergeDirection,
    ) -> Result<bool, MergeError> {
        let real = |row: usize| -> Result<usize, MergeError> {
            let index = match &self.view {
                Some(view) => *view.get(row).ok_or(MergeError::NoSuchRow(row))?,
                None => row,
            };
            if index < self.diff.rows.len() {
                Ok(index)
            } else {
                Err(MergeError::NoSuchRow(row))
            }
        };
        let (a, b) = (real(first.min(last))?, real(first.max(last))?);
        let (from, to) = match direction {
            MergeDirection::LeftToRight => (Side::Left, Side::Right),
            MergeDirection::RightToLeft => (Side::Right, Side::Left),
        };
        let number_of = |r: &crate::diff::Row, side| match side {
            Side::Left => r.left.as_ref().map(|c| c.number),
            Side::Right => r.right.as_ref().map(|c| c.number),
        };
        let rows = &self.diff.rows[a..=b];
        // The lines of each side in these rows are consecutive: first and last number are enough.
        let range = |side| {
            let numbers: Vec<usize> = rows.iter().filter_map(|r| number_of(r, side)).collect();
            numbers
                .first()
                .zip(numbers.last())
                .map(|(lo, hi)| (*lo, *hi))
        };
        let (src_lo, src_hi) = range(from).ok_or(MergeError::NothingToCopy)?;
        let lines: Vec<String> = (src_lo..=src_hi)
            .map(|n| {
                self.document(from)
                    .lines
                    .get(n - 1)
                    .map(|l| l.to_string())
                    .ok_or(MergeError::Inconsistent)
            })
            .collect::<Result<_, _>>()?;
        let (start, remove) = match range(to) {
            Some((lo, hi)) => (lo - 1, hi - lo + 1),
            // The destination has no line here: it goes after the last one above (0 = at the top).
            None => (
                self.diff.rows[..a]
                    .iter()
                    .rev()
                    .find_map(|r| number_of(r, to))
                    .unwrap_or(0),
                0,
            ),
        };
        self.edit_lines(to, start, remove, &lines)
    }

    /// Replaces `remove` rows starting from the row `start` (index from 0) of the side `side` with
    /// `lines`. With `remove` at 0 it inserts, with `lines` empty it deletes. It enters the same
    /// history as the merges, so it is undone with [`Session::undo`]. Returns `false`,
    /// without touching anything, if the result would be the same as before.
    pub fn edit_lines(
        &mut self,
        side: Side,
        start: usize,
        remove: usize,
        lines: &[String],
    ) -> Result<bool, MergeError> {
        if self.document(side).read_only {
            return Err(MergeError::ReadOnly(side));
        }
        if lines.iter().any(|l| l.contains(['\n', '\r'])) {
            return Err(MergeError::LineBreakInLine);
        }
        let current = &self.document(side).lines;
        let end = start.checked_add(remove).ok_or(MergeError::NoSuchLines)?;
        if end > current.len() {
            return Err(MergeError::NoSuchLines);
        }
        if current[start..end]
            .iter()
            .map(|l| &**l)
            .eq(lines.iter().map(|l| l.as_str()))
        {
            return Ok(false);
        }
        let mut next: Vec<Arc<str>> = Vec::with_capacity(current.len() - remove + lines.len());
        next.extend_from_slice(&current[..start]);
        next.extend(lines.iter().map(|l| Arc::from(l.as_str())));
        next.extend_from_slice(&current[end..]);

        self.remember();
        match side {
            Side::Left => self.left.lines = Arc::new(next),
            Side::Right => self.right.lines = Arc::new(next),
        }
        self.rebuild();
        Ok(true)
    }

    /// Undoes the last merge.
    pub fn undo(&mut self) -> Result<(), MergeError> {
        let snapshot = self.history.pop().ok_or(MergeError::NothingToUndo)?;
        self.left.lines = snapshot.left;
        self.right.lines = snapshot.right;
        self.rebuild();
        Ok(())
    }

    /// Saves a side to its file. Without changes it does nothing.
    pub fn save(&mut self, side: Side) -> Result<(), SaveError> {
        match side {
            Side::Left => self.left.write(&self.right)?,
            Side::Right => self.right.write(&self.left)?,
        }
        self.diff.left.eol = self.left.eol;
        self.diff.right.eol = self.right.eol;
        Ok(())
    }
}
