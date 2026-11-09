//! Search in the text of a comparison: where a string appears in the lines of a side.
//!
//! Positions are in UTF-16 code units, as JavaScript indexes them (like the marks of [`crate::inline`]): the UI
//! can use them directly with `String.prototype.slice`.

use serde::Serialize;

/// The search stops after this many matches (`SearchResult::truncated`): a count of millions is no use
/// to the UI, which only draws those it shows.
pub const MAX_HITS: usize = 10_000;

/// One match: the row of the view (among those the view shows) and the range `[start, end)` in the line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SearchHit {
    pub row: usize,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SearchResult {
    /// In order of row and position.
    pub hits: Vec<SearchHit>,
    /// There are more matches than `MAX_HITS`: the others were not looked for.
    pub truncated: bool,
}

/// What is searched for, ready to be looked for in many lines.
pub struct Needle {
    chars: Vec<char>,
    case_sensitive: bool,
}

/// One character of the line with where it starts and how long it is, in UTF-16 units.
#[derive(Clone, Copy)]
struct Unit {
    ch: char,
    start: usize,
    len: usize,
}

/// The character without case: one that becomes several is left as it is, so every character
/// keeps its place and the positions stay those of the original line.
fn fold(c: char) -> char {
    let mut lower = c.to_lowercase();
    match (lower.next(), lower.next()) {
        (Some(one), None) => one,
        _ => c,
    }
}

impl Needle {
    /// `None` for an empty text: it matches nowhere.
    pub fn new(text: &str, case_sensitive: bool) -> Option<Needle> {
        if text.is_empty() {
            return None;
        }
        let chars = text
            .chars()
            .map(|c| if case_sensitive { c } else { fold(c) })
            .collect();
        Some(Needle {
            chars,
            case_sensitive,
        })
    }

    /// Adds to `out` the matches in the line (they do not overlap), as ranges in UTF-16 units. `scratch`
    /// is a buffer the caller keeps between calls, so that a search over many lines does not allocate for each.
    fn find_in(&self, line: &str, scratch: &mut Vec<Unit>, out: &mut Vec<(usize, usize)>) {
        scratch.clear();
        let mut at = 0;
        for c in line.chars() {
            let len = c.len_utf16();
            let ch = if self.case_sensitive { c } else { fold(c) };
            scratch.push(Unit { ch, start: at, len });
            at += len;
        }
        let m = self.chars.len();
        let mut i = 0;
        while i + m <= scratch.len() {
            if scratch[i..i + m]
                .iter()
                .zip(&self.chars)
                .all(|(unit, want)| unit.ch == *want)
            {
                let last = scratch[i + m - 1];
                out.push((scratch[i].start, last.start + last.len));
                i += m;
            } else {
                i += 1;
            }
        }
    }
}

/// Every how many lines the search asks whether it was cancelled: often enough to stop within a few
/// milliseconds, rarely enough not to weigh on the search.
const CANCEL_CHECK_EVERY: usize = 4096;

/// Looks for `needle` in the lines (`row` is the position of the line in the view). It stops at `MAX_HITS`.
/// `cancelled` is consulted every [`CANCEL_CHECK_EVERY`] lines: if it becomes true the result is `None`.
pub fn search_lines<'a>(
    lines: impl Iterator<Item = (usize, Option<&'a str>)>,
    needle: &Needle,
    cancelled: &dyn Fn() -> bool,
) -> Option<SearchResult> {
    let mut hits = Vec::new();
    let (mut scratch, mut found) = (Vec::new(), Vec::new());
    for (seen, (row, line)) in lines.enumerate() {
        if seen % CANCEL_CHECK_EVERY == 0 && cancelled() {
            return None;
        }
        let Some(line) = line else { continue };
        found.clear();
        needle.find_in(line, &mut scratch, &mut found);
        for &(start, end) in &found {
            if hits.len() == MAX_HITS {
                return Some(SearchResult {
                    hits,
                    truncated: true,
                });
            }
            hits.push(SearchHit { row, start, end });
        }
    }
    Some(SearchResult {
        hits,
        truncated: false,
    })
}

#[cfg(test)]
mod tests;
