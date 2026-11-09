use super::*;
use crate::diff::{diff_lines, DiffOptions};

fn rows(a: &str, b: &str) -> Vec<Row> {
    let l: Vec<&str> = a.lines().collect();
    let r: Vec<&str> = b.lines().collect();
    diff_lines(&l, &r, &DiffOptions::default()).0
}

fn all(rows: &[Row]) -> Vec<UnifiedRow> {
    let (total, _) = layout(rows.iter().enumerate());
    slice(rows.iter().enumerate(), 0, total, &DiffOptions::default())
}

fn shape(u: &[UnifiedRow]) -> Vec<String> {
    u.iter()
        .map(|r| {
            let sign = match r.kind {
                UnifiedKind::Equal => ' ',
                UnifiedKind::Removed => '-',
                UnifiedKind::Added => '+',
            };
            format!("{sign}{}", r.text)
        })
        .collect()
}

#[test]
fn un_blocco_da_prima_le_tolte_poi_le_aggiunte() {
    let r = rows("a\nb\nc\nd\n", "a\nB\nC\nd\n");
    let u = all(&r);
    assert_eq!(shape(&u), [" a", "-b", "-c", "+B", "+C", " d"]);
    assert_eq!((u[1].left, u[1].right), (Some(2), None));
    assert_eq!((u[3].left, u[3].right), (None, Some(2)));
    assert_eq!((u[0].left, u[0].right), (Some(1), Some(1)));
}

#[test]
fn righe_solo_a_un_lato() {
    let r = rows("a\nb\n", "a\nx\nb\n");
    assert_eq!(shape(&all(&r)), [" a", "+x", " b"]);
    let r = rows("a\nx\nb\n", "a\nb\n");
    assert_eq!(shape(&all(&r)), [" a", "-x", " b"]);
}

#[test]
fn layout_dei_blocchi() {
    let r = rows("a\nb\nc\nd\ne\n", "a\nB\nc\nd\nE\nf\n");
    let (total, spans) = layout(r.iter().enumerate());
    assert_eq!(total, all(&r).len());
    assert_eq!(
        spans,
        [
            UnifiedSpan { start: 1, end: 3 },
            UnifiedSpan { start: 5, end: 8 }
        ]
    );
    assert_eq!(spans.len(), crate::diff::compute_hunks(&r).len());
}

#[test]
fn un_intervallo_coincide_con_lo_stesso_pezzo_dell_elenco_intero() {
    let r = rows(
        "1\n2\n3\n4\n5\n6\n7\n8\n9\n",
        "1\nb\nc\nd\n5\n6\nx\ny\n8\n9\nz\n",
    );
    let full = all(&r);
    let o = DiffOptions::default();
    for start in 0..=full.len() {
        for end in start..=full.len() + 1 {
            let got = slice(r.iter().enumerate(), start, end, &o);
            assert_eq!(got, full[start..end.min(full.len())], "{start}..{end}");
        }
    }
}

#[test]
fn le_righe_modificate_hanno_le_parti_evidenziate() {
    let r = rows("let x = 1;\n", "let x = 2;\n");
    let u = all(&r);
    assert_eq!(u.len(), 2);
    assert!(!u[0].marks.is_empty() && !u[1].marks.is_empty());
}

#[test]
fn righe_nascoste_dal_filtro_segnano_il_salto() {
    let r = rows("a\nb\nc\nd\ne\nf\n", "a\nb\nC\nd\ne\nf\n");
    // View with only the different row and an equal one after it: it skips the first two.
    let view = [2usize, 3];
    let it = || view.iter().map(|&i| (i, &r[i]));
    let (total, spans) = layout(it());
    assert_eq!((total, spans.len()), (3, 1));
    let u = slice(it(), 0, total, &DiffOptions::default());
    assert!(u[0].gap && !u[1].gap && !u[2].gap);
    assert_eq!(shape(&u), ["-c", "+C", " d"]);
    // A block split in half keeps the jump only on the first row.
    let mid = slice(it(), 1, 3, &DiffOptions::default());
    assert!(!mid[0].gap);
}

#[test]
fn due_blocchi_separati_da_righe_nascoste_restano_due() {
    let r = rows("a\nb\nc\n", "A\nb\nC\n");
    let view = [0usize, 2];
    let (_, spans) = layout(view.iter().map(|&i| (i, &r[i])));
    assert_eq!(spans.len(), 2);
}

#[test]
fn nessuna_riga() {
    let (total, spans) = layout(std::iter::empty());
    assert_eq!((total, spans.len()), (0, 0));
}

#[test]
fn ogni_riga_dice_da_quale_riga_del_confronto_affiancato_viene() {
    let r = rows("a\nb\nc\nd\n", "a\nB\nC\nd\n");
    let u = all(&r);
    assert_eq!(shape(&u), [" a", "-b", "-c", "+B", "+C", " d"]);
    // the removed and the added line of the same changed row point to the same row
    assert_eq!(
        u.iter().map(|x| x.row).collect::<Vec<_>>(),
        [0, 1, 2, 1, 2, 3]
    );
    let part = slice(r.iter().enumerate(), 3, 5, &DiffOptions::default());
    assert_eq!(part.iter().map(|x| x.row).collect::<Vec<_>>(), [1, 2]);
}
