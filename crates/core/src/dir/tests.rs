use super::*;
use tempfile::TempDir;

fn write(root: &Path, rel: &str, content: &str) {
    let path = root.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

fn setup() -> (TempDir, PathBuf, PathBuf) {
    let tmp = tempfile::tempdir().unwrap();
    let (l, r) = (tmp.path().join("l"), tmp.path().join("r"));
    fs::create_dir(&l).unwrap();
    fs::create_dir(&r).unwrap();
    (tmp, l, r)
}

#[test]
fn list_directory_primo_livello_cartelle_prima() {
    let (_t, l, _r) = setup();
    write(&l, "b.txt", "bb");
    write(&l, "A.txt", "a");
    write(&l, "zeta/dentro.txt", "x");
    write(&l, "alfa/dentro.txt", "x");
    let items = list_directory(&l, &ExtFilter::default()).unwrap();
    let names: Vec<_> = items.iter().map(|i| i.name.as_str()).collect();
    assert_eq!(names, ["alfa", "zeta", "A.txt", "b.txt"]);
    assert_eq!(items[0].kind, EntryKind::Dir);
    assert_eq!(items[3].kind, EntryKind::File);
    assert_eq!(items[3].size, 2);
    assert!(items[3].modified.is_some());
}

#[test]
fn scan_conta_come_il_confronto_senza_leggere_i_file() {
    let (_t, l, r) = setup();
    write(&l, "uguale.txt", "x");
    write(&r, "uguale.txt", "x");
    write(&l, "diverso.txt", "a");
    write(&r, "diverso.txt", "b");
    write(&l, "solo-sx.txt", "x");
    write(&r, "solo-dx.txt", "x");
    write(&l, "orfana/a.txt", "x");
    write(&l, "orfana/dentro/b.txt", "x");
    write(&l, "tipo", "file");
    write(&r, "tipo/dentro.txt", "x");
    write(&l, "comune/n.txt", "x");
    write(&r, "comune/n.txt", "x");
    let scan = scan_dirs(&l, &r, &DirOptions::default(), 1000, &|| false)
        .unwrap()
        .unwrap();
    let diff = compare_dirs(&l, &r, &DirOptions::default()).unwrap();
    assert_eq!(scan.left_only, diff.stats.left_only);
    assert_eq!(scan.right_only, diff.stats.right_only);
    assert_eq!(scan.type_mismatch, diff.stats.type_mismatch);
    // The pairs of files are the ones the comparison says are equal or different.
    assert_eq!(scan.file_pairs, diff.stats.identical + diff.stats.different);
    assert!(!scan.truncated);
}

#[test]
fn scan_rispetta_il_filtro_e_toglie_le_cartelle_senza_file_che_passano() {
    let (_t, l, r) = setup();
    write(&l, "a.rs", "x");
    write(&r, "a.rs", "x");
    write(&l, "b.txt", "x");
    write(&l, "solo-txt/c.txt", "x");
    write(&l, "misto/c.txt", "x");
    write(&l, "misto/d.rs", "x");
    let opts = DirOptions {
        filter: ExtFilter {
            include_exts: vec!["rs".into()],
            ..Default::default()
        },
    };
    let scan = scan_dirs(&l, &r, &opts, 1000, &|| false).unwrap().unwrap();
    let diff = compare_dirs(&l, &r, &opts).unwrap();
    assert_eq!(scan.left_only, diff.stats.left_only);
    assert_eq!(scan.file_pairs, diff.stats.identical + diff.stats.different);
    // "misto" and its d.rs are there, "solo-txt" and b.txt are not.
    assert_eq!(scan.left_only, 2);
}

#[test]
fn scan_si_ferma_al_limite_e_si_annulla() {
    let (_t, l, r) = setup();
    for i in 0..20 {
        write(&l, &format!("f{i:02}.txt"), "x");
    }
    let scan = scan_dirs(&l, &r, &DirOptions::default(), 5, &|| false)
        .unwrap()
        .unwrap();
    assert!(scan.truncated);
    assert_eq!(scan.visited, 5);
    assert_eq!(scan.left_only, 5);
    assert_eq!(
        scan_dirs(&l, &r, &DirOptions::default(), 1000, &|| true).unwrap(),
        None
    );
}

#[test]
fn scan_di_una_cartella_che_non_c_e_e_un_errore() {
    let (t, l, _r) = setup();
    assert!(scan_dirs(
        &l,
        &t.path().join("manca"),
        &DirOptions::default(),
        10,
        &|| false
    )
    .is_err());
}

#[test]
fn differenze_minori_nei_file_di_una_cartella() {
    let (_t, l, r) = setup();
    write(&l, "eol.txt", "a\nb\n");
    write(&r, "eol.txt", "a\r\nb\r\n");
    write(&l, "spazi.txt", "a  \nb\n");
    write(&r, "spazi.txt", "a\nb\n");
    write(&l, "vera.txt", "a\nb\n");
    write(&r, "vera.txt", "a\nc\n");
    write(&l, "mista.txt", "a  \nb\n");
    write(&r, "mista.txt", "a\nc\n");
    write(&l, "uguale.txt", "x\n");
    write(&r, "uguale.txt", "x\n");
    write(&l, "bin.dat", "ab\0cd");
    write(&r, "bin.dat", "ab\0ce");
    let diff = compare(&l, &r);
    let minor = |p: &str| {
        diff.entries
            .iter()
            .find(|e| e.path == p)
            .unwrap_or_else(|| panic!("manca {p}"))
            .minor
    };
    let eol = minor("eol.txt").expect("solo fine riga");
    assert!(eol.eol && !eol.trailing_space);
    let spazi = minor("spazi.txt").expect("solo spazi a fine riga");
    assert!(spazi.trailing_space && !spazi.eol);
    assert_eq!(minor("vera.txt"), None);
    assert_eq!(
        minor("mista.txt"),
        None,
        "una differenza vera annulla le minori"
    );
    assert_eq!(minor("uguale.txt"), None);
    assert_eq!(minor("bin.dat"), None, "i binari non sono mai minori");
    // They stay "different" for the status; the minor count is a subset
    assert_eq!(status(&diff, "eol.txt"), EntryStatus::Different);
    assert_eq!(diff.stats.different, 5);
    assert_eq!(diff.stats.minor, 2);
    assert_eq!(diff.stats.identical, 1);
}

#[test]
fn compare_entry_dice_anche_se_e_minore() {
    let (_t, l, r) = setup();
    write(&l, "f.txt", "a\n");
    write(&r, "f.txt", "A\n");
    let out = compare_entry(&l, &r, "f.txt", &DirOptions::default()).unwrap();
    assert!(out[0].minor.unwrap().case);
}

/// How many times the comparison consults `cancelled` to get to the end.
fn checks_of_a_full_compare(l: &Path, r: &Path) -> usize {
    let n = std::cell::Cell::new(0usize);
    compare_dirs_cancellable(l, r, &DirOptions::default(), &|| {
        n.set(n.get() + 1);
        false
    })
    .unwrap()
    .unwrap();
    n.get()
}

#[test]
fn annullare_ferma_il_confronto_senza_risultati_parziali() {
    let (_t, l, r) = setup();
    for i in 0..40 {
        write(&l, &format!("d{i:02}/f.txt"), "uno");
        write(&r, &format!("d{i:02}/f.txt"), "uno");
    }
    let opts = DirOptions::default();
    // already cancelled at the start
    assert!(compare_dirs_cancellable(&l, &r, &opts, &|| true)
        .unwrap()
        .is_none());
    // cancelled after a few checks: it stops well before the end
    let total = checks_of_a_full_compare(&l, &r);
    let calls = std::cell::Cell::new(0usize);
    let out = compare_dirs_cancellable(&l, &r, &opts, &|| {
        calls.set(calls.get() + 1);
        calls.get() > 10
    })
    .unwrap();
    assert!(out.is_none());
    assert_eq!(
        calls.get(),
        11,
        "si ferma al primo controllo che dice di fermarsi"
    );
    assert!(total > 40, "{total}");
    // never cancelled: the same result as compare_dirs
    let full = compare_dirs_cancellable(&l, &r, &opts, &|| false)
        .unwrap()
        .unwrap();
    assert_eq!(full, compare(&l, &r));
}

#[test]
fn annullare_si_ferma_dentro_un_file_grande() {
    let (_t, l, r) = setup();
    let big = "a".repeat(3 * 1024 * 1024);
    write(&l, "grande.txt", &big);
    write(&r, "grande.txt", &big);
    let total = checks_of_a_full_compare(&l, &r);
    assert!(total > 40, "un controllo per blocco da 64 KB: {total}");
    let calls = std::cell::Cell::new(0usize);
    let out = compare_dirs_cancellable(&l, &r, &DirOptions::default(), &|| {
        calls.set(calls.get() + 1);
        calls.get() > 5
    })
    .unwrap();
    assert!(out.is_none());
    assert_eq!(calls.get(), 6);
}

#[test]
fn annullare_una_riga_e_non_un_errore_ne_un_file_diverso() {
    let (_t, l, r) = setup();
    // different sizes (LF against CRLF): no block reading, it goes through the classification
    write(&l, "eol.txt", "a\nb\n");
    write(&r, "eol.txt", "a\r\nb\r\n");
    let calls = std::cell::Cell::new(0usize);
    let out = compare_entry_cancellable(&l, &r, "eol.txt", &DirOptions::default(), &|| {
        calls.set(calls.get() + 1);
        calls.get() >= 2
    })
    .unwrap();
    assert!(
        out.is_none(),
        "annullato prima di classificare: né «diverso» né errore"
    );
    // without cancelling it is minor, as always
    let full = compare_entry_cancellable(&l, &r, "eol.txt", &DirOptions::default(), &|| false)
        .unwrap()
        .unwrap();
    assert!(full[0].minor.is_some());
    assert_eq!(
        full,
        compare_entry(&l, &r, "eol.txt", &DirOptions::default()).unwrap()
    );
}

#[test]
fn list_directory_rifiuta_un_file() {
    let (_t, l, _r) = setup();
    write(&l, "f.txt", "x");
    assert!(list_directory(&l.join("f.txt"), &ExtFilter::default()).is_err());
    assert!(list_directory(&l.join("manca"), &ExtFilter::default()).is_err());
}

fn compare(l: &Path, r: &Path) -> DirDiff {
    compare_dirs(l, r, &DirOptions::default()).unwrap()
}

fn status(diff: &DirDiff, path: &str) -> EntryStatus {
    diff.entries
        .iter()
        .find(|e| e.path == path)
        .unwrap_or_else(|| panic!("voce {path} assente"))
        .status
}

#[test]
fn directory_identiche() {
    let (_tmp, l, r) = setup();
    for root in [&l, &r] {
        write(root, "a.txt", "ciao");
        write(root, "sub/b.txt", "mondo");
    }
    let diff = compare(&l, &r);
    assert!(diff
        .entries
        .iter()
        .all(|e| e.status == EntryStatus::Identical));
    assert_eq!(diff.stats.identical, 2);
    assert_eq!(diff.stats.different, 0);
}

#[test]
fn file_presenti_da_un_solo_lato() {
    let (_tmp, l, r) = setup();
    write(&l, "solo_sx.txt", "x");
    write(&r, "solo_dx.txt", "y");
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "solo_sx.txt"), EntryStatus::LeftOnly);
    assert_eq!(status(&diff, "solo_dx.txt"), EntryStatus::RightOnly);
    assert_eq!(diff.stats.left_only, 1);
    assert_eq!(diff.stats.right_only, 1);
}

