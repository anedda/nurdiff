//! Line-by-line comparison (Myers algorithm in linear space) and construction
//! of the side-by-side rows.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::anchors::{anchored_edits_flagged, Strategy};
use crate::inline::Mark;

/// Maximum number of "rounds" of the algorithm for each subproblem: it finds the minimal
/// diff as long as the edit distance of the subproblem stays below about twice this value
/// (~12000 changed lines). Beyond that the search is cut at the furthest point reached and
/// continues on both sides of it: the result is still precise, only no longer guaranteed
/// minimal. Lines that exist on one side only do not count towards the distance (see
/// `edits_from_ids`). It avoids exploding running times on completely different regions.
pub const MAX_ROUNDS: usize = 6000;

/// Rounds per subproblem once one has been cut short (the result is approximate anyway).
const FALLBACK_ROUNDS: usize = 1000;

/// The algorithm that decides which lines are paired.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Algorithm {
    /// The minimum number of different lines: it is the default.
    #[default]
    Myers,
    /// Starts from the lines that appear exactly once on both sides.
    Patience,
    /// Starts from the longest common stretch among the rarest lines.
    Histogram,
}

/// Which whitespace differences do not count when comparing two lines. The same levels
/// as `git diff`: `--ignore-space-at-eol`, `-b` and `-w`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Whitespace {
    /// All whitespace counts: it is the default.
    #[default]
    None,
    /// Whitespace at the end of the line is ignored.
    Trailing,
    /// Like `Trailing`, and a run of spaces and tabs counts the same as any other (but "no
    /// space" stays different from "one space").
    Amount,
    /// Any whitespace, also inside the line.
    All,
}

impl Whitespace {
    pub const ALL: [Whitespace; 4] = [
        Whitespace::None,
        Whitespace::Trailing,
        Whitespace::Amount,
        Whitespace::All,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Whitespace::None => "none",
            Whitespace::Trailing => "trailing",
            Whitespace::Amount => "amount",
            Whitespace::All => "all",
        }
    }
}

impl Algorithm {
    pub const ALL: [Algorithm; 3] = [Algorithm::Myers, Algorithm::Patience, Algorithm::Histogram];

    pub fn name(self) -> &'static str {
        match self {
            Algorithm::Myers => "myers",
            Algorithm::Patience => "patience",
            Algorithm::Histogram => "histogram",
        }
    }
}

impl std::str::FromStr for Algorithm {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, String> {
        Algorithm::ALL
            .into_iter()
            .find(|a| a.name() == s.to_ascii_lowercase())
            .ok_or_else(|| format!("unknown algorithm: {s} (myers, patience or histogram)"))
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct DiffOptions {
    pub ignore_case: bool,
    /// Which whitespace differences do not count.
    pub whitespace: Whitespace,
    /// How to pair the lines (it does not apply to the parts highlighted inside a line).
    pub algorithm: Algorithm,
}

/// Elementary operation returned by the engine (0-based indexes).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edit {
    Equal { a: usize, b: usize },
    Delete { a: usize },
    Insert { b: usize },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RowKind {
    Equal,
    /// Line present on both sides but different.
    Changed,
    LeftOnly,
    RightOnly,
}

/// A line of text with its number (1-based).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Cell {
    pub number: usize,
    pub text: String,
    /// Parts of the line that differ from the other side (only for "modified" rows, and only
    /// when `DiffStore::rows` asks for them): ranges in UTF-16 units.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub marks: Vec<Mark>,
}

/// Row of the side-by-side view.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Row {
    pub kind: RowKind,
    pub left: Option<Cell>,
    pub right: Option<Cell>,
    /// True if, with a filter active, other rows were hidden before this one.
    /// Set only by `Session::visible_rows`.
    #[serde(skip_serializing_if = "is_false")]
    pub gap: bool,
    /// True if the two lines are side by side because the user chose so (a fixed point),
    /// and not because the algorithm paired them.
    #[serde(skip_serializing_if = "is_false")]
    pub aligned: bool,
}

pub(crate) fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub equal: usize,
    pub changed: usize,
    pub left_only: usize,
    pub right_only: usize,
}

impl DiffStats {
    fn from_rows(rows: &[Row]) -> Self {
        let mut stats = DiffStats::default();
        for row in rows {
            match row.kind {
                RowKind::Equal => stats.equal += 1,
                RowKind::Changed => stats.changed += 1,
                RowKind::LeftOnly => stats.left_only += 1,
                RowKind::RightOnly => stats.right_only += 1,
            }
        }
        stats
    }

