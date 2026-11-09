use super::*;
use crate::diff::{compute_hunks, RowKind};
use crate::text::{Encoding, Eol};
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

struct Case {
    _dir: TempDir,
    left: PathBuf,
    right: PathBuf,
}

fn files(l: &[u8], r: &[u8]) -> Case {
    let dir = tempfile::tempdir().unwrap();
    let (left, right) = (dir.path().join("l.txt"), dir.path().join("r.txt"));
    fs::write(&left, l).unwrap();
    fs::write(&right, r).unwrap();
    Case {
        _dir: dir,
        left,
        right,
    }
}

fn session(c: &Case) -> Session {
    Session::load(&c.left, &c.right, &DiffOptions::default()).unwrap()
}

fn lines(s: &Session, side: Side) -> Vec<String> {
    let d = s.document(side);
    (0..d.len())
        .map(|i| d.line(i).unwrap().to_string())
        .collect()
}

use MergeDirection::*;

#[test]
fn il_riepilogo_dice_se_le_differenze_sono_solo_minori() {
    // Equal rows, different line ending: equal but with a cause
    let s = session(&files(b"a\nb\n", b"a\r\nb\r\n"));
    let m = s.summary().minor.expect("fine riga");
    assert!(s.diff().identical && m.eol);
    // Rows that differ only in trailing spaces
    let s = session(&files(b"a  \nb\n", b"a\nb\n"));
    let m = s.summary().minor.expect("spazi a fine riga");
    assert!(!s.diff().identical && m.trailing_space && !m.eol);
    // A real difference, or nothing different: no warning
    assert!(session(&files(b"a\nb\n", b"a\nc\n"))
        .summary()
        .minor
        .is_none());
    assert!(session(&files(b"a\nb\n", b"a\nb\n"))
        .summary()
        .minor
        .is_none());
}

#[test]
fn il_riepilogo_minore_segue_le_unioni() {
    let mut s = session(&files(b"a\nb\n", b"A\nB\n"));
    assert!(s.summary().minor.unwrap().case);
    s.apply(0, LeftToRight).unwrap();
    assert!(s.diff().identical);
    assert!(
        s.summary().minor.is_none(),
        "dopo l'unione i testi coincidono"
    );
}

#[test]
fn copia_una_riga_modificata_a_destra_e_a_sinistra() {
    let c = files(b"a\nb\nc\n", b"a\nX\nc\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "b", "c"]);
    assert!(s.diff().identical);

    let mut s = session(&c);
    s.apply(0, RightToLeft).unwrap();
    assert_eq!(lines(&s, Side::Left), ["a", "X", "c"]);
    assert!(s.diff().identical);
}

#[test]
fn righe_aggiunte_si_copiano_o_si_eliminano() {
    // Block only on the right: from right to left it inserts it, from left to right it removes it.
    let c = files(b"a\nc\n", b"a\nNUOVA 1\nNUOVA 2\nc\n");
    let mut s = session(&c);
    s.apply(0, RightToLeft).unwrap();
    assert_eq!(lines(&s, Side::Left), ["a", "NUOVA 1", "NUOVA 2", "c"]);
    assert!(s.diff().identical);

    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "c"]);
    assert!(s.diff().identical);
}

#[test]
fn blocchi_con_numero_diverso_di_righe_per_lato() {
    let c = files(b"a\nx1\nx2\nx3\nz\n", b"a\ny1\ny2\nz\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "x1", "x2", "x3", "z"]);
    let mut s = session(&c);
    s.apply(0, RightToLeft).unwrap();
    assert_eq!(lines(&s, Side::Left), ["a", "y1", "y2", "z"]);
}

#[test]
fn blocchi_all_inizio_e_alla_fine_del_file() {
    let c = files(b"inizio\na\nb\nfine\n", b"a\nb\n");
    let mut s = session(&c);
    assert_eq!(compute_hunks(&s.diff().rows).len(), 2);
    s.apply(0, LeftToRight).unwrap(); // "inizio" goes to the right
    s.apply(0, LeftToRight).unwrap(); // "fine" goes to the right
    assert_eq!(lines(&s, Side::Right), ["inizio", "a", "b", "fine"]);
    assert!(s.diff().identical);
}

#[test]
fn file_vuoto_da_un_lato() {
    let c = files(b"", b"uno\ndue\n");
    let mut s = session(&c);
    s.apply(0, RightToLeft).unwrap();
    assert_eq!(lines(&s, Side::Left), ["uno", "due"]);
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    assert!(lines(&s, Side::Right).is_empty());
}

#[test]
fn unire_tutti_i_blocchi_rende_i_file_identici() {
    let l: String = (0..60).map(|i| format!("riga {i}\n")).collect();
    let r: String = (0..60)
        .map(|i| match i % 7 {
            0 => format!("MOD {i}\n"),
            3 => String::new(),
            _ => format!("riga {i}\n"),
        })
        .chain(["coda\n".to_string()])
        .collect();
    let c = files(l.as_bytes(), r.as_bytes());
    let mut s = session(&c);
    let n = compute_hunks(&s.diff().rows).len();
    assert!(n > 5);
    for _ in 0..n {
        s.apply(0, LeftToRight).unwrap();
    }
    assert!(s.diff().identical);
    assert_eq!(lines(&s, Side::Right), lines(&s, Side::Left));
}

#[test]
fn blocco_inesistente() {
    let c = files(b"a\n", b"b\n");
    let mut s = session(&c);
    assert_eq!(s.apply(1, LeftToRight), Err(MergeError::NoSuchHunk(1)));
    assert!(!s.can_undo());
    assert_eq!(s.revision(), 0);
}

#[test]
fn annulla_ripristina_righe_e_stato_di_modifica() {
    let c = files(b"a\nb\nc\n", b"a\nX\nc\n");
    let mut s = session(&c);
    assert_eq!(s.undo(), Err(MergeError::NothingToUndo));
    s.apply(0, LeftToRight).unwrap();
    assert!(s.document(Side::Right).is_dirty());
    assert!(!s.document(Side::Left).is_dirty());
    assert!(s.can_undo());
    s.undo().unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "X", "c"]);
    assert!(!s.document(Side::Right).is_dirty());
    assert!(!s.can_undo());
    assert!(!s.diff().identical);
    assert_eq!(s.revision(), 2);
}

