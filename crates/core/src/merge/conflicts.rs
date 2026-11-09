//! Resolving the conflicts of a merged file (`git mergetool`). Git has already merged what it could and has written the
//! rest between conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`, and `|||||||` with the base, in the `diff3` style):
//! here each conflict is chosen (local, remote, both) or written by hand, and the result is saved over the same file.
//! What git decided is conflict and what is not stays git's decision.

use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::{Document, MergeError, SaveError, MAX_UNDO};
use crate::text::TextError;

/// What to put in place of a conflict.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    /// Not chosen yet: the conflict stays in the file with its markers.
    Unresolved,
    /// The local side (the first one in the file).
    Ours,
    /// The remote side.
    Theirs,
    /// Local, then remote.
    Both,
    /// Remote, then local.
    BothReversed,
    /// Text written by hand.
    Custom { lines: Vec<String> },
}

#[derive(Debug, Clone)]
struct Conflict {
    /// The marker lines as they were in the file, to put them back if the conflict stays unresolved.
    open: String,
    base_marker: Option<String>,
    sep: String,
    close: String,
    ours: Vec<String>,
    base: Option<Vec<String>>,
    theirs: Vec<String>,
    resolution: Resolution,
}

impl Conflict {
    /// The lines this conflict gives to the file in its current state.
    fn result(&self) -> Vec<String> {
        match &self.resolution {
            Resolution::Unresolved => {
                let mut out = vec![self.open.clone()];
                out.extend(self.ours.iter().cloned());
                if let (Some(marker), Some(base)) = (&self.base_marker, &self.base) {
                    out.push(marker.clone());
                    out.extend(base.iter().cloned());
                }
                out.push(self.sep.clone());
                out.extend(self.theirs.iter().cloned());
                out.push(self.close.clone());
                out
            }
            Resolution::Ours => self.ours.clone(),
            Resolution::Theirs => self.theirs.clone(),
            Resolution::Both => [self.ours.as_slice(), self.theirs.as_slice()].concat(),
            Resolution::BothReversed => [self.theirs.as_slice(), self.ours.as_slice()].concat(),
            Resolution::Custom { lines } => lines.clone(),
        }
    }
}

#[derive(Debug, Clone)]
enum Segment {
    Text(Vec<String>),
    Conflict(Conflict),
}

/// How long the run of marker characters is: a marker is at least 7 of them, then a space or the end of the line.
fn marker_len(line: &str, ch: char) -> Option<usize> {
    let n = line.chars().take_while(|&c| c == ch).count();
    let rest = &line[n * ch.len_utf8()..];
    (n >= 7 && (rest.is_empty() || rest.starts_with(' '))).then_some(n)
}

/// A conflict that starts at `lines[at]` (`<<<<<<<`): the conflict and how many lines it takes, if it is well formed.
fn parse_conflict(lines: &[String], at: usize) -> Option<(Conflict, usize)> {
    let n = marker_len(&lines[at], '<')?;
    let is = |line: &str, ch: char| marker_len(line, ch) == Some(n);
    let mut ours = Vec::new();
    let mut base: Option<(String, Vec<String>)> = None;
    let mut theirs = Vec::new();
    // 0: local side, 1: base (diff3), 2: remote side
    let mut part = 0;
    let mut sep = None;
    for (offset, line) in lines[at + 1..].iter().enumerate() {
        match part {
            0 if is(line, '|') => {
                base = Some((line.clone(), Vec::new()));
                part = 1;
            }
            0 | 1 if line.as_str() == "=".repeat(n) => {
                sep = Some(line.clone());
                part = 2;
            }
            2 if is(line, '>') => {
                let conflict = Conflict {
                    open: lines[at].clone(),
                    base_marker: base.as_ref().map(|(m, _)| m.clone()),
                    sep: sep?,
                    close: line.clone(),
                    ours,
                    base: base.map(|(_, b)| b),
                    theirs,
                    resolution: Resolution::Unresolved,
                };
                return Some((conflict, offset + 2));
            }
            // a new opening before the end: this one is not a conflict
            _ if is(line, '<') => return None,
            0 => ours.push(line.clone()),
            1 => {
                if let Some((_, b)) = base.as_mut() {
                    b.push(line.clone());
                }
            }
            _ => theirs.push(line.clone()),
        }
    }
    None
}

fn parse(lines: &[String]) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut text: Vec<String> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if let Some((conflict, taken)) = parse_conflict(lines, i) {
            if !text.is_empty() {
                segments.push(Segment::Text(std::mem::take(&mut text)));
            }
            segments.push(Segment::Conflict(conflict));
            i += taken;
        } else {
            text.push(lines[i].clone());
            i += 1;
        }
    }
    if !text.is_empty() {
        segments.push(Segment::Text(text));
    }
    segments
}

/// What the UI receives for each piece of the file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SegmentView {
    /// Lines without conflict; `start` is the number (from 1) of the first one in the file as it is now.
    #[serde(rename_all = "camelCase")]
    Text { start: usize, lines: Vec<String> },
    #[serde(rename_all = "camelCase")]
    Conflict {
        /// Position among the conflicts (from 0).
        index: usize,
        /// Number of the first line of its result in the file as it is now.
        start: usize,
        ours_label: String,
        theirs_label: String,
        ours: Vec<String>,
        base: Option<Vec<String>>,
        theirs: Vec<String>,
        resolution: Resolution,
        /// The lines it gives to the file now (with the markers if unresolved).
        result: Vec<String>,
    },
}

