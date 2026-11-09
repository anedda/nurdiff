use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::detect::Kind;
use crate::error::ArchiveError;
use crate::safe::safe_relative;

/// What an extraction may cost. The defaults protect a machine from an archive made to fill the disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Limits {
    /// Bytes written in total.
    pub max_total_bytes: u64,
    /// Entries (files and folders).
    pub max_entries: usize,
    /// Written bytes per byte of the archive; it only counts once `ratio_floor` bytes have been written, because
    /// a small archive of zeros is harmless.
    pub max_ratio: u64,
    pub ratio_floor: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            max_total_bytes: 2 * 1024 * 1024 * 1024,
            max_entries: 200_000,
            max_ratio: 200,
            ratio_floor: 64 * 1024 * 1024,
        }
    }
}

/// Why an entry was not extracted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    /// Its name would leave the destination, or the system cannot have a file with that name.
    UnsafeName,
    /// A link (symbolic or hard): NurDiff does not follow links.
    Link,
    /// Another entry already has the same name (or, on a system that ignores case, the same name apart from case).
    Duplicate,
    /// Anything else that could not be written (a device, a folder where a file was, …).
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skipped {
    pub name: String,
    pub reason: SkipReason,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Extraction {
    /// Files and folders created.
    pub entries: usize,
    pub skipped: Vec<Skipped>,
}

/// Extracts `archive` (of the given kind) into the existing folder `dest`.
pub fn extract(
    archive: &Path,
    kind: Kind,
    dest: &Path,
    limits: &Limits,
) -> Result<Extraction, ArchiveError> {
    let archive_len = fs::metadata(archive)
        .map_err(|e| ArchiveError::io(archive, e))?
        .len();
    let mut run = Run {
        archive,
        dest,
        limits,
        archive_len,
        written: 0,
        out: Extraction::default(),
    };
    match kind {
        Kind::Zip => run.zip()?,
        Kind::Tar => run.tar(File::open(archive).map_err(|e| ArchiveError::io(archive, e))?)?,
        Kind::TarGz => run.tar(flate2::read::GzDecoder::new(
            File::open(archive).map_err(|e| ArchiveError::io(archive, e))?,
        ))?,
    }
    Ok(run.out)
}

struct Run<'a> {
    archive: &'a Path,
    dest: &'a Path,
    limits: &'a Limits,
    archive_len: u64,
    /// Bytes written so far: counted while writing, not taken from the sizes the archive declares.
    written: u64,
    out: Extraction,
}

