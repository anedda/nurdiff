use super::*;
use crate::{DiffOptions, Mark};
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

struct Case {
    _dir: TempDir,
    left: PathBuf,
    right: PathBuf,
}

fn files(l: &str, r: &str) -> Case {
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

fn open(store: &mut DiffStore, c: &Case, opts: &DiffOptions) -> OpenedDiff {
    store.open(Session::load(&c.left, &c.right, opts).unwrap())
}

/// Ten rows; the fourth is different on the right.
fn sample(n: usize) -> Case {
    let left: String = (0..n).map(|i| format!("riga {i}\n")).collect();
    let right = left.replace("riga 3\n", "RIGA 3\n");
    files(&left, &right)
}

#[test]
fn open_restituisce_riepilogo_senza_righe() {
    let mut store = DiffStore::new();
    let opened = open(&mut store, &sample(10), &DiffOptions::default());
    assert_eq!(opened.summary.total_rows, 10);
    assert_eq!(opened.summary.hunks.len(), 1);
    assert_eq!(opened.summary.stats.changed, 1);
    assert!(!opened.left_dirty && !opened.right_dirty && !opened.can_undo);
    let json = serde_json::to_value(&opened).unwrap();
    assert!(json.get("rows").is_none());
}

#[test]
fn righe_con_filtro_e_segno_delle_righe_nascoste() {
    let mut store = DiffStore::new();
    let opened = open(&mut store, &sample(10), &DiffOptions::default());
    let id = opened.id;
    let opened = store.set_filter(id, RowFilter::Diffs).unwrap();
    assert!(opened.revision > 0);
    assert_eq!(opened.summary.total_rows, 1);
    let rows = store.rows(id, 0, 99).unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0].gap);
    let json = serde_json::to_value(&rows[0]).unwrap();
    assert_eq!(json["gap"], true);
    // without a filter the field does not travel
    store.set_filter(id, RowFilter::All).unwrap();
    let json = serde_json::to_value(&store.rows(id, 0, 1).unwrap()[0]).unwrap();
    assert!(json.get("gap").is_none());
    assert!(store.set_filter(999, RowFilter::All).is_err());
}

#[test]
fn modifica_di_righe_cambia_revisione_e_stato_e_si_annulla() {
    let mut store = DiffStore::new();
    let c = sample(10);
    let opened = open(&mut store, &c, &DiffOptions::default());
    let id = opened.id;
    // A row on the right becomes equal to the left again: the comparison becomes identical.
    let edited = store
        .edit_lines(id, Side::Right, 3, 1, &["riga 3".to_string()])
        .unwrap();
    assert!(
        edited.summary.identical && edited.right_dirty && !edited.left_dirty && edited.can_undo
    );
    assert!(edited.revision > opened.revision);
    // Row 4 of the right side is at row 3 of the view (index 3).
    assert_eq!(store.locate_line(id, Side::Right, 4).unwrap(), Some(3));
    assert_eq!(store.locate_line(id, Side::Right, 99).unwrap(), None);
    let undone = store.undo(id).unwrap();
    assert!(!undone.summary.identical && !undone.right_dirty);
    assert!(store.edit_lines(id, Side::Left, 50, 1, &[]).is_err());
}

#[test]
fn id_diversi_per_confronti_diversi() {
    let mut store = DiffStore::new();
    let c = sample(3);
    let a = open(&mut store, &c, &DiffOptions::default()).id;
    let b = open(&mut store, &c, &DiffOptions::default()).id;
    assert_ne!(a, b);
    assert_eq!(store.len(), 2);
}

#[test]
fn righe_a_fetta() {
    let mut store = DiffStore::new();
    let id = open(&mut store, &sample(10), &DiffOptions::default()).id;
    let rows = store.rows(id, 2, 5).unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].left.as_ref().unwrap().number, 3);
    assert_eq!(rows[1].left.as_ref().unwrap().text, "riga 3");
    assert_eq!(rows[1].right.as_ref().unwrap().text, "RIGA 3");
}

