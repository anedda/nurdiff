//! Recursive comparison of two directories.
//!
//! For each entry the type is compared first, then (for files) the size, and only
//! if it matches the content, read in blocks. Symbolic links are not followed:
//! their targets are compared.

use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::filter::ExtFilter;
use crate::minor::{classify_files, MinorCauses};

/// Options of the folder comparison. In Phase 3: ignore case in names, Unicode
/// normalization, respect for `.gitignore`.
#[derive(Debug, Clone, Default)]
pub struct DirOptions {
    /// Which files to compare, by extension. Files that do not pass are treated as if they were not there
    /// (they do not even count as "only on the left"), and folders that end up empty disappear.
    pub filter: ExtFilter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    File,
    Dir,
    Symlink,
    /// Sockets, FIFOs, devices: they are not read.
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryStatus {
    Identical,
    Different,
    LeftOnly,
    RightOnly,
    /// For example a file on one side and a directory on the other.
    TypeMismatch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryDiff {
    /// Relative path with `/` as separator on every system.
    pub path: String,
    pub status: EntryStatus,
    pub left_kind: Option<EntryKind>,
    pub right_kind: Option<EntryKind>,
    pub left_size: Option<u64>,
    pub right_size: Option<u64>,
    /// Modification time in milliseconds since 1970 (for files and folders; not for links).
    pub left_modified: Option<i64>,
    pub right_modified: Option<i64>,
    /// Only for `Different` files: present if the difference is only minor (line ending, spaces,
    /// case, encoding), with the causes. Folders do not have it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minor: Option<MinorCauses>,
    /// The entry could not be read (a folder without permission, a file that vanished while it was compared):
    /// the system text. The entry is `Different` (or one side only) and a folder has no children; the rest of
    /// the comparison goes on.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirStats {
    pub identical: usize,
    pub different: usize,
    /// Among the `different` ones, those with only minor differences.
    pub minor: usize,
    pub left_only: usize,
    pub right_only: usize,
    pub type_mismatch: usize,
}

impl DirStats {
    /// Counts the entries, excluding the directories present on both sides
    /// (their status only summarizes that of their children), unless they could not be read.
    fn from_entries(entries: &[DirEntryDiff]) -> Self {
        let mut stats = DirStats::default();
        for e in entries {
            if e.left_kind == Some(EntryKind::Dir)
                && e.right_kind == Some(EntryKind::Dir)
                && e.error.is_none()
            {
                continue;
            }
            match e.status {
                EntryStatus::Identical => stats.identical += 1,
                EntryStatus::Different => {
                    stats.different += 1;
                    if e.minor.is_some() {
                        stats.minor += 1;
                    }
                }
                EntryStatus::LeftOnly => stats.left_only += 1,
                EntryStatus::RightOnly => stats.right_only += 1,
                EntryStatus::TypeMismatch => stats.type_mismatch += 1,
            }
        }
        stats
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirDiff {
    /// Flat list in path order: every directory comes before its children.
    pub entries: Vec<DirEntryDiff>,
    pub stats: DirStats,
}

struct Child {
    path: PathBuf,
    kind: EntryKind,
    size: u64,
    modified: Option<i64>,
}

/// The "not a folder" error: it lives inside the `io::Error`, so the UI recognizes and translates it.
#[derive(Debug)]
pub struct NotADirectory(pub PathBuf);

impl std::fmt::Display for NotADirectory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} is not a directory", self.0.display())
    }
}

impl std::error::Error for NotADirectory {}

fn not_a_directory(dir: &Path) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        NotADirectory(dir.to_path_buf()),
    )
}

type Pair = (Option<Child>, Option<Child>);

/// The comparison was cancelled: it lives inside the `io::Error` and goes up to the public functions,
/// which turn it into `Ok(None)`.
#[derive(Debug)]
struct Cancelled;

impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "comparison cancelled")
    }
}

impl std::error::Error for Cancelled {}

fn cancelled_error() -> io::Error {
    io::Error::new(io::ErrorKind::Interrupted, Cancelled)
}

