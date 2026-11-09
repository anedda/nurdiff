use super::*;
use crate::{diff_line_sets, split_lines, DiffOptions, Encoding, Eol};
use std::time::Duration;

fn diff(l: &str, r: &str) -> FileDiff {
    let fmt = (Encoding::Utf8, Eol::Lf);
    diff_line_sets(
        &split_lines(l),
        &split_lines(r),
        fmt,
        fmt,
        &DiffOptions::default(),
        &[],
    )
}

#[test]
fn una_riga_uguale_senza_un_lato_non_ferma_il_rapporto() {
    // A state that should not exist (an equal row always has both sides): no panic.
    let mut d = diff("a\nb\nc\n", "a\nX\nc\n");
    d.rows[0].right = None;
    let out = file_report(
        &d,
        "a.txt",
        "b.txt",
        ReportFormat::Unified,
        &ReportOptions {
            context: Some(1),
            ..Default::default()
        },
    );
    assert!(out.contains("-b") && out.contains("+X"), "{out}");
}

fn unified_of(l: &str, r: &str, ctx: Option<usize>) -> String {
    file_report(
        &diff(l, r),
        "a.txt",
        "b.txt",
        ReportFormat::Unified,
        &ReportOptions {
            context: ctx,
            ..Default::default()
        },
    )
}

#[test]
fn identici_non_hanno_diff_unificato() {
    assert_eq!(unified_of("a\nb\n", "a\nb\n", Some(3)), "");
}

#[test]
fn una_riga_cambiata() {
    let u = unified_of("uno\ndue\ntre\n", "uno\nDUE\ntre\n", Some(3));
    assert_eq!(
        u,
        "--- a.txt\n+++ b.txt\n@@ -1,3 +1,3 @@\n uno\n-due\n+DUE\n tre\n"
    );
}

#[test]
fn tolte_prima_delle_aggiunte_in_una_serie() {
    let u = unified_of("a\nx\ny\nb\n", "a\nP\nQ\nR\nb\n", Some(1));
    assert_eq!(
        u,
        "--- a.txt\n+++ b.txt\n@@ -1,4 +1,5 @@\n a\n-x\n-y\n+P\n+Q\n+R\n b\n"
    );
}

#[test]
fn aggiunta_in_testa_a_un_file_vuoto() {
    let u = unified_of("", "uno\ndue\n", Some(3));
    assert_eq!(u, "--- a.txt\n+++ b.txt\n@@ -0,0 +1,2 @@\n+uno\n+due\n");
}

#[test]
fn contesto_ridotto_separa_i_gruppi() {
    let l: Vec<String> = (1..=20).map(|i| format!("r{i}")).collect();
    let mut r = l.clone();
    r[1] = "X".into();
    r[17] = "Y".into();
    let u = unified_of(&(l.join("\n") + "\n"), &(r.join("\n") + "\n"), Some(1));
    let heads: Vec<&str> = u.lines().filter(|l| l.starts_with("@@")).collect();
    assert_eq!(heads, vec!["@@ -1,3 +1,3 @@", "@@ -17,3 +17,3 @@"]);
}

#[test]
fn conteggio_uno_ha_la_forma_abbreviata() {
    let u = unified_of("a\n", "b\n", Some(0));
    assert!(u.contains("@@ -1 +1 @@\n-a\n+b\n"), "{u}");
}

#[test]
fn tutto_il_file_senza_limite_di_contesto() {
    let u = unified_of(
        "1\n2\n3\n4\n5\n6\n7\n8\n9\n",
        "1\n2\n3\n4\nX\n6\n7\n8\n9\n",
        None,
    );
    assert!(u.contains("@@ -1,9 +1,9 @@"), "{u}");
}

