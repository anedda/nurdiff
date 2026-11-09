//! Archives for the tests, built by hand (also hostile ones).

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;

pub(crate) enum Item<'a> {
    File(&'a str, &'a [u8]),
    Dir(&'a str),
    Symlink(&'a str, &'a str),
}

pub(crate) fn zip_with(path: &Path, items: &[Item]) -> PathBuf {
    let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
    let opts = SimpleFileOptions::default();
    for item in items {
        match item {
            Item::File(name, bytes) => {
                zip.start_file(*name, opts).unwrap();
                zip.write_all(bytes).unwrap();
            }
            Item::Dir(name) => zip.add_directory(*name, opts).unwrap(),
            Item::Symlink(name, target) => zip.add_symlink(*name, *target, opts).unwrap(),
        }
    }
    zip.finish().unwrap();
    path.to_path_buf()
}

/// A zip with one file with a given date (year, month, day, hour, minute, second).
pub(crate) fn zip_dated(path: &Path, name: &str, bytes: &[u8], date: (u16, u8, u8, u8, u8, u8)) {
    let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
    let when =
        zip::DateTime::from_date_and_time(date.0, date.1, date.2, date.3, date.4, date.5).unwrap();
    zip.start_file(name, SimpleFileOptions::default().last_modified_time(when))
        .unwrap();
    zip.write_all(bytes).unwrap();
    zip.finish().unwrap();
}

/// A tar (`gzip`: compressed). `raw_name` is written as it is, so a hostile name can be put in it.
pub(crate) fn tar_with(path: &Path, items: &[(&str, &[u8])], gzip: bool) {
    let mut bytes = Vec::new();
    {
        let mut builder = tar::Builder::new(&mut bytes);
        for (name, data) in items {
            let mut header = tar::Header::new_gnu();
            let raw = header.as_old().name.len();
            assert!(name.len() < raw);
            header.as_old_mut().name[..name.len()].copy_from_slice(name.as_bytes());
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_mtime(1_700_000_000);
            header.set_entry_type(tar::EntryType::Regular);
            header.set_cksum();
            builder.append(&header, *data).unwrap();
        }
        builder.finish().unwrap();
    }
    let mut file = File::create(path).unwrap();
    if gzip {
        let mut enc = flate2::write::GzEncoder::new(&mut file, flate2::Compression::default());
        enc.write_all(&bytes).unwrap();
        enc.finish().unwrap();
    } else {
        file.write_all(&bytes).unwrap();
    }
}
