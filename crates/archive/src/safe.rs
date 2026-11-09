use std::path::PathBuf;

/// A name of an entry as a path relative to the destination, or `None` if it cannot be used safely: it goes up
/// (`..`), has a NUL, or (on Windows) a colon or a name the system reserves. A leading `/` or a Windows `\`
/// separator is fine: the name is read as relative, so it cannot point outside the destination. Empty and `.`
/// parts are dropped.
pub(crate) fn safe_relative(name: &str) -> Option<PathBuf> {
    if name.contains('\0') {
        return None;
    }
    let mut out = PathBuf::new();
    for part in name.split(['/', '\\']) {
        match part {
            "" | "." => {}
            ".." => return None,
            p => {
                if cfg!(windows) && (p.contains(':') || is_reserved_on_windows(p)) {
                    return None;
                }
                out.push(p);
            }
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

/// `CON`, `NUL`, `COM1`, … (with or without an extension): Windows cannot create files with these names.
pub(crate) fn is_reserved_on_windows(part: &str) -> bool {
    let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0')
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn ordinary_names_are_kept() {
        assert_eq!(safe_relative("a.txt").unwrap(), Path::new("a.txt"));
        assert_eq!(
            safe_relative("dir/sub/a.txt").unwrap(),
            Path::new("dir/sub/a.txt")
        );
        assert_eq!(safe_relative("dir/").unwrap(), Path::new("dir"));
        assert_eq!(safe_relative("./a/./b").unwrap(), Path::new("a/b"));
        assert_eq!(
            safe_relative("a\\b\\c.txt").unwrap(),
            Path::new("a/b/c.txt")
        );
    }

    #[test]
    fn names_that_leave_the_destination_are_refused() {
        assert_eq!(safe_relative("../evil.txt"), None);
        assert_eq!(safe_relative("a/../../evil.txt"), None);
        assert_eq!(safe_relative("a\\..\\..\\evil.txt"), None);
        assert_eq!(safe_relative("a\0b"), None);
        assert_eq!(safe_relative(""), None);
        assert_eq!(safe_relative("/"), None);
    }

    #[test]
    fn an_absolute_name_becomes_relative() {
        assert_eq!(
            safe_relative("/etc/passwd").unwrap(),
            Path::new("etc/passwd")
        );
        assert_eq!(safe_relative("C:/x.txt").is_some(), !cfg!(windows));
    }

    #[test]
    fn windows_reserved_names() {
        for n in ["CON", "nul", "aux.txt", "COM1", "lpt9.log", "PRN"] {
            assert!(is_reserved_on_windows(n), "{n}");
        }
        for n in ["COM0", "COM10", "console", "a.txt", "LPT"] {
            assert!(!is_reserved_on_windows(n), "{n}");
        }
    }
}