#[test]
fn html_e_autonomo_e_evidenzia_le_parti_cambiate() {
    let h = file_report(
        &diff("il gatto <nero>\n", "il cane <nero>\n"),
        "a & b",
        "c.txt",
        ReportFormat::Html,
        &ReportOptions::default(),
    );
    assert!(h.starts_with("<!doctype html>"));
    assert!(h.contains("<style>") && !h.contains("<link") && !h.contains("<script"));
    assert!(h.contains("a &amp; b ↔ c.txt"));
    assert!(
        h.contains("<mark>gatto</mark>") && h.contains("<mark>cane</mark>"),
        "{h}"
    );
    assert!(h.contains("&lt;nero&gt;") && !h.contains("<nero>"));
    assert!(h.contains("1 modified"));
}

#[test]
fn html_riassume_i_tratti_uguali_lontani() {
    let l: Vec<String> = (1..=30).map(|i| format!("r{i}")).collect();
    let mut r = l.clone();
    r[15] = "X".into();
    let h = file_report(
        &diff(&(l.join("\n") + "\n"), &(r.join("\n") + "\n")),
        "a",
        "b",
        ReportFormat::Html,
        &ReportOptions {
            context: Some(2),
            ..Default::default()
        },
    );
    assert!(
        h.contains("… 13 identical lines …") && h.contains("… 12 identical lines …"),
        "{h}"
    );
}

#[test]
fn html_di_file_identici() {
    let h = file_report(
        &diff("a\n", "a\n"),
        "a",
        "b",
        ReportFormat::Html,
        &ReportOptions::default(),
    );
    assert!(h.contains("identical"));
}

#[test]
fn html_dice_se_il_confronto_e_approssimato() {
    let mut d = diff("a\nb\n", "a\nc\n");
    let normal = file_report(&d, "a", "b", ReportFormat::Html, &ReportOptions::default());
    assert!(!normal.contains("Approximate comparison"));
    d.approximate = true;
    let h = file_report(&d, "a", "b", ReportFormat::Html, &ReportOptions::default());
    assert!(h.contains("Approximate comparison"), "{h}");
}

#[test]
fn le_parti_si_contano_in_utf16() {
    // "😀" is worth two UTF-16 units: the mark 2..5 falls on "abc", not on the emoji.
    assert_eq!(
        marked("😀abc", &[Mark { start: 2, end: 5 }]),
        "😀<mark>abc</mark>"
    );
}

#[test]
fn data_in_utc() {
    let t = UNIX_EPOCH + Duration::from_secs(1_792_113_600); // 2026-10-16 01:20:00 UTC
    assert_eq!(format_utc(t), "2026-10-16 01:20 UTC");
    assert_eq!(format_utc(UNIX_EPOCH), "1970-01-01 00:00 UTC");
    // 29 February 2024, 23:59
    assert_eq!(
        format_utc(UNIX_EPOCH + Duration::from_secs(1_709_251_199)),
        "2024-02-29 23:59 UTC"
    );
}

#[test]
fn righe_visibili_come_finestre_di_contesto_anche_enormi() {
    // 0 1 2 3 4 5 6 7 8 9 with differences at 2 and 4, context 1: 1..=5 visible.
    let l: String = (0..10).map(|i| format!("{i}\n")).collect();
    let r = l.replace("2\n", "X\n").replace("4\n", "Y\n");
    let d = diff(&l, &r);
    let shown: Vec<usize> = visible_rows(&d.rows, Some(1))
        .iter()
        .enumerate()
        .filter_map(|(i, &v)| v.then_some(i))
        .collect();
    assert_eq!(shown, [1, 2, 3, 4, 5]);
    assert!(visible_rows(&d.rows, Some(usize::MAX)).iter().all(|&v| v));
    // Every other row different with a huge context: linear, not rows × context.
    let pair = diff("a\nuguale\n", "b\nuguale\n").rows;
    let rows: Vec<Row> = pair.iter().cycle().take(400_000).cloned().collect();
    let start = std::time::Instant::now();
    assert!(visible_rows(&rows, Some(1_000_000)).iter().all(|&v| v));
    assert!(start.elapsed() < Duration::from_secs(2));
}