fn is_cancelled(e: &io::Error) -> bool {
    e.get_ref().is_some_and(|inner| inner.is::<Cancelled>())
}

/// Asks whether the comparison must stop; if so, it goes up with the cancellation error.
fn check(cancelled: &dyn Fn() -> bool) -> io::Result<()> {
    if cancelled() {
        Err(cancelled_error())
    } else {
        Ok(())
    }
}

pub fn compare_dirs(left: &Path, right: &Path, opts: &DirOptions) -> io::Result<DirDiff> {
    // Nobody cancels it: `None` cannot come out.
    compare_dirs_cancellable(left, right, opts, &|| false)?.ok_or_else(cancelled_error)
}

/// Like [`compare_dirs`], but `cancelled` is consulted at every entry and at every block read from a
/// file: if it becomes true the comparison stops and the result is `None` (no partial results).
pub fn compare_dirs_cancellable(
    left: &Path,
    right: &Path,
    opts: &DirOptions,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<Option<DirDiff>> {
    for dir in [left, right] {
        if !dir.is_dir() {
            return Err(not_a_directory(dir));
        }
    }
    let mut entries = Vec::new();
    let filter = opts.filter.normalized();
    match walk(
        Some(left),
        Some(right),
        "",
        &filter,
        &mut entries,
        cancelled,
    ) {
        Ok(_) => {}
        Err(e) if is_cancelled(&e) => return Ok(None),
        Err(e) => return Err(e),
    }
    let stats = DirStats::from_entries(&entries);
    Ok(Some(DirDiff { entries, stats }))
}

/// An entry in the listing of a folder (without any comparison).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    /// Modification time in milliseconds since 1970.
    pub modified: Option<i64>,
}

/// Lists only the first level of a folder: subfolders first, then files, each
/// group in alphabetical order (ignoring case). It is used to show the contents
/// of a folder before comparing it. The filter removes the files that do not pass; the folders
/// all stay, because knowing whether they are empty would mean visiting them.
pub fn list_directory(dir: &Path, filter: &ExtFilter) -> io::Result<Vec<DirListing>> {
    if !dir.is_dir() {
        return Err(not_a_directory(dir));
    }
    let filter = filter.normalized();
    let mut out: Vec<DirListing> = list_dir(dir)?
        .into_iter()
        .filter(|(name, c)| c.kind == EntryKind::Dir || filter.accepts(name))
        .map(|(name, c)| DirListing {
            name,
            kind: c.kind,
            size: c.size,
            modified: c.modified,
        })
        .collect();
    out.sort_by(|a, b| {
        (a.kind != EntryKind::Dir)
            .cmp(&(b.kind != EntryKind::Dir))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(out)
}

/// Sum of the sizes of the files contained in a folder, at any depth (apparent
/// size, not disk space). The operating system does not keep this figure: it is obtained
/// by visiting the folder. Symbolic links are not followed and do not count; a file with several hard links
/// counts only once (on Unix); unreadable subfolders are skipped, while if the folder itself
/// cannot be read it is an error. `cancelled` is consulted at every folder: if it becomes true the
/// visit stops and the result is `None`.
pub fn dir_size(root: &Path, cancelled: &dyn Fn() -> bool) -> io::Result<Option<u64>> {
    if !root.is_dir() {
        return Err(not_a_directory(root));
    }
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    #[cfg(unix)]
    let mut seen = std::collections::HashSet::new();
    let mut first = true;
    while let Some(dir) = stack.pop() {
        if cancelled() {
            return Ok(None);
        }
        let entries = if first {
            fs::read_dir(&dir)?
        } else {
            match fs::read_dir(&dir) {
                Ok(e) => e,
                Err(_) => continue,
            }
        };
        first = false;
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            let kind = meta.file_type();
            if kind.is_dir() {
                stack.push(path);
            } else if kind.is_file() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if meta.nlink() > 1 && !seen.insert((meta.dev(), meta.ino())) {
                        continue;
                    }
                }
                total += meta.len();
            }
        }
    }
    Ok(Some(total))
}

