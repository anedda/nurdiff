use std::fs::File;
use std::io::Read;
use std::path::Path;

/// The kinds of archive NurDiff opens.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// `.zip` and the formats built on it: `.jar`, `.apk`, `.epub`.
    Zip,
    /// `.tar`.
    Tar,
    /// `.tar.gz` and `.tgz`.
    TarGz,
}

/// The kind of archive a file is, or `None` if it is not one NurDiff opens. Both things must agree: the name ends
/// like an archive and the first bytes say the same, so a text file called `notes.zip` is a text file. Other formats
/// that are zip files inside (`.docx`, `.xlsx`, `.odt`, `.whl`, …) are not listed on purpose: whoever
/// wants to look inside one does it explicitly.
pub fn kind_of(path: &Path) -> Option<Kind> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    let by_name = if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        Kind::TarGz
    } else if name.ends_with(".tar") {
        Kind::Tar
    } else if [".zip", ".jar", ".apk", ".epub"]
        .iter()
        .any(|ext| name.ends_with(ext))
    {
        Kind::Zip
    } else {
        return None;
    };
    // A tar header is 512 bytes and says "ustar" at 257: the first bytes are enough for every kind.
    let mut head = [0u8; 262];
    let n = File::open(path).ok()?.read(&mut head).ok()?;
    let head = &head[..n];
    let matches = match by_name {
        Kind::Zip => head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06"),
        Kind::TarGz => head.starts_with(&[0x1f, 0x8b]),
        Kind::Tar => head.len() >= 262 && &head[257..262] == b"ustar",
    };
    matches.then_some(by_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn file(dir: &tempfile::TempDir, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let p = dir.path().join(name);
        fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn the_name_and_the_first_bytes_must_agree() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(
            kind_of(&file(&d, "a.zip", b"PK\x03\x04rest")),
            Some(Kind::Zip)
        );
        assert_eq!(
            kind_of(&file(&d, "empty.zip", b"PK\x05\x06")),
            Some(Kind::Zip)
        );
        assert_eq!(kind_of(&file(&d, "b.JAR", b"PK\x03\x04")), Some(Kind::Zip));
        assert_eq!(kind_of(&file(&d, "c.apk", b"PK\x03\x04")), Some(Kind::Zip));
        assert_eq!(kind_of(&file(&d, "d.epub", b"PK\x03\x04")), Some(Kind::Zip));
        assert_eq!(
            kind_of(&file(&d, "e.tgz", &[0x1f, 0x8b, 8])),
            Some(Kind::TarGz)
        );
        assert_eq!(
            kind_of(&file(&d, "f.tar.gz", &[0x1f, 0x8b, 8])),
            Some(Kind::TarGz)
        );
        let mut tar = vec![0u8; 300];
        tar[257..262].copy_from_slice(b"ustar");
        assert_eq!(kind_of(&file(&d, "g.tar", &tar)), Some(Kind::Tar));
    }

    #[test]
    fn a_file_that_only_looks_like_an_archive_is_not_one() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(kind_of(&file(&d, "notes.zip", b"just text\n")), None);
        assert_eq!(kind_of(&file(&d, "short.tar", b"ustar")), None);
        assert_eq!(
            kind_of(&file(&d, "a.docx", b"PK\x03\x04")),
            None,
            "not in the list"
        );
        assert_eq!(kind_of(&file(&d, "plain.txt", b"PK\x03\x04")), None);
        assert_eq!(kind_of(&d.path().join("missing.zip")), None);
        assert_eq!(kind_of(d.path()), None);
    }
}
