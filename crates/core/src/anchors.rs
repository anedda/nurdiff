//! Patience and Histogram: algorithms that first look for "anchor" lines and then solve
//! what lies between them recursively. Where they find no anchors they fall back to Myers.
//!
//! - **Patience**: anchors = lines that appear exactly once on both sides, kept in order with
//!   the longest increasing subsequence.
//! - **Histogram**: the anchor is the longest common stretch, preferring the lines that appear
//!   least often on the left side (at most [`MAX_CHAIN`]). It is the idea of the algorithm of the
//!   same name in Git/JGit, written here from scratch: in some cases the results can differ from
//!   the exact lines Git would choose.
//!
//! The work uses an explicit stack instead of recursion, so a long, pathological file cannot
//! exhaust the call stack.

use std::collections::HashMap;

use crate::diff::{edits_from_ids_flagged, Edit};

/// Above this number of occurrences on the left side, a line does not act as an anchor in Histogram.
pub const MAX_CHAIN: usize = 64;

/// Histogram picks one anchor per step and rebuilds its tables over the whole region each time: on a
/// big region with many blocks that is quadratic. Above this many rows (on either side) a region is
/// split with the unique lines of Patience instead, which gives many anchors in one pass; Histogram
/// refines the smaller regions that remain. A big region with no unique lines goes to Myers.
pub const HISTOGRAM_MAX_REGION: usize = 20_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Strategy {
    Patience,
    Histogram,
}

/// A common stretch: `len` equal rows starting at `a` (on the left) and at `b` (on the right).
type Anchor = (usize, usize, usize);

enum Task {
    Range {
        a_lo: usize,
        a_hi: usize,
        b_lo: usize,
        b_hi: usize,
    },
    Equal {
        a: usize,
        b: usize,
        len: usize,
    },
}

#[cfg(test)]
pub(crate) fn anchored_edits(a: &[u32], b: &[u32], strategy: Strategy) -> Vec<Edit> {
    anchored_edits_flagged(a, b, strategy, &mut false)
}

/// `approximate` is set if the Myers search of some stretch hit its limit (it is never cleared).
pub(crate) fn anchored_edits_flagged(
    a: &[u32],
    b: &[u32],
    strategy: Strategy,
    approximate: &mut bool,
) -> Vec<Edit> {
    let mut out = Vec::with_capacity(a.len() + b.len());
    let mut stack = vec![Task::Range {
        a_lo: 0,
        a_hi: a.len(),
        b_lo: 0,
        b_hi: b.len(),
    }];
    while let Some(task) = stack.pop() {
        let (mut a_lo, mut a_hi, mut b_lo, mut b_hi) = match task {
            Task::Equal { a, b, len } => {
                out.extend((0..len).map(|k| Edit::Equal { a: a + k, b: b + k }));
                continue;
            }
            Task::Range {
                a_lo,
                a_hi,
                b_lo,
                b_hi,
            } => (a_lo, a_hi, b_lo, b_hi),
        };

        // Common prefix and suffix: in real cases they are almost the whole file.
        while a_lo < a_hi && b_lo < b_hi && a[a_lo] == b[b_lo] {
            out.push(Edit::Equal { a: a_lo, b: b_lo });
            a_lo += 1;
            b_lo += 1;
        }
        let mut suffix = 0;
        while a_lo + suffix < a_hi
            && b_lo + suffix < b_hi
            && a[a_hi - 1 - suffix] == b[b_hi - 1 - suffix]
        {
            suffix += 1;
        }
        a_hi -= suffix;
        b_hi -= suffix;
        if suffix > 0 {
            // Emitted after everything in between (the stack comes out backwards).
            stack.push(Task::Equal {
                a: a_hi,
                b: b_hi,
                len: suffix,
            });
        }

        if a_lo == a_hi {
            out.extend((b_lo..b_hi).map(|b| Edit::Insert { b }));
            continue;
        }
        if b_lo == b_hi {
            out.extend((a_lo..a_hi).map(|a| Edit::Delete { a }));
            continue;
        }

        let anchors = match strategy {
            Strategy::Patience => patience_anchors(a, b, a_lo, a_hi, b_lo, b_hi),
            Strategy::Histogram if (a_hi - a_lo).max(b_hi - b_lo) > HISTOGRAM_MAX_REGION => {
                patience_anchors(a, b, a_lo, a_hi, b_lo, b_hi)
            }
            Strategy::Histogram => histogram_anchor(a, b, a_lo, a_hi, b_lo, b_hi),
        };
        if anchors.is_empty() {
            // No anchor: Myers on the remaining stretch only.
            out.extend(
                edits_from_ids_flagged(&a[a_lo..a_hi], &b[b_lo..b_hi], approximate)
                    .into_iter()
                    .map(|e| match e {
                        Edit::Equal { a, b } => Edit::Equal {
                            a: a + a_lo,
                            b: b + b_lo,
                        },
                        Edit::Delete { a } => Edit::Delete { a: a + a_lo },
                        Edit::Insert { b } => Edit::Insert { b: b + b_lo },
                    }),
            );
            continue;
        }

        // Pushed in reverse: first the stretch after the last anchor, then (for each anchor, from the
        // last) the anchor itself and the stretch that precedes it.
        let (mut next_a, mut next_b) = (a_hi, b_hi);
        for &(ai, bi, len) in anchors.iter().rev() {
            stack.push(Task::Range {
                a_lo: ai + len,
                a_hi: next_a,
                b_lo: bi + len,
                b_hi: next_b,
            });
            stack.push(Task::Equal { a: ai, b: bi, len });
            next_a = ai;
            next_b = bi;
        }
        stack.push(Task::Range {
            a_lo,
            a_hi: next_a,
            b_lo,
            b_hi: next_b,
        });
    }
    out
}