    pub fn is_identical(&self) -> bool {
        self.changed == 0 && self.left_only == 0 && self.right_only == 0
    }
}

/// Compares two lists of lines and returns the side-by-side rows with the statistics.
pub fn diff_lines(a: &[&str], b: &[&str], opts: &DiffOptions) -> (Vec<Row>, DiffStats) {
    diff_lines_aligned(a, b, opts, &[])
}

/// Like [`diff_lines`], but with fixed points chosen by hand: each pair `(line of a, line of b)`
/// (from 0) is placed side by side anyway, and the comparison runs separately before and after it,
/// with the chosen algorithm. A pair with different lines becomes a "modified" row.
///
/// The pairs must be increasing on both sides and inside the lists; those that are not
/// are ignored (whoever creates them checks them: see `Session::align`).
pub fn diff_lines_aligned(
    a: &[&str],
    b: &[&str],
    opts: &DiffOptions,
    aligns: &[(usize, usize)],
) -> (Vec<Row>, DiffStats) {
    let (rows, stats, _) = diff_lines_full(a, b, opts, aligns);
    (rows, stats)
}

/// Like [`diff_lines_aligned`], and says whether the result is approximate: the search for the smallest
/// diff hit [`MAX_ROUNDS`] somewhere, so the diff is correct but may have more changed lines than the minimum.
pub(crate) fn diff_lines_full(
    a: &[&str],
    b: &[&str],
    opts: &DiffOptions,
    aligns: &[(usize, usize)],
) -> (Vec<Row>, DiffStats, bool) {
    let mut approximate = false;
    let mut rows = Vec::new();
    let (mut a_from, mut b_from) = (0, 0);
    for &(ai, bi) in aligns {
        if ai < a_from || bi < b_from || ai >= a.len() || bi >= b.len() {
            continue;
        }
        segment_rows(
            &mut rows,
            a,
            b,
            a_from..ai,
            b_from..bi,
            opts,
            &mut approximate,
        );
        let kind = if key(a[ai], opts) == key(b[bi], opts) {
            RowKind::Equal
        } else {
            RowKind::Changed
        };
        rows.push(Row {
            kind,
            left: Some(cell(a, ai)),
            right: Some(cell(b, bi)),
            gap: false,
            aligned: true,
        });
        a_from = ai + 1;
        b_from = bi + 1;
    }
    segment_rows(
        &mut rows,
        a,
        b,
        a_from..a.len(),
        b_from..b.len(),
        opts,
        &mut approximate,
    );

    let stats = DiffStats::from_rows(&rows);
    (rows, stats, approximate)
}

/// The side-by-side rows for the stretch `a_range` / `b_range` (absolute indexes in `a` and `b`).
fn segment_rows(
    rows: &mut Vec<Row>,
    a: &[&str],
    b: &[&str],
    a_range: std::ops::Range<usize>,
    b_range: std::ops::Range<usize>,
    opts: &DiffOptions,
    approximate: &mut bool,
) {
    let (a_off, b_off) = (a_range.start, b_range.start);
    let (mut dels, mut ins) = (Vec::new(), Vec::new());
    for edit in diff_edits_flagged(&a[a_range], &b[b_range], opts, approximate) {
        match edit {
            Edit::Equal { a: ai, b: bi } => {
                flush_run(rows, &mut dels, &mut ins, a, b);
                rows.push(Row {
                    kind: RowKind::Equal,
                    left: Some(cell(a, ai + a_off)),
                    right: Some(cell(b, bi + b_off)),
                    gap: false,
                    aligned: false,
                });
            }
            Edit::Delete { a: ai } => dels.push(ai + a_off),
            Edit::Insert { b: bi } => ins.push(bi + b_off),
        }
    }
    flush_run(rows, &mut dels, &mut ins, a, b);
}

fn cell(lines: &[&str], index: usize) -> Cell {
    Cell {
        number: index + 1,
        text: lines[index].to_string(),
        marks: Vec::new(),
    }
}