#[test]
fn la_cronologia_e_limitata() {
    let n = 2 * (MAX_UNDO + 10);
    let l: String = (0..n).map(|i| format!("{i}\n")).collect();
    let r: String = (0..n)
        .map(|i| {
            if i % 2 == 0 {
                format!("x{i}\n")
            } else {
                format!("{i}\n")
            }
        })
        .collect();
    let c = files(l.as_bytes(), r.as_bytes());
    let mut s = session(&c);
    for _ in 0..(MAX_UNDO + 5) {
        s.apply(0, LeftToRight).unwrap();
    }
    let mut undone = 0;
    while s.undo().is_ok() {
        undone += 1;
    }
    assert_eq!(undone, MAX_UNDO);
}

#[test]
fn modifica_inserisce_elimina_e_si_annulla_con_le_unioni() {
    let c = files(b"a\nb\nc\n", b"a\nb\nc\n");
    let mut s = session(&c);
    assert!(s.diff().summary().identical);
    // edit of a row
    assert!(s.edit_lines(Side::Right, 1, 1, &["B".to_string()]).unwrap());
    assert_eq!(s.document(Side::Right).line(1), Some("B"));
    assert!(s.document(Side::Right).is_dirty());
    assert!(!s.document(Side::Left).is_dirty());
    assert!(!s.diff().summary().identical);
    // insertion after the first row and deletion of the last
    assert!(s
        .edit_lines(Side::Right, 1, 0, &["nuova".to_string()])
        .unwrap());
    assert_eq!(s.document(Side::Right).len(), 4);
    assert!(s.edit_lines(Side::Right, 3, 1, &[]).unwrap());
    assert_eq!(s.document(Side::Right).len(), 3);
    // rows that do not change do not enter the history
    let rev = s.revision();
    assert!(!s.edit_lines(Side::Right, 0, 1, &["a".to_string()]).unwrap());
    assert_eq!(s.revision(), rev);
    // it is undone in reverse order, like the merges
    s.undo().unwrap();
    s.undo().unwrap();
    s.undo().unwrap();
    assert!(s.diff().summary().identical);
    assert!(!s.document(Side::Right).is_dirty());
    assert_eq!(s.undo(), Err(MergeError::NothingToUndo));
}

#[test]
fn modifica_rifiuta_intervalli_a_capo_e_lati_in_sola_lettura() {
    let c = files(b"a\nb\n", b"a\nb\n");
    let mut s = session(&c);
    assert_eq!(
        s.edit_lines(Side::Left, 2, 1, &[]),
        Err(MergeError::NoSuchLines)
    );
    assert_eq!(
        s.edit_lines(Side::Left, 3, 0, &[]),
        Err(MergeError::NoSuchLines)
    );
    assert_eq!(
        s.edit_lines(Side::Left, 0, 1, &["x\ny".to_string()]),
        Err(MergeError::LineBreakInLine)
    );
    assert!(!s.can_undo());
    let mut ro =
        Session::load_read_only(&c.left, &c.right, &DiffOptions::default(), true, false).unwrap();
    assert_eq!(
        ro.edit_lines(Side::Left, 0, 1, &["x".to_string()]),
        Err(MergeError::ReadOnly(Side::Left))
    );
}

#[test]
fn modifica_poi_salva_conserva_fine_riga_e_codifica() {
    let c = files(b"a\r\nb\r\nc\r\n", b"a\r\nb\r\nc\r\n");
    let mut s = session(&c);
    s.edit_lines(Side::Right, 1, 1, &["B".to_string(), "B2".to_string()])
        .unwrap();
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read(&c.right).unwrap(), b"a\r\nB\r\nB2\r\nc\r\n");
    assert_eq!(fs::read(&c.left).unwrap(), b"a\r\nb\r\nc\r\n");
}

