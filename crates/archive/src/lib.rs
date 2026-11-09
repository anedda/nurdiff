//! Archives as folders: zip (and the zip-based `.jar`, `.apk`, `.epub`), `.tar`, `.tar.gz` and `.tgz`.
//!
//! NurDiff compares folders, not archives. This crate extracts an archive into a temporary folder, read only as far as
//! NurDiff is concerned, so that every comparison of folders and files works on it unchanged. The path of a file
//! inside an archive is written as if the archive were a folder (`release.zip/docs/readme.txt`):
//! [`ArchiveCache::resolve`] turns it into the path of the extracted copy.
//!
//! Archives come from anywhere, so extraction is defensive: names that would leave the destination are skipped,
//! links are not created, and the size, the number of entries and the compression ratio are limited ([`Limits`]).

mod cache;
mod detect;
mod error;
mod extract;
mod safe;
#[cfg(test)]
mod test_support;

pub use cache::{ArchiveCache, Resolved, Want};
pub use detect::{kind_of, Kind};
pub use error::ArchiveError;
pub use extract::{extract, Extraction, Limits, SkipReason, Skipped};