#[test]
fn una_directory_solo_a_sinistra_elenca_anche_i_figli() {
    let (_tmp, l, r) = setup();
    write(&l, "solo/dentro.txt", "x");
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "solo"), EntryStatus::LeftOnly);
    assert_eq!(status(&diff, "solo/dentro.txt"), EntryStatus::LeftOnly);
}

#[test]
fn contenuto_diverso_a_parita_di_dimensione() {
    let (_tmp, l, r) = setup();
    write(&l, "f.txt", "aaa");
    write(&r, "f.txt", "bbb");
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "f.txt"), EntryStatus::Different);
}

#[test]
fn dimensione_diversa() {
    let (_tmp, l, r) = setup();
    write(&l, "f.txt", "aaa");
    write(&r, "f.txt", "aaaa");
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "f.txt"), EntryStatus::Different);
    let e = &diff.entries[0];
    assert_eq!((e.left_size, e.right_size), (Some(3), Some(4)));
}

#[test]
fn una_differenza_annidata_segna_le_directory_genitore() {
    let (_tmp, l, r) = setup();
    write(&l, "a/b/c.txt", "uno");
    write(&r, "a/b/c.txt", "due");
    write(&l, "a/ok.txt", "x");
    write(&r, "a/ok.txt", "x");
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "a"), EntryStatus::Different);
    assert_eq!(status(&diff, "a/b"), EntryStatus::Different);
    assert_eq!(status(&diff, "a/b/c.txt"), EntryStatus::Different);
    assert_eq!(status(&diff, "a/ok.txt"), EntryStatus::Identical);
    // directories present on both sides do not enter the statistics
    assert_eq!(diff.stats.different, 1);
    assert_eq!(diff.stats.identical, 1);
}

