use super::*;

#[test]
fn file_cartella_e_inesistente() {
    let tmp = tempfile::tempdir().unwrap();
    let file = tmp.path().join("a.txt");
    fs::write(&file, "x").unwrap();
    assert_eq!(path_kind(&file), PathKind::File);
    assert_eq!(path_kind(tmp.path()), PathKind::Dir);
    assert_eq!(path_kind(&tmp.path().join("manca")), PathKind::Missing);
    assert_eq!(path_kind(Path::new("")), PathKind::Missing);
}

#[test]
fn il_dispositivo_nullo_conta_come_file() {
    assert!(is_null_device(Path::new("/dev/null")));
    assert!(!is_null_device(Path::new("/dev/nullo")));
    assert!(!is_null_device(Path::new("null")));
    assert_eq!(path_kind(Path::new("/dev/null")), PathKind::File);
}

#[cfg(unix)]
#[test]
fn collegamenti_simbolici_si_seguono() {
    use std::os::unix::fs::symlink;
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("cartella");
    let file = tmp.path().join("a.txt");
    fs::create_dir(&dir).unwrap();
    fs::write(&file, "x").unwrap();
    symlink(&dir, tmp.path().join("verso-cartella")).unwrap();
    symlink(&file, tmp.path().join("verso-file")).unwrap();
    symlink(tmp.path().join("manca"), tmp.path().join("rotto")).unwrap();
    assert_eq!(path_kind(&tmp.path().join("verso-cartella")), PathKind::Dir);
    assert_eq!(path_kind(&tmp.path().join("verso-file")), PathKind::File);
    assert_eq!(path_kind(&tmp.path().join("rotto")), PathKind::Missing);
}

#[cfg(unix)]
#[test]
fn altri_tipi_di_file() {
    assert_eq!(path_kind(Path::new("/dev/zero")), PathKind::Other);
}

/// The UI (src/types.ts) depends on these names.
#[test]
fn il_json_ha_i_nomi_attesi_dalla_ui() {
    let json = serde_json::to_string(&[
        PathKind::File,
        PathKind::Dir,
        PathKind::Other,
        PathKind::Missing,
    ])
    .unwrap();
    assert_eq!(json, r#"["file","dir","other","missing"]"#);
}
