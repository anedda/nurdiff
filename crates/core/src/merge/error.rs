//! The merge and save errors, with the English text (`Display`) and the code for the UI (`Coded`).

use std::fmt;
use std::io;
use std::path::PathBuf;

use super::Side;
use crate::coded::{Coded, CodedError};
use crate::text::{EncodeError, Encoding};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeError {
    NoSuchHunk(usize),
    /// The row (index among those the view shows) does not exist.
    NoSuchRow(usize),
    /// The row has nothing to copy in that direction: it is equal, or it exists only on the destination side.
    NothingToCopy,
    NothingToUndo,
    /// The destination side is read-only.
    ReadOnly(Side),
    /// The rows do not match the computed blocks (it should not happen).
    Inconsistent,
    /// The range of rows to edit goes outside the file.
    NoSuchLines,
    /// A row contains a line break: every item must be a single row.
    LineBreakInLine,
    /// The fixed point crosses another: the rows would change order on one side.
    AlignCrosses,
}

impl fmt::Display for MergeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MergeError::NoSuchHunk(i) => write!(f, "difference {} does not exist", i + 1),
            MergeError::NoSuchRow(i) => write!(f, "row {} does not exist", i + 1),
            MergeError::NothingToCopy => write!(f, "this row has nothing to copy in that direction"),
            MergeError::NothingToUndo => write!(f, "there is nothing to undo"),
            MergeError::ReadOnly(Side::Left) => write!(f, "the left side is read-only"),
            MergeError::ReadOnly(Side::Right) => write!(f, "the right side is read-only"),
            MergeError::Inconsistent => write!(f, "inconsistent comparison state"),
            MergeError::NoSuchLines => write!(f, "the lines to edit do not exist"),
            MergeError::LineBreakInLine => write!(f, "a line cannot contain a line break"),
            MergeError::AlignCrosses => write!(
                f,
                "this alignment crosses another: the lines would end up in a different order on the two sides. Remove the other one first"
            ),
        }
    }
}

impl Coded for MergeError {
    fn coded(&self) -> CodedError {
        match self {
            MergeError::NoSuchHunk(i) => CodedError::new("err.merge.noSuchHunk").with("n", i + 1),
            MergeError::NoSuchRow(i) => CodedError::new("err.merge.noSuchRow").with("n", i + 1),
            MergeError::NothingToCopy => CodedError::new("err.merge.nothingToCopy"),
            MergeError::NothingToUndo => CodedError::new("err.merge.nothingToUndo"),
            MergeError::ReadOnly(Side::Left) => CodedError::new("err.merge.readOnlyLeft"),
            MergeError::ReadOnly(Side::Right) => CodedError::new("err.merge.readOnlyRight"),
            MergeError::Inconsistent => CodedError::new("err.merge.inconsistent"),
            MergeError::NoSuchLines => CodedError::new("err.merge.noSuchLines"),
            MergeError::LineBreakInLine => CodedError::new("err.merge.lineBreak"),
            MergeError::AlignCrosses => CodedError::new("err.merge.alignCrosses"),
        }
    }
}

impl std::error::Error for MergeError {}

#[derive(Debug)]
pub enum SaveError {
    Io {
        path: PathBuf,
        source: io::Error,
    },
    /// The file was modified (or deleted) by someone else after the comparison.
    ChangedOnDisk(PathBuf),
    ReadOnly(PathBuf),
    Encode {
        path: PathBuf,
        error: EncodeError,
    },
}

impl fmt::Display for SaveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SaveError::Io { path, source } => {
                write!(f, "cannot save {}: {}", path.display(), source)
            }
            SaveError::ChangedOnDisk(path) => write!(
                f,
                "{} changed on disk after the comparison: it was not overwritten. \
                 Compare again to see the current version",
                path.display()
            ),
            SaveError::ReadOnly(path) => write!(f, "{} is read-only", path.display()),
            SaveError::Encode { path, error } => {
                write!(f, "cannot save {}: {}", path.display(), error)
            }
        }
    }
}

impl Coded for SaveError {
    fn coded(&self) -> CodedError {
        match self {
            SaveError::Io { path, source } => CodedError::new("err.save.io")
                .with("path", path.display())
                .with("reason", source),
            SaveError::ChangedOnDisk(path) => {
                CodedError::new("err.save.changed").with("path", path.display())
            }
            SaveError::ReadOnly(path) => {
                CodedError::new("err.save.readOnly").with("path", path.display())
            }
            SaveError::Encode { path, error } => CodedError::new(match error.encoding {
                Encoding::Latin1 => "err.save.encodeLatin1",
                _ => "err.save.encodeOther",
            })
            .with("path", path.display())
            .with("ch", error.ch),
        }
    }
}

impl std::error::Error for SaveError {}