/// Turns a sequence of consecutive deletions/insertions into side-by-side rows:
/// the i-th deletion is paired with the i-th insertion (a "modified" row).
fn flush_run(
    rows: &mut Vec<Row>,
    dels: &mut Vec<usize>,
    ins: &mut Vec<usize>,
    a: &[&str],
    b: &[&str],
) {
    for i in 0..dels.len().max(ins.len()) {
        let left = dels.get(i).map(|&ai| cell(a, ai));
        let right = ins.get(i).map(|&bi| cell(b, bi));
        let kind = match (&left, &right) {
            (Some(_), Some(_)) => RowKind::Changed,
            (Some(_), None) => RowKind::LeftOnly,
            _ => RowKind::RightOnly,
        };
        rows.push(Row {
            kind,
            left,
            right,
            gap: false,
            aligned: false,
        });
    }
    dels.clear();
    ins.clear();
}

/// Comparison key of a line according to the options.
fn key(line: &str, opts: &DiffOptions) -> String {
    let mut s = String::with_capacity(line.len());
    let line = match opts.whitespace {
        Whitespace::None | Whitespace::All => line,
        Whitespace::Trailing | Whitespace::Amount => line.trim_end(),
    };
    // `Amount`: a run of whitespace becomes a single space, added when another character follows.
    let mut pending_space = false;
    for c in line.chars() {
        if c.is_whitespace() {
            match opts.whitespace {
                Whitespace::All => continue,
                Whitespace::Amount => {
                    pending_space = true;
                    continue;
                }
                Whitespace::None | Whitespace::Trailing => {}
            }
        }
        if pending_space {
            s.push(' ');
            pending_space = false;
        }
        if opts.ignore_case {
            s.extend(c.to_lowercase());
        } else {
            s.push(c);
        }
    }
    s
}

/// Sequence of operations that turns `a` into `b`.
pub fn diff_edits(a: &[&str], b: &[&str], opts: &DiffOptions) -> Vec<Edit> {
    diff_edits_flagged(a, b, opts, &mut false)
}

/// Like [`diff_edits`]; `approximate` is set if the search hit [`MAX_ROUNDS`] (it is never cleared).
fn diff_edits_flagged(
    a: &[&str],
    b: &[&str],
    opts: &DiffOptions,
    approximate: &mut bool,
) -> Vec<Edit> {
    // Every distinct line (according to the options) becomes an integer: the comparisons
    // of the algorithm then cost O(1) instead of comparing strings.
    let mut ids: HashMap<String, u32> = HashMap::new();
    let mut intern = |line: &str| -> u32 {
        let next = ids.len() as u32;
        *ids.entry(key(line, opts)).or_insert(next)
    };
    let ia: Vec<u32> = a.iter().map(|&l| intern(l)).collect();
    let ib: Vec<u32> = b.iter().map(|&l| intern(l)).collect();
    match opts.algorithm {
        Algorithm::Myers => edits_from_ids_flagged(&ia, &ib, approximate),
        Algorithm::Patience => anchored_edits_flagged(&ia, &ib, Strategy::Patience, approximate),
        Algorithm::Histogram => anchored_edits_flagged(&ia, &ib, Strategy::Histogram, approximate),
    }
}

/// Like `edits_from_ids`, with the algorithm of your choice.
pub fn edits_with_algorithm(a: &[u32], b: &[u32], algorithm: Algorithm) -> Vec<Edit> {
    match algorithm {
        Algorithm::Myers => edits_from_ids(a, b),
        Algorithm::Patience => anchored_edits_flagged(a, b, Strategy::Patience, &mut false),
        Algorithm::Histogram => anchored_edits_flagged(a, b, Strategy::Histogram, &mut false),
    }
}

/// Like `diff_edits`, but on sequences of integers.
///
/// Lines that exist on one side only can never be part of a common subsequence, so they are
/// left out of the search (and put back as removed or added afterwards): the number of changed
/// lines is the same (the alignment among equally small diffs may differ), but the edit distance
/// the search has to cover shrinks to the lines that really move. It is only done when the
/// rounds limit could be reached at all: below that the extra pass would only cost time.
pub fn edits_from_ids(a: &[u32], b: &[u32]) -> Vec<Edit> {
    edits_from_ids_flagged(a, b, &mut false)
}