#[test]
fn row_of_line_trova_la_riga_della_vista() {
    let c = files(b"a\nb\n", b"a\nX\nb\n");
    let s = session(&c);
    // on the right row 2 is X (row 1 of the view); on the left 2 is b (row 2 of the view)
    assert_eq!(s.row_of_line(Side::Right, 2), Some(1));
    assert_eq!(s.row_of_line(Side::Left, 2), Some(2));
    assert_eq!(s.row_of_line(Side::Left, 9), None);
}

/// Twenty rows; the sixth and the sixteenth are different on the right.
fn venti() -> Case {
    let left: String = (0..20).map(|i| format!("riga {i}\n")).collect();
    let right = left
        .replace("riga 5\n", "RIGA 5\n")
        .replace("riga 15\n", "RIGA 15\n");
    files(left.as_bytes(), right.as_bytes())
}

fn gaps(s: &Session) -> Vec<bool> {
    s.visible_rows(0, s.visible_len())
        .iter()
        .map(|r| r.gap)
        .collect()
}

/// Text with one row per digit (same sequences as the test on the algorithms in `anchors`).
fn digits(ids: &[u8]) -> Vec<u8> {
    ids.iter()
        .flat_map(|d| format!("riga{d}\n").into_bytes())
        .collect()
}

#[test]
fn l_algoritmo_scelto_resta_dopo_le_unioni() {
    use crate::diff::{diff_lines, Algorithm};
    let c = files(
        &digits(&[4, 1, 4, 3, 2, 4, 2]),
        &digits(&[4, 3, 2, 1, 2, 0, 4, 4, 4, 1]),
    );
    let load = |algorithm| {
        let opts = DiffOptions {
            algorithm,
            ..DiffOptions::default()
        };
        Session::load(&c.left, &c.right, &opts).unwrap()
    };
    let myers = load(Algorithm::Myers);
    let mut patience = load(Algorithm::Patience);
    assert!(
        patience.summary().hunks.len() < myers.summary().hunks.len(),
        "Patience raggruppa questo caso in meno blocchi"
    );

    // After a merge the comparison is redone with the same algorithm.
    patience.apply(0, LeftToRight).unwrap();
    let (l, r) = (lines(&patience, Side::Left), lines(&patience, Side::Right));
    let (l, r): (Vec<&str>, Vec<&str>) = (
        l.iter().map(String::as_str).collect(),
        r.iter().map(String::as_str).collect(),
    );
    let opts = DiffOptions {
        algorithm: Algorithm::Patience,
        ..DiffOptions::default()
    };
    let (rows, _) = diff_lines(&l, &r, &opts);
    assert_eq!(patience.diff().rows, rows);
}

fn kinds(s: &Session) -> Vec<(RowKind, bool)> {
    s.visible_rows(0, s.visible_len())
        .iter()
        .map(|r| (r.kind, r.aligned))
        .collect()
}

#[test]
fn allineare_due_righe_le_affianca_comunque() {
    // Without help "int b = 2;" is placed next to the comment (by position in the block).
    let c = files(b"int b = 2;\n", b"// nuovo\nint b = 20;\n");
    let mut s = session(&c);
    assert_eq!(
        kinds(&s),
        [(RowKind::Changed, false), (RowKind::RightOnly, false)]
    );
    let before = s.revision();

    s.align(1, 2).unwrap();
    assert_eq!(s.aligns(), vec![[1, 2]]);
    assert!(s.revision() > before, "la UI deve ricaricare le righe");
    assert_eq!(
        kinds(&s),
        [(RowKind::RightOnly, false), (RowKind::Changed, true)]
    );
    let rows = s.visible_rows(0, 2);
    assert_eq!(rows[1].left.as_ref().unwrap().text, "int b = 2;");
    assert_eq!(rows[1].right.as_ref().unwrap().text, "int b = 20;");
    assert_eq!(s.summary().aligns, vec![[1, 2]]);

    // Removing it brings back the previous comparison.
    assert!(s.unalign(1));
    assert!(!s.unalign(1), "già tolto");
    assert_eq!(
        kinds(&s),
        [(RowKind::Changed, false), (RowKind::RightOnly, false)]
    );
    assert!(s.aligns().is_empty());
}

#[test]
fn un_punto_fermo_con_righe_uguali_resta_una_riga_uguale() {
    let c = files(b"a\nb\nc\n", b"a\nb\nc\n");
    let mut s = session(&c);
    s.align(2, 2).unwrap();
    assert_eq!(
        kinds(&s),
        [
            (RowKind::Equal, false),
            (RowKind::Equal, true),
            (RowKind::Equal, false)
        ]
    );
    assert!(s.diff().identical);
    // Even with the "differences only" filter the fixed point stays visible.
    s.set_filter(RowFilter::Diffs);
    assert_eq!(kinds(&s), [(RowKind::Equal, true)]);
    assert_eq!(s.visible_rows(0, 1)[0].left.as_ref().unwrap().number, 2);
    assert!(s.visible_rows(0, 1)[0].gap, "ci sono righe nascoste prima");
}

