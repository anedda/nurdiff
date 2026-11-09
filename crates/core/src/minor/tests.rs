use super::*;
use tempfile::TempDir;

fn text(s: &str) -> TextFile {
    decode(s.as_bytes()).unwrap()
}

fn causes(a: &str, b: &str) -> Option<MinorCauses> {
    classify_texts(&text(a), &text(b))
}

#[test]
fn testi_identici_non_hanno_cause() {
    assert_eq!(causes("a\nb\n", "a\nb\n"), Some(MinorCauses::default()));
}

#[test]
fn fine_riga_diversa() {
    let c = causes("a\nb\n", "a\r\nb\r\n").unwrap();
    assert!(c.eol && !c.trailing_space && !c.whitespace && !c.case && !c.encoding);
}

#[test]
fn fine_riga_finale_mancante() {
    let c = causes("a\nb\n", "a\nb").unwrap();
    assert!(c.eol);
}

#[test]
fn spazi_a_fine_riga() {
    let c = causes("a  \nb\t\n", "a\nb\n").unwrap();
    assert!(c.trailing_space && !c.whitespace && !c.eol);
}

#[test]
fn rientri_e_spazi_interni() {
    let c = causes("\tx = 1\n", "    x  =  1\n").unwrap();
    assert!(c.whitespace && !c.trailing_space);
}

#[test]
fn maiuscole() {
    let c = causes("Ciao\n", "ciao\n").unwrap();
    assert!(c.case && !c.whitespace);
}

#[test]
fn cause_combinate() {
    let c = causes("Ciao  \r\nmondo\r\n", "ciao\nmondo\n").unwrap();
    assert!(c.eol && c.trailing_space && c.case);
}

#[test]
fn codifica_e_bom() {
    let l = decode(b"\xEF\xBB\xBFciao\n").unwrap();
    let r = decode(b"ciao\n").unwrap();
    let c = classify_texts(&l, &r).unwrap();
    assert!(c.encoding && !c.eol);
}

#[test]
fn differenza_sostanziale() {
    assert_eq!(causes("a\nb\n", "a\nc\n"), None);
    assert_eq!(causes("a\nb\n", "a\n"), None, "righe in più");
    assert_eq!(causes("ab\n", "a b c\n"), None);
}

#[test]
fn la_differenza_sostanziale_vince_su_quelle_minori() {
    assert_eq!(causes("a  \nx\n", "a\ny\n"), None);
}

#[test]
fn file_binari_e_grandi_non_si_classificano() {
    let dir = TempDir::new().unwrap();
    let (a, b) = (dir.path().join("a"), dir.path().join("b"));
    fs::write(&a, b"ab\0cd").unwrap();
    fs::write(&b, b"ab\0ce").unwrap();
    assert_eq!(classify_files(&a, &b).unwrap(), None);
}

#[test]
fn classify_files_ha_sempre_una_causa() {
    let dir = TempDir::new().unwrap();
    let (a, b) = (dir.path().join("a"), dir.path().join("b"));
    fs::write(&a, "uno\ndue\n").unwrap();
    fs::write(&b, "uno\r\ndue\r\n").unwrap();
    let c = classify_files(&a, &b).unwrap().unwrap();
    assert!(c.any() && c.eol);
    fs::write(&b, "uno\ndue!\n").unwrap();
    assert_eq!(classify_files(&a, &b).unwrap(), None);
}

#[test]
fn file_vuoto_contro_solo_un_a_capo_e_fine_riga() {
    for other in ["\n", "\r\n"] {
        let c = causes("", other).expect("only the line ending differs");
        assert!(c.eol && !c.whitespace && !c.case, "{other:?}");
        assert!(causes(other, "").unwrap().eol);
    }
    // a row with text is still a substantial difference
    assert_eq!(causes("", "x\n"), None);
    assert_eq!(causes("", "\n\n"), None);
}

#[test]
fn un_file_binario_non_si_legge_tutto_per_classificarlo() {
    let dir = TempDir::new().unwrap();
    let (a, b) = (dir.path().join("a.bin"), dir.path().join("b.bin"));
    fs::write(&a, b"PNG\0\x01\x02").unwrap();
    fs::write(&b, b"PNG\0\x01\x03").unwrap();
    assert!(looks_binary(&a).unwrap());
    assert_eq!(classify_files(&a, &b).unwrap(), None);
    // a UTF-16 file has NUL bytes but is text
    let u = dir.path().join("u.txt");
    fs::write(&u, [0xFF, 0xFE, b'a', 0]).unwrap();
    assert!(!looks_binary(&u).unwrap());
}
