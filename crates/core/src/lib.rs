//! The NurDiff engine: no dependency on the UI, so it can be used both by the CLI
//! and by the Tauri app (and tested in isolation).
//!
//! The modules are internal to the crate; whoever uses it finds types and functions re-exported below, at the root. Where things are:
//!
//! - `config`: the files of the user's configuration (`~/.nurdiff`)
//! - `text`: reading text files (encoding, line ending, lines)
//! - `diff`: line-by-line comparison (Myers) and side-by-side rows
//! - `dir`: recursive comparison of directories
//! - `inline`: changed parts inside a line
//! - `minor`: minor differences (line ending, trailing spaces, case, encoding)
//! - `merge`: block merge (copying a difference from one side to the other) and saving
//! - `paths`: type of a path (file, folder, …)
//! - `report`: report of a comparison (unified diff, HTML)
//! - `search`: where a text appears in the lines of a side
//! - `store`: store of the open comparisons, to serve the rows in blocks
//! - `unified`: the rows of a comparison in a single list (unified view)

pub(crate) mod anchors;
pub(crate) mod coded;
pub(crate) mod config;
pub(crate) mod diff;
pub(crate) mod dir;
pub(crate) mod filter;
pub(crate) mod gitconfig;
pub(crate) mod inline;
pub(crate) mod launch;
pub(crate) mod merge;
pub(crate) mod minor;
pub(crate) mod paths;
pub(crate) mod report;
pub(crate) mod search;
pub(crate) mod store;
pub(crate) mod text;
pub(crate) mod unified;

use std::path::Path;

use serde::Serialize;

pub use coded::{Coded, CodedError};
pub use config::{
    backup_config_file, config_dir, load_config, save_config, ConfigError, ConfigFile,
};
pub use diff::{
    compute_hunks, diff_lines, diff_lines_aligned, edits_with_algorithm, max_line_width, Algorithm,
    Cell, DiffOptions, DiffStats, Edit, Hunk, HunkKind, Row, RowKind, Whitespace,
};
pub use dir::{
    compare_dirs, compare_dirs_cancellable, compare_entry, compare_entry_cancellable, dir_size,
    list_directory, scan_dirs, DirDiff, DirEntryDiff, DirListing, DirOptions, DirScan, DirStats,
    EntryKind, EntryStatus, NotADirectory,
};
pub use filter::{extension, parse_ext_list, ExtFilter};
pub use gitconfig::{
    cli_name, command_for, remove as remove_git_config, setup as setup_git_config,
    status as git_config_status, GitChange, GitConfigError, GitSetup, GitStatus,
};
pub use inline::{inline_marks, Mark};
pub use launch::{parse_launch_args, parse_merge_args, LaunchError, LaunchRequest};
pub use merge::{
    ConflictSession, ConflictView, Document, MergeDirection, MergeError, Resolution, RowFilter,
    SaveError, SegmentView, Session, Side, FILTER_CONTEXT,
};
pub use minor::{classify_files, classify_lines, classify_texts, Format, MinorCauses};
pub use paths::{is_null_device, path_kind, PathKind};
pub use report::{file_report, visible_rows, ReportFormat, ReportLabels, ReportOptions};
pub use search::{SearchHit, SearchResult, MAX_HITS};
pub use store::{DiffStore, OpenedDiff, StoreError, MAX_SLICE};
use text::find_too_large;
pub use text::{
    decode, encode, read_text_file, split_lines, EncodeError, Encoding, Eol, TextError, TextFile,
    MAX_TEXT_BYTES,
};
pub use unified::{UnifiedKind, UnifiedRow, UnifiedSpan};

/// Information about one of the two compared files.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub encoding: Encoding,
    pub eol: Eol,
    pub lines: usize,
}

/// Result of the comparison of two text files.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    /// True if the lines match according to the options (encoding and line ending may differ).
    pub identical: bool,
    pub rows: Vec<Row>,
    pub stats: DiffStats,
    /// The search for the smallest diff hit its limit (`diff::MAX_ROUNDS`): the diff is correct, but it may
    /// have more changed lines than the minimum.
    #[serde(skip_serializing_if = "diff::is_false")]
    pub approximate: bool,
    pub left: FileInfo,
    pub right: FileInfo,
    /// Options used for the comparison: they are also needed by the diff inside the lines.
    #[serde(skip)]
    pub options: DiffOptions,
}