#[test]
fn righe_inesistenti_e_incroci_sono_rifiutati() {
    let c = files(b"a\nb\nc\n", b"c\nb\na\n");
    let mut s = session(&c);
    assert_eq!(s.align(0, 1), Err(MergeError::NoSuchLines));
    assert_eq!(s.align(1, 4), Err(MergeError::NoSuchLines));
    assert_eq!(s.align(4, 1), Err(MergeError::NoSuchLines));

    s.align(1, 3).unwrap(); // a con a
                            // c with c would cross: a is before c on the left, but after it on the right.
    assert_eq!(s.align(3, 1), Err(MergeError::AlignCrosses));
    assert_eq!(s.aligns(), vec![[1, 3]], "dopo un rifiuto non cambia nulla");
    assert!(MergeError::AlignCrosses
        .to_string()
        .contains("crosses another"));
}

#[test]
fn un_nuovo_punto_sostituisce_quello_della_stessa_riga() {
    let c = files(b"a\nb\nc\n", b"x\ny\nz\n");
    let mut s = session(&c);
    s.align(1, 1).unwrap();
    s.align(3, 3).unwrap();
    s.align(1, 2).unwrap(); // row 1 on the left goes from right 1 to 2
    assert_eq!(s.aligns(), vec![[1, 2], [3, 3]]);
    s.align(2, 3).unwrap(); // right 3 was (3, 3): it is replaced
    assert_eq!(s.aligns(), vec![[1, 2], [2, 3]]);
    s.align(2, 3).unwrap(); // identical: nothing changes
    assert_eq!(s.aligns(), vec![[1, 2], [2, 3]]);
    assert!(s.clear_aligns());
    assert!(!s.clear_aligns());
}

#[test]
fn le_unioni_azzerano_i_punti_fermi() {
    let c = files(b"a\nb\nc\n", b"a\nX\nc\n");
    let mut s = session(&c);
    s.align(1, 1).unwrap();
    assert_eq!(s.aligns().len(), 1);
    s.apply(0, LeftToRight).unwrap();
    assert!(s.aligns().is_empty());
    assert!(s.summary().aligns.is_empty());

    let mut s = session(&c);
    s.align(3, 3).unwrap();
    s.edit_lines(Side::Left, 0, 0, &["nuova".to_string()])
        .unwrap();
    assert!(
        s.aligns().is_empty(),
        "una modifica sposta i numeri di riga"
    );

    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    s.align(1, 1).unwrap();
    s.undo().unwrap();
    assert!(s.aligns().is_empty());
}

#[test]
fn i_punti_fermi_si_riapplicano_in_blocco() {
    let c = files(b"int b = 2;\n", b"// nuovo\nint b = 20;\n");
    let mut s = session(&c);
    assert_eq!(
        s.set_aligns(&[[1, 2], [1, 2]]),
        Err(MergeError::AlignCrosses)
    );
    assert!(
        s.aligns().is_empty(),
        "un elenco non valido non applica nulla"
    );
    s.set_aligns(&[[1, 2]]).unwrap();
    assert_eq!(kinds(&s)[1], (RowKind::Changed, true));
    assert_eq!(s.set_aligns(&[[1, 9]]), Err(MergeError::AlignCrosses));
    assert_eq!(s.aligns(), vec![[1, 2]], "e il vecchio elenco resta");
    s.set_aligns(&[]).unwrap();
    assert!(s.aligns().is_empty());
}

#[test]
fn filtro_solo_differenze() {
    let c = venti();
    let mut s = session(&c);
    assert_eq!(s.visible_len(), 20);
    assert!(gaps(&s).iter().all(|g| !g));
    s.set_filter(RowFilter::Diffs);
    let sum = s.summary();
    assert_eq!(sum.total_rows, 2);
    assert_eq!(
        sum.hunks
            .iter()
            .map(|h| (h.start, h.end))
            .collect::<Vec<_>>(),
        vec![(0, 1), (1, 2)]
    );
    assert_eq!(gaps(&s), vec![true, true]);
    let rows = s.visible_rows(0, 2);
    assert_eq!(rows[0].left.as_ref().unwrap().number, 6);
    assert_eq!(rows[1].left.as_ref().unwrap().number, 16);
}

#[test]
fn filtro_con_contesto() {
    let c = venti();
    let mut s = session(&c);
    s.set_filter(RowFilter::Context);
    // rows 2..=8 and 12..=18 (indexes from 0): seven plus seven
    let sum = s.summary();
    assert_eq!(sum.total_rows, 14);
    assert_eq!(
        sum.hunks
            .iter()
            .map(|h| (h.start, h.end))
            .collect::<Vec<_>>(),
        vec![(3, 4), (10, 11)]
    );
    // rows before the first visible one and between the two groups are hidden
    let g = gaps(&s);
    assert_eq!(g.iter().filter(|x| **x).count(), 2);
    assert!(g[0] && g[7]);
    // the two groups merge if the context makes them touch
    let c2 = files(b"a\nb\nc\nd\ne\nf\n", b"X\nb\nc\nd\ne\nY\n");
    let mut s2 = session(&c2);
    s2.set_filter(RowFilter::Context);
    assert_eq!(s2.visible_len(), 6);
    assert!(gaps(&s2).iter().all(|g| !g));
}

