use super::*;
use crate::diff::edits_from_ids;

/// A sequence of operations is valid if it keeps the order, covers every line exactly once
/// and pairs only equal lines.
fn assert_valid(a: &[u32], b: &[u32], edits: &[Edit]) {
    let (mut ai, mut bi) = (0, 0);
    for e in edits {
        match *e {
            Edit::Equal { a: x, b: y } => {
                assert_eq!((x, y), (ai, bi), "ordine delle righe uguali");
                assert_eq!(a[x], b[y], "righe abbinate ma diverse");
                ai += 1;
                bi += 1;
            }
            Edit::Delete { a: x } => {
                assert_eq!(x, ai);
                ai += 1;
            }
            Edit::Insert { b: y } => {
                assert_eq!(y, bi);
                bi += 1;
            }
        }
    }
    assert_eq!((ai, bi), (a.len(), b.len()), "righe non coperte");
}

fn changes(edits: &[Edit]) -> usize {
    edits
        .iter()
        .filter(|e| !matches!(e, Edit::Equal { .. }))
        .count()
}

/// Simple, repeatable pseudo-random generator (no dependencies).
fn lcg(seed: &mut u64) -> u64 {
    *seed = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    *seed >> 33
}

#[test]
fn risultati_validi_su_sequenze_casuali() {
    let mut seed = 7;
    for round in 0..600 {
        let alphabet = 2 + (round % 7) as u64;
        let n = (lcg(&mut seed) % 40) as usize;
        let m = (lcg(&mut seed) % 40) as usize;
        let a: Vec<u32> = (0..n).map(|_| (lcg(&mut seed) % alphabet) as u32).collect();
        let b: Vec<u32> = (0..m).map(|_| (lcg(&mut seed) % alphabet) as u32).collect();
        let myers = edits_from_ids(&a, &b);
        for strategy in [Strategy::Patience, Strategy::Histogram] {
            let edits = anchored_edits(&a, &b, strategy);
            assert_valid(&a, &b, &edits);
            // Myers is the minimum: the others cannot do better.
            assert!(
                changes(&edits) >= changes(&myers),
                "{strategy:?} {a:?} {b:?}"
            );
        }
    }
}

#[test]
fn sequenze_vuote_e_identiche() {
    for strategy in [Strategy::Patience, Strategy::Histogram] {
        assert!(anchored_edits(&[], &[], strategy).is_empty());
        let a = [1, 2, 3];
        let same = anchored_edits(&a, &a, strategy);
        assert_valid(&a, &a, &same);
        assert_eq!(changes(&same), 0);
        let all_new = anchored_edits(&a, &[], strategy);
        assert_valid(&a, &[], &all_new);
        assert_eq!(changes(&all_new), 3);
        let all_added = anchored_edits(&[], &a, strategy);
        assert_valid(&[], &a, &all_added);
        assert_eq!(changes(&all_added), 3);
    }
}

#[test]
fn patience_usa_le_righe_uniche_come_punti_fermi() {
    // 1 = "}", 2 = empty line (repeated); 10, 11, 12 = lines that appear only once.
    // On the left: f g, on the right: g f: the order of the two blocks is swapped.
    let a = [10, 1, 2, 11, 1, 2];
    let b = [11, 1, 2, 10, 1, 2];
    let edits = anchored_edits(&a, &b, Strategy::Patience);
    assert_valid(&a, &b, &edits);
    // The unique lines 10 and 11 cross each other: only one of them can stay an anchor, and the
    // other lines are paired inside the remaining stretches.
    assert!(changes(&edits) <= 6);
}

#[test]
fn histogram_preferisce_le_righe_rare() {
    // Line 1 appears very often; 9 only once. Histogram must anchor on the stretch around 9
    // and not on an arbitrary occurrence of 1.
    let a = [1, 1, 1, 1, 9, 5, 1, 1, 1];
    let b = [1, 1, 7, 7, 9, 5, 1, 1, 1];
    let edits = anchored_edits(&a, &b, Strategy::Histogram);
    assert_valid(&a, &b, &edits);
    assert!(edits.contains(&Edit::Equal { a: 4, b: 4 }));
    assert!(edits.contains(&Edit::Equal { a: 5, b: 5 }));
}

#[test]
fn file_lunghi_e_rovesciati() {
    // Reversed sequence, all unique lines: a single anchor, the rest is removed and added.
    let n = 60_000u32;
    let a: Vec<u32> = (0..n).collect();
    let b: Vec<u32> = (0..n).rev().collect();
    for strategy in [Strategy::Patience, Strategy::Histogram] {
        let edits = anchored_edits(&a, &b, strategy);
        assert_valid(&a, &b, &edits);
    }
}

/// Number of blocks: groups of consecutive operations that are not equal.
fn hunks(edits: &[Edit]) -> usize {
    let mut count = 0;
    let mut inside = false;
    for e in edits {
        let different = !matches!(e, Edit::Equal { .. });
        if different && !inside {
            count += 1;
        }
        inside = different;
    }
    count
}

#[test]
fn a_parita_di_righe_cambiate_possono_dare_meno_blocchi_di_myers() {
    // Case found by searching small sequences: the same number of changed lines (the Myers
    // minimum) but grouped into fewer blocks. It does not hold in general: in other cases Myers
    // gives fewer blocks, which is why the algorithm is a choice.
    let a = [4, 1, 4, 3, 2, 4, 2];
    let b = [4, 3, 2, 1, 2, 0, 4, 4, 4, 1];
    let myers = edits_from_ids(&a, &b);
    let patience = anchored_edits(&a, &b, Strategy::Patience);
    assert_valid(&a, &b, &patience);
    assert_eq!(changes(&patience), changes(&myers));
    assert!(
        hunks(&patience) < hunks(&myers),
        "{} contro {}",
        hunks(&patience),
        hunks(&myers)
    );

    let a = [2, 2, 4, 4, 4];
    let b = [1, 2, 3, 2, 2, 3, 0, 2, 0, 3];
    let myers = edits_from_ids(&a, &b);
    let histogram = anchored_edits(&a, &b, Strategy::Histogram);
    assert_valid(&a, &b, &histogram);
    assert_eq!(changes(&histogram), changes(&myers));
    assert!(hunks(&histogram) < hunks(&myers));
}

/// Regression (measured: 100 000 lines took 14 s, 1 million over 400 s): many blocks in a big file must not make
/// Histogram quadratic.
#[test]
fn histogram_con_tanti_blocchi_in_un_file_grande_e_veloce() {
    let n = 60_000u32;
    let a: Vec<u32> = (0..n).collect();
    let b: Vec<u32> = a
        .iter()
        .map(|&v| if v % 100 == 0 { 9_000_000 + v } else { v })
        .collect();
    let start = std::time::Instant::now();
    let edits = anchored_edits(&a, &b, Strategy::Histogram);
    assert_valid(&a, &b, &edits);
    assert_eq!(changes(&edits), 2 * 600);
    assert!(
        start.elapsed().as_secs() < 5,
        "troppo lento: {:?}",
        start.elapsed()
    );
}
