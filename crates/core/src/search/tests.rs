use super::*;

fn find(lines: &[&str], text: &str, case_sensitive: bool) -> SearchResult {
    let needle = Needle::new(text, case_sensitive).unwrap();
    search_lines(
        lines.iter().enumerate().map(|(i, l)| (i, Some(*l))),
        &needle,
        &|| false,
    )
    .expect("not cancelled")
}

fn ranges(result: &SearchResult) -> Vec<(usize, usize, usize)> {
    result
        .hits
        .iter()
        .map(|h| (h.row, h.start, h.end))
        .collect()
}

#[test]
fn trova_tutte_le_occorrenze_senza_sovrapporle() {
    let r = find(&["una riga", "abcabc", "niente", "aaaa"], "a", true);
    assert_eq!(
        ranges(&r),
        [
            (0, 2, 3),
            (0, 7, 8),
            (1, 0, 1),
            (1, 3, 4),
            (3, 0, 1),
            (3, 1, 2),
            (3, 2, 3),
            (3, 3, 4)
        ]
    );
    // overlapping matches are not counted twice: "aa" in "aaaa" is found at 0 and 2
    assert_eq!(ranges(&find(&["aaaa"], "aa", true)), [(0, 0, 2), (0, 2, 4)]);
    assert!(!r.truncated);
}

#[test]
fn maiuscole_e_minuscole_solo_se_richiesto() {
    let lines = ["Casa casa CASA"];
    assert_eq!(ranges(&find(&lines, "casa", true)), [(0, 5, 9)]);
    assert_eq!(
        ranges(&find(&lines, "casa", false)),
        [(0, 0, 4), (0, 5, 9), (0, 10, 14)]
    );
    assert_eq!(ranges(&find(&lines, "CASA", false)).len(), 3);
}

#[test]
fn le_posizioni_sono_in_unita_utf16_come_in_javascript() {
    // "é" is 1 unit; "😀" (outside the BMP) is 2 units: the match after them starts at 3
    let r = find(&["é😀x"], "x", true);
    assert_eq!(ranges(&r), [(0, 3, 4)]);
    // a match that contains a character of two units is 2 units longer
    assert_eq!(ranges(&find(&["a😀b"], "😀", true)), [(0, 1, 3)]);
}

#[test]
fn una_lettera_che_cambia_lunghezza_maiuscola_tiene_le_posizioni() {
    // "İ" lowercases to two characters: it is left as it is, so the "x" after it is still at 1
    let r = find(&["İx", "ß"], "x", false);
    assert_eq!(ranges(&r), [(0, 1, 2)]);
    assert_eq!(ranges(&find(&["Straße"], "STRASSE", false)), []);
    assert_eq!(ranges(&find(&["ÀÈ"], "àè", false)), [(0, 0, 2)]);
}

#[test]
fn testo_vuoto_non_cerca_niente_e_le_righe_senza_testo_si_saltano() {
    assert!(Needle::new("", true).is_none());
    let needle = Needle::new("a", true).unwrap();
    let lines = vec![(0, None), (1, Some("a")), (2, None)];
    let r = search_lines(lines.into_iter(), &needle, &|| false).unwrap();
    assert_eq!(ranges(&r), [(1, 0, 1)]);
}

#[test]
fn si_ferma_al_massimo_delle_corrispondenze() {
    let many = "a".repeat(MAX_HITS + 50);
    let r = find(&[many.as_str()], "a", true);
    assert!(r.truncated);
    assert_eq!(r.hits.len(), MAX_HITS);
    let exact = "a".repeat(MAX_HITS);
    let r = find(&[exact.as_str()], "a", true);
    assert!(!r.truncated);
    assert_eq!(r.hits.len(), MAX_HITS);
}

#[test]
fn una_ricerca_annullata_si_ferma_presto_e_non_da_risultato() {
    // a word that is nowhere: the search has to go through everything (with many matches it would stop at the limit)
    let needle = Needle::new("zz", true).unwrap();
    let lines: Vec<String> = (0..100_000).map(|_| "aaa".to_string()).collect();
    let iter = || lines.iter().enumerate().map(|(i, l)| (i, Some(l.as_str())));
    // already cancelled at the start: nothing is searched
    assert_eq!(search_lines(iter(), &needle, &|| true), None);
    // cancelled while it goes: it stops at the next check, not at the end
    let polls = std::cell::Cell::new(0);
    let cancelled = || {
        polls.set(polls.get() + 1);
        polls.get() > 3
    };
    assert_eq!(search_lines(iter(), &needle, &cancelled), None);
    assert_eq!(polls.get(), 4);
    // not cancelled: it asks only every CANCEL_CHECK_EVERY lines
    polls.set(0);
    let r = search_lines(iter().take(10_000), &needle, &|| {
        polls.set(polls.get() + 1);
        false
    });
    assert!(r.is_some());
    assert_eq!(polls.get(), 10_000_usize.div_ceil(CANCEL_CHECK_EVERY));
}