#[test]
fn filtro_row_of_line_e_revisione() {
    let c = venti();
    let mut s = session(&c);
    let rev = s.revision();
    s.set_filter(RowFilter::All);
    assert_eq!(s.revision(), rev, "stesso filtro: nulla cambia");
    s.set_filter(RowFilter::Diffs);
    assert_eq!(s.revision(), rev + 1);
    assert_eq!(s.row_of_line(Side::Right, 6), Some(0));
    assert_eq!(s.row_of_line(Side::Right, 16), Some(1));
    assert_eq!(s.row_of_line(Side::Right, 7), None, "riga uguale: nascosta");
    s.set_filter(RowFilter::All);
    assert_eq!(s.row_of_line(Side::Right, 7), Some(6));
}

#[test]
fn il_filtro_resta_dopo_unioni_e_modifiche() {
    let c = venti();
    let mut s = session(&c);
    s.set_filter(RowFilter::Diffs);
    // the block numbers are the usual ones
    s.apply(1, RightToLeft).unwrap();
    assert_eq!(s.filter(), RowFilter::Diffs);
    assert_eq!(s.visible_len(), 1);
    assert_eq!(s.summary().hunks.len(), 1);
    s.undo().unwrap();
    assert_eq!(s.visible_len(), 2);
    s.edit_lines(Side::Left, 5, 1, &["RIGA 5".to_string()])
        .unwrap();
    assert_eq!(s.visible_len(), 1, "riga resa uguale: sparisce dal filtro");
}

#[test]
fn i_blocchi_dicono_dove_inserire() {
    // "b" is missing on the right: the block is only on the left, and on the right it is inserted after 1 row
    let c = files(b"a\nb\nc\n", b"a\nc\n");
    let s = session(&c);
    let h = s.summary().hunks;
    assert_eq!(h.len(), 1);
    assert_eq!((h[0].left_at, h[0].right_at), (1, 1));
    // with two blocks the counts take into account the rows of the previous blocks
    let c = files(b"a\nb\nc\nd\n", b"a\nc\nd\nz\n");
    let h = session(&c).summary().hunks;
    assert_eq!(h.len(), 2);
    assert_eq!((h[1].left_at, h[1].right_at), (4, 3));
}

#[test]
fn salva_solo_il_lato_modificato_e_conserva_il_formato() {
    let c = files(b"a\r\nb\r\nc\r\n", b"a\r\nX\r\nc\r\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    s.save(Side::Left).unwrap(); // without changes: it does nothing
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read(&c.right).unwrap(), b"a\r\nb\r\nc\r\n");
    assert_eq!(fs::read(&c.left).unwrap(), b"a\r\nb\r\nc\r\n");
    assert!(!s.document(Side::Right).is_dirty());
    // no temporary files left behind
    let names: Vec<_> = fs::read_dir(c.left.parent().unwrap())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names.len(), 2, "{names:?}");
}

#[test]
fn conserva_bom_e_utf16_e_assenza_di_riga_finale() {
    // right: UTF-8 with BOM and without a final line ending
    let c = files(b"a\nb\nc\n", b"\xEF\xBB\xBFa\nX\nc");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read(&c.right).unwrap(), b"\xEF\xBB\xBFa\nb\nc");

    // left: UTF-16 LE
    let utf16: Vec<u8> = [0xFF, 0xFE]
        .into_iter()
        .chain("a\nb\n".encode_utf16().flat_map(u16::to_le_bytes))
        .collect();
    let c = files(&utf16, b"a\nX\n");
    let mut s = session(&c);
    s.apply(0, RightToLeft).unwrap();
    s.save(Side::Left).unwrap();
    let expected: Vec<u8> = [0xFF, 0xFE]
        .into_iter()
        .chain("a\nX\n".encode_utf16().flat_map(u16::to_le_bytes))
        .collect();
    assert_eq!(fs::read(&c.left).unwrap(), expected);
}

#[test]
fn file_non_modificato_si_riscrive_identico() {
    for original in [
        &b"a\nb\n"[..],
        b"a\r\nb\r\n",
        b"a\rb\r",
        b"a\nb",
        b"\n\nx\n\n",
    ] {
        let c = files(original, b"zzz\n");
        let s = session(&c);
        let doc = &s.left;
        assert_eq!(doc.render(doc.save_eol(&s.right)).as_bytes(), original);
    }
}

