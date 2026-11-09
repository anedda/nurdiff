use super::*;
use crate::test_support::{zip_with, Item};
use nurdiff_core::{compare_dirs, DirOptions, EntryStatus};
use std::fs;

fn cache(d: &tempfile::TempDir) -> ArchiveCache {
    ArchiveCache::with_root(d.path().join("cache"), Limits::default())
}

fn status(diff: &nurdiff_core::DirDiff, path: &str) -> EntryStatus {
    diff.entries.iter().find(|e| e.path == path).unwrap().status
}

#[test]
fn an_archive_resolves_to_a_folder_with_its_contents() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(&d.path().join("a.zip"), &[Item::File("docs/r.txt", b"hi")]);
    let c = cache(&d);
    let r = c.resolve(&z, Want::Dir).unwrap();
    assert!(r.in_archive && r.path.is_dir());
    assert_eq!(fs::read_to_string(r.path.join("docs/r.txt")).unwrap(), "hi");
}

#[test]
fn a_path_inside_the_archive_resolves_to_the_extracted_file() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(&d.path().join("a.zip"), &[Item::File("docs/r.txt", b"hi")]);
    let c = cache(&d);
    let r = c.resolve(&z.join("docs/r.txt"), Want::File).unwrap();
    assert!(r.in_archive);
    assert_eq!(fs::read_to_string(&r.path).unwrap(), "hi");
    // and also as a folder path
    let dir = c.resolve(&z.join("docs"), Want::Dir).unwrap();
    assert!(dir.in_archive && dir.path.join("r.txt").is_file());
}

#[test]
fn an_archive_is_extracted_once() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(&d.path().join("a.zip"), &[Item::File("f.txt", b"x")]);
    let c = cache(&d);
    let first = c.resolve(&z, Want::Dir).unwrap().path;
    let second = c.resolve(&z.join("f.txt"), Want::File).unwrap().path;
    assert_eq!(second.parent().unwrap(), first);
    assert_eq!(c.resolve(&z, Want::Dir).unwrap().path, first);
}

#[test]
fn a_changed_archive_is_extracted_again() {
    let d = tempfile::tempdir().unwrap();
    let z = d.path().join("a.zip");
    zip_with(&z, &[Item::File("f.txt", b"old")]);
    let c = cache(&d);
    let first = c.resolve(&z, Want::Dir).unwrap().path;
    zip_with(&z, &[Item::File("f.txt", b"new content, longer")]);
    let second = c.resolve(&z, Want::Dir).unwrap().path;
    assert_ne!(first, second);
    assert_eq!(
        fs::read_to_string(second.join("f.txt")).unwrap(),
        "new content, longer"
    );
    assert!(!first.exists(), "the old copy is deleted");
}

#[test]
fn a_file_that_is_an_archive_is_still_a_file_when_a_file_is_wanted() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(&d.path().join("a.zip"), &[Item::File("f.txt", b"x")]);
    let c = cache(&d);
    let r = c.resolve(&z, Want::File).unwrap();
    assert_eq!(r.path, z);
    assert!(!r.in_archive);
}

#[test]
fn other_paths_are_returned_as_they_are() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("plain.txt"), "x").unwrap();
    let c = cache(&d);
    for p in [
        d.path().to_path_buf(),
        d.path().join("plain.txt"),
        d.path().join("missing/x.txt"),
    ] {
        for want in [Want::File, Want::Dir] {
            let r = c.resolve(&p, want).unwrap();
            assert_eq!(r.path, p);
            assert!(!r.in_archive);
        }
    }
    assert!(!d.path().join("cache").exists(), "nothing extracted");
}

#[test]
fn an_archive_inside_an_archive_is_opened_one_level_at_a_time() {
    let d = tempfile::tempdir().unwrap();
    let inner = zip_with(
        &d.path().join("inner.zip"),
        &[Item::File("deep.txt", b"deep")],
    );
    let inner_bytes = fs::read(&inner).unwrap();
    let outer = zip_with(
        &d.path().join("outer.zip"),
        &[
            Item::File("inner.zip", &inner_bytes),
            Item::File("top.txt", b"t"),
        ],
    );
    let c = cache(&d);
    let r = c.resolve(&outer.join("inner.zip"), Want::Dir).unwrap();
    assert_eq!(fs::read_to_string(r.path.join("deep.txt")).unwrap(), "deep");
    // as a file it is the extracted copy of the inner archive
    let f = c.resolve(&outer.join("inner.zip"), Want::File).unwrap();
    assert!(f.path.is_file());
    // and a path through both
    let both = c
        .resolve(&outer.join("inner.zip/deep.txt"), Want::File)
        .unwrap();
    assert_eq!(fs::read_to_string(both.path).unwrap(), "deep");
}

