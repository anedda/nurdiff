use super::*;

fn words(s: &str) -> Vec<&str> {
    s.split_whitespace().collect()
}

fn kinds(a: &str, b: &str, opts: &DiffOptions) -> Vec<RowKind> {
    let (rows, _) = diff_lines(&words(a), &words(b), opts);
    rows.iter().map(|r| r.kind).collect()
}

#[test]
fn identici() {
    let (rows, stats) = diff_lines(&words("a b c"), &words("a b c"), &DiffOptions::default());
    assert_eq!(rows.len(), 3);
    assert!(stats.is_identical());
    assert_eq!(stats.equal, 3);
}

#[test]
fn entrambi_vuoti() {
    let (rows, stats) = diff_lines(&[], &[], &DiffOptions::default());
    assert!(rows.is_empty());
    assert!(stats.is_identical());
}

#[test]
fn riga_aggiunta() {
    assert_eq!(
        kinds("a c", "a b c", &DiffOptions::default()),
        vec![RowKind::Equal, RowKind::RightOnly, RowKind::Equal]
    );
}

#[test]
fn riga_rimossa() {
    assert_eq!(
        kinds("a b c", "a c", &DiffOptions::default()),
        vec![RowKind::Equal, RowKind::LeftOnly, RowKind::Equal]
    );
}

#[test]
fn riga_modificata_accoppia_i_due_lati() {
    let (rows, stats) = diff_lines(
        &["uno", "due", "tre"],
        &["uno", "DUE", "tre"],
        &DiffOptions::default(),
    );
    assert_eq!(stats.changed, 1);
    let changed = &rows[1];
    assert_eq!(changed.kind, RowKind::Changed);
    assert_eq!(changed.left.as_ref().unwrap().text, "due");
    assert_eq!(changed.left.as_ref().unwrap().number, 2);
    assert_eq!(changed.right.as_ref().unwrap().text, "DUE");
    assert_eq!(changed.right.as_ref().unwrap().number, 2);
}

#[test]
fn un_lato_vuoto() {
    let (_, stats) = diff_lines(&[], &["a", "b"], &DiffOptions::default());
    assert_eq!(stats.right_only, 2);
    let (_, stats) = diff_lines(&["a", "b"], &[], &DiffOptions::default());
    assert_eq!(stats.left_only, 2);
}

#[test]
fn ignora_maiuscole() {
    let opts = DiffOptions {
        ignore_case: true,
        ..Default::default()
    };
    let (_, stats) = diff_lines(&["Ciao"], &["cIAO"], &opts);
    assert!(stats.is_identical());
    let (_, stats) = diff_lines(&["Ciao"], &["cIAO"], &DiffOptions::default());
    assert_eq!(stats.changed, 1);
}

fn same_with(whitespace: Whitespace, l: &str, r: &str) -> bool {
    let opts = DiffOptions {
        whitespace,
        ..Default::default()
    };
    diff_lines(&[l], &[r], &opts).1.is_identical()
}

#[test]
fn ignora_spazi() {
    assert!(same_with(Whitespace::All, "a  b\t", " a b"));
    assert!(!same_with(Whitespace::None, "a  b\t", " a b"));
}

#[test]
fn spazi_a_fine_riga() {
    use Whitespace::Trailing as T;
    assert!(same_with(T, "x = 1  \t", "x = 1"));
    assert!(!same_with(T, "x = 1", "x  = 1"), "gli spazi dentro contano");
    assert!(!same_with(T, "  x", "x"), "il rientro conta");
    assert!(!same_with(Whitespace::None, "x ", "x"));
}

#[test]
fn solo_la_quantita_di_spazi() {
    use Whitespace::Amount as A;
    assert!(
        same_with(A, "x = 1", "x  =\t1"),
        "una sequenza vale l'altra"
    );
    assert!(same_with(A, "x = 1   ", "x = 1"), "anche a fine riga");
    assert!(
        same_with(A, "    return a", "        return a"),
        "rientri di ampiezza diversa"
    );
    assert!(
        !same_with(A, "x = 1", "x=1"),
        "nessuno spazio è diverso da uno"
    );
    assert!(!same_with(A, "foo()", "foo ()"));
    assert!(
        !same_with(A, "return a", "    return a"),
        "da zero a qualcosa è una differenza"
    );
    assert!(!same_with(A, "a b", "ab"));
}