/// Like [`edits_from_ids`]; `approximate` is set if the search hit [`MAX_ROUNDS`] (it is never cleared).
pub(crate) fn edits_from_ids_flagged(a: &[u32], b: &[u32], approximate: &mut bool) -> Vec<Edit> {
    // The edit distance cannot exceed `a.len() + b.len()`, and a round covers two of it.
    if a.len() + b.len() <= 2 * MAX_ROUNDS {
        return edits_with_limit_flagged(a, b, MAX_ROUNDS, approximate);
    }
    let in_a: HashSet<u32> = a.iter().copied().collect();
    let in_b: HashSet<u32> = b.iter().copied().collect();
    let keep_a: Vec<usize> = (0..a.len()).filter(|&i| in_b.contains(&a[i])).collect();
    let keep_b: Vec<usize> = (0..b.len()).filter(|&j| in_a.contains(&b[j])).collect();
    if keep_a.len() == a.len() && keep_b.len() == b.len() {
        return edits_with_limit_flagged(a, b, MAX_ROUNDS, approximate);
    }
    let ra: Vec<u32> = keep_a.iter().map(|&i| a[i]).collect();
    let rb: Vec<u32> = keep_b.iter().map(|&j| b[j]).collect();
    let reduced = edits_with_limit_flagged(&ra, &rb, MAX_ROUNDS, approximate);

    // Put the left-out lines back: before each operation, the ones that precede it on their side.
    let mut out = Vec::with_capacity(a.len() + b.len());
    let (mut next_a, mut next_b) = (0, 0);
    for edit in reduced {
        let (to_a, to_b) = match edit {
            Edit::Equal { a: x, b: y } => (Some(keep_a[x]), Some(keep_b[y])),
            Edit::Delete { a: x } => (Some(keep_a[x]), None),
            Edit::Insert { b: y } => (None, Some(keep_b[y])),
        };
        if let Some(i) = to_a {
            out.extend((next_a..i).map(|a| Edit::Delete { a }));
            next_a = i + 1;
        }
        if let Some(j) = to_b {
            out.extend((next_b..j).map(|b| Edit::Insert { b }));
            next_b = j + 1;
        }
        out.push(match edit {
            Edit::Equal { .. } => Edit::Equal {
                a: to_a.unwrap_or(0),
                b: to_b.unwrap_or(0),
            },
            Edit::Delete { .. } => Edit::Delete {
                a: to_a.unwrap_or(0),
            },
            Edit::Insert { .. } => Edit::Insert {
                b: to_b.unwrap_or(0),
            },
        });
    }
    out.extend((next_a..a.len()).map(|a| Edit::Delete { a }));
    out.extend((next_b..b.len()).map(|b| Edit::Insert { b }));
    out
}

#[cfg(test)]
fn edits_with_limit(a: &[u32], b: &[u32], max_rounds: usize) -> Vec<Edit> {
    edits_with_limit_flagged(a, b, max_rounds, &mut false)
}

fn edits_with_limit_flagged(
    a: &[u32],
    b: &[u32],
    max_rounds: usize,
    approximate: &mut bool,
) -> Vec<Edit> {
    let mut solver = Solver::new(a, b, max_rounds);
    solver.solve(0, a.len(), 0, b.len());
    *approximate |= solver.approximate;
    solver.out
}

/// "Unreachable" value in the diagonal tables.
const NEG: isize = isize::MIN / 4;

/// Linear-space Myers: the "middle snake" is searched (the point where the forward path
/// and the backward path meet), the problem is split there into two halves and each is
/// solved recursively. Memory is O(N + M) instead of O(D²).
struct Solver<'a> {
    a: &'a [u32],
    b: &'a [u32],
    /// Maximum number of rounds per subproblem (and size of the tables).
    cap: usize,
    /// Rounds allowed now: `cap` until a subproblem is cut short, then `FALLBACK_ROUNDS`.
    limit: usize,
    /// For each diagonal k, the furthest x reached by the forward search.
    vf: Vec<isize>,
    /// Like `vf`, but for the backward search (reversed coordinates).
    vb: Vec<isize>,
    out: Vec<Edit>,
    /// A subproblem needed more than `cap` rounds: the result is not guaranteed minimal.
    approximate: bool,
}

impl<'a> Solver<'a> {
    fn new(a: &'a [u32], b: &'a [u32], max_rounds: usize) -> Self {
        let cap = max_rounds.min((a.len() + b.len()).div_ceil(2) + 1).max(1);
        Solver {
            a,
            b,
            cap,
            limit: cap,
            vf: vec![NEG; 2 * cap + 2],
            vb: vec![NEG; 2 * cap + 2],
            out: Vec::with_capacity(a.len() + b.len()),
            approximate: false,
        }
    }

