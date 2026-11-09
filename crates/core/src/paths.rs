//! Type of a path: the UI uses it to understand what was dragged onto the window.

use std::fs;
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PathKind {
    File,
    Dir,
    /// It exists but is neither a file nor a folder (device, socket, …).
    Other,
    /// It does not exist or is not accessible.
    Missing,
}

/// `/dev/null` (or `NUL` on Windows): git passes it in place of the file that does not exist on one side,
/// for an added or deleted file. It is compared as an empty file, read-only.
pub fn is_null_device(path: &Path) -> bool {
    if path == Path::new("/dev/null") {
        return true;
    }
    cfg!(windows)
        && path
            .to_str()
            .is_some_and(|p| p.eq_ignore_ascii_case("nul") || p.eq_ignore_ascii_case("\\\\.\\nul"))
}

/// Classifies a path following symbolic links: a link to a folder
/// is a folder, a broken one is `Missing`.
pub fn path_kind(path: &Path) -> PathKind {
    if is_null_device(path) {
        return PathKind::File;
    }
    match fs::metadata(path) {
        Ok(meta) if meta.is_file() => PathKind::File,
        Ok(meta) if meta.is_dir() => PathKind::Dir,
        Ok(_) => PathKind::Other,
        Err(_) => PathKind::Missing,
    }
}

#[cfg(test)]
mod tests;