#[test]
fn tutti_gli_spazi_e_le_maiuscole_si_sommano() {
    let opts = DiffOptions {
        whitespace: Whitespace::Amount,
        ignore_case: true,
        ..Default::default()
    };
    assert!(diff_lines(&["Ciao   Mondo "], &["ciao mondo"], &opts)
        .1
        .is_identical());
    assert!(!diff_lines(&["CiaoMondo"], &["ciao mondo"], &opts)
        .1
        .is_identical());
}

// --- Check on pseudo-random inputs -------------------------------------

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u32 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }

    fn sequence(&mut self, max_len: u32, alphabet: u32) -> Vec<u32> {
        let len = self.next() % (max_len + 1);
        (0..len).map(|_| self.next() % alphabet).collect()
    }
}

fn lcs_len(a: &[u32], b: &[u32]) -> usize {
    let mut table = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            table[i][j] = if a[i - 1] == b[j - 1] {
                table[i - 1][j - 1] + 1
            } else {
                table[i - 1][j].max(table[i][j - 1])
            };
        }
    }
    table[a.len()][b.len()]
}

/// Every index appears once and in order; the "equal" rows really are equal.
fn assert_consistent(a: &[u32], b: &[u32], edits: &[Edit]) {
    let (mut ia, mut ib) = (0, 0);
    for edit in edits {
        match *edit {
            Edit::Equal { a: x, b: y } => {
                assert_eq!((x, y), (ia, ib));
                assert_eq!(a[x], b[y]);
                ia += 1;
                ib += 1;
            }
            Edit::Delete { a: x } => {
                assert_eq!(x, ia);
                ia += 1;
            }
            Edit::Insert { b: y } => {
                assert_eq!(y, ib);
                ib += 1;
            }
        }
    }
    assert_eq!((ia, ib), (a.len(), b.len()));
}

fn changes(edits: &[Edit]) -> usize {
    edits
        .iter()
        .filter(|e| !matches!(e, Edit::Equal { .. }))
        .count()
}

fn assert_minimal_on_random(seed: u64, cases: usize, max_len: u32, alphabet: u32) {
    let mut rng = Lcg(seed);
    for _ in 0..cases {
        let a = rng.sequence(max_len, alphabet);
        let b = rng.sequence(max_len, alphabet);
        let edits = edits_from_ids(&a, &b);
        assert_consistent(&a, &b, &edits);
        assert_eq!(
            changes(&edits),
            a.len() + b.len() - 2 * lcs_len(&a, &b),
            "diff non minimo per {a:?} / {b:?}"
        );
    }
}

#[test]
fn il_diff_e_minimo_e_coerente() {
    assert_minimal_on_random(42, 1000, 30, 4);
}

#[test]
fn il_diff_e_minimo_con_alfabeto_binario() {
    assert_minimal_on_random(7, 1000, 40, 2);
}

#[test]
fn il_diff_e_minimo_su_sequenze_piu_lunghe() {
    assert_minimal_on_random(2026, 300, 120, 3);
}

#[test]
fn il_diff_e_minimo_con_quasi_tutti_simboli_distinti() {
    assert_minimal_on_random(99, 500, 40, 40);
}

/// Regression: sparse changes in a large file must not make the whole file fall back
/// to "everything changed".
#[test]
fn modifiche_sparse_in_un_file_grande_restano_precise() {
    let a: Vec<u32> = (0..30_000).collect();
    let mut b = a.clone();
    for i in (0..30_000).step_by(10) {
        b[i] = 1_000_000 + i as u32; // 3000 modified rows: 6000 operations
    }
    let edits = edits_from_ids(&a, &b);
    assert_consistent(&a, &b, &edits);
    assert_eq!(changes(&edits), 6000);
}

#[test]
fn inserimenti_e_cancellazioni_sparsi_restano_precisi() {
    let a: Vec<u32> = (0..20_000).collect();
    let mut b = Vec::new();
    for (i, &v) in a.iter().enumerate() {
        match i % 40 {
            10 => b.push(2_000_000 + i as u32), // insertion before the line
            20 => continue,                     // deletion
            _ => {}
        }
        b.push(v);
    }
    let edits = edits_from_ids(&a, &b);
    assert_consistent(&a, &b, &edits);
    assert_eq!(changes(&edits), 1000); // 500 insertions + 500 deletions
}