#[test]
fn le_righe_modificate_hanno_le_parti_cambiate() {
    let mut store = DiffStore::new();
    let id = open(&mut store, &sample(10), &DiffOptions::default()).id;
    let rows = store.rows(id, 3, 5).unwrap();
    let (l, r) = (
        rows[0].left.as_ref().unwrap(),
        rows[0].right.as_ref().unwrap(),
    );
    let word = [Mark { start: 0, end: 4 }];
    assert_eq!(
        (l.marks.as_slice(), r.marks.as_slice()),
        (&word[..], &word[..])
    );
    // Equal rows have no highlights.
    assert!(rows[1].left.as_ref().unwrap().marks.is_empty());
    let json = serde_json::to_value(&rows).unwrap();
    assert_eq!(json[0]["left"]["marks"][0]["start"], 0);
    assert_eq!(json[0]["left"]["marks"][0]["end"], 4);
    assert!(json[1]["left"].get("marks").is_none());
}

#[test]
fn le_opzioni_del_confronto_valgono_anche_per_le_parti_cambiate() {
    let c = files("Ciao mondo\n", "ciao luna\n");
    let opts = DiffOptions {
        ignore_case: true,
        ..Default::default()
    };
    let mut store = DiffStore::new();
    let id = open(&mut store, &c, &opts).id;
    let row = &store.rows(id, 0, 1).unwrap()[0];
    // "Ciao" and "ciao" match: only the second word is highlighted.
    assert_eq!(
        row.left.as_ref().unwrap().marks,
        vec![Mark { start: 5, end: 10 }]
    );
}

#[test]
fn fette_oltre_i_limiti_vengono_ridotte() {
    let mut store = DiffStore::new();
    let id = open(&mut store, &sample(10), &DiffOptions::default()).id;
    assert_eq!(store.rows(id, 8, 100).unwrap().len(), 2);
    assert!(store.rows(id, 50, 60).unwrap().is_empty());
    assert!(store.rows(id, 5, 2).unwrap().is_empty());
    assert_eq!(store.rows(id, 0, usize::MAX).unwrap().len(), 10);
}

#[test]
fn una_fetta_non_supera_il_massimo() {
    let mut store = DiffStore::new();
    let id = open(
        &mut store,
        &sample(MAX_SLICE + 100),
        &DiffOptions::default(),
    )
    .id;
    assert_eq!(store.rows(id, 0, usize::MAX).unwrap().len(), MAX_SLICE);
    assert_eq!(store.rows(id, 50, usize::MAX).unwrap().len(), MAX_SLICE);
    assert_eq!(store.rows(id, MAX_SLICE, usize::MAX).unwrap().len(), 100);
}

#[test]
fn id_sconosciuto_o_rilasciato_da_errore() {
    let mut store = DiffStore::new();
    assert!(matches!(store.rows(42, 0, 1), Err(StoreError::Unknown(42))));
    assert!(matches!(
        store.apply_hunk(42, 0, MergeDirection::LeftToRight),
        Err(StoreError::Unknown(42))
    ));
    assert!(matches!(store.undo(42), Err(StoreError::Unknown(42))));
    assert!(matches!(
        store.save(42, Side::Left),
        Err(StoreError::Unknown(42))
    ));
    let id = open(&mut store, &sample(3), &DiffOptions::default()).id;
    store.release(id);
    assert!(store.is_empty());
    assert!(matches!(store.rows(id, 0, 1), Err(StoreError::Unknown(_))));
    store.release(id); // idempotent
}