#[test]
fn i_genitori_precedono_i_figli() {
    let (_tmp, l, r) = setup();
    for root in [&l, &r] {
        write(root, "a/x.txt", "x");
        write(root, "b.txt", "x");
    }
    let diff = compare(&l, &r);
    let paths: Vec<_> = diff.entries.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(paths, vec!["a", "a/x.txt", "b.txt"]);
}

#[test]
fn tipo_diverso() {
    let (_tmp, l, r) = setup();
    write(&l, "x", "file");
    write(&r, "x/dentro.txt", "dir");
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "x"), EntryStatus::TypeMismatch);
    assert_eq!(diff.stats.type_mismatch, 1);
}

#[test]
fn un_percorso_che_non_e_una_directory_da_errore() {
    let (_tmp, l, r) = setup();
    write(&l, "f.txt", "x");
    assert!(compare_dirs(&l.join("f.txt"), &r, &DirOptions::default()).is_err());
    assert!(compare_dirs(&l.join("manca"), &r, &DirOptions::default()).is_err());
}

#[cfg(unix)]
#[test]
fn i_symlink_si_confrontano_per_target() {
    use std::os::unix::fs::symlink;
    let (_tmp, l, r) = setup();
    symlink("uno", l.join("s")).unwrap();
    symlink("due", r.join("s")).unwrap();
    symlink("stesso", l.join("t")).unwrap();
    symlink("stesso", r.join("t")).unwrap();
    let diff = compare(&l, &r);
    assert_eq!(status(&diff, "s"), EntryStatus::Different);
    assert_eq!(status(&diff, "t"), EntryStatus::Identical);
}