#[test]
fn skipped_entries_are_counted() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("a.zip"),
        &[
            Item::File("../x", b"1"),
            Item::File("ok", b"2"),
            Item::Symlink("l", "ok"),
        ],
    );
    let r = cache(&d).resolve(&z, Want::Dir).unwrap();
    assert_eq!(r.skipped, 2);
}

#[test]
fn a_failed_extraction_leaves_nothing_behind() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(&d.path().join("a.zip"), &[Item::File("big", &[b'x'; 5000])]);
    let c = ArchiveCache::with_root(
        d.path().join("cache"),
        Limits {
            max_total_bytes: 100,
            ..Limits::default()
        },
    );
    assert!(matches!(
        c.resolve(&z, Want::Dir).unwrap_err(),
        ArchiveError::TooLarge { .. }
    ));
    let left: Vec<_> = fs::read_dir(d.path().join("cache")).unwrap().collect();
    assert!(left.is_empty(), "{left:?}");
}

#[test]
fn purge_deletes_everything_and_stale_folders_of_other_runs_go_too() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(&d.path().join("a.zip"), &[Item::File("f", b"x")]);
    let c = cache(&d);
    c.resolve(&z, Want::Dir).unwrap();
    c.purge();
    assert!(!d.path().join("cache").exists());

    let stale = d.path().join(format!("{PREFIX}999999"));
    let unrelated = d.path().join("something-else");
    fs::create_dir_all(stale.join("0")).unwrap();
    fs::create_dir_all(&unrelated).unwrap();
    ArchiveCache::purge_stale(d.path(), Duration::from_secs(3600));
    assert!(stale.exists(), "recent: kept");
    ArchiveCache::purge_stale(d.path(), Duration::ZERO);
    assert!(!stale.exists(), "old enough: deleted");
    assert!(unrelated.exists(), "never touches other folders");
}

#[test]
fn two_archives_compare_like_two_folders() {
    let d = tempfile::tempdir().unwrap();
    let left = zip_with(
        &d.path().join("v1.zip"),
        &[
            Item::File("same.txt", b"same\n"),
            Item::File("changed.txt", b"one\n"),
            Item::File("only-left.txt", b"l\n"),
            Item::File("sub/inner.txt", b"i\n"),
        ],
    );
    let right = zip_with(
        &d.path().join("v2.zip"),
        &[
            Item::File("same.txt", b"same\n"),
            Item::File("changed.txt", b"two\n"),
            Item::File("only-right.txt", b"r\n"),
            Item::File("sub/inner.txt", b"i\n"),
        ],
    );
    let c = cache(&d);
    let l = c.resolve(&left, Want::Dir).unwrap().path;
    let r = c.resolve(&right, Want::Dir).unwrap().path;
    let diff = compare_dirs(&l, &r, &DirOptions::default()).unwrap();
    assert_eq!(status(&diff, "same.txt"), EntryStatus::Identical);
    assert_eq!(status(&diff, "changed.txt"), EntryStatus::Different);
    assert_eq!(status(&diff, "only-left.txt"), EntryStatus::LeftOnly);
    assert_eq!(status(&diff, "only-right.txt"), EntryStatus::RightOnly);
    assert_eq!(status(&diff, "sub/inner.txt"), EntryStatus::Identical);
}

#[test]
fn an_archive_compares_with_a_folder() {
    let d = tempfile::tempdir().unwrap();
    let z = zip_with(
        &d.path().join("rel.zip"),
        &[Item::File("a.txt", b"a\n"), Item::File("b.txt", b"b\n")],
    );
    let dir = d.path().join("src");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("a.txt"), "a\n").unwrap();
    fs::write(dir.join("c.txt"), "c\n").unwrap();
    let c = cache(&d);
    let l = c.resolve(&z, Want::Dir).unwrap().path;
    let r = c.resolve(&dir, Want::Dir).unwrap();
    assert!(!r.in_archive);
    let diff = compare_dirs(&l, &r.path, &DirOptions::default()).unwrap();
    assert_eq!(status(&diff, "a.txt"), EntryStatus::Identical);
    assert_eq!(status(&diff, "b.txt"), EntryStatus::LeftOnly);
    assert_eq!(status(&diff, "c.txt"), EntryStatus::RightOnly);
}
