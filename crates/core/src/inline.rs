//! Diff inside a line: highlights the changed parts of two "modified" lines.
//!
//! The lines are split into tokens (words, spaces, symbols) and compared with the same engine
//! as the line diff. Positions are in UTF-16 code units, that is, as JavaScript indexes
//! them: the UI can use them directly with `String.prototype.slice`.

use serde::Serialize;

use crate::diff::{diff_edits, Algorithm, DiffOptions, Edit, Whitespace};

/// Longer lines (in bytes) are not analysed: the highlighting would be of little use
/// and the cost would grow without limit.
pub const MAX_INLINE_BYTES: usize = 4000;

/// Range `[start, end)` of a line, in UTF-16 code units.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Mark {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Class {
    Word,
    Space,
    Symbol,
}

struct Token<'a> {
    text: &'a str,
    start: usize,
    end: usize,
    class: Class,
}

fn class_of(c: char) -> Class {
    if c.is_alphanumeric() || c == '_' {
        Class::Word
    } else if c.is_whitespace() {
        Class::Space
    } else {
        Class::Symbol
    }
}

/// The text a token is compared with: with `Amount` every run of spaces counts as a single space.
fn token_text<'a>(token: &Token<'a>, amount: bool) -> &'a str {
    if amount && token.class == Class::Space {
        " "
    } else {
        token.text
    }
}

/// Consecutive words and spaces form a token; every symbol is a token on its own.
fn tokenize(text: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let mut offset = 0; // UTF-16 units from the start of the line
    let mut current: Option<(usize, usize, Class)> = None; // (start byte, start UTF-16, class)
    for (byte, c) in text.char_indices() {
        let class = class_of(c);
        if let Some((open_byte, open_start, open_class)) = current {
            if open_class == class && class != Class::Symbol {
                offset += c.len_utf16();
                continue;
            }
            tokens.push(Token {
                text: &text[open_byte..byte],
                start: open_start,
                end: offset,
                class: open_class,
            });
        }
        current = Some((byte, offset, class));
        offset += c.len_utf16();
    }
    if let Some((open_byte, open_start, open_class)) = current {
        tokens.push(Token {
            text: &text[open_byte..],
            start: open_start,
            end: offset,
            class: open_class,
        });
    }
    tokens
}

/// Differing parts between two lines, for the left and the right side.
///
/// Returns empty lists if there is nothing useful to highlight: lines that are too
/// long, lines equal according to the options, or lines with no word in common (in that
/// case the whole line is already coloured as different).
pub fn inline_marks(left: &str, right: &str, opts: &DiffOptions) -> (Vec<Mark>, Vec<Mark>) {
    if left.len() > MAX_INLINE_BYTES || right.len() > MAX_INLINE_BYTES {
        return (Vec::new(), Vec::new());
    }
    let lt = tokenize(left);
    let rt = tokenize(right);

    // With "ignore spaces" the spaces do not take part in the comparison (nor are they highlighted):
    // `All` removes them all; `Trailing` those at the end of the line; `Amount` those at the end and
    // treats every inner run as a single space.
    let comparable = |tokens: &[Token<'_>]| -> Vec<usize> {
        let last = tokens.len().checked_sub(1);
        (0..tokens.len())
            .filter(|&i| {
                if tokens[i].class != Class::Space {
                    return true;
                }
                match opts.whitespace {
                    Whitespace::None => true,
                    Whitespace::All => false,
                    Whitespace::Trailing | Whitespace::Amount => Some(i) != last,
                }
            })
            .collect()
    };
    let li = comparable(&lt);
    let ri = comparable(&rt);
    let amount = opts.whitespace == Whitespace::Amount;
    let la: Vec<&str> = li.iter().map(|&i| token_text(&lt[i], amount)).collect();
    let ra: Vec<&str> = ri.iter().map(|&i| token_text(&rt[i], amount)).collect();

    let mut lmark = vec![false; lt.len()];
    let mut rmark = vec![false; rt.len()];
    let mut shared_word = false;
    // Inside the line the minimal comparison is what counts: the chosen algorithm applies to the lines.
    let opts = &DiffOptions {
        algorithm: Algorithm::Myers,
        ..*opts
    };
    for edit in diff_edits(&la, &ra, opts) {
        match edit {
            Edit::Equal { a, .. } => {
                if lt[li[a]].class == Class::Word {
                    shared_word = true;
                }
            }
            Edit::Delete { a } => lmark[li[a]] = true,
            Edit::Insert { b } => rmark[ri[b]] = true,
        }
    }
    if !shared_word {
        return (Vec::new(), Vec::new());
    }
    (to_marks(&lt, &mut lmark), to_marks(&rt, &mut rmark))
}

/// Merges the highlighted tokens: the spaces between two highlighted tokens become highlighted too,
/// so "two changed words" is a single range.
fn to_marks(tokens: &[Token<'_>], marked: &mut [bool]) -> Vec<Mark> {
    let mut i = 0;
    while i < tokens.len() {
        if !marked[i] && tokens[i].class == Class::Space {
            let mut j = i;
            while j < tokens.len() && !marked[j] && tokens[j].class == Class::Space {
                j += 1;
            }
            if i > 0 && j < tokens.len() && marked[i - 1] && marked[j] {
                marked[i..j].iter_mut().for_each(|m| *m = true);
            }
            i = j.max(i + 1);
        } else {
            i += 1;
        }
    }
    let mut marks: Vec<Mark> = Vec::new();
    for (token, &is_marked) in tokens.iter().zip(marked.iter()) {
        if !is_marked {
            continue;
        }
        match marks.last_mut() {
            Some(last) if last.end == token.start => last.end = token.end,
            _ => marks.push(Mark {
                start: token.start,
                end: token.end,
            }),
        }
    }
    marks
}

#[cfg(test)]
mod tests;
