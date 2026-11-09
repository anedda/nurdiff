use super::*;
use crate::test_support::{tar_with, zip_dated, zip_with, Item};
use std::fs;

fn out(dir: &tempfile::TempDir) -> PathBuf {
    let d = dir.path().join("out");
    fs::create_dir_all(&d).unwrap();
    d
}

fn read(p: &Path) -> String {
    fs::read_to_string(p).unwrap()
}

#[test]
fn a_zip_is_extracted_with_its_folders_and_files() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[
            Item::Dir("docs/"),
            Item::File("docs/readme.txt", b"hello\n"),
            Item::File("top.txt", b"top\n"),
            Item::File("deep/er/file.txt", b"x"),
        ],
    );
    let dest = out(&d);
    let r = extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    assert_eq!(read(&dest.join("docs/readme.txt")), "hello\n");
    assert_eq!(read(&dest.join("top.txt")), "top\n");
    assert_eq!(read(&dest.join("deep/er/file.txt")), "x");
    assert_eq!(r.entries, 4);
    assert!(r.skipped.is_empty());
}

#[test]
fn the_date_of_a_zip_entry_is_kept() {
    let d = tempfile::tempdir().unwrap();
    let z = d.path().join("a.zip");
    zip_dated(&z, "f.txt", b"x", (2020, 3, 4, 5, 6, 8));
    let dest = out(&d);
    extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    let secs = fs::metadata(dest.join("f.txt"))
        .unwrap()
        .modified()
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // 2020-03-04 05:06:08 UTC
    assert_eq!(secs, 1_583_298_368);
}

#[test]
fn names_that_leave_the_destination_are_skipped_and_written_nowhere() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("evil.zip"),
        &[
            Item::File("../evil.txt", b"x"),
            Item::File("a/../../evil2.txt", b"x"),
            Item::File("ok.txt", b"ok"),
        ],
    );
    let dest = out(&d);
    let r = extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    assert_eq!(read(&dest.join("ok.txt")), "ok");
    assert_eq!(r.skipped.len(), 2);
    assert!(r.skipped.iter().all(|s| s.reason == SkipReason::UnsafeName));
    assert!(!d.path().join("evil.txt").exists());
    assert!(!d.path().join("evil2.txt").exists());
}

#[test]
fn an_absolute_name_is_read_as_relative() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[Item::File("/abs/file.txt", b"x")],
    );
    let dest = out(&d);
    extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    assert_eq!(read(&dest.join("abs/file.txt")), "x");
}

#[test]
fn links_are_not_created() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[
            Item::File("real.txt", b"x"),
            Item::Symlink("link", "/etc/passwd"),
        ],
    );
    let dest = out(&d);
    let r = extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    assert!(!dest.join("link").exists() && fs::symlink_metadata(dest.join("link")).is_err());
    assert_eq!(
        r.skipped,
        vec![Skipped {
            name: "link".into(),
            reason: SkipReason::Link
        }]
    );
}

#[test]
fn a_zip_with_two_entries_of_one_name_gives_one_file() {
    let d = tempfile::tempdir().unwrap();
    // The writer refuses two entries with one name, so the second is written with another name of the same
    // length and renamed in the bytes (in the local and in the central header).
    let z = zip_with(
        &d.path().join("a.zip"),
        &[
            Item::File("same.txt", b"first"),
            Item::File("samX.txt", b"second"),
        ],
    );
    let bytes = fs::read(&z).unwrap();
    let mut patched = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(b"samX.txt") {
            patched.extend_from_slice(b"same.txt");
            i += 8;
        } else {
            patched.push(bytes[i]);
            i += 1;
        }
    }
    fs::write(&z, patched).unwrap();
    let dest = out(&d);
    extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    // The zip library keeps one entry per name; what matters is that nothing is written twice or elsewhere.
    let files: Vec<_> = fs::read_dir(&dest).unwrap().collect();
    assert_eq!(files.len(), 1);
    assert!(["first", "second"].contains(&read(&dest.join("same.txt")).as_str()));
}

#[test]
fn a_second_tar_entry_with_the_same_name_does_not_overwrite_the_first() {
    let d = tempfile::tempdir().unwrap();
    let t = d.path().join("dup.tar");
    tar_with(
        &t,
        &[
            ("same.txt", b"first"),
            ("same.txt", b"second"),
            ("ok.txt", b"ok"),
        ],
        false,
    );
    let dest = out(&d);
    let r = extract(&t, Kind::Tar, &dest, &Limits::default()).unwrap();
    assert_eq!(read(&dest.join("same.txt")), "first");
    assert_eq!(read(&dest.join("ok.txt")), "ok");
    assert_eq!(r.skipped.len(), 1);
    assert_eq!(r.skipped[0].reason, SkipReason::Duplicate);
}

#[test]
fn a_file_where_a_folder_is_needed_is_skipped_not_an_error() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[Item::File("a", b"file"), Item::File("a/b.txt", b"x")],
    );
    let dest = out(&d);
    let r = extract(&z, Kind::Zip, &dest, &Limits::default()).unwrap();
    assert_eq!(read(&dest.join("a")), "file");
    assert_eq!(r.skipped.len(), 1);
}

