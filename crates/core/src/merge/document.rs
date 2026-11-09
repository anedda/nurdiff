//! One of the two files of a comparison: the current rows, those on disk and the original format, and the
//! saving that preserves them (encoding, line ending) without ever leaving a broken file.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use super::SaveError;
use crate::paths::is_null_device;
use crate::text::{
    detect_eol, dominant_eol, encode, eol_str, read_text_file, split_lines, Encoding, Eol,
    TextError,
};

/// The rows of a file, shared (merges and history do not copy them).
pub(super) type Lines = Arc<Vec<Arc<str>>>;

/// Size and modification time of a file, to notice that it changed.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
}

impl Stamp {
    fn of(meta: &fs::Metadata) -> Self {
        Stamp {
            len: meta.len(),
            modified: meta.modified().ok(),
        }
    }
}

/// One of the two files: current rows, rows as they are on disk and original format.
#[derive(Debug, Clone)]
pub struct Document {
    pub path: PathBuf,
    /// It cannot be modified or saved (git temporary file, null device).
    pub read_only: bool,
    pub encoding: Encoding,
    pub eol: Eol,
    dominant_eol: Eol,
    pub(super) ends_with_newline: bool,
    pub(super) lines: Lines,
    saved: Lines,
    stamp: Stamp,
}

impl Document {
    pub fn load(path: &Path) -> Result<Self, TextError> {
        if is_null_device(path) {
            let lines: Lines = Arc::new(Vec::new());
            return Ok(Document {
                path: path.to_path_buf(),
                read_only: true,
                encoding: Encoding::Utf8,
                eol: Eol::None,
                dominant_eol: Eol::Lf,
                ends_with_newline: true,
                saved: Arc::clone(&lines),
                lines,
                stamp: Stamp {
                    len: 0,
                    modified: None,
                },
            });
        }
        let meta = fs::metadata(path).map_err(|source| TextError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        let file = read_text_file(path)?;
        let lines: Lines = Arc::new(split_lines(&file.text).into_iter().map(Arc::from).collect());
        Ok(Document {
            path: path.to_path_buf(),
            read_only: false,
            encoding: file.encoding,
            eol: file.eol,
            dominant_eol: dominant_eol(&file.text),
            // An empty file, to which rows are added, wants them terminated.
            ends_with_newline: file.text.is_empty()
                || file.text.ends_with('\n')
                || file.text.ends_with('\r'),
            saved: Arc::clone(&lines),
            lines,
            stamp: Stamp::of(&meta),
        })
    }

    pub fn len(&self) -> usize {
        self.lines.len()
    }

    pub fn is_empty(&self) -> bool {
        self.lines.is_empty()
    }

    pub fn line(&self, index: usize) -> Option<&str> {
        self.lines.get(index).map(|l| &**l)
    }

    /// There are unsaved changes.
    pub fn is_dirty(&self) -> bool {
        !Arc::ptr_eq(&self.lines, &self.saved) && self.lines != self.saved
    }

    /// Line ending to write the file with: that of the original; if it was mixed the most
    /// frequent; if it had none (a single row) that of the other file, otherwise LF.
    pub(super) fn save_eol(&self, other: &Document) -> Eol {
        match self.eol {
            Eol::Lf | Eol::CrLf | Eol::Cr => self.eol,
            Eol::Mixed => self.dominant_eol,
            Eol::None => match other.eol {
                Eol::Lf | Eol::CrLf | Eol::Cr => other.eol,
                Eol::Mixed => other.dominant_eol,
                Eol::None => Eol::Lf,
            },
        }
    }

    pub(super) fn render(&self, eol: Eol) -> String {
        let nl = eol_str(eol);
        let mut text = String::with_capacity(self.lines.iter().map(|l| l.len() + nl.len()).sum());
        for (i, line) in self.lines.iter().enumerate() {
            if i > 0 {
                text.push_str(nl);
            }
            text.push_str(line);
        }
        if self.ends_with_newline && !self.lines.is_empty() {
            text.push_str(nl);
        }
        text
    }

    pub(super) fn write(&mut self, other: &Document) -> Result<(), SaveError> {
        if self.read_only {
            return Err(SaveError::ReadOnly(self.path.clone()));
        }
        if !self.is_dirty() {
            return Ok(());
        }
        let io_err = |path: &Path, source: io::Error| SaveError::Io {
            path: path.to_path_buf(),
            source,
        };
        let meta = match fs::metadata(&self.path) {
            Ok(meta) => meta,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Err(SaveError::ChangedOnDisk(self.path.clone()))
            }
            Err(e) => return Err(io_err(&self.path, e)),
        };
        if Stamp::of(&meta) != self.stamp {
            return Err(SaveError::ChangedOnDisk(self.path.clone()));
        }

        let text = self.render(self.save_eol(other));
        let bytes = encode(&text, self.encoding).map_err(|error| SaveError::Encode {
            path: self.path.clone(),
            error,
        })?;

        // It writes to a temporary file next to the original and then renames it:
        // an error halfway never leaves a broken file. A symbolic link is
        // followed, so the real file is updated and not the link.
        let real = fs::canonicalize(&self.path).map_err(|e| io_err(&self.path, e))?;
        let name = real.file_name().map(|n| n.to_string_lossy().into_owned());
        let tmp = real.with_file_name(format!(".{}.nurdiff-tmp", name.unwrap_or_default()));
        let result = fs::write(&tmp, &bytes)
            .and_then(|_| fs::set_permissions(&tmp, meta.permissions()))
            .and_then(|_| fs::rename(&tmp, &real));
        if let Err(e) = result {
            let _ = fs::remove_file(&tmp);
            return Err(io_err(&self.path, e));
        }

        let new_meta = fs::metadata(&real).map_err(|e| io_err(&self.path, e))?;
        self.stamp = Stamp::of(&new_meta);
        self.saved = Arc::clone(&self.lines);
        self.eol = detect_eol(&text);
        Ok(())
    }
}
