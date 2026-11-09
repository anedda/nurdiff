use super::*;
use std::fs;

#[test]
fn confronta_due_file_su_disco() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\ntre\n").unwrap();
    fs::write(&b, "uno\r\nDUE\r\ntre\r\n").unwrap();

    let diff = diff_files(&a, &b, &DiffOptions::default()).unwrap();
    assert!(!diff.identical);
    assert_eq!(diff.stats.changed, 1);
    assert_eq!(diff.left.eol, Eol::Lf);
    assert_eq!(diff.right.eol, Eol::CrLf);
    assert_eq!(diff.left.lines, 3);
}

#[test]
fn fine_riga_diverse_non_contano_come_differenza() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\n").unwrap();
    fs::write(&b, "uno\r\ndue\r\n").unwrap();

    let diff = diff_files(&a, &b, &DiffOptions::default()).unwrap();
    assert!(diff.identical);
    assert_ne!(diff.left.eol, diff.right.eol);
}

#[test]
fn conteggio_delle_righe_diverse_di_due_file() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\ntre\nquattro\n").unwrap();
    fs::write(&b, "uno\nDUE\ntre\nquattro\ncinque\n").unwrap();
    let LineCount::Lines(stats) = file_diff_stats(&a, &b, &DiffOptions::default()).unwrap() else {
        panic!("two text files have rows");
    };
    assert_eq!(
        (
            stats.equal,
            stats.changed,
            stats.left_only,
            stats.right_only
        ),
        (3, 1, 0, 1)
    );
    // A binary file has no rows to count; a non-existent one is an error.
    let bin = tmp.path().join("bin.dat");
    fs::write(&bin, [0u8, 1, 2, 3]).unwrap();
    let opts = DiffOptions::default();
    assert_eq!(file_diff_stats(&a, &bin, &opts).unwrap(), LineCount::Binary);
    assert!(file_diff_stats(&a, &tmp.path().join("manca"), &opts).is_err());
    // A text file over the limit is not counted either.
    let big = tmp.path().join("big.txt");
    fs::write(&big, "riga\n".repeat(MAX_TEXT_BYTES as usize / 5 + 1)).unwrap();
    assert_eq!(
        file_diff_stats(&a, &big, &opts).unwrap(),
        LineCount::TooLarge
    );
}

#[test]
fn file_inesistente_o_binario_da_errore() {
    let tmp = tempfile::tempdir().unwrap();
    let ok = tmp.path().join("ok.txt");
    let bin = tmp.path().join("bin.dat");
    fs::write(&ok, "x").unwrap();
    fs::write(&bin, [0u8, 1, 2, 3]).unwrap();

    let opts = DiffOptions::default();
    assert!(matches!(
        diff_files(&ok, &tmp.path().join("manca"), &opts),
        Err(TextError::Io { .. })
    ));
    assert!(matches!(
        diff_files(&ok, &bin, &opts),
        Err(TextError::Binary { .. })
    ));
}

/// The UI (src/types.ts) depends on these names: if they change here, they must be changed there.
#[test]
fn il_json_ha_i_nomi_attesi_dalla_ui() {
    let l = text::decode(b"a\nsolo\r\n\xEF\xBB\xBF").unwrap();
    let r = text::decode(b"b\n").unwrap();
    let diff = diff_texts(&l, &r, &DiffOptions::default());
    let json = serde_json::to_value(&diff).unwrap();

    assert_eq!(json["identical"], false);
    assert_eq!(json["rows"][0]["kind"], "changed");
    assert_eq!(json["rows"][0]["left"]["number"], 1);
    assert_eq!(json["rows"][0]["left"]["text"], "a");
    assert_eq!(json["rows"][1]["kind"], "leftOnly");
    assert!(json["rows"][1]["right"].is_null());
    assert_eq!(json["stats"]["leftOnly"], 2);
    assert_eq!(json["left"]["eol"], "mixed");
    assert_eq!(json["right"]["encoding"], "utf8");
}

#[test]
fn il_json_della_directory_ha_i_nomi_attesi_dalla_ui() {
    let tmp = tempfile::tempdir().unwrap();
    let (l, r) = (tmp.path().join("l"), tmp.path().join("r"));
    fs::create_dir(&l).unwrap();
    fs::create_dir(&r).unwrap();
    fs::write(l.join("f.txt"), "x").unwrap();

    let diff = compare_dirs(&l, &r, &DirOptions::default()).unwrap();
    let json = serde_json::to_value(&diff).unwrap();

    assert_eq!(json["entries"][0]["path"], "f.txt");
    assert_eq!(json["entries"][0]["status"], "leftOnly");
    assert_eq!(json["entries"][0]["leftKind"], "file");
    assert!(json["entries"][0]["rightKind"].is_null());
    assert_eq!(json["entries"][0]["leftSize"], 1);
    assert_eq!(json["stats"]["leftOnly"], 1);
    assert_eq!(json["stats"]["typeMismatch"], 0);
}

#[test]
fn il_conteggio_delle_righe_ha_la_forma_che_la_ui_si_aspetta() {
    // The UI reads `kind` and, for the rows, the counts next to it (`src/types.ts`, `LineCount`).
    let stats = DiffStats {
        equal: 5,
        changed: 1,
        left_only: 0,
        right_only: 2,
    };
    assert_eq!(
        serde_json::to_value(LineCount::Lines(stats)).unwrap(),
        serde_json::json!({"kind": "lines", "equal": 5, "changed": 1, "leftOnly": 0, "rightOnly": 2})
    );
    assert_eq!(
        serde_json::to_value(LineCount::Binary).unwrap(),
        serde_json::json!({"kind": "binary"})
    );
    assert_eq!(
        serde_json::to_value(LineCount::TooLarge).unwrap(),
        serde_json::json!({"kind": "tooLarge"})
    );
}