/// Lines unique on both sides, in the longest sequence that keeps the order on both sides.
fn patience_anchors(
    a: &[u32],
    b: &[u32],
    a_lo: usize,
    a_hi: usize,
    b_lo: usize,
    b_hi: usize,
) -> Vec<Anchor> {
    // (occurrences on the left, occurrences on the right, position on the right of the last one)
    let mut info: HashMap<u32, (u32, u32, usize)> = HashMap::new();
    for &id in &a[a_lo..a_hi] {
        info.entry(id).or_insert((0, 0, 0)).0 += 1;
    }
    for (j, id) in b.iter().enumerate().take(b_hi).skip(b_lo) {
        if let Some(entry) = info.get_mut(id) {
            entry.1 += 1;
            entry.2 = j;
        }
    }
    // Pairs (position on the left, position on the right), in left order.
    let pairs: Vec<(usize, usize)> = (a_lo..a_hi)
        .filter_map(|i| {
            let (ca, cb, j) = info[&a[i]];
            (ca == 1 && cb == 1).then_some((i, j))
        })
        .collect();
    if pairs.is_empty() {
        return Vec::new();
    }

    // Longest increasing subsequence on the right positions ("patience" sorting).
    let mut tails: Vec<usize> = Vec::new(); // index in `pairs` of the last element of each length
    let mut prev: Vec<Option<usize>> = vec![None; pairs.len()];
    for k in 0..pairs.len() {
        let at = tails.partition_point(|&t| pairs[t].1 < pairs[k].1);
        prev[k] = if at > 0 { Some(tails[at - 1]) } else { None };
        if at == tails.len() {
            tails.push(k);
        } else {
            tails[at] = k;
        }
    }
    let mut chain = Vec::with_capacity(tails.len());
    let mut cursor = tails.last().copied();
    while let Some(k) = cursor {
        chain.push((pairs[k].0, pairs[k].1, 1));
        cursor = prev[k];
    }
    chain.reverse();
    chain
}

/// The longest common stretch among the rarest lines of the left side (at most one anchor).
fn histogram_anchor(
    a: &[u32],
    b: &[u32],
    a_lo: usize,
    a_hi: usize,
    b_lo: usize,
    b_hi: usize,
) -> Vec<Anchor> {
    let mut occurrences: HashMap<u32, Vec<usize>> = HashMap::new();
    for (i, &id) in a.iter().enumerate().take(a_hi).skip(a_lo) {
        occurrences.entry(id).or_default().push(i);
    }
    let count = |id: u32| occurrences.get(&id).map_or(0, Vec::len);

    let mut best: Option<Anchor> = None;
    let mut best_rarity = usize::MAX; // occurrences of the most frequent line of the best stretch
    let mut lowest = MAX_CHAIN; // lines more frequent than this are not tried
    let mut j = b_lo;
    while j < b_hi {
        let Some(list) = occurrences.get(&b[j]) else {
            j += 1;
            continue;
        };
        if list.len() > lowest {
            j += 1;
            continue;
        }
        let mut next_j = j + 1;
        for &i in list {
            // The stretch is widened in both directions; `rarity` is the most frequent line.
            let (mut a_start, mut b_start, mut rarity) = (i, j, list.len());
            while a_start > a_lo && b_start > b_lo && a[a_start - 1] == b[b_start - 1] {
                a_start -= 1;
                b_start -= 1;
                rarity = rarity.max(count(a[a_start]));
            }
            let (mut a_end, mut b_end) = (i + 1, j + 1);
            while a_end < a_hi && b_end < b_hi && a[a_end] == b[b_end] {
                rarity = rarity.max(count(a[a_end]));
                a_end += 1;
                b_end += 1;
            }
            let len = a_end - a_start;
            let better = match best {
                None => true,
                Some((_, _, best_len)) => {
                    rarity < best_rarity || (rarity == best_rarity && len > best_len)
                }
            };
            if better {
                best = Some((a_start, b_start, len));
                best_rarity = rarity;
                lowest = lowest.min(rarity);
            }
            next_j = next_j.max(b_end);
        }
        j = next_j;
    }
    best.into_iter().collect()
}

#[cfg(test)]
mod tests;
