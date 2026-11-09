use super::*;

#[test]
fn utf8_semplice() {
    let f = decode(b"ciao\nmondo\n").unwrap();
    assert_eq!(f.encoding, Encoding::Utf8);
    assert_eq!(f.eol, Eol::Lf);
    assert_eq!(f.text, "ciao\nmondo\n");
}

#[test]
fn utf8_con_bom_toglie_il_bom() {
    let f = decode(b"\xEF\xBB\xBFciao").unwrap();
    assert_eq!(f.encoding, Encoding::Utf8Bom);
    assert_eq!(f.text, "ciao");
}

#[test]
fn utf16_little_endian() {
    let f = decode(&[0xFF, 0xFE, b'c', 0, b'i', 0, b'\n', 0]).unwrap();
    assert_eq!(f.encoding, Encoding::Utf16Le);
    assert_eq!(f.text, "ci\n");
}

#[test]
fn utf16_big_endian() {
    let f = decode(&[0xFE, 0xFF, 0, b'c', 0, b'i']).unwrap();
    assert_eq!(f.encoding, Encoding::Utf16Be);
    assert_eq!(f.text, "ci");
}

#[test]
fn latin1_come_ripiego() {
    let f = decode(b"caff\xE8").unwrap();
    assert_eq!(f.encoding, Encoding::Latin1);
    assert_eq!(f.text, "caffè");
}

#[test]
fn i_file_binari_sono_rifiutati() {
    assert!(decode(b"ab\0cd").is_none());
}

#[test]
fn rileva_le_fine_riga() {
    assert_eq!(detect_eol(""), Eol::None);
    assert_eq!(detect_eol("a"), Eol::None);
    assert_eq!(detect_eol("a\nb\n"), Eol::Lf);
    assert_eq!(detect_eol("a\r\nb\r\n"), Eol::CrLf);
    assert_eq!(detect_eol("a\rb\r"), Eol::Cr);
    assert_eq!(detect_eol("a\r\nb\n"), Eol::Mixed);
}

#[test]
fn divide_in_righe() {
    assert_eq!(split_lines(""), Vec::<&str>::new());
    assert_eq!(split_lines("a"), vec!["a"]);
    assert_eq!(split_lines("a\nb\n"), vec!["a", "b"]);
    assert_eq!(split_lines("a\r\nb"), vec!["a", "b"]);
    assert_eq!(split_lines("a\rb"), vec!["a", "b"]);
    assert_eq!(split_lines("\n"), vec![""]);
    assert_eq!(split_lines("a\n\nb"), vec!["a", "", "b"]);
}

#[test]
fn fine_riga_prevalente_e_terminatori() {
    assert_eq!(dominant_eol(""), Eol::Lf);
    assert_eq!(dominant_eol("a\r\nb\r\nc\n"), Eol::CrLf);
    assert_eq!(dominant_eol("a\nb\r\n"), Eol::Lf); // tie: LF
    assert_eq!(dominant_eol("a\rb\rc\n"), Eol::Cr);
    assert_eq!(eol_str(Eol::CrLf), "\r\n");
    assert_eq!(eol_str(Eol::Cr), "\r");
    assert_eq!(eol_str(Eol::Lf), "\n");
    assert_eq!(eol_str(Eol::Mixed), "\n");
    assert_eq!(eol_str(Eol::None), "\n");
}

#[test]
fn codifica_e_decodifica_sono_inverse() {
    for bytes in [
        &b"ciao\nmondo\n"[..],
        &b"\xEF\xBB\xBFcaff\xC3\xA8"[..],
        &[0xFF, 0xFE, b'c', 0, 0xE8, 0, b'\n', 0][..],
        &[0xFE, 0xFF, 0, b'c', 0, 0xE8][..],
        &b"caff\xE8"[..],
    ] {
        let file = decode(bytes).unwrap();
        assert_eq!(encode(&file.text, file.encoding).unwrap(), bytes);
    }
}

#[test]
fn utf16_con_caratteri_fuori_dal_piano_base() {
    let file = decode(&[0xFF, 0xFE, 0x3D, 0xD8, 0x00, 0xDE]).unwrap(); // 😀
    assert_eq!(file.text, "😀");
    assert_eq!(
        encode("😀", Encoding::Utf16Le).unwrap(),
        [0xFF, 0xFE, 0x3D, 0xD8, 0x00, 0xDE]
    );
}

#[test]
fn latin1_rifiuta_i_caratteri_che_non_rappresenta() {
    let err = encode("ok €", Encoding::Latin1).unwrap_err();
    assert_eq!(err.ch, '€');
    assert!(err.to_string().contains("Latin-1"));
    assert_eq!(encode("caffè", Encoding::Latin1).unwrap(), b"caff\xE8");
}

#[test]
fn il_dispositivo_nullo_e_un_file_vuoto() {
    // what git passes for an added or deleted file; on Windows it cannot be read as a file
    let f = read_text_file(Path::new("/dev/null")).unwrap();
    assert_eq!(f.text, "");
}

#[test]
fn utf16_non_valido_non_e_testo() {
    // odd length: the last byte would be lost at the first save
    assert!(decode(&[0xFF, 0xFE, b'c', 0, b'i']).is_none());
    // unpaired surrogate: it would become U+FFFD at the first save
    assert!(decode(&[0xFF, 0xFE, b'c', 0, 0x00, 0xD8, b'i', 0]).is_none());
    assert!(decode(&[0xFE, 0xFF, 0xDC, 0x00]).is_none());
    // a valid pair is still text
    assert_eq!(
        decode(&[0xFF, 0xFE, 0x3D, 0xD8, 0x00, 0xDE]).unwrap().text,
        "\u{1F600}"
    );
}