/// Regression (measured on 1 million lines, one changed every 100): more changed lines than the rounds limit
/// allows must not turn the whole file into one block when the changed lines exist on one side only.
#[test]
fn molte_righe_cambiate_oltre_il_limite_restano_precise() {
    let n = 60_000u32;
    let a: Vec<u32> = (0..n).collect();
    let b: Vec<u32> = a
        .iter()
        .map(|&v| if v % 5 == 0 { 5_000_000 + v } else { v })
        .collect();
    let edits = edits_from_ids(&a, &b);
    assert_consistent(&a, &b, &edits);
    assert_eq!(changes(&edits), 2 * 12_000); // 12 000 modified rows, as one removal and one addition
}

/// Regression: the same with changed lines that exist on both sides (so they cannot be discarded up front): over
/// the limit, the result is no longer minimal but it keeps most of the equal lines.
#[test]
fn oltre_il_limite_con_righe_ripetute_il_ripiego_tiene_le_righe_uguali() {
    let mut rng = Lcg(7);
    let a: Vec<u32> = (0..4000).map(|_| rng.next() % 20).collect();
    let b: Vec<u32> = (0..4000).map(|_| rng.next() % 20).collect();
    let edits = edits_with_limit(&a, &b, 100);
    assert_consistent(&a, &b, &edits);
    let equal = edits.len() - changes(&edits);
    assert!(equal > 400, "righe uguali conservate: {equal}");
}

/// Lines that exist on one side only cannot be part of a common subsequence: leaving them out of the search
/// keeps the result minimal.
#[test]
fn le_righe_presenti_da_un_lato_solo_non_cambiano_il_risultato() {
    let a = [1, 100, 2, 3, 101, 4, 5];
    let b = [1, 2, 200, 3, 4, 201, 202, 5];
    let edits = edits_from_ids(&a, &b);
    assert_consistent(&a, &b, &edits);
    assert_eq!(changes(&edits), 5); // 2 lines only on the left, 3 only on the right
}

#[test]
fn il_risultato_e_approssimato_solo_se_scatta_il_limite() {
    let mut rng = Lcg(7);
    let a: Vec<u32> = (0..4000).map(|_| rng.next() % 20).collect();
    let b: Vec<u32> = (0..4000).map(|_| rng.next() % 20).collect();

    let mut approximate = false;
    edits_with_limit_flagged(&a, &b, 100, &mut approximate);
    assert!(approximate, "limite basso su righe ripetute");

    let mut approximate = false;
    edits_with_limit_flagged(&a, &b, MAX_ROUNDS, &mut approximate);
    assert!(!approximate, "con il limite normale questo caso si risolve");

    // Many changed lines, but unique: they are left out of the search and the limit is not reached.
    let a: Vec<u32> = (0..60_000).collect();
    let b: Vec<u32> = a
        .iter()
        .map(|&v| if v % 5 == 0 { 5_000_000 + v } else { v })
        .collect();
    let mut approximate = false;
    edits_from_ids_flagged(&a, &b, &mut approximate);
    assert!(!approximate);
}

#[test]
fn il_flag_non_si_spegne_una_volta_acceso() {
    let (a, b) = ([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1]);
    let mut approximate = true;
    edits_with_limit_flagged(&a, &b, MAX_ROUNDS, &mut approximate);
    assert!(approximate);
}

#[test]
fn un_confronto_normale_non_e_approssimato() {
    let (_, _, approximate) = diff_lines_full(
        &["a", "b", "c"],
        &["a", "x", "c"],
        &DiffOptions::default(),
        &[],
    );
    assert!(!approximate);
}

#[test]
fn oltre_il_limite_si_ripiega_su_tutto_cambiato() {
    let (a, b) = ([1, 2, 3], [4, 5, 6]);
    let edits = edits_with_limit(&a, &b, 1);
    assert_consistent(&a, &b, &edits);
    assert_eq!(edits.len(), 6);
}

#[test]
fn il_ripiego_mantiene_prefisso_e_suffisso() {
    let (a, b) = ([9, 1, 2, 3, 8], [9, 4, 5, 6, 8]);
    let edits = edits_with_limit(&a, &b, 1);
    assert_consistent(&a, &b, &edits);
    assert_eq!(edits.first(), Some(&Edit::Equal { a: 0, b: 0 }));
    assert_eq!(edits.last(), Some(&Edit::Equal { a: 4, b: 4 }));
}