/// The result of [`scan_dirs`]: how many entries the two trees have, counted like [`DirStats`] but without
/// reading the contents of the files.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirScan {
    pub left_only: usize,
    pub right_only: usize,
    pub type_mismatch: usize,
    /// Pairs of regular files present on both sides: these are the ones a comparison would have to
    /// read to say whether they are equal or different.
    pub file_pairs: usize,
    /// Entries visited (folders included, also those present on both sides).
    pub visited: usize,
    /// The visit stopped at the entry limit: the counts are partial.
    pub truncated: bool,
}

impl DirScan {
    /// The entries that count for [`DirStats`] (folders present on both sides do not count).
    fn counted(&self) -> usize {
        self.left_only + self.right_only + self.type_mismatch + self.file_pairs
    }
}

/// Visits two folders and counts the entries without opening any file: entries present on one side only, of a
/// different type, and the pairs of files still to compare. It follows the same rules as
/// [`compare_dirs`] (extension filter, links not followed, folders without passing files
/// removed), but it is much faster because it does not read the contents. It stops after `limit` visited entries
/// (`truncated`). `cancelled` is consulted at every folder and every entry: if it becomes true the
/// result is `None`.
pub fn scan_dirs(
    left: &Path,
    right: &Path,
    opts: &DirOptions,
    limit: usize,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<Option<DirScan>> {
    for dir in [left, right] {
        if !dir.is_dir() {
            return Err(not_a_directory(dir));
        }
    }
    let filter = opts.filter.normalized();
    let mut scan = DirScan::default();
    match scan_walk(
        Some(left),
        Some(right),
        &filter,
        limit,
        &mut scan,
        cancelled,
    ) {
        Ok(()) => Ok(Some(scan)),
        Err(e) if is_cancelled(&e) => Ok(None),
        Err(e) => Err(e),
    }
}

fn scan_walk(
    left: Option<&Path>,
    right: Option<&Path>,
    filter: &ExtFilter,
    limit: usize,
    scan: &mut DirScan,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<()> {
    check(cancelled)?;
    let mut merged: BTreeMap<String, Pair> = BTreeMap::new();
    let passes = |name: &str, child: &Child| child.kind == EntryKind::Dir || filter.accepts(name);
    if let Some(dir) = left {
        for (name, child) in list_dir(dir)? {
            if passes(&name, &child) {
                merged.entry(name).or_default().0 = Some(child);
            }
        }
    }
    if let Some(dir) = right {
        for (name, child) in list_dir(dir)? {
            if passes(&name, &child) {
                merged.entry(name).or_default().1 = Some(child);
            }
        }
    }
    for (_name, (l, r)) in merged {
        check(cancelled)?;
        if scan.visited >= limit {
            scan.truncated = true;
            return Ok(());
        }
        scan.visited += 1;
        match (l, r) {
            (Some(l), None) => {
                scan.left_only += 1;
                if l.kind == EntryKind::Dir {
                    let before = scan.counted();
                    let read = scan_sub(Some(&l.path), None, filter, limit, scan, cancelled)?;
                    // Like `drop_if_empty`: with a filter, a folder without passing files is not there.
                    if read && filter.is_active() && scan.counted() == before {
                        scan.left_only -= 1;
                    }
                }
            }
            (None, Some(r)) => {
                scan.right_only += 1;
                if r.kind == EntryKind::Dir {
                    let before = scan.counted();
                    let read = scan_sub(None, Some(&r.path), filter, limit, scan, cancelled)?;
                    if read && filter.is_active() && scan.counted() == before {
                        scan.right_only -= 1;
                    }
                }
            }
            (Some(l), Some(r)) if l.kind == EntryKind::Dir && r.kind == EntryKind::Dir => {
                // Unreadable, it counts for nothing: what it holds is not known until it is compared.
                scan_sub(Some(&l.path), Some(&r.path), filter, limit, scan, cancelled)?;
            }
            (Some(l), Some(r)) => {
                if l.kind != r.kind {
                    scan.type_mismatch += 1;
                } else if l.kind == EntryKind::File {
                    scan.file_pairs += 1;
                }
            }
            (None, None) => {}
        }
    }
    Ok(())
}

/// Visits a subfolder like [`compare_dirs`] does: one that cannot be read counts as empty (`false`) and the visit
/// goes on; only a cancellation goes up.
fn scan_sub(
    left: Option<&Path>,
    right: Option<&Path>,
    filter: &ExtFilter,
    limit: usize,
    scan: &mut DirScan,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<bool> {
    match scan_walk(left, right, filter, limit, scan, cancelled) {
        Ok(()) => Ok(true),
        Err(e) if is_cancelled(&e) => Err(e),
        Err(_) => Ok(false),
    }
}

/// The entries of a folder. Only an unreadable folder is an error: an entry that vanishes while it is read is
/// left out, and one whose details cannot be read has no size or date.
fn list_dir(dir: &Path) -> io::Result<Vec<(String, Child)>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)? {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let kind = if file_type.is_symlink() {
            EntryKind::Symlink
        } else if file_type.is_dir() {
            EntryKind::Dir
        } else if file_type.is_file() {
            EntryKind::File
        } else {
            EntryKind::Other
        };
        let (size, modified) = match kind {
            EntryKind::File | EntryKind::Dir => match entry.metadata() {
                Ok(meta) => (
                    if kind == EntryKind::File {
                        meta.len()
                    } else {
                        0
                    },
                    millis(&meta),
                ),
                Err(e) if e.kind() == io::ErrorKind::NotFound => continue,
                Err(_) => (0, None),
            },
            _ => (0, None),
        };
        out.push((
            entry.file_name().to_string_lossy().into_owned(),
            Child {
                path: entry.path(),
                kind,
                size,
                modified,
            },
        ));
    }
    Ok(out)
}

/// Compares the contents of two directories (one of them may be missing).
/// Returns `true` if everything they contain is identical.
fn walk(
    left: Option<&Path>,
    right: Option<&Path>,
    prefix: &str,
    filter: &ExtFilter,
    out: &mut Vec<DirEntryDiff>,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<bool> {
    check(cancelled)?;
    let mut merged: BTreeMap<String, Pair> = BTreeMap::new();
    // The filter affects everything that is not a folder, from the same name on both sides.
    let passes = |name: &str, child: &Child| child.kind == EntryKind::Dir || filter.accepts(name);
    if let Some(dir) = left {
        for (name, child) in list_dir(dir)? {
            if passes(&name, &child) {
                merged.entry(name).or_default().0 = Some(child);
            }
        }
    }
    if let Some(dir) = right {
        for (name, child) in list_dir(dir)? {
            if passes(&name, &child) {
                merged.entry(name).or_default().1 = Some(child);
            }
        }
    }

    let mut all_same = true;
    for (name, (l, r)) in merged {
        let rel = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        if !compare_pair(&rel, l, r, filter, out, cancelled)? {
            all_same = false;
        }
    }
    Ok(all_same)
}

/// Compares the two entries that have the same relative path (one may be missing) and adds
/// the results to `out`, children included. `true` if they are identical.
fn compare_pair(
    rel: &str,
    l: Option<Child>,
    r: Option<Child>,
    filter: &ExtFilter,
    out: &mut Vec<DirEntryDiff>,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<bool> {
    check(cancelled)?;
    let idx = out.len();
    match (l, r) {
        (Some(l), None) => {
            out.push(entry(rel, EntryStatus::LeftOnly, Some(&l), None));
            if l.kind == EntryKind::Dir {
                let walked = walk(Some(&l.path), None, rel, filter, out, cancelled);
                if readable(walked, out, idx)?.is_some() && drop_if_empty(out, idx, filter) {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        (None, Some(r)) => {
            out.push(entry(rel, EntryStatus::RightOnly, None, Some(&r)));
            if r.kind == EntryKind::Dir {
                let walked = walk(None, Some(&r.path), rel, filter, out, cancelled);
                if readable(walked, out, idx)?.is_some() && drop_if_empty(out, idx, filter) {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        (Some(l), Some(r)) if l.kind == EntryKind::Dir && r.kind == EntryKind::Dir => {
            // The status of the directory is only known after seeing its children:
            // it is inserted right away (for the order) and corrected afterwards.
            out.push(entry(rel, EntryStatus::Identical, Some(&l), Some(&r)));
            let walked = walk(Some(&l.path), Some(&r.path), rel, filter, out, cancelled);
            let Some(same) = readable(walked, out, idx)? else {
                out[idx].status = EntryStatus::Different;
                return Ok(false);
            };
            if drop_if_empty(out, idx, filter) {
                return Ok(true);
            }
            if !same {
                out[idx].status = EntryStatus::Different;
            }
            Ok(same)
        }
        (Some(l), Some(r)) => {
            let (status, minor, error) = if l.kind != r.kind {
                (EntryStatus::TypeMismatch, None, None)
            } else {
                match same_leaf(&l, &r, cancelled) {
                    Ok(Leaf::Same) => (EntryStatus::Identical, None, None),
                    Ok(Leaf::Minor(c)) => (EntryStatus::Different, Some(c), None),
                    Ok(Leaf::Different) => (EntryStatus::Different, None, None),
                    Err(e) if is_cancelled(&e) => return Err(e),
                    // Unreadable: it cannot be called equal.
                    Err(e) => (EntryStatus::Different, None, Some(e.to_string())),
                }
            };
            let mut e = entry(rel, status, Some(&l), Some(&r));
            e.minor = minor;
            e.error = error;
            out.push(e);
            Ok(status == EntryStatus::Identical)
        }
        (None, None) => Ok(true),
    }
}

/// The outcome of the visit of the folder at `idx`: if it could not be read, the folder keeps the error and loses
/// the children added before it (`None`); a cancellation goes up.
fn readable(
    walked: io::Result<bool>,
    out: &mut Vec<DirEntryDiff>,
    idx: usize,
) -> io::Result<Option<bool>> {
    match walked {
        Ok(same) => Ok(Some(same)),
        Err(e) if is_cancelled(&e) => Err(e),
        Err(e) => {
            out.truncate(idx + 1);
            out[idx].error = Some(e.to_string());
            Ok(None)
        }
    }
}

/// With a filter active, removes from the list the folder at `idx` if nothing is left inside it
/// (no file passed the filter). `true` if it removed it: for whoever is above, it is as if it were not there.
fn drop_if_empty(out: &mut Vec<DirEntryDiff>, idx: usize, filter: &ExtFilter) -> bool {
    if filter.is_active() && out.len() == idx + 1 {
        out.truncate(idx);
        true
    } else {
        false
    }
}

/// An entry on disk as it is now, without following links; `None` if it does not exist.
fn child_at(path: &Path) -> io::Result<Option<Child>> {
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    let ft = meta.file_type();
    let kind = if ft.is_symlink() {
        EntryKind::Symlink
    } else if ft.is_dir() {
        EntryKind::Dir
    } else if ft.is_file() {
        EntryKind::File
    } else {
        EntryKind::Other
    };
    let (size, modified) = match kind {
        EntryKind::File => (meta.len(), millis(&meta)),
        EntryKind::Dir => (0, millis(&meta)),
        _ => (0, None),
    };
    Ok(Some(Child {
        path: path.to_path_buf(),
        kind,
        size,
        modified,
    }))
}

/// Compares again a single entry (and, if it is a folder, everything it contains) of a comparison
/// already done: `rel` is the relative path with `/`. It returns the entries in flat-list order, the
/// entry itself first; empty only if it no longer exists anywhere. A folder that the filter empties is
/// still returned, alone (equal if it is on both sides): the one asked for exists.
pub fn compare_entry(
    left_root: &Path,
    right_root: &Path,
    rel: &str,
    opts: &DirOptions,
) -> io::Result<Vec<DirEntryDiff>> {
    // Nobody cancels it: `None` cannot come out.
    compare_entry_cancellable(left_root, right_root, rel, opts, &|| false)?
        .ok_or_else(cancelled_error)
}

/// Like [`compare_entry`], but `cancelled` is consulted at every entry and at every block read from a
/// file: if it becomes true the comparison stops and the result is `None` (no partial results).
pub fn compare_entry_cancellable(
    left_root: &Path,
    right_root: &Path,
    rel: &str,
    opts: &DirOptions,
    cancelled: &dyn Fn() -> bool,
) -> io::Result<Option<Vec<DirEntryDiff>>> {
    let join = |root: &Path| {
        rel.split('/')
            .filter(|p| !p.is_empty())
            .fold(root.to_path_buf(), |p, part| p.join(part))
    };
    let mut out = Vec::new();
    let (l, r) = (child_at(&join(left_root))?, child_at(&join(right_root))?);
    let alone = match (&l, &r) {
        (Some(_), Some(_)) => Some(EntryStatus::Identical),
        (Some(_), None) => Some(EntryStatus::LeftOnly),
        (None, Some(_)) => Some(EntryStatus::RightOnly),
        (None, None) => None,
    }
    .map(|status| entry(rel, status, l.as_ref(), r.as_ref()));
    match compare_pair(rel, l, r, &opts.filter.normalized(), &mut out, cancelled) {
        Ok(_) if out.is_empty() => Ok(Some(alone.into_iter().collect())),
        Ok(_) => Ok(Some(out)),
        Err(e) if is_cancelled(&e) => Ok(None),
        Err(e) => Err(e),
    }
}

fn entry(
    path: &str,
    status: EntryStatus,
    left: Option<&Child>,
    right: Option<&Child>,
) -> DirEntryDiff {
    let size = |c: Option<&Child>| c.filter(|c| c.kind == EntryKind::File).map(|c| c.size);
    DirEntryDiff {
        path: path.to_string(),
        status,
        left_kind: left.map(|c| c.kind),
        right_kind: right.map(|c| c.kind),
        left_size: size(left),
        right_size: size(right),
        left_modified: left.and_then(|c| c.modified),
        right_modified: right.and_then(|c| c.modified),
        minor: None,
        error: None,
    }
}

fn millis(meta: &fs::Metadata) -> Option<i64> {
    let t = meta.modified().ok()?;
    Some(match t.duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_millis() as i64,
        Err(e) => -(e.duration().as_millis() as i64),
    })
}

/// Outcome of the comparison of two non-directory entries of the same type.
enum Leaf {
    Same,
    /// Different, but only for minor things (see [`crate::minor`]).
    Minor(MinorCauses),
    Different,
}

/// Comparison of two non-directory entries of the same type. For files: bytes first (which say
/// "equal" without further work); if they differ, the classification stops at the first
/// substantial difference. The size is not enough to say "different": CRLF and LF change the
/// size of a file that is anyway minor.
fn same_leaf(l: &Child, r: &Child, cancelled: &dyn Fn() -> bool) -> io::Result<Leaf> {
    Ok(match l.kind {
        EntryKind::File => {
            if l.size == r.size && files_equal(&l.path, &r.path, cancelled)? {
                Leaf::Same
            } else {
                check(cancelled)?;
                // A file that cannot be read as text simply stays "different".
                match classify_files(&l.path, &r.path).ok().flatten() {
                    Some(causes) => Leaf::Minor(causes),
                    None => Leaf::Different,
                }
            }
        }
        EntryKind::Symlink => {
            if fs::read_link(&l.path)? == fs::read_link(&r.path)? {
                Leaf::Same
            } else {
                Leaf::Different
            }
        }
        EntryKind::Dir | EntryKind::Other => Leaf::Same,
    })
}

fn files_equal(a: &Path, b: &Path, cancelled: &dyn Fn() -> bool) -> io::Result<bool> {
    let mut fa = fs::File::open(a)?;
    let mut fb = fs::File::open(b)?;
    let mut buf_a = vec![0u8; 64 * 1024];
    let mut buf_b = vec![0u8; 64 * 1024];
    loop {
        check(cancelled)?;
        let na = read_full(&mut fa, &mut buf_a)?;
        let nb = read_full(&mut fb, &mut buf_b)?;
        if na != nb || buf_a[..na] != buf_b[..nb] {
            return Ok(false);
        }
        if na == 0 {
            return Ok(true);
        }
    }
}

fn read_full(reader: &mut impl Read, buf: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(filled)
}

#[cfg(test)]
mod tests;