#[test]
fn fine_riga_mista_viene_normalizzata_su_quella_piu_frequente() {
    let c = files(b"a\r\nb\r\nc\nd\r\n", b"a\r\nB\r\nc\nd\r\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read(&c.right).unwrap(), b"a\r\nb\r\nc\r\nd\r\n");
    assert_eq!(s.document(Side::Right).eol, Eol::CrLf);
    assert_eq!(s.diff().right.eol, Eol::CrLf);
}

#[test]
fn senza_fine_riga_usa_quella_dell_altro_file() {
    let c = files(b"solo", b"a\r\nb\r\n");
    let mut s = session(&c);
    s.apply(0, RightToLeft).unwrap();
    s.save(Side::Left).unwrap();
    // The original did not end with a line break: it stays that way.
    assert_eq!(fs::read(&c.left).unwrap(), b"a\r\nb");
}

#[test]
fn non_sovrascrive_un_file_cambiato_nel_frattempo() {
    let c = files(b"a\nb\n", b"a\nX\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    fs::write(&c.right, b"a\nQUALCUN ALTRO\nlungo\n").unwrap();
    let err = s.save(Side::Right).unwrap_err();
    assert!(matches!(err, SaveError::ChangedOnDisk(_)), "{err}");
    assert_eq!(fs::read(&c.right).unwrap(), b"a\nQUALCUN ALTRO\nlungo\n");
    assert!(s.document(Side::Right).is_dirty());
}

#[test]
fn non_ricrea_un_file_cancellato() {
    let c = files(b"a\nb\n", b"a\nX\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    fs::remove_file(&c.right).unwrap();
    assert!(matches!(
        s.save(Side::Right),
        Err(SaveError::ChangedOnDisk(_))
    ));
    assert!(!c.right.exists());
}

#[test]
fn caratteri_non_rappresentabili_in_latin1() {
    let c = files(b"caff\xE8\nb\n", "a\n€ prezzo\n".as_bytes());
    let mut s = session(&c);
    assert_eq!(s.document(Side::Left).encoding, Encoding::Latin1);
    s.apply(0, RightToLeft).unwrap();
    let before = fs::read(&c.left).unwrap();
    let err = s.save(Side::Left).unwrap_err();
    assert!(matches!(err, SaveError::Encode { .. }), "{err}");
    assert!(err.to_string().contains('€'));
    assert_eq!(fs::read(&c.left).unwrap(), before);
}

#[test]
fn dopo_il_salvataggio_si_puo_ancora_annullare_e_salvare() {
    let c = files(b"a\nb\n", b"a\nX\n");
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    s.save(Side::Right).unwrap();
    s.undo().unwrap();
    assert!(s.document(Side::Right).is_dirty()); // now it differs from the disk
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read(&c.right).unwrap(), b"a\nX\n");
    assert!(!s.document(Side::Right).is_dirty());
}

#[cfg(unix)]
#[test]
fn conserva_i_permessi_e_segue_i_collegamenti() {
    use std::os::unix::fs::{symlink, PermissionsExt};
    let c = files(b"a\nb\n", b"a\nX\n");
    let real = c.right.with_file_name("vero.txt");
    fs::rename(&c.right, &real).unwrap();
    symlink(&real, &c.right).unwrap();
    fs::set_permissions(&real, fs::Permissions::from_mode(0o640)).unwrap();
    let mut s = session(&c);
    s.apply(0, LeftToRight).unwrap();
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read(&real).unwrap(), b"a\nb\n");
    assert!(fs::symlink_metadata(&c.right)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(
        fs::metadata(&real).unwrap().permissions().mode() & 0o777,
        0o640
    );
}

#[test]
fn le_opzioni_del_confronto_restano_dopo_l_unione() {
    let c = files(b"Ciao\nuno\n", b"CIAO\ndue\n");
    let opts = DiffOptions {
        ignore_case: true,
        ..Default::default()
    };
    let mut s = Session::load(&c.left, &c.right, &opts).unwrap();
    assert_eq!(compute_hunks(&s.diff().rows).len(), 1);
    s.apply(0, LeftToRight).unwrap();
    assert!(s.diff().identical);
    // the row "Ciao"/"CIAO" was not a difference: it stays as it was
    assert_eq!(lines(&s, Side::Right), ["CIAO", "uno"]);
}

#[test]
fn errori_di_lettura() {
    let c = files(b"a\n", b"b\n");
    assert!(Session::load(
        &c.left,
        &c.left.with_file_name("manca"),
        &DiffOptions::default()
    )
    .is_err());
}

#[test]
fn un_lato_in_sola_lettura_non_si_unisce_ne_si_salva() {
    let c = files(b"a\nb\n", b"a\nc\n");
    let opts = DiffOptions::default();
    let mut s = Session::load_read_only(&c.left, &c.right, &opts, true, false).unwrap();
    assert_eq!(
        s.apply(0, MergeDirection::RightToLeft),
        Err(MergeError::ReadOnly(Side::Left))
    );
    assert!(!s.can_undo());
    assert!(matches!(s.save(Side::Left), Err(SaveError::ReadOnly(_))));
    // In the other direction it can.
    s.apply(0, MergeDirection::LeftToRight).unwrap();
    s.save(Side::Right).unwrap();
    assert_eq!(fs::read_to_string(&c.right).unwrap(), "a\nb\n");
    assert_eq!(fs::read_to_string(&c.left).unwrap(), "a\nb\n");
}

#[test]
fn il_dispositivo_nullo_e_un_file_vuoto_in_sola_lettura() {
    let c = files(b"uno\ndue\n", b"");
    let opts = DiffOptions::default();
    let s = Session::load(Path::new("/dev/null"), &c.left, &opts).unwrap();
    assert!(s.document(Side::Left).read_only);
    assert!(!s.document(Side::Right).read_only);
    assert_eq!(s.diff().stats.right_only, 2);
    assert!(!s.diff().identical);
}

#[test]
fn copiare_una_riga_modificata_sostituisce_la_riga_dell_altro_lato() {
    let c = files(b"a\nb\nc\n", b"a\nX\nc\n");
    let mut s = session(&c);
    assert!(s.apply_row(1, LeftToRight).unwrap());
    assert_eq!(lines(&s, Side::Right), ["a", "b", "c"]);
    s.undo().unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "X", "c"]);
    assert!(s.apply_row(1, RightToLeft).unwrap());
    assert_eq!(lines(&s, Side::Left), ["a", "X", "c"]);
}

