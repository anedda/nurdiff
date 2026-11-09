use super::*;
use std::fs;

const TWO: &str = "inizio\n<<<<<<< HEAD\nlocale 1\nlocale 2\n=======\nremoto\n>>>>>>> feature\nmezzo\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> feature\nfine\n";

fn session_of(text: &str) -> (tempfile::TempDir, ConflictSession) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("merged.txt");
    fs::write(&path, text).unwrap();
    let s = ConflictSession::load(&path).unwrap();
    (dir, s)
}

fn result_text(s: &ConflictSession) -> String {
    s.doc.render(s.doc.eol)
}

#[test]
fn trova_i_conflitti_e_le_due_parti() {
    let (_d, s) = session_of(TWO);
    assert_eq!((s.total(), s.unresolved()), (2, 2));
    let v = s.view(1);
    assert_eq!(v.segments.len(), 5);
    match &v.segments[1] {
        SegmentView::Conflict {
            index,
            ours,
            theirs,
            ours_label,
            theirs_label,
            base,
            start,
            ..
        } => {
            assert_eq!((*index, *start), (0, 2));
            assert_eq!(ours, &["locale 1", "locale 2"]);
            assert_eq!(theirs, &["remoto"]);
            assert_eq!(
                (ours_label.as_str(), theirs_label.as_str()),
                ("HEAD", "feature")
            );
            assert!(base.is_none());
        }
        other => panic!("{other:?}"),
    }
    // the second conflict starts after the first one with its markers (6 lines, from line 2) and the text in between
    match &v.segments[3] {
        SegmentView::Conflict { index, start, .. } => assert_eq!((*index, *start), (1, 9)),
        other => panic!("{other:?}"),
    }
}

#[test]
fn senza_scelte_il_file_resta_com_e_e_non_risulta_modificato() {
    let (_d, s) = session_of(TWO);
    assert_eq!(result_text(&s), TWO);
    assert!(!s.is_dirty());
}

#[test]
fn le_scelte_cambiano_il_risultato() {
    let (_d, mut s) = session_of(TWO);
    s.resolve(0, Resolution::Ours).unwrap();
    assert_eq!(s.unresolved(), 1);
    assert_eq!(
        result_text(&s),
        "inizio\nlocale 1\nlocale 2\nmezzo\n<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> feature\nfine\n"
    );
    s.resolve(1, Resolution::Both).unwrap();
    s.resolve(0, Resolution::Theirs).unwrap();
    assert_eq!(result_text(&s), "inizio\nremoto\nmezzo\nA\nB\nfine\n");
    s.resolve(1, Resolution::BothReversed).unwrap();
    assert_eq!(result_text(&s), "inizio\nremoto\nmezzo\nB\nA\nfine\n");
    s.resolve(
        1,
        Resolution::Custom {
            lines: vec!["uno".into(), "due".into()],
        },
    )
    .unwrap();
    assert_eq!(result_text(&s), "inizio\nremoto\nmezzo\nuno\ndue\nfine\n");
    assert_eq!(s.unresolved(), 0);
    assert!(s.is_dirty());
}

#[test]
fn si_puo_tornare_indietro_con_annulla_e_con_non_risolto() {
    let (_d, mut s) = session_of(TWO);
    s.resolve(0, Resolution::Ours).unwrap();
    s.resolve(1, Resolution::Theirs).unwrap();
    s.undo().unwrap();
    assert_eq!(s.unresolved(), 1);
    s.resolve(0, Resolution::Unresolved).unwrap();
    s.undo().unwrap();
    s.undo().unwrap();
    assert_eq!(result_text(&s), TWO);
    assert!(!s.is_dirty());
    assert!(!s.can_undo());
    assert_eq!(s.undo(), Err(MergeError::NothingToUndo));
}

#[test]
fn indici_e_testi_non_validi_sono_rifiutati() {
    let (_d, mut s) = session_of(TWO);
    assert_eq!(
        s.resolve(2, Resolution::Ours),
        Err(MergeError::NoSuchHunk(2))
    );
    assert_eq!(
        s.resolve(
            0,
            Resolution::Custom {
                lines: vec!["a\nb".into()]
            }
        ),
        Err(MergeError::LineBreakInLine)
    );
    // the same choice again changes nothing and does not enter the history
    s.resolve(0, Resolution::Unresolved).unwrap();
    assert!(!s.can_undo());
}

#[test]
fn con_diff3_c_e_anche_la_base() {
    let text = "a\n<<<<<<< HEAD\nlocale\n||||||| base comune\noriginale\n=======\nremoto\n>>>>>>> altro\nz\n";
    let (_d, mut s) = session_of(text);
    match &s.view(1).segments[1] {
        SegmentView::Conflict {
            base, ours, theirs, ..
        } => {
            assert_eq!(base.as_deref(), Some(&["originale".to_string()][..]));
            assert_eq!(
                (ours, theirs),
                (&vec!["locale".to_string()], &vec!["remoto".to_string()])
            );
        }
        other => panic!("{other:?}"),
    }
    // unresolved it goes back as it was, the base included
    assert_eq!(result_text(&s), text);
    s.resolve(0, Resolution::Ours).unwrap();
    assert_eq!(result_text(&s), "a\nlocale\nz\n");
}