#[test]
fn data_di_modifica_per_file_e_cartelle() {
    let (_tmp, l, r) = setup();
    write(&l, "d/f.txt", "a");
    fs::create_dir_all(r.join("d")).unwrap();
    let diff = compare(&l, &r);
    let d = diff.entries.iter().find(|e| e.path == "d").unwrap();
    assert!(d.left_modified.unwrap() > 1_500_000_000_000);
    assert!(d.right_modified.is_some());
    let f = diff.entries.iter().find(|e| e.path == "d/f.txt").unwrap();
    assert!(f.left_modified.is_some() && f.right_modified.is_none());
}

#[test]
fn compare_entry_rilegge_una_voce_e_i_suoi_figli() {
    let (l, r) = (TempDir::new().unwrap(), TempDir::new().unwrap());
    for root in [l.path(), r.path()] {
        fs::create_dir_all(root.join("d/sub")).unwrap();
        fs::write(root.join("d/a.txt"), "uno").unwrap();
        fs::write(root.join("d/sub/b.txt"), "due").unwrap();
    }
    // equal file, then changed on disk
    let e = compare_entry(l.path(), r.path(), "d/a.txt", &DirOptions::default()).unwrap();
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].status, EntryStatus::Identical);
    fs::write(r.path().join("d/a.txt"), "uno!").unwrap();
    let e = compare_entry(l.path(), r.path(), "d/a.txt", &DirOptions::default()).unwrap();
    assert_eq!(
        (e[0].path.as_str(), e[0].status),
        ("d/a.txt", EntryStatus::Different)
    );
    assert_eq!((e[0].left_size, e[0].right_size), (Some(3), Some(4)));
    // folder: the entry itself first, then the children, with the full paths
    let e = compare_entry(l.path(), r.path(), "d", &DirOptions::default()).unwrap();
    let paths: Vec<_> = e.iter().map(|x| x.path.as_str()).collect();
    assert_eq!(paths, ["d", "d/a.txt", "d/sub", "d/sub/b.txt"]);
    assert_eq!(e[0].status, EntryStatus::Different);
    assert_eq!(e[2].status, EntryStatus::Identical);
    // entry that exists on one side only, and that no longer exists
    fs::remove_file(r.path().join("d/a.txt")).unwrap();
    let e = compare_entry(l.path(), r.path(), "d/a.txt", &DirOptions::default()).unwrap();
    assert_eq!(e[0].status, EntryStatus::LeftOnly);
    fs::remove_file(l.path().join("d/a.txt")).unwrap();
    assert!(
        compare_entry(l.path(), r.path(), "d/a.txt", &DirOptions::default())
            .unwrap()
            .is_empty()
    );
}