    /// Computes the operations for `a[a_lo..a_hi]` against `b[b_lo..b_hi]`, in order.
    fn solve(&mut self, mut a_lo: usize, mut a_hi: usize, mut b_lo: usize, mut b_hi: usize) {
        // Common prefix and suffix: in real cases they are almost the whole file.
        while a_lo < a_hi && b_lo < b_hi && self.a[a_lo] == self.b[b_lo] {
            self.out.push(Edit::Equal { a: a_lo, b: b_lo });
            a_lo += 1;
            b_lo += 1;
        }
        let mut suffix = 0;
        while a_lo + suffix < a_hi
            && b_lo + suffix < b_hi
            && self.a[a_hi - 1 - suffix] == self.b[b_hi - 1 - suffix]
        {
            suffix += 1;
        }
        a_hi -= suffix;
        b_hi -= suffix;

        if a_lo == a_hi {
            self.out.extend((b_lo..b_hi).map(|b| Edit::Insert { b }));
        } else if b_lo == b_hi {
            self.out.extend((a_lo..a_hi).map(|a| Edit::Delete { a }));
        } else {
            match self.middle_snake(a_lo, a_hi, b_lo, b_hi) {
                // The progress check avoids infinite recursion in case of a bug.
                Some((x, y)) if (x, y) != (a_lo, b_lo) && (x, y) != (a_hi, b_hi) => {
                    self.solve(a_lo, x, b_lo, y);
                    self.solve(x, a_hi, y, b_hi);
                }
                _ => {
                    // Region too different: everything removed, then everything added.
                    self.out.extend((a_lo..a_hi).map(|a| Edit::Delete { a }));
                    self.out.extend((b_lo..b_hi).map(|b| Edit::Insert { b }));
                }
            }
        }

        for i in 0..suffix {
            self.out.push(Edit::Equal {
                a: a_hi + i,
                b: b_hi + i,
            });
        }
    }

    /// Finds a point (absolute coordinates) that a minimum-cost path goes through,
    /// so as to split the problem into two halves. If more than `cap` rounds are needed
    /// it gives the furthest point reached instead (the result is no longer minimal);
    /// `None` only if that point makes no progress.
    fn middle_snake(
        &mut self,
        a_lo: usize,
        a_hi: usize,
        b_lo: usize,
        b_hi: usize,
    ) -> Option<(usize, usize)> {
        let (a, b) = (self.a, self.b);
        let n = (a_hi - a_lo) as isize;
        let m = (b_hi - b_lo) as isize;
        let delta = n - m;
        let odd = delta & 1 != 0;
        let rounds = ((n + m + 1) / 2 + 1).min(self.limit as isize);
        let off = self.cap as isize;
        let idx = |k: isize| (k + off) as usize;
        // A point on diagonal k is valid only if it lies inside the grid.
        let valid = |x: isize, k: isize| x >= 0 && x <= n && x - k >= 0 && x - k <= m;
        let (vf, vb) = (&mut self.vf, &mut self.vb);

        for d in 0..rounds {
            // --- Forward search ---
            let mut k = -d;
            while k <= d {
                let start = if d == 0 {
                    0
                } else {
                    let right = if k > -d { vf[idx(k - 1)] + 1 } else { NEG };
                    let down = if k < d { vf[idx(k + 1)] } else { NEG };
                    match (valid(right, k), valid(down, k)) {
                        (true, true) => right.max(down),
                        (true, false) => right,
                        (false, true) => down,
                        (false, false) => NEG,
                    }
                };
                if start == NEG {
                    vf[idx(k)] = NEG;
                    k += 2;
                    continue;
                }
                let mut x = start;
                let mut y = x - k;
                let (x0, y0) = (x, y);
                while x < n && y < m && a[a_lo + x as usize] == b[b_lo + y as usize] {
                    x += 1;
                    y += 1;
                }
                vf[idx(k)] = x;
                // With an odd delta the two searches meet during the forward one.
                if odd && (k - delta).abs() < d && x + vb[idx(delta - k)] >= n {
                    return Some((a_lo + x0 as usize, b_lo + y0 as usize));
                }
                k += 2;
            }

            // --- Backward search (sequences read from the end) ---
            let mut k = -d;
            while k <= d {
                let start = if d == 0 {
                    0
                } else {
                    let right = if k > -d { vb[idx(k - 1)] + 1 } else { NEG };
                    let down = if k < d { vb[idx(k + 1)] } else { NEG };
                    match (valid(right, k), valid(down, k)) {
                        (true, true) => right.max(down),
                        (true, false) => right,
                        (false, true) => down,
                        (false, false) => NEG,
                    }
                };
                if start == NEG {
                    vb[idx(k)] = NEG;
                    k += 2;
                    continue;
                }
                let mut x = start;
                let mut y = x - k;
                while x < n && y < m && a[a_hi - 1 - x as usize] == b[b_hi - 1 - y as usize] {
                    x += 1;
                    y += 1;
                }
                vb[idx(k)] = x;
                // With an even delta they meet during the backward one.
                if !odd && (k - delta).abs() <= d && x + vf[idx(delta - k)] >= n {
                    return Some((a_hi - x as usize, b_hi - y as usize));
                }
                k += 2;
            }
        }
        self.approximate = true;
        // Every cut costs `rounds`² steps and advances about `rounds`: with a smaller limit from here on the
        // total stays proportional to the size instead of growing with every cut.
        self.limit = self.limit.min(FALLBACK_ROUNDS);
        self.furthest_point(a_lo, a_hi, b_lo, b_hi, rounds)
    }