#[test]
fn too_many_entries_stop_the_extraction() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[
            Item::File("1", b"x"),
            Item::File("2", b"x"),
            Item::File("3", b"x"),
        ],
    );
    let limits = Limits {
        max_entries: 2,
        ..Limits::default()
    };
    let e = extract(&z, Kind::Zip, &out(&d), &limits).unwrap_err();
    assert!(
        matches!(e, ArchiveError::TooManyEntries { limit: 2, .. }),
        "{e}"
    );
}

#[test]
fn what_is_written_is_limited_not_what_the_archive_declares() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[Item::File("a", &[b'x'; 600]), Item::File("b", &[b'y'; 600])],
    );
    let limits = Limits {
        max_total_bytes: 1000,
        ..Limits::default()
    };
    let e = extract(&z, Kind::Zip, &out(&d), &limits).unwrap_err();
    assert!(
        matches!(e, ArchiveError::TooLarge { limit: 1000, .. }),
        "{e}"
    );
}

#[test]
fn an_archive_that_expands_enormously_is_refused() {
    let d = tempfile::tempdir().unwrap();
    // Zeros compress to almost nothing: 4 MB of them take a few KB.
    let z = zip_with(
        &d.path().join("bomb.zip"),
        &[Item::File("zeros", &vec![0u8; 4_000_000])],
    );
    let limits = Limits {
        max_ratio: 50,
        ratio_floor: 1_000_000,
        ..Limits::default()
    };
    let e = extract(&z, Kind::Zip, &out(&d), &limits).unwrap_err();
    assert!(matches!(e, ArchiveError::Suspicious { .. }), "{e}");
    // Under the floor it is not a bomb, only a small file of zeros.
    let ok = Limits {
        max_ratio: 50,
        ratio_floor: 10_000_000,
        ..Limits::default()
    };
    extract(&z, Kind::Zip, &out(&d), &ok).unwrap();
}

#[test]
fn a_damaged_zip_is_a_clear_error() {
    let d = tempfile::tempdir().unwrap();
    let z = d.path().join("bad.zip");
    fs::write(&z, b"PK\x03\x04 this is not really a zip").unwrap();
    let e = extract(&z, Kind::Zip, &out(&d), &Limits::default()).unwrap_err();
    assert!(matches!(e, ArchiveError::Corrupt { .. }), "{e}");
}

#[test]
fn an_encrypted_zip_is_reported_as_such() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("secret.zip"),
        &[Item::File("s.txt", b"secret")],
    );
    // The "encrypted" bit (bit 0 of the general purpose flags) in the local and in the central header.
    let mut bytes = fs::read(&z).unwrap();
    bytes[6] |= 1;
    let central = bytes.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    bytes[central + 8] |= 1;
    fs::write(&z, bytes).unwrap();
    let e = extract(&z, Kind::Zip, &out(&d), &Limits::default()).unwrap_err();
    assert!(matches!(e, ArchiveError::Encrypted { .. }), "{e}");
}

#[test]
fn tar_and_tar_gz_are_extracted_with_their_dates() {
    let d = tempfile::tempdir().unwrap();
    for (name, gzip, kind) in [("a.tar", false, Kind::Tar), ("a.tar.gz", true, Kind::TarGz)] {
        let t = d.path().join(name);
        tar_with(&t, &[("dir/one.txt", b"1"), ("two.txt", b"22")], gzip);
        let dest = d.path().join(format!("out-{name}"));
        fs::create_dir_all(&dest).unwrap();
        let r = extract(&t, kind, &dest, &Limits::default()).unwrap();
        assert_eq!(read(&dest.join("dir/one.txt")), "1", "{name}");
        assert_eq!(read(&dest.join("two.txt")), "22", "{name}");
        assert_eq!(r.entries, 2);
        let secs = fs::metadata(dest.join("two.txt"))
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert_eq!(secs, 1_700_000_000, "{name}");
    }
}

#[test]
fn a_tar_with_a_name_that_leaves_the_destination_is_skipped() {
    let d = tempfile::tempdir().unwrap();
    let t = d.path().join("evil.tar");
    tar_with(&t, &[("../evil.txt", b"x"), ("ok.txt", b"ok")], false);
    let dest = out(&d);
    let r = extract(&t, Kind::Tar, &dest, &Limits::default()).unwrap();
    assert_eq!(read(&dest.join("ok.txt")), "ok");
    assert_eq!(r.skipped.len(), 1);
    assert_eq!(r.skipped[0].reason, SkipReason::UnsafeName);
    assert!(!d.path().join("evil.txt").exists());
}

#[test]
fn a_truncated_gzip_is_corrupt() {
    let d = tempfile::tempdir().unwrap();
    let t = d.path().join("a.tar.gz");
    tar_with(&t, &[("f.txt", &vec![b'a'; 100_000])], true);
    let bytes = fs::read(&t).unwrap();
    fs::write(&t, &bytes[..bytes.len() / 2]).unwrap();
    let e = extract(&t, Kind::TarGz, &out(&d), &Limits::default()).unwrap_err();
    assert!(matches!(e, ArchiveError::Corrupt { .. }), "{e}");
}

#[test]
fn dates_of_zip_are_converted_without_a_library() {
    let t = |y, m, d, h, mi, s| {
        zip_time(zip::DateTime::from_date_and_time(y, m, d, h, mi, s).unwrap())
            .unwrap()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
    };
    assert_eq!(t(1980, 1, 1, 0, 0, 0), 315_532_800);
    assert_eq!(t(2000, 2, 29, 12, 0, 0), 951_825_600);
    assert_eq!(t(2024, 12, 31, 23, 59, 58), 1_735_689_598);
}