fn with_filter(l: &Path, r: &Path, filter: ExtFilter) -> Vec<String> {
    let diff = compare_dirs(l, r, &DirOptions { filter }).unwrap();
    diff.entries.into_iter().map(|e| e.path).collect()
}

fn filtri_setup() -> (TempDir, PathBuf, PathBuf) {
    let (tmp, l, r) = setup();
    write(&l, "a.rs", "1");
    write(&r, "a.rs", "1");
    write(&l, "b.md", "1");
    write(&l, "Makefile", "1");
    write(&r, "Makefile", "2");
    write(&l, "solo/x.log", "1");
    write(&r, "solo/y.log", "1");
    write(&l, "src/m.rs", "1");
    write(&r, "src/m.RS", "1");
    write(&l, "src/n.log", "1");
    (tmp, l, r)
}

#[test]
fn filtro_senza_nulla_non_cambia_il_confronto() {
    let (_t, l, r) = filtri_setup();
    let tutto = with_filter(&l, &r, ExtFilter::default());
    assert!(tutto.contains(&"b.md".to_string()) && tutto.contains(&"solo".to_string()));
}

#[test]
fn filtro_include_toglie_file_e_cartelle_vuote() {
    let (_t, l, r) = filtri_setup();
    let filter = ExtFilter {
        include_exts: vec!["rs".into()],
        ..ExtFilter::default()
    };
    // "solo" only has .log and disappears; `m.rs` and `m.RS` are different names: orphans each
    assert_eq!(
        with_filter(&l, &r, filter),
        ["a.rs", "src", "src/m.RS", "src/m.rs"]
    );
}

#[test]
fn filtro_senza_estensione_incluso_o_escluso() {
    let (_t, l, r) = filtri_setup();
    let solo = ExtFilter {
        include_none: true,
        ..ExtFilter::default()
    };
    assert_eq!(with_filter(&l, &r, solo), ["Makefile"]);
    let senza = ExtFilter {
        exclude_none: true,
        ..ExtFilter::default()
    };
    let out = with_filter(&l, &r, senza);
    assert!(!out.contains(&"Makefile".to_string()) && out.contains(&"a.rs".to_string()));
}

#[test]
fn filtro_escludi_non_fa_contare_i_file_nascosti() {
    let (_t, l, r) = filtri_setup();
    let filter = ExtFilter {
        exclude_exts: vec!["log".into(), "md".into()],
        ..ExtFilter::default()
    };
    let diff = compare_dirs(
        &l,
        &r,
        &DirOptions {
            filter: filter.clone(),
        },
    )
    .unwrap();
    let paths: Vec<_> = diff.entries.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(paths, ["Makefile", "a.rs", "src", "src/m.RS", "src/m.rs"]);
    // "b.md" and the orphan .log files do not appear among the "only on the left"
    assert_eq!(diff.stats.left_only, 1);
}

#[test]
fn filtro_non_cambia_lo_stato_delle_cartelle_con_file_nascosti() {
    let (_t, l, r) = setup();
    write(&l, "d/a.rs", "1");
    write(&r, "d/a.rs", "1");
    write(&l, "d/note.txt", "diverso");
    write(&r, "d/note.txt", "altro");
    let filter = ExtFilter {
        include_exts: vec!["rs".into()],
        ..ExtFilter::default()
    };
    let diff = compare_dirs(&l, &r, &DirOptions { filter }).unwrap();
    let d = diff.entries.iter().find(|e| e.path == "d").unwrap();
    assert_eq!(d.status, EntryStatus::Identical);
    assert_eq!(diff.stats.different, 0);
}

#[test]
fn filtro_nell_elenco_dell_anteprima_toglie_i_file_e_tiene_le_cartelle() {
    let (_t, l, _r) = filtri_setup();
    let filter = ExtFilter {
        include_exts: vec!["rs".into()],
        ..ExtFilter::default()
    };
    let names: Vec<_> = list_directory(&l, &filter)
        .unwrap()
        .into_iter()
        .map(|i| i.name)
        .collect();
    assert_eq!(names, ["solo", "src", "a.rs"]);
}

