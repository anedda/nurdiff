use std::fmt;
use std::path::{Path, PathBuf};

use nurdiff_core::{Coded, CodedError};

/// Why an archive could not be opened. Whatever is wrong with a single entry is not here: that entry is skipped (see
/// [`crate::Skipped`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveError {
    /// The archive could not be read (permissions, disk).
    Io { path: PathBuf, reason: String },
    /// It is damaged, truncated or not what its name says.
    Corrupt { path: PathBuf, reason: String },
    /// An entry needs a password.
    Encrypted { path: PathBuf },
    /// More than `limit` bytes would be extracted.
    TooLarge { path: PathBuf, limit: u64 },
    /// More than `limit` entries.
    TooManyEntries { path: PathBuf, limit: usize },
    /// It expands far more than any normal archive (a "zip bomb").
    Suspicious { path: PathBuf },
}

impl ArchiveError {
    pub(crate) fn io(path: &Path, e: impl fmt::Display) -> Self {
        ArchiveError::Io {
            path: path.to_path_buf(),
            reason: e.to_string(),
        }
    }

    pub(crate) fn corrupt(path: &Path, e: impl fmt::Display) -> Self {
        ArchiveError::Corrupt {
            path: path.to_path_buf(),
            reason: e.to_string(),
        }
    }
}

/// `1.5 GB`, `64 MB`: a size for the messages.
pub(crate) fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 || value >= 100.0 || (value - value.round()).abs() < 0.05 {
        format!("{} {}", value.round() as u64, UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArchiveError::Io { path, reason } => {
                write!(f, "cannot read the archive {}: {reason}", path.display())
            }
            ArchiveError::Corrupt { path, reason } => {
                write!(
                    f,
                    "{} is damaged or not an archive: {reason}",
                    path.display()
                )
            }
            ArchiveError::Encrypted { path } => {
                write!(
                    f,
                    "{} needs a password, which NurDiff does not support",
                    path.display()
                )
            }
            ArchiveError::TooLarge { path, limit } => write!(
                f,
                "{} would extract to more than {}",
                path.display(),
                human_bytes(*limit)
            ),
            ArchiveError::TooManyEntries { path, limit } => {
                write!(f, "{} has more than {limit} entries", path.display())
            }
            ArchiveError::Suspicious { path } => write!(
                f,
                "{} expands far more than a normal archive: it was not extracted",
                path.display()
            ),
        }
    }
}

impl std::error::Error for ArchiveError {}

impl Coded for ArchiveError {
    fn coded(&self) -> CodedError {
        match self {
            ArchiveError::Io { path, reason } => CodedError::new("err.archive.io")
                .with("path", path.display())
                .with("reason", reason),
            ArchiveError::Corrupt { path, reason } => CodedError::new("err.archive.corrupt")
                .with("path", path.display())
                .with("reason", reason),
            ArchiveError::Encrypted { path } => {
                CodedError::new("err.archive.encrypted").with("path", path.display())
            }
            ArchiveError::TooLarge { path, limit } => CodedError::new("err.archive.tooLarge")
                .with("path", path.display())
                .with("limit", human_bytes(*limit)),
            ArchiveError::TooManyEntries { path, limit } => {
                CodedError::new("err.archive.tooManyEntries")
                    .with("path", path.display())
                    .with("limit", limit)
            }
            ArchiveError::Suspicious { path } => {
                CodedError::new("err.archive.suspicious").with("path", path.display())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_are_written_for_people() {
        assert_eq!(human_bytes(0), "0 B");
        assert_eq!(human_bytes(1023), "1023 B");
        assert_eq!(human_bytes(2 * 1024 * 1024 * 1024), "2 GB");
        assert_eq!(human_bytes(1536 * 1024), "1.5 MB");
        assert_eq!(human_bytes(64 * 1024 * 1024), "64 MB");
    }

    #[test]
    fn errors_carry_a_code_and_their_parameters() {
        let e = ArchiveError::TooLarge {
            path: PathBuf::from("/a.zip"),
            limit: 2 * 1024 * 1024 * 1024,
        }
        .coded();
        assert_eq!(e.code, "err.archive.tooLarge");
        assert_eq!(e.params["limit"], "2 GB");
        assert_eq!(e.params["path"], "/a.zip");
    }
}