#[test]
fn il_ripiego_e_locale_alla_regione_troppo_diversa() {
    // Two identical regions separated by a completely different block:
    // with a low limit only the block falls back, the equal regions stay equal.
    let mut a: Vec<u32> = (0..100).collect();
    a.extend(1000..1050);
    a.extend(100..200);
    let mut b: Vec<u32> = (0..100).collect();
    b.extend(2000..2050);
    b.extend(100..200);

    let edits = edits_with_limit(&a, &b, 3);
    assert_consistent(&a, &b, &edits);
    let equal = edits
        .iter()
        .filter(|e| matches!(e, Edit::Equal { .. }))
        .count();
    assert_eq!(equal, 200);
}

fn row(kind: RowKind, l: Option<&str>, r: Option<&str>) -> Row {
    let cell = |t: &str| Cell {
        number: 1,
        text: t.to_string(),
        marks: Vec::new(),
    };
    Row {
        kind,
        left: l.map(cell),
        right: r.map(cell),
        gap: false,
        aligned: false,
    }
}

fn rows_of(kinds: &[RowKind]) -> Vec<Row> {
    kinds.iter().map(|k| row(*k, None, None)).collect()
}

#[test]
fn blocchi_senza_differenze() {
    assert!(compute_hunks(&[]).is_empty());
    assert!(compute_hunks(&rows_of(&[RowKind::Equal, RowKind::Equal])).is_empty());
}

#[test]
fn blocchi_raggruppano_righe_consecutive() {
    use RowKind::*;
    let rows = rows_of(&[
        Equal, Changed, Changed, Equal, Equal, LeftOnly, Equal, RightOnly,
    ]);
    let h = |start, end, kind, at| Hunk {
        start,
        end,
        kind,
        left_at: at,
        right_at: at,
    };
    assert_eq!(
        compute_hunks(&rows),
        vec![
            h(1, 3, HunkKind::Changed, 1),
            h(5, 6, HunkKind::LeftOnly, 3),
            h(7, 8, HunkKind::RightOnly, 4),
        ]
    );
}

#[test]
fn blocchi_ai_bordi_e_misti() {
    use RowKind::*;
    assert_eq!(
        compute_hunks(&rows_of(&[Changed, Equal, Changed])),
        vec![
            Hunk {
                start: 0,
                end: 1,
                kind: HunkKind::Changed,
                left_at: 0,
                right_at: 0,
            },
            Hunk {
                start: 2,
                end: 3,
                kind: HunkKind::Changed,
                left_at: 1,
                right_at: 1,
            },
        ]
    );
    assert_eq!(
        compute_hunks(&rows_of(&[LeftOnly, RightOnly]))[0].kind,
        HunkKind::Changed
    );
    assert_eq!(
        compute_hunks(&rows_of(&[LeftOnly, LeftOnly]))[0].kind,
        HunkKind::LeftOnly
    );
}

#[test]
fn larghezza_massima_conta_tabulazioni_e_caratteri() {
    assert_eq!(max_line_width(&[]), 0);
    let rows = vec![
        row(RowKind::Equal, Some("abc"), Some("a\tb")),
        row(RowKind::LeftOnly, Some("àèì"), None),
    ];
    // "a\tb" = 1 + 4 + 1; accented characters count one each.
    assert_eq!(max_line_width(&rows), 6);
    assert_eq!(visual_width("\t\t"), 2 * TAB_SIZE);
}

#[test]
fn i_punti_fermi_dividono_il_confronto_e_i_non_validi_si_ignorano() {
    let a = ["x", "p", "q", "y"];
    let b = ["p", "x", "y", "q"];
    let opts = DiffOptions::default();
    let (rows, _) = diff_lines_aligned(&a, &b, &opts, &[(1, 3)]);
    // Before: [x] against [p, x, y]; the fixed point p↔q; after: [q, y] against [].
    let aligned: Vec<_> = rows.iter().filter(|r| r.aligned).collect();
    assert_eq!(aligned.len(), 1);
    assert_eq!(aligned[0].left.as_ref().unwrap().number, 2);
    assert_eq!(aligned[0].right.as_ref().unwrap().number, 4);
    assert_eq!(aligned[0].kind, RowKind::Changed);

    // Pairs outside the lists, not increasing or duplicated: as if they were not there.
    let plain = diff_lines(&a, &b, &opts);
    assert_eq!(diff_lines_aligned(&a, &b, &opts, &[(9, 0)]), plain);
    assert_eq!(diff_lines_aligned(&a, &b, &opts, &[(0, 9)]), plain);
    let (rows, _) = diff_lines_aligned(&a, &b, &opts, &[(2, 2), (1, 3)]);
    assert_eq!(rows.iter().filter(|r| r.aligned).count(), 1);
}
