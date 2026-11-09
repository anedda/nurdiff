use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, SystemTime};

use crate::detect::kind_of;
use crate::error::ArchiveError;
use crate::extract::{extract, Limits};

/// What the caller wants the path to be: the commands on folders want a folder (an archive is opened), the ones
/// on files want a file (an archive is a file that cannot be compared line by line).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Want {
    File,
    Dir,
}

/// A path ready to be used by the code that reads the disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    pub path: PathBuf,
    /// The path is inside an extracted archive: whoever shows or saves it must treat it as read only.
    pub in_archive: bool,
    /// Entries of the archives involved that were not extracted (links, unsafe or duplicate names).
    pub skipped: usize,
}

/// How an archive looked when it was extracted: if it changes, it is extracted again.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
}

struct Cached {
    stamp: Stamp,
    dir: PathBuf,
    skipped: usize,
}

/// The archives extracted so far, in a temporary folder of their own. One per process.
pub struct ArchiveCache {
    root: PathBuf,
    next: AtomicU64,
    limits: Limits,
    done: Mutex<HashMap<PathBuf, Cached>>,
}

/// Archives inside archives are opened one level at a time, up to this deep.
const MAX_DEPTH: usize = 8;

const PREFIX: &str = "nurdiff-archives-";

impl ArchiveCache {
    /// A cache in `<temporary folder>/nurdiff-archives-<process id>`, created when the first archive is opened.
    pub fn new() -> Self {
        let root = std::env::temp_dir().join(format!("{PREFIX}{}", std::process::id()));
        Self::with_root(root, Limits::default())
    }

    pub fn with_root(root: PathBuf, limits: Limits) -> Self {
        ArchiveCache {
            root,
            next: AtomicU64::new(0),
            limits,
            done: Mutex::new(HashMap::new()),
        }
    }

    /// Turns `path` into one that exists on the disk. A path that goes through an archive file
    /// (`release.zip/docs/a.txt`) becomes the one of the extracted copy; with [`Want::Dir`] an archive file itself
    /// becomes the folder it was extracted to. Any other path is returned as it is, also if it does not exist:
    /// the caller reports that in its own way.
    pub fn resolve(&self, path: &Path, want: Want) -> Result<Resolved, ArchiveError> {
        let mut current = path.to_path_buf();
        let mut resolved = Resolved {
            path: current.clone(),
            in_archive: false,
            skipped: 0,
        };
        for _ in 0..MAX_DEPTH {
            let archive = if !current.exists() {
                // A path below an archive file: the nearest existing ancestor is that file.
                match archive_ancestor(&current) {
                    Some(found) => found,
                    None => break,
                }
            } else if want == Want::Dir && current.is_file() && kind_of(&current).is_some() {
                (current.clone(), PathBuf::new())
            } else {
                break;
            };
            let (archive_file, rest) = archive;
            let (dir, skipped) = self.extracted(&archive_file)?;
            current = dir.join(rest);
            resolved.in_archive = true;
            resolved.skipped += skipped;
        }
        resolved.path = current;
        Ok(resolved)
    }

    /// The folder `archive` is extracted to (extracting it first if needed) and how many entries were skipped.
    fn extracted(&self, archive: &Path) -> Result<(PathBuf, usize), ArchiveError> {
        let kind = kind_of(archive).ok_or_else(|| {
            ArchiveError::corrupt(archive, "it does not look like a supported archive")
        })?;
        let meta = fs::metadata(archive).map_err(|e| ArchiveError::io(archive, e))?;
        let stamp = Stamp {
            len: meta.len(),
            modified: meta.modified().ok(),
        };
        let key = fs::canonicalize(archive).unwrap_or_else(|_| archive.to_path_buf());
        // The lock is held while extracting: two requests for the same archive extract it once.
        let mut done = self.done.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(c) = done.get(&key) {
            if c.stamp == stamp {
                return Ok((c.dir.clone(), c.skipped));
            }
        }
        if let Some(old) = done.remove(&key) {
            let _ = fs::remove_dir_all(old.dir);
        }
        let dir = self
            .root
            .join(self.next.fetch_add(1, Ordering::Relaxed).to_string());
        fs::create_dir_all(&dir).map_err(|e| ArchiveError::io(&dir, e))?;
        match extract(archive, kind, &dir, &self.limits) {
            Ok(result) => {
                let skipped = result.skipped.len();
                done.insert(
                    key,
                    Cached {
                        stamp,
                        dir: dir.clone(),
                        skipped,
                    },
                );
                Ok((dir, skipped))
            }
            Err(e) => {
                let _ = fs::remove_dir_all(&dir);
                Err(e)
            }
        }
    }

    /// Deletes everything this cache extracted (at the end of the program).
    pub fn purge(&self) {
        self.done
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clear();
        let _ = fs::remove_dir_all(&self.root);
    }

    /// Deletes the folders of earlier runs that were left behind (the program was killed): the ones in `parent` named
    /// like ours, other than the one of this process, not touched for `older_than`.
    pub fn purge_stale(parent: &Path, older_than: Duration) {
        let mine = format!("{PREFIX}{}", std::process::id());
        let Ok(entries) = fs::read_dir(parent) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if !name.starts_with(PREFIX) || name == mine {
                continue;
            }
            let old = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age >= older_than);
            if old {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
}

impl Default for ArchiveCache {
    fn default() -> Self {
        Self::new()
    }
}

/// The nearest existing ancestor of `path` if it is an archive file, with the rest of the path below it.
fn archive_ancestor(path: &Path) -> Option<(PathBuf, PathBuf)> {
    let ancestor = path.ancestors().skip(1).find(|a| a.exists())?;
    if ancestor.is_file() && kind_of(ancestor).is_some() {
        let rest = path.strip_prefix(ancestor).ok()?.to_path_buf();
        Some((ancestor.to_path_buf(), rest))
    } else {
        None
    }
}

#[cfg(test)]
mod tests;