impl Run<'_> {
    fn skip(&mut self, name: &str, reason: SkipReason) {
        self.out.skipped.push(Skipped {
            name: name.to_string(),
            reason,
        });
    }

    fn count_entry(&mut self) -> Result<(), ArchiveError> {
        if self.out.entries >= self.limits.max_entries {
            return Err(ArchiveError::TooManyEntries {
                path: self.archive.to_path_buf(),
                limit: self.limits.max_entries,
            });
        }
        self.out.entries += 1;
        Ok(())
    }

    fn make_dir(&mut self, name: &str, rel: &Path) -> Result<(), ArchiveError> {
        self.count_entry()?;
        if fs::create_dir_all(self.dest.join(rel)).is_err() {
            self.out.entries -= 1;
            self.skip(name, SkipReason::Other);
        }
        Ok(())
    }

    /// Writes one file from `reader`, with the checks on size and ratio while it is copied.
    fn write_file(
        &mut self,
        name: &str,
        rel: &Path,
        reader: &mut dyn Read,
        modified: Option<SystemTime>,
    ) -> Result<(), ArchiveError> {
        let target: PathBuf = self.dest.join(rel);
        if let Some(parent) = target.parent() {
            if fs::create_dir_all(parent).is_err() {
                self.skip(name, SkipReason::Other);
                return Ok(());
            }
        }
        // `create_new` refuses a name that exists: a second entry with the same name, or one that differs only in case
        // on a system that does not tell them apart, is not allowed to overwrite the first.
        let mut file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(f) => f,
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                self.skip(name, SkipReason::Duplicate);
                return Ok(());
            }
            Err(_) => {
                self.skip(name, SkipReason::Other);
                return Ok(());
            }
        };
        self.count_entry()?;
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) => return Err(self.read_error(e)),
            };
            self.written += n as u64;
            self.check_budget()?;
            file.write_all(&buf[..n])
                .map_err(|e| ArchiveError::io(&target, e))?;
        }
        if let Some(t) = modified {
            let _ = file.set_modified(t);
        }
        Ok(())
    }

    fn check_budget(&self) -> Result<(), ArchiveError> {
        if self.written > self.limits.max_total_bytes {
            return Err(ArchiveError::TooLarge {
                path: self.archive.to_path_buf(),
                limit: self.limits.max_total_bytes,
            });
        }
        if self.written > self.limits.ratio_floor
            && self.written / self.archive_len.max(1) > self.limits.max_ratio
        {
            return Err(ArchiveError::Suspicious {
                path: self.archive.to_path_buf(),
            });
        }
        Ok(())
    }

    fn read_error(&self, e: io::Error) -> ArchiveError {
        // A damaged compressed stream is reported by the decoders as InvalidData / UnexpectedEof.
        match e.kind() {
            io::ErrorKind::InvalidData | io::ErrorKind::UnexpectedEof => {
                ArchiveError::corrupt(self.archive, e)
            }
            _ => ArchiveError::io(self.archive, e),
        }
    }

    fn zip(&mut self) -> Result<(), ArchiveError> {
        use zip::result::ZipError;
        let file = File::open(self.archive).map_err(|e| ArchiveError::io(self.archive, e))?;
        let mut zip =
            zip::ZipArchive::new(file).map_err(|e| ArchiveError::corrupt(self.archive, e))?;
        if zip.len() > self.limits.max_entries {
            return Err(ArchiveError::TooManyEntries {
                path: self.archive.to_path_buf(),
                limit: self.limits.max_entries,
            });
        }
        for i in 0..zip.len() {
            let mut entry = match zip.by_index(i) {
                Ok(e) => e,
                Err(ZipError::UnsupportedArchive(m)) if m == ZipError::PASSWORD_REQUIRED => {
                    return Err(ArchiveError::Encrypted {
                        path: self.archive.to_path_buf(),
                    })
                }
                Err(ZipError::InvalidPassword) => {
                    return Err(ArchiveError::Encrypted {
                        path: self.archive.to_path_buf(),
                    })
                }
                Err(e) => return Err(ArchiveError::corrupt(self.archive, e)),
            };
            let name = match entry.name() {
                Ok(n) => n.into_owned(),
                Err(_) => {
                    self.skip("?", SkipReason::UnsafeName);
                    continue;
                }
            };
            let Some(rel) = safe_relative(&name) else {
                self.skip(&name, SkipReason::UnsafeName);
                continue;
            };
            if entry.is_symlink() {
                self.skip(&name, SkipReason::Link);
            } else if entry.is_dir() {
                self.make_dir(&name, &rel)?;
            } else {
                // The declared size is only a first, cheap check: what counts is what is really written.
                if entry.size() > self.limits.max_total_bytes {
                    return Err(ArchiveError::TooLarge {
                        path: self.archive.to_path_buf(),
                        limit: self.limits.max_total_bytes,
                    });
                }
                let modified = entry.last_modified().and_then(zip_time);
                self.write_file(&name, &rel, &mut entry, modified)?;
            }
        }
        Ok(())
    }

    fn tar(&mut self, reader: impl Read) -> Result<(), ArchiveError> {
        use tar::EntryType;
        let mut tar = tar::Archive::new(reader);
        let entries = tar
            .entries()
            .map_err(|e| ArchiveError::corrupt(self.archive, e))?;
        for entry in entries {
            let mut entry = entry.map_err(|e| self.read_error(e))?;
            let kind = entry.header().entry_type();
            let name = String::from_utf8_lossy(&entry.path_bytes()).into_owned();
            match kind {
                // Information about the archive itself, not an entry.
                EntryType::XGlobalHeader | EntryType::XHeader => continue,
                EntryType::Symlink | EntryType::Link => {
                    self.skip(&name, SkipReason::Link);
                    continue;
                }
                _ => {}
            }
            let Some(rel) = safe_relative(&name) else {
                self.skip(&name, SkipReason::UnsafeName);
                continue;
            };
            if kind.is_dir() {
                self.make_dir(&name, &rel)?;
            } else if kind.is_file() || kind == EntryType::Continuous {
                let modified = entry
                    .header()
                    .mtime()
                    .ok()
                    .map(|s| UNIX_EPOCH + Duration::from_secs(s));
                self.write_file(&name, &rel, &mut entry, modified)?;
            } else {
                self.skip(&name, SkipReason::Other);
            }
        }
        Ok(())
    }
}

/// The date of a zip entry. Zip stores the local time of whoever made the archive, without a time zone: it is read as
/// UTC, so the same archive shows the same date everywhere (it can be off by the time zone of its author).
fn zip_time(t: zip::DateTime) -> Option<SystemTime> {
    let (y, m, d) = (
        i64::from(t.year()),
        i64::from(t.month()),
        i64::from(t.day()),
    );
    // Days since 1970-01-01 of a calendar date (Howard Hinnant's algorithm).
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400
        + i64::from(t.hour()) * 3600
        + i64::from(t.minute()) * 60
        + i64::from(t.second());
    u64::try_from(secs)
        .ok()
        .map(|s| UNIX_EPOCH + Duration::from_secs(s))
}

#[cfg(test)]
mod tests;
