//! Reading text files: detection of encoding and line ending, splitting into rows.

use crate::coded::{Coded, CodedError};
use crate::paths::is_null_device;
use std::{fmt, fs, io, path::Path, path::PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Encoding {
    Utf8,
    Utf8Bom,
    Utf16Le,
    Utf16Be,
    /// Fallback when the file is not valid UTF-8 (every byte becomes a character).
    Latin1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Eol {
    Lf,
    CrLf,
    Cr,
    /// More than one kind of line ending in the same file.
    Mixed,
    /// No line ending (empty file or single-row file).
    None,
}

#[derive(Debug, Clone)]
pub struct TextFile {
    pub text: String,
    pub encoding: Encoding,
    pub eol: Eol,
}

#[derive(Debug)]
pub enum TextError {
    Io { path: PathBuf, source: io::Error },
    Binary { path: PathBuf },
}

impl fmt::Display for TextError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TextError::Io { path, source } => {
                write!(f, "cannot read {}: {}", path.display(), source)
            }
            TextError::Binary { path } => {
                write!(f, "{} looks like a binary file", path.display())
            }
        }
    }
}

impl Coded for TextError {
    fn coded(&self) -> CodedError {
        match self {
            TextError::Io { path, source } => CodedError::new("err.text.read")
                .with("path", path.display())
                .with("reason", source),
            TextError::Binary { path } => {
                CodedError::new("err.text.binary").with("path", path.display())
            }
        }
    }
}

impl Coded for EncodeError {
    fn coded(&self) -> CodedError {
        CodedError::new(match self.encoding {
            Encoding::Latin1 => "err.encode.latin1",
            _ => "err.encode.other",
        })
        .with("ch", self.ch)
    }
}

impl std::error::Error for TextError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            TextError::Io { source, .. } => Some(source),
            TextError::Binary { .. } => None,
        }
    }
}

/// Above this size (of either file) the work that reads two files whole just for a mark or a cell is not done:
/// the classification of minor differences ("≈") and the count of the "Differences" column.
pub const MAX_TEXT_BYTES: u64 = 16 * 1024 * 1024;

/// The first of the files larger than [`MAX_TEXT_BYTES`]; an error says which file could not be examined.
pub(crate) fn find_too_large<'a>(
    paths: &[&'a Path],
) -> Result<Option<&'a Path>, (&'a Path, io::Error)> {
    for &p in paths {
        match fs::metadata(p) {
            Ok(meta) if meta.len() > MAX_TEXT_BYTES => return Ok(Some(p)),
            Ok(_) => {}
            Err(e) => return Err((p, e)),
        }
    }
    Ok(None)
}

/// Reads a file and decodes it as text.
pub fn read_text_file(path: &Path) -> Result<TextFile, TextError> {
    // The side git passes for an added or deleted file: empty (on Windows `/dev/null` does not exist).
    if is_null_device(path) {
        return decode(&[]).ok_or_else(|| TextError::Binary {
            path: path.to_path_buf(),
        });
    }
    let bytes = fs::read(path).map_err(|source| TextError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    decode(&bytes).ok_or_else(|| TextError::Binary {
        path: path.to_path_buf(),
    })
}

/// Decoding of bytes as text. Returns `None` if they look like binary data
/// (NUL bytes present without a UTF-16 BOM, or UTF-16 that is not valid: an odd length or an unpaired
/// surrogate, which saving would change).
pub fn decode(bytes: &[u8]) -> Option<TextFile> {
    let (text, encoding) = if let Some(rest) = bytes
        .strip_prefix(&[0xEF, 0xBB, 0xBF])
        .filter(|rest| std::str::from_utf8(rest).is_ok())
    {
        (
            String::from_utf8_lossy(rest).into_owned(),
            Encoding::Utf8Bom,
        )
    } else if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        (decode_utf16(rest, u16::from_le_bytes)?, Encoding::Utf16Le)
    } else if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        (decode_utf16(rest, u16::from_be_bytes)?, Encoding::Utf16Be)
    } else if bytes.contains(&0) {
        return None;
    } else if let Ok(s) = std::str::from_utf8(bytes) {
        (s.to_string(), Encoding::Utf8)
    } else {
        (bytes.iter().map(|&b| b as char).collect(), Encoding::Latin1)
    };

    let eol = detect_eol(&text);
    Some(TextFile {
        text,
        encoding,
        eol,
    })
}