#[test]
fn marcatori_piu_lunghi_e_non_chiusi() {
    let long = "x\n<<<<<<<<< HEAD\nl\n=========\nr\n>>>>>>>>> b\ny\n";
    let (_d, s) = session_of(long);
    assert_eq!(s.total(), 1);
    // markers of different length do not match: not a conflict
    let (_d, s) = session_of("x\n<<<<<<< HEAD\nl\n=========\nr\n>>>>>>> b\ny\n");
    assert_eq!(s.total(), 0);
    // never closed, or opened again before closing: plain text
    let (_d, s) = session_of("<<<<<<< HEAD\nl\n=======\nr\n");
    assert_eq!(s.total(), 0);
    let (_d, s) = session_of("<<<<<<< a\n<<<<<<< b\nl\n=======\nr\n>>>>>>> c\n");
    assert_eq!(s.total(), 1);
    // fewer than 7 characters: not a marker
    let (_d, s) = session_of("<<<<<< HEAD\nl\n=======\nr\n>>>>>>> b\n");
    assert_eq!(s.total(), 0);
    // text after the markers without a space ("<<<<<<<x") is not a marker either
    let (_d, s) = session_of("<<<<<<<x\nl\n=======\nr\n>>>>>>> b\n");
    assert_eq!(s.total(), 0);
}

#[test]
fn senza_conflitti_non_c_e_niente_da_fare() {
    let (_d, s) = session_of("a\nb\n");
    assert_eq!((s.total(), s.unresolved()), (0, 0));
    assert_eq!(s.view(3).segments.len(), 1);
}

#[test]
fn il_salvataggio_conserva_la_fine_riga_e_scrive_il_risultato() {
    let crlf = TWO.replace('\n', "\r\n");
    let (dir, mut s) = session_of(&crlf);
    s.resolve(0, Resolution::Theirs).unwrap();
    s.resolve(1, Resolution::Ours).unwrap();
    s.save().unwrap();
    let written = fs::read(dir.path().join("merged.txt")).unwrap();
    assert_eq!(
        String::from_utf8(written).unwrap(),
        "inizio\r\nremoto\r\nmezzo\r\nA\r\nfine\r\n"
    );
    assert!(!s.is_dirty());
}

#[test]
fn se_il_file_e_cambiato_nel_frattempo_non_lo_sovrascrive() {
    let (dir, mut s) = session_of(TWO);
    s.resolve(0, Resolution::Ours).unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    fs::write(
        dir.path().join("merged.txt"),
        "altro contenuto, piu lungo\n",
    )
    .unwrap();
    assert!(matches!(s.save(), Err(SaveError::ChangedOnDisk(_))));
}

/// A conflict made by a real `git merge`, in both marker styles (skipped without git).
#[test]
fn legge_i_conflitti_scritti_da_git_davvero() {
    use std::process::Command;
    if Command::new("git").arg("--version").output().is_err() {
        return;
    }
    for style in ["merge", "diff3"] {
        let dir = tempfile::tempdir().unwrap();
        let git = |args: &[&str]| {
            let out = Command::new("git")
                .current_dir(dir.path())
                .env("GIT_CONFIG_GLOBAL", dir.path().join("none"))
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .args(["-c", "user.name=t", "-c", "user.email=t@t"])
                .args(["-c", &format!("merge.conflictStyle={style}")])
                .args(args)
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).into_owned()
                + &String::from_utf8_lossy(&out.stderr)
        };
        git(&["init", "-q", "-b", "main"]);
        fs::write(dir.path().join("f.txt"), "uno\ndue\ntre\nquattro\n").unwrap();
        git(&["add", "."]);
        git(&["commit", "-qm", "base"]);
        git(&["checkout", "-qb", "altro"]);
        fs::write(dir.path().join("f.txt"), "uno\nDUE remoto\ntre\nquattro\n").unwrap();
        git(&["commit", "-qam", "remoto"]);
        git(&["checkout", "-q", "main"]);
        fs::write(dir.path().join("f.txt"), "uno\nDUE locale\ntre\nquattro\n").unwrap();
        git(&["commit", "-qam", "locale"]);
        git(&["merge", "altro"]);

        let mut s = ConflictSession::load(&dir.path().join("f.txt")).unwrap();
        assert_eq!(s.total(), 1, "{style}");
        match &s.view(1).segments[1] {
            SegmentView::Conflict {
                ours,
                theirs,
                base,
                theirs_label,
                ..
            } => {
                assert_eq!(ours, &["DUE locale"]);
                assert_eq!(theirs, &["DUE remoto"]);
                assert_eq!(theirs_label, "altro");
                assert_eq!(base.is_some(), style == "diff3", "{style}");
            }
            other => panic!("{other:?}"),
        }
        s.resolve(0, Resolution::Both).unwrap();
        s.save().unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("f.txt")).unwrap(),
            "uno\nDUE locale\nDUE remoto\ntre\nquattro\n",
            "{style}"
        );
    }
}