/// Everything needed to open the view of a comparison, without the rows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    pub identical: bool,
    pub total_rows: usize,
    pub stats: DiffStats,
    /// See [`FileDiff::approximate`].
    #[serde(skip_serializing_if = "diff::is_false")]
    pub approximate: bool,
    pub left: FileInfo,
    pub right: FileInfo,
    /// Blocks of differences, in order of position.
    pub hunks: Vec<Hunk>,
    /// Width of the longest line, in characters.
    pub max_width: usize,
    /// Fixed points set by hand: pairs (left row, right row), from 1. They are filled in by
    /// `Session::summary`.
    pub aligns: Vec<[usize; 2]>,
    /// Rows of the unified view and position of each block in that list. They are filled in by
    /// `Session::summary`.
    pub unified_total: usize,
    pub unified_hunks: Vec<unified::UnifiedSpan>,
    /// Whether the two texts differ (or are equal according to the options) only in minor things:
    /// line ending, spaces, case, encoding. Filled in by `Session::summary`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minor: Option<MinorCauses>,
}

impl FileDiff {
    /// Summary without the rows (which can be hundreds of thousands).
    pub fn summary(&self) -> DiffSummary {
        DiffSummary {
            identical: self.identical,
            total_rows: self.rows.len(),
            stats: self.stats,
            approximate: self.approximate,
            left: self.left.clone(),
            right: self.right.clone(),
            hunks: compute_hunks(&self.rows),
            max_width: max_line_width(&self.rows),
            aligns: Vec::new(),
            unified_total: 0,
            unified_hunks: Vec::new(),
            minor: None,
        }
    }
}

/// Reads and compares two text files.
pub fn diff_files(left: &Path, right: &Path, opts: &DiffOptions) -> Result<FileDiff, TextError> {
    let l = read_text_file(left)?;
    let r = read_text_file(right)?;
    Ok(diff_texts(&l, &r, opts))
}

/// The rows of [`file_diff_stats`], or why they were not counted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LineCount {
    Lines(DiffStats),
    /// One of the two is not a text file.
    Binary,
    /// One of the two is larger than [`MAX_TEXT_BYTES`]: reading and comparing files of gigabytes would take a
    /// lot of memory and time for one cell.
    TooLarge,
}

/// The equal, modified and one-side-only rows of two text files, without keeping the rows: it is used
/// by the "Differences" column of the folder comparison.
pub fn file_diff_stats(
    left: &Path,
    right: &Path,
    opts: &DiffOptions,
) -> Result<LineCount, TextError> {
    let too_large = find_too_large(&[left, right]).map_err(|(path, source)| TextError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    if too_large.is_some() {
        return Ok(LineCount::TooLarge);
    }
    match diff_files(left, right, opts) {
        Ok(diff) => Ok(LineCount::Lines(diff.stats)),
        Err(TextError::Binary { .. }) => Ok(LineCount::Binary),
        Err(e) => Err(e),
    }
}

/// Compares two texts already read.
pub fn diff_texts(left: &TextFile, right: &TextFile, opts: &DiffOptions) -> FileDiff {
    diff_line_sets(
        &split_lines(&left.text),
        &split_lines(&right.text),
        (left.encoding, left.eol),
        (right.encoding, right.eol),
        opts,
        &[],
    )
}

/// Compares two sets of lines; the encoding and the line ending are only used for the information
/// about the files in the result.
pub(crate) fn diff_line_sets(
    left: &[&str],
    right: &[&str],
    left_format: (Encoding, Eol),
    right_format: (Encoding, Eol),
    opts: &DiffOptions,
    aligns: &[(usize, usize)],
) -> FileDiff {
    let (rows, stats, approximate) = diff::diff_lines_full(left, right, opts, aligns);
    FileDiff {
        identical: stats.is_identical(),
        rows,
        stats,
        approximate,
        left: FileInfo {
            encoding: left_format.0,
            eol: left_format.1,
            lines: left.len(),
        },
        right: FileInfo {
            encoding: right_format.0,
            eol: right_format.1,
            lines: right.len(),
        },
        options: *opts,
    }
}

#[cfg(test)]
mod tests;