#[test]
fn unione_annullamento_e_salvataggio_aggiornano_il_riepilogo() {
    let c = sample(10);
    let mut store = DiffStore::new();
    let first = open(&mut store, &c, &DiffOptions::default());

    let merged = store
        .apply_hunk(first.id, 0, MergeDirection::LeftToRight)
        .unwrap();
    assert_eq!(merged.id, first.id);
    assert!(merged.revision > first.revision);
    assert!(merged.right_dirty && !merged.left_dirty && merged.can_undo);
    assert!(merged.summary.identical);
    assert!(merged.summary.hunks.is_empty());
    // the rows requested after the merge are the new ones
    let rows = store.rows(first.id, 3, 4).unwrap();
    assert_eq!(rows[0].right.as_ref().unwrap().text, "riga 3");

    let undone = store.undo(first.id).unwrap();
    assert!(!undone.right_dirty && !undone.can_undo);
    assert_eq!(undone.summary.hunks.len(), 1);
    assert!(undone.revision > merged.revision);

    store
        .apply_hunk(first.id, 0, MergeDirection::LeftToRight)
        .unwrap();
    let saved = store.save(first.id, Side::Right).unwrap();
    assert!(!saved.right_dirty);
    assert!(saved.can_undo);
    assert!(fs::read_to_string(&c.right).unwrap().contains("riga 3\n"));
}

#[test]
fn errori_di_unione_e_salvataggio_arrivano_come_messaggio() {
    let c = sample(10);
    let mut store = DiffStore::new();
    let id = open(&mut store, &c, &DiffOptions::default()).id;
    let err = store
        .apply_hunk(id, 5, MergeDirection::LeftToRight)
        .unwrap_err();
    assert!(err.to_string().contains("does not exist"), "{err}");
    let err = store.undo(id).unwrap_err();
    assert!(err.to_string().contains("nothing to undo"), "{err}");
    store
        .apply_hunk(id, 0, MergeDirection::LeftToRight)
        .unwrap();
    fs::write(&c.right, "cambiato\n").unwrap();
    let err = store.save(id, Side::Right).unwrap_err();
    assert!(err.to_string().contains("changed on disk"), "{err}");
}

/// The UI (src/types.ts) depends on these names.
#[test]
fn il_json_ha_i_nomi_attesi_dalla_ui() {
    let mut store = DiffStore::new();
    let opened = open(&mut store, &sample(10), &DiffOptions::default());
    let json = serde_json::to_value(&opened).unwrap();
    assert_eq!(json["id"], opened.id);
    assert_eq!(json["revision"], 0);
    assert_eq!(json["leftDirty"], false);
    assert_eq!(json["rightDirty"], false);
    assert_eq!(json["canUndo"], false);
    assert_eq!(json["identical"], false);
    assert_eq!(json["totalRows"], 10);
    assert_eq!(json["maxWidth"], 6); // "row N" / "ROW N"
    assert_eq!(json["hunks"][0]["start"], 3);
    assert_eq!(json["hunks"][0]["end"], 4);
    assert_eq!(json["hunks"][0]["kind"], "changed");
    assert_eq!(json["stats"]["changed"], 1);
    assert_eq!(json["left"]["lines"], 10);
    assert_eq!(json["right"]["encoding"], "utf8");
    assert_eq!(json["aligns"], serde_json::json!([]));
    // A modified row gives two unified rows (removed and added).
    assert_eq!(json["unifiedTotal"], 11);
    assert_eq!(
        json["unifiedHunks"],
        serde_json::json!([{"start": 3, "end": 5}])
    );
    let u = store.unified_rows(opened.id, 2, 6).unwrap();
    let texts: Vec<_> = u.iter().map(|r| (r.left, r.right)).collect();
    assert_eq!(
        texts,
        [
            (Some(3), Some(3)),
            (Some(4), None),
            (None, Some(4)),
            (Some(5), Some(5))
        ]
    );
}