#[test]
fn copiare_una_riga_di_un_blocco_lascia_le_altre_righe_del_blocco() {
    let c = files(b"a\nb1\nb2\nc\n", b"a\nX1\nX2\nc\n");
    let mut s = session(&c);
    s.apply_row(2, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "X1", "b2", "c"]);
    assert_eq!(lines(&s, Side::Left), ["a", "b1", "b2", "c"]);
}

#[test]
fn una_riga_solo_a_sinistra_si_inserisce_dopo_l_ultima_riga_sopra() {
    let c = files(b"a\nnuova\nb\n", b"a\nb\n");
    let mut s = session(&c);
    assert_eq!(s.diff().rows[1].kind, RowKind::LeftOnly);
    s.apply_row(1, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "nuova", "b"]);
    // in cima al file: la destinazione non ha righe sopra
    let c = files(b"prima\na\n", b"a\n");
    let mut s = session(&c);
    s.apply_row(0, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["prima", "a"]);
}

#[test]
fn due_righe_solo_a_sinistra_copiate_una_dopo_l_altra_restano_in_ordine() {
    let c = files(b"a\nn1\nn2\nb\n", b"a\nb\n");
    let mut s = session(&c);
    s.apply_row(1, LeftToRight).unwrap();
    // the first copied row is now equal: the second one is the row 2 of the new comparison
    let next = s
        .diff()
        .rows
        .iter()
        .position(|r| r.kind == RowKind::LeftOnly)
        .unwrap();
    s.apply_row(next, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "n1", "n2", "b"]);
}

#[test]
fn non_c_e_niente_da_copiare_per_righe_uguali_o_solo_dall_altro_lato() {
    let c = files(b"a\nb\n", b"a\nb\nsolo\n");
    let mut s = session(&c);
    assert_eq!(s.apply_row(0, LeftToRight), Err(MergeError::NothingToCopy));
    // the row exists only on the right: from left to right there is nothing to copy
    assert_eq!(s.apply_row(2, LeftToRight), Err(MergeError::NothingToCopy));
    assert_eq!(s.apply_row(9, LeftToRight), Err(MergeError::NoSuchRow(9)));
}

#[test]
fn con_il_filtro_la_riga_e_quella_mostrata() {
    let c = files(b"a\nb\nc\nd\ne\n", b"a\nb\nX\nd\ne\n");
    let mut s = session(&c);
    s.set_filter(RowFilter::Diffs);
    // only the changed row is shown: index 0 of the view is the row 3 of the file
    s.apply_row(0, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "b", "c", "d", "e"]);
}

#[test]
fn le_righe_unificate_indicano_la_riga_da_copiare_anche_con_il_filtro() {
    use crate::unified::UnifiedKind;
    let c = files(b"a\nb\nc\nd\ne\n", b"a\nb\nX\nd\ne\n");
    let mut s = session(&c);
    s.set_filter(RowFilter::Diffs);
    let u = s.unified_rows(0, 10);
    assert_eq!(
        u.iter().map(|r| (r.kind, r.row)).collect::<Vec<_>>(),
        [(UnifiedKind::Removed, 0), (UnifiedKind::Added, 0)]
    );
    // the added line (right) copied to the left
    s.apply_row(u[1].row, RightToLeft).unwrap();
    assert_eq!(lines(&s, Side::Left), ["a", "b", "X", "d", "e"]);
    s.undo().unwrap();
    // the removed line (left) copied to the right
    s.apply_row(u[0].row, LeftToRight).unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "b", "c", "d", "e"]);
}