#[test]
fn filtro_vale_anche_per_il_confronto_di_una_riga() {
    let (_t, l, r) = filtri_setup();
    let filter = ExtFilter {
        include_exts: vec!["rs".into()],
        ..ExtFilter::default()
    };
    let opts = DirOptions { filter };
    let e = compare_entry(&l, &r, "src", &opts).unwrap();
    let paths: Vec<_> = e.iter().map(|x| x.path.as_str()).collect();
    assert_eq!(paths, ["src", "src/m.RS", "src/m.rs"]);
    // a folder without passing files comes back alone (the folder comparison removes its row, the preview
    // marks it equal); only an entry that no longer exists gives nothing
    let e = compare_entry(&l, &r, "solo", &opts).unwrap();
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].path, "solo");
    assert!(compare_entry(&l, &r, "manca", &opts).unwrap().is_empty());
}

#[test]
fn dir_size_somma_i_file_a_ogni_profondita() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "a.txt", "12345");
    write(tmp.path(), "sub/b.txt", "123");
    write(tmp.path(), "sub/deep/c.txt", "12");
    fs::create_dir_all(tmp.path().join("vuota")).unwrap();
    assert_eq!(dir_size(tmp.path(), &|| false).unwrap(), Some(10));
    assert_eq!(
        dir_size(&tmp.path().join("sub"), &|| false).unwrap(),
        Some(5)
    );
    assert_eq!(
        dir_size(&tmp.path().join("vuota"), &|| false).unwrap(),
        Some(0)
    );
}

#[test]
fn dir_size_annullabile_e_con_errori() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "a.txt", "12345");
    assert_eq!(dir_size(tmp.path(), &|| true).unwrap(), None);
    assert!(dir_size(&tmp.path().join("a.txt"), &|| false).is_err());
    assert!(dir_size(&tmp.path().join("manca"), &|| false).is_err());
}

#[cfg(unix)]
#[test]
fn dir_size_non_segue_i_link_e_conta_una_volta_gli_hard_link() {
    let tmp = tempfile::tempdir().unwrap();
    write(tmp.path(), "a.txt", "12345");
    std::os::unix::fs::symlink(tmp.path().join("a.txt"), tmp.path().join("link")).unwrap();
    fs::hard_link(tmp.path().join("a.txt"), tmp.path().join("hard")).unwrap();
    assert_eq!(dir_size(tmp.path(), &|| false).unwrap(), Some(5));
}

#[cfg(unix)]
#[test]
fn una_voce_illeggibile_resta_nella_riga_e_il_confronto_va_avanti() {
    use std::os::unix::fs::PermissionsExt;
    let (_tmp, l, r) = setup();
    write(&l, "chiusa/x.txt", "x");
    write(&r, "chiusa/x.txt", "x");
    write(&l, "f.txt", "uno");
    write(&r, "f.txt", "uno");
    write(&l, "segreto.txt", "a");
    write(&r, "segreto.txt", "a");
    let lock = |p: &Path, mode| fs::set_permissions(p, fs::Permissions::from_mode(mode)).unwrap();
    lock(&l.join("chiusa"), 0o000);
    lock(&r.join("segreto.txt"), 0o000);
    // as root (some containers) the permissions do not stop reading: nothing to check
    let readable = fs::read_dir(l.join("chiusa")).is_ok();
    let diff = compare_dirs(&l, &r, &DirOptions::default());
    let scan = scan_dirs(&l, &r, &DirOptions::default(), 1000, &|| false);
    lock(&l.join("chiusa"), 0o755);
    lock(&r.join("segreto.txt"), 0o644);
    if readable {
        return;
    }
    let diff = diff.expect("an unreadable entry does not stop the comparison");
    let find = |p: &str| diff.entries.iter().find(|e| e.path == p).unwrap();
    assert_eq!(find("chiusa").status, EntryStatus::Different);
    assert!(find("chiusa").error.is_some());
    assert!(
        diff.entries.iter().all(|e| e.path != "chiusa/x.txt"),
        "no children"
    );
    assert_eq!(find("segreto.txt").status, EntryStatus::Different);
    assert!(find("segreto.txt").error.is_some());
    assert_eq!(find("f.txt").status, EntryStatus::Identical);
    assert!(find("f.txt").error.is_none());
    // The unreadable folder counts in the summary, and the scan of the preview goes on too.
    assert_eq!((diff.stats.different, diff.stats.identical), (2, 1));
    let scan = scan
        .expect("an unreadable subfolder does not stop the scan")
        .unwrap();
    assert_eq!(scan.file_pairs, 2);
}