#[test]
fn allineare_righe_dallo_store() {
    let c = files("int b = 2;\n", "// nuovo\nint b = 20;\n");
    let mut store = DiffStore::new();
    let id = open(&mut store, &c, &DiffOptions::default()).id;

    let opened = store.align(id, 1, 2).unwrap();
    let json = serde_json::to_value(&opened).unwrap();
    assert_eq!(json["aligns"], serde_json::json!([[1, 2]]));
    assert_eq!(opened.revision, 1);
    let rows = store.rows(id, 0, 2).unwrap();
    let json = serde_json::to_value(&rows[1]).unwrap();
    assert_eq!(json["aligned"], true);
    assert!(serde_json::to_value(&rows[0])
        .unwrap()
        .get("aligned")
        .is_none());

    let err = store.align(id, 9, 1).unwrap_err();
    assert!(err.to_string().contains("do not exist"), "{err}");
    let opened = store.unalign(id, 1).unwrap();
    assert!(opened.summary.aligns.is_empty());
    store.align(id, 1, 1).unwrap();
    let opened = store.clear_aligns(id).unwrap();
    assert!(opened.summary.aligns.is_empty());
    assert!(store.align(99, 1, 1).is_err());
}

/// The Tauri commands receive these strings from the UI.
#[test]
fn verso_e_lato_si_leggono_dai_nomi_della_ui() {
    let d: MergeDirection = serde_json::from_str("\"leftToRight\"").unwrap();
    assert_eq!(d, MergeDirection::LeftToRight);
    let d: MergeDirection = serde_json::from_str("\"rightToLeft\"").unwrap();
    assert_eq!(d, MergeDirection::RightToLeft);
    let s: Side = serde_json::from_str("\"left\"").unwrap();
    assert_eq!(s, Side::Left);
    assert!(serde_json::from_str::<Side>("\"centro\"").is_err());
}

#[test]
fn il_report_riflette_le_unioni_non_salvate() {
    let mut store = DiffStore::new();
    let c = files("uno\ndue\n", "uno\nDUE\n");
    let opened = open(&mut store, &c, &DiffOptions::default());
    let before = store
        .report(opened.id, ReportFormat::Unified, &ReportOptions::default())
        .unwrap();
    assert!(before.contains("-due\n+DUE\n"), "{before}");
    store
        .apply_hunk(opened.id, 0, MergeDirection::LeftToRight)
        .unwrap();
    let after = store
        .report(opened.id, ReportFormat::Unified, &ReportOptions::default())
        .unwrap();
    assert_eq!(after, "", "dopo l'unione i due lati coincidono");
    assert!(matches!(
        store.report(99, ReportFormat::Html, &ReportOptions::default()),
        Err(StoreError::Unknown(99))
    ));
}

#[test]
fn i_conflitti_non_finiti_si_sanno_anche_dopo_la_chiusura() {
    use crate::{ConflictSession, Resolution};
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("m.txt");
    let text = "a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\nz\n";
    let open_session = |store: &mut DiffStore| {
        fs::write(&path, text).unwrap();
        store.open_conflicts(ConflictSession::load(&path).unwrap())
    };

    let mut store = DiffStore::new();
    // nothing opened yet (unreadable file, window closed first): not resolved
    assert!(store.conflicts_pending());
    let view = open_session(&mut store);
    assert_eq!((view.total, view.unresolved), (1, 1));
    assert!(store.conflicts_pending());
    // resolved but not saved: still pending
    let view = store
        .resolve_conflict(view.id, 0, Resolution::Ours)
        .unwrap();
    assert!(store.conflicts_pending());
    let view = store.save_conflicts(view.id).unwrap();
    assert!(!view.dirty);
    assert!(!store.conflicts_pending());
    assert_eq!(fs::read_to_string(&path).unwrap(), "a\nx\nz\n");
    store.release(view.id);
    assert!(!store.conflicts_pending());

    // closed without finishing: it stays pending (the exit code of the app tells git)
    let view = open_session(&mut store);
    store.release(view.id);
    assert!(store.conflicts_pending());
    assert!(matches!(
        store.undo_conflicts(view.id),
        Err(StoreError::Unknown(_))
    ));
}