#[test]
fn copiare_un_blocco_di_righe_rende_uguale_la_zona_di_destinazione() {
    // rows: a | b1->X1 | b2->(none, left only) | c | d->Y (changed)
    let c = files(b"a\nb1\nb2\nc\nd\ne\n", b"a\nX1\nc\nY\ne\n");
    let mut s = session(&c);
    let kinds: Vec<_> = s.diff().rows.iter().map(|r| r.kind).collect();
    assert_eq!(kinds.len(), 6);
    // the rows 1..=2 (b1 and b2) go to the right: X1 is replaced by both lines
    assert!(s.apply_rows(1, 2, LeftToRight).unwrap());
    assert_eq!(lines(&s, Side::Right), ["a", "b1", "b2", "c", "Y", "e"]);
    s.undo().unwrap();
    assert_eq!(lines(&s, Side::Right), ["a", "X1", "c", "Y", "e"]);
    // either order of the ends
    assert!(s.apply_rows(2, 1, LeftToRight).unwrap());
    assert_eq!(lines(&s, Side::Right), ["a", "b1", "b2", "c", "Y", "e"]);
}

#[test]
fn il_blocco_toglie_anche_le_righe_che_ha_solo_la_destinazione() {
    // left: a, c ; right: a, X, Y, c  -> copying all the rows left to right removes X and Y
    let c = files(b"a\nc\n", b"a\nX\nY\nc\n");
    let mut s = session(&c);
    let n = s.diff().rows.len();
    assert!(s.apply_rows(0, n - 1, LeftToRight).unwrap());
    assert_eq!(lines(&s, Side::Right), ["a", "c"]);
}

#[test]
fn il_blocco_si_inserisce_dove_la_destinazione_non_ha_righe() {
    let c = files(b"a\nn1\nn2\nb\n", b"a\nb\n");
    let mut s = session(&c);
    assert!(s.apply_rows(1, 2, LeftToRight).unwrap());
    assert_eq!(lines(&s, Side::Right), ["a", "n1", "n2", "b"]);
}

#[test]
fn il_blocco_rifiuta_righe_senza_origine_e_indici_sbagliati() {
    let c = files(b"a\nb\n", b"a\nb\nsolo\n");
    let mut s = session(&c);
    // the last row exists only on the right: from the left there is nothing to copy
    assert_eq!(
        s.apply_rows(2, 2, LeftToRight),
        Err(MergeError::NothingToCopy)
    );
    assert_eq!(
        s.apply_rows(0, 9, LeftToRight),
        Err(MergeError::NoSuchRow(9))
    );
    // equal rows: no error, nothing changes
    assert_eq!(s.apply_rows(0, 1, LeftToRight), Ok(false));
    assert!(!s.can_undo());
}

#[test]
fn il_blocco_vale_anche_con_il_filtro() {
    let c = files(b"a\nb\nc\nd\ne\nf\ng\n", b"a\nb\nX\nd\ne\nf\nZ\n");
    let mut s = session(&c);
    s.set_filter(RowFilter::Diffs);
    // visible rows: 0 = "c vs X", 1 = "g vs Z"; the block copies both and everything between them
    assert!(s.apply_rows(0, 1, RightToLeft).unwrap());
    assert_eq!(lines(&s, Side::Left), ["a", "b", "X", "d", "e", "f", "Z"]);
}

#[test]
fn la_ricerca_guarda_il_testo_corrente_di_un_lato_sulle_righe_della_vista() {
    let case = files(
        b"uno\ndue\ntre\nquattro\ncinque\n",
        b"uno\nDUE\ntre\nquattro\nsei\n",
    );
    let mut s = session(&case);
    let hits = |s: &Session, side, text: &str, case_sensitive| {
        s.search(side, text, case_sensitive, &|| false)
            .unwrap()
            .hits
            .iter()
            .map(|h| (h.row, h.start, h.end))
            .collect::<Vec<_>>()
    };
    // Each side has its own text: "due" only on the left (the right has "DUE" in capitals)
    assert_eq!(hits(&s, Side::Left, "due", true), [(1, 0, 3)]);
    assert_eq!(hits(&s, Side::Right, "due", true), []);
    assert_eq!(hits(&s, Side::Right, "due", false), [(1, 0, 3)]);
    // An empty text finds nothing
    assert!(s
        .search(Side::Left, "", true, &|| false)
        .unwrap()
        .hits
        .is_empty());
    // a cancelled search gives no answer (a newer one replaced it)
    assert!(s.search(Side::Left, "due", true, &|| true).is_none());

    // With a filter the row is the position among those shown: "cinque" is the fifth row, but the third visible one
    s.set_filter(RowFilter::Diffs);
    assert_eq!(hits(&s, Side::Left, "cinque", true), [(1, 0, 6)]);

    // The text not yet saved counts: after an edit the new line is found
    s.set_filter(RowFilter::All);
    s.edit_lines(Side::Left, 0, 1, &["zero uno".to_string()])
        .unwrap();
    assert_eq!(hits(&s, Side::Left, "zero", true), [(0, 0, 4)]);
    assert_eq!(hits(&s, Side::Right, "zero", true), []);
}