/// The file with its conflicts, for the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictView {
    pub id: u64,
    pub path: String,
    pub segments: Vec<SegmentView>,
    /// Number of conflicts, and how many are still unresolved.
    pub total: usize,
    pub unresolved: usize,
    /// There are unsaved changes.
    pub dirty: bool,
    pub can_undo: bool,
}

/// A file with conflict markers being resolved.
#[derive(Debug)]
pub struct ConflictSession {
    doc: Document,
    segments: Vec<Segment>,
    /// The choices before each change, to undo.
    history: Vec<Vec<Resolution>>,
}

impl ConflictSession {
    pub fn load(path: &Path) -> Result<Self, TextError> {
        let doc = Document::load(path)?;
        let lines: Vec<String> = doc.lines.iter().map(|l| l.to_string()).collect();
        Ok(ConflictSession {
            segments: parse(&lines),
            doc,
            history: Vec::new(),
        })
    }

    fn conflicts(&self) -> impl Iterator<Item = &Conflict> {
        self.segments.iter().filter_map(|s| match s {
            Segment::Conflict(c) => Some(c),
            Segment::Text(_) => None,
        })
    }

    fn conflicts_mut(&mut self) -> impl Iterator<Item = &mut Conflict> {
        self.segments.iter_mut().filter_map(|s| match s {
            Segment::Conflict(c) => Some(c),
            Segment::Text(_) => None,
        })
    }

    pub fn total(&self) -> usize {
        self.conflicts().count()
    }

    /// How many conflicts are still without a choice.
    pub fn unresolved(&self) -> usize {
        self.conflicts()
            .filter(|c| c.resolution == Resolution::Unresolved)
            .count()
    }

    pub fn is_dirty(&self) -> bool {
        self.doc.is_dirty()
    }

    pub fn can_undo(&self) -> bool {
        !self.history.is_empty()
    }

    pub fn path(&self) -> &Path {
        &self.doc.path
    }

    /// Writes the current state of every conflict into the rows of the document.
    fn apply(&mut self) {
        let mut lines: Vec<Arc<str>> = Vec::new();
        for segment in &self.segments {
            match segment {
                Segment::Text(t) => lines.extend(t.iter().map(|l| Arc::from(l.as_str()))),
                Segment::Conflict(c) => {
                    lines.extend(c.result().iter().map(|l| Arc::from(l.as_str())))
                }
            }
        }
        self.doc.lines = Arc::new(lines);
    }

    /// Chooses what to put in place of the conflict `index` (from 0); `Unresolved` takes the choice back.
    pub fn resolve(&mut self, index: usize, resolution: Resolution) -> Result<(), MergeError> {
        if let Resolution::Custom { lines } = &resolution {
            if lines.iter().any(|l| l.contains(['\n', '\r'])) {
                return Err(MergeError::LineBreakInLine);
            }
        }
        if index >= self.total() {
            return Err(MergeError::NoSuchHunk(index));
        }
        let before: Vec<Resolution> = self.conflicts().map(|c| c.resolution.clone()).collect();
        let conflict = self
            .conflicts_mut()
            .nth(index)
            .ok_or(MergeError::NoSuchHunk(index))?;
        if conflict.resolution == resolution {
            return Ok(());
        }
        conflict.resolution = resolution;
        self.history.push(before);
        if self.history.len() > MAX_UNDO {
            self.history.remove(0);
        }
        self.apply();
        Ok(())
    }

    pub fn undo(&mut self) -> Result<(), MergeError> {
        let before = self.history.pop().ok_or(MergeError::NothingToUndo)?;
        for (conflict, resolution) in self.conflicts_mut().zip(before) {
            conflict.resolution = resolution;
        }
        self.apply();
        Ok(())
    }

    /// Saves the file over itself, with its encoding and line ending.
    pub fn save(&mut self) -> Result<(), SaveError> {
        let same = self.doc.clone();
        self.doc.write(&same)
    }

    pub fn view(&self, id: u64) -> ConflictView {
        let label = |marker: &str, ch: char| marker.trim_start_matches(ch).trim().to_string();
        let mut segments = Vec::new();
        let (mut line, mut index) = (1, 0);
        for segment in &self.segments {
            match segment {
                Segment::Text(lines) => {
                    segments.push(SegmentView::Text {
                        start: line,
                        lines: lines.clone(),
                    });
                    line += lines.len();
                }
                Segment::Conflict(c) => {
                    let result = c.result();
                    let len = result.len();
                    segments.push(SegmentView::Conflict {
                        index,
                        start: line,
                        ours_label: label(&c.open, '<'),
                        theirs_label: label(&c.close, '>'),
                        ours: c.ours.clone(),
                        base: c.base.clone(),
                        theirs: c.theirs.clone(),
                        resolution: c.resolution.clone(),
                        result,
                    });
                    line += len;
                    index += 1;
                }
            }
        }
        ConflictView {
            id,
            path: self.doc.path.display().to_string(),
            segments,
            total: self.total(),
            unresolved: self.unresolved(),
            dirty: self.is_dirty(),
            can_undo: self.can_undo(),
        }
    }
}

#[cfg(test)]
mod tests;