    /// After `rounds` rounds without the two searches meeting: the point, among those reached by either
    /// search, that is furthest from its own corner (largest x + y); the problem is split there.
    fn furthest_point(
        &self,
        a_lo: usize,
        a_hi: usize,
        b_lo: usize,
        b_hi: usize,
        rounds: isize,
    ) -> Option<(usize, usize)> {
        let off = self.cap as isize;
        let reach = |table: &[isize]| {
            (-(rounds - 1)..=rounds - 1)
                .filter_map(|k| {
                    let x = table[(k + off) as usize];
                    (x != NEG).then_some((2 * x - k, x, x - k))
                })
                .max()
        };
        let forward = reach(&self.vf);
        let backward = reach(&self.vb);
        match (forward, backward) {
            (Some(f), Some(b)) if b.0 > f.0 => Some((a_hi - b.1 as usize, b_hi - b.2 as usize)),
            (Some(f), _) => Some((a_lo + f.1 as usize, b_lo + f.2 as usize)),
            (None, Some(b)) => Some((a_hi - b.1 as usize, b_hi - b.2 as usize)),
            (None, None) => None,
        }
    }
}

/// Group of consecutive rows that are not equal (`end` is exclusive).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub start: usize,
    pub end: usize,
    pub kind: HunkKind,
    /// Rows of the left / right side before the block: where a line that is missing on that
    /// side is inserted at the start of the block.
    pub left_at: usize,
    pub right_at: usize,
}

/// Prevailing kind of a block: it colours the mark in the overview bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HunkKind {
    /// At least one modified row, or removed and added rows together.
    Changed,
    LeftOnly,
    RightOnly,
}

/// Groups the consecutive rows that are not equal.
pub fn compute_hunks(rows: &[Row]) -> Vec<Hunk> {
    let mut hunks = Vec::new();
    let mut i = 0;
    // Rows of each side seen so far (they are needed by `left_at` and `right_at`).
    let (mut seen_left, mut seen_right) = (0, 0);
    while i < rows.len() {
        if rows[i].kind == RowKind::Equal {
            seen_left += 1;
            seen_right += 1;
            i += 1;
            continue;
        }
        let start = i;
        let (left_at, right_at) = (seen_left, seen_right);
        let (mut changed, mut left, mut right) = (false, false, false);
        while i < rows.len() && rows[i].kind != RowKind::Equal {
            match rows[i].kind {
                RowKind::Changed => changed = true,
                RowKind::LeftOnly => left = true,
                _ => right = true,
            }
            seen_left += usize::from(rows[i].left.is_some());
            seen_right += usize::from(rows[i].right.is_some());
            i += 1;
        }
        let kind = if changed || (left && right) {
            HunkKind::Changed
        } else if left {
            HunkKind::LeftOnly
        } else {
            HunkKind::RightOnly
        };
        hunks.push(Hunk {
            start,
            end: i,
            kind,
            left_at,
            right_at,
        });
    }
    hunks
}

/// Width in characters of a line in a monospaced font: every tab counts
/// [`TAB_SIZE`] columns.
pub fn visual_width(text: &str) -> usize {
    text.chars()
        .map(|c| if c == '\t' { TAB_SIZE } else { 1 })
        .sum()
}

/// Columns taken by a tab in the view (it must match `tab-size` in `src/styles/20-file-viewer.css`).
pub const TAB_SIZE: usize = 4;

/// The widest line of the two sides: it is used to size the horizontally scrollable area.
pub fn max_line_width(rows: &[Row]) -> usize {
    rows.iter()
        .flat_map(|r| [r.left.as_ref(), r.right.as_ref()])
        .flatten()
        .map(|c| visual_width(&c.text))
        .max()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests;
