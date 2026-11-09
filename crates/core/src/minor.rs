//! Minor differences: two files that differ only in line ending, trailing spaces or other
//! trivial things. A comparison is "minor" if, after normalizing the two texts, they become equal.
//!
//! The comparison goes row by row and stops at the first difference that survives
//! normalization (the substantial one): to say "≈" one has to have seen all the differences,
//! to say "different" one is enough.

use std::io::Read;
use std::{fs, io, path::Path};

use serde::Serialize;

use crate::text::{decode, find_too_large, split_lines, Encoding, Eol, TextFile};

/// What makes a difference minor. All false = no difference of this kind.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinorCauses {
    /// Type of line ending, or missing line ending at the end of the file.
    pub eol: bool,
    /// Encoding or BOM (UTF-8, UTF-16, Latin-1) with the same text.
    pub encoding: bool,
    /// Spaces and tabs at the end of rows.
    pub trailing_space: bool,
    /// Other spaces: indentation, tabs in place of spaces, double spaces.
    pub whitespace: bool,
    /// Uppercase and lowercase.
    pub case: bool,
}

impl MinorCauses {
    pub fn any(&self) -> bool {
        self.eol || self.encoding || self.trailing_space || self.whitespace || self.case
    }

    /// The causes in English, for the command line (the UI translates them with its own keys).
    pub fn labels(&self) -> Vec<&'static str> {
        [
            (self.eol, "line endings"),
            (self.encoding, "encoding"),
            (self.trailing_space, "trailing whitespace"),
            (self.whitespace, "whitespace"),
            (self.case, "letter case"),
        ]
        .into_iter()
        .filter_map(|(on, name)| on.then_some(name))
        .collect()
    }

    fn merge(&mut self, other: MinorCauses) {
        self.eol |= other.eol;
        self.encoding |= other.encoding;
        self.trailing_space |= other.trailing_space;
        self.whitespace |= other.whitespace;
        self.case |= other.case;
    }
}

/// The format of a file, besides its rows.
#[derive(Debug, Clone, Copy)]
pub struct Format {
    pub encoding: Encoding,
    pub eol: Eol,
    /// The last row ends with a line ending.
    pub final_newline: bool,
}

impl Format {
    pub fn of(file: &TextFile) -> Format {
        Format {
            encoding: file.encoding,
            eol: file.eol,
            final_newline: file.text.is_empty()
                || file.text.ends_with('\n')
                || file.text.ends_with('\r'),
        }
    }
}

/// The causes for which two different rows are still "minor"; `None` if the difference is
/// substantial. For equal rows it gives all false.
fn line_causes(a: &str, b: &str) -> Option<MinorCauses> {
    let mut c = MinorCauses::default();
    if a == b {
        return Some(c);
    }
    let (la, lb) = (a.to_lowercase(), b.to_lowercase());
    if la == lb {
        c.case = true;
        return Some(c);
    }
    let strip = |s: &str| -> String { s.chars().filter(|ch| !ch.is_whitespace()).collect() };
    if a.trim_end() == b.trim_end() {
        c.trailing_space = true;
    } else if la.trim_end() == lb.trim_end() {
        c.trailing_space = true;
        c.case = true;
    } else if strip(a) == strip(b) {
        c.whitespace = true;
    } else if strip(&la) == strip(&lb) {
        c.whitespace = true;
        c.case = true;
    } else {
        return None;
    }
    Some(c)
}

/// The causes of all the differences between two sets of rows, or `None` at the first substantial
/// difference (different number of rows, or a row that differs in more than spaces and
/// case). With all false the two files are equal also in format.
pub fn classify_lines<A: AsRef<str>, B: AsRef<str>>(
    left: &[A],
    right: &[B],
    left_format: Format,
    right_format: Format,
) -> Option<MinorCauses> {
    // An empty file and one with only a line ending have no row against one empty row: only the
    // line ending differs.
    let blank = |rows: usize, first: Option<&str>| rows == 1 && first == Some("");
    let empty_vs_blank = (left.is_empty() && blank(right.len(), right.first().map(AsRef::as_ref)))
        || (right.is_empty() && blank(left.len(), left.first().map(AsRef::as_ref)));
    if left.len() != right.len() && !empty_vs_blank {
        return None;
    }
    let mut causes = MinorCauses::default();
    for (a, b) in left.iter().zip(right) {
        causes.merge(line_causes(a.as_ref(), b.as_ref())?);
    }
    if left_format.eol != right_format.eol
        || left_format.final_newline != right_format.final_newline
    {
        causes.eol = true;
    }
    if left_format.encoding != right_format.encoding {
        causes.encoding = true;
    }
    Some(causes)
}

/// Like [`classify_lines`], for two texts already read.
pub fn classify_texts(left: &TextFile, right: &TextFile) -> Option<MinorCauses> {
    classify_lines(
        &split_lines(&left.text),
        &split_lines(&right.text),
        Format::of(left),
        Format::of(right),
    )
}

/// Classifies two files whose bytes are different. `None` if the difference is substantial, if one of the
/// two is not text or exceeds [`MAX_TEXT_BYTES`](crate::MAX_TEXT_BYTES). Since the bytes differ, the result always
/// has at least one cause.
pub fn classify_files(a: &Path, b: &Path) -> io::Result<Option<MinorCauses>> {
    if find_too_large(&[a, b]).map_err(|(_, e)| e)?.is_some() {
        return Ok(None);
    }
    // A binary file (images, archives) is not read whole just to find out it is not text.
    for p in [a, b] {
        if looks_binary(p)? {
            return Ok(None);
        }
    }
    let (bytes_a, bytes_b) = (fs::read(a)?, fs::read(b)?);
    let (Some(l), Some(r)) = (decode(&bytes_a), decode(&bytes_b)) else {
        return Ok(None);
    };
    let Some(mut causes) = classify_texts(&l, &r) else {
        return Ok(None);
    };
    if !causes.any() {
        // Same text and same format, but different bytes (for example invalid sequences that
        // become the same replacement character): it is an encoding difference.
        if l.eol == Eol::Mixed || r.eol == Eol::Mixed {
            causes.eol = true;
        } else {
            causes.encoding = true;
        }
    }
    Ok(Some(causes))
}

/// How many bytes [`looks_binary`] reads.
const SNIFF_BYTES: usize = 8 * 1024;

/// The first bytes already say the file is not text for [`decode`]: a NUL byte without a BOM.
fn looks_binary(path: &Path) -> io::Result<bool> {
    let mut head = Vec::with_capacity(SNIFF_BYTES);
    fs::File::open(path)?
        .take(SNIFF_BYTES as u64)
        .read_to_end(&mut head)?;
    let bom = [&[0xEF, 0xBB, 0xBF][..], &[0xFF, 0xFE], &[0xFE, 0xFF]]
        .iter()
        .any(|b| head.starts_with(b));
    Ok(!bom && head.contains(&0))
}

#[cfg(test)]
mod tests;