/// `None` if the bytes are not valid UTF-16: reading them with replacement characters would change the file
/// at the first save.
fn decode_utf16(bytes: &[u8], to_unit: fn([u8; 2]) -> u16) -> Option<String> {
    let (units, rest) = bytes.as_chunks::<2>();
    if !rest.is_empty() {
        return None;
    }
    char::decode_utf16(units.iter().map(|&c| to_unit(c)))
        .collect::<Result<String, _>>()
        .ok()
}

/// How many times LF, CRLF and CR appear (isolated) in the text.
fn count_eols(text: &str) -> (usize, usize, usize) {
    let bytes = text.as_bytes();
    let (mut lf, mut crlf, mut cr) = (0usize, 0usize, 0usize);
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                crlf += 1;
                i += 1;
            }
            b'\r' => cr += 1,
            b'\n' => lf += 1,
            _ => {}
        }
        i += 1;
    }
    (lf, crlf, cr)
}

pub fn detect_eol(text: &str) -> Eol {
    let (lf, crlf, cr) = count_eols(text);
    match (lf > 0, crlf > 0, cr > 0) {
        (false, false, false) => Eol::None,
        (true, false, false) => Eol::Lf,
        (false, true, false) => Eol::CrLf,
        (false, false, true) => Eol::Cr,
        _ => Eol::Mixed,
    }
}

/// The most frequent kind of line ending (on a tie, LF, then CRLF); LF if there are none.
pub fn dominant_eol(text: &str) -> Eol {
    let (lf, crlf, cr) = count_eols(text);
    if lf >= crlf && lf >= cr {
        Eol::Lf
    } else if crlf >= cr {
        Eol::CrLf
    } else {
        Eol::Cr
    }
}

/// The row terminator to write for a kind of line ending (LF for `Mixed` and `None`).
pub fn eol_str(eol: Eol) -> &'static str {
    match eol {
        Eol::CrLf => "\r\n",
        Eol::Cr => "\r",
        _ => "\n",
    }
}

/// The text contains characters that the requested encoding cannot represent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodeError {
    pub ch: char,
    pub encoding: Encoding,
}

impl fmt::Display for EncodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "the character {:?} cannot be saved in {}",
            self.ch,
            match self.encoding {
                Encoding::Latin1 => "Latin-1",
                _ => "this encoding",
            }
        )
    }
}

impl std::error::Error for EncodeError {}

/// Encodes the text like the original: the opposite of [`decode`] (BOM included).
pub fn encode(text: &str, encoding: Encoding) -> Result<Vec<u8>, EncodeError> {
    match encoding {
        Encoding::Utf8 => Ok(text.as_bytes().to_vec()),
        Encoding::Utf8Bom => {
            let mut out = vec![0xEF, 0xBB, 0xBF];
            out.extend_from_slice(text.as_bytes());
            Ok(out)
        }
        Encoding::Utf16Le | Encoding::Utf16Be => {
            let le = encoding == Encoding::Utf16Le;
            let mut out = if le {
                vec![0xFF, 0xFE]
            } else {
                vec![0xFE, 0xFF]
            };
            for unit in text.encode_utf16() {
                out.extend_from_slice(&if le {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                });
            }
            Ok(out)
        }
        Encoding::Latin1 => text
            .chars()
            .map(|c| u8::try_from(c as u32).map_err(|_| EncodeError { ch: c, encoding }))
            .collect(),
    }
}

/// Splits the text into rows (without the terminators). Recognizes LF, CRLF and CR.
/// A possible empty final row after the last terminator is not produced.
pub fn split_lines(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut lines = Vec::new();
    let (mut start, mut i) = (0, 0);
    while i < bytes.len() {
        match bytes[i] {
            b'\n' => {
                lines.push(&text[start..i]);
                start = i + 1;
            }
            b'\r' => {
                lines.push(&text[start..i]);
                if bytes.get(i + 1) == Some(&b'\n') {
                    i += 1;
                }
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    if start < text.len() {
        lines.push(&text[start..]);
    }
    lines
}

#[cfg(test)]
mod tests;
