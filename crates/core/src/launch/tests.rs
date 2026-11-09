use super::*;

fn args(a: &[&str]) -> Vec<String> {
    a.iter().map(|s| s.to_string()).collect()
}

fn parse(a: &[&str]) -> Result<Option<LaunchRequest>, LaunchError> {
    parse_launch_args(&args(a), Path::new("/work"))
}

/// A relative path as `parse` resolves it: under `/work`, with the system separator (on Windows `\`).
fn sotto_work(relativo: &str) -> String {
    Path::new("/work")
        .join(relativo)
        .to_string_lossy()
        .into_owned()
}

#[test]
fn senza_percorsi_l_avvio_e_normale() {
    assert_eq!(parse(&[]), Ok(None));
    assert_eq!(parse(&["--qualcosa"]), Ok(None));
}

#[test]
fn due_percorsi_diventano_una_richiesta() {
    let r = parse(&["/a/x.txt", "/b/x.txt"]).unwrap().unwrap();
    assert_eq!(
        (r.left.as_str(), r.right.as_str()),
        ("/a/x.txt", "/b/x.txt")
    );
    assert!(!r.left_read_only && !r.right_read_only);
}

#[test]
fn i_percorsi_relativi_partono_dalla_cartella_di_lavoro() {
    let r = parse(&["a.txt", "sub/b.txt"]).unwrap().unwrap();
    assert_eq!(r.left, sotto_work("a.txt"));
    assert_eq!(r.right, sotto_work("sub/b.txt"));
}

#[test]
fn il_dispositivo_nullo_resta_com_e() {
    let r = parse(&["/dev/null", "n.txt"]).unwrap().unwrap();
    assert_eq!(r.left, "/dev/null");
}

#[test]
fn sola_lettura_esplicita_e_opzioni_sconosciute() {
    let r = parse(&["--ro-right", "--gtk-x", "a", "b"])
        .unwrap()
        .unwrap();
    assert!(r.right_read_only && !r.left_read_only);
}

#[test]
fn i_file_temporanei_di_git_sono_in_sola_lettura() {
    let r = parse(&["/tmp/git-blob-n1Jy3Z/a.txt", "a.txt"])
        .unwrap()
        .unwrap();
    assert!(r.left_read_only && !r.right_read_only);
    let r = parse(&[
        "/tmp/git-difftool.XpH5K6/left/",
        "/tmp/git-difftool.XpH5K6/right/",
    ])
    .unwrap()
    .unwrap();
    assert!(r.left_read_only && !r.right_read_only);
}

#[test]
fn dopo_due_trattini_tutto_e_un_percorso() {
    let r = parse(&["--", "--a", "--b"]).unwrap().unwrap();
    assert_eq!(
        (r.left.as_str(), r.right.as_str()),
        (sotto_work("--a").as_str(), sotto_work("--b").as_str())
    );
}

#[test]
fn un_numero_sbagliato_di_percorsi_e_un_errore() {
    assert_eq!(parse(&["solo"]).unwrap_err(), LaunchError(1));
    assert!(parse(&["a", "b", "c"])
        .unwrap_err()
        .to_string()
        .contains("3"));
}

#[test]
fn merge_e_una_richiesta_a_parte_dal_confronto() {
    let merge = |a: &[&str]| parse_merge_args(&args(a), Path::new("/work"));
    assert_eq!(
        merge(&["--merge", "conflitto.txt"]),
        Some(sotto_work("conflitto.txt"))
    );
    assert_eq!(
        merge(&["--merge", "/abs/f.txt"]).as_deref(),
        Some("/abs/f.txt")
    );
    // not a comparison: the normal start of the comparisons ignores it
    assert_eq!(parse(&["--merge", "conflitto.txt"]), Ok(None));
    // without a path, or without the option, there is no request
    assert_eq!(merge(&["--merge"]), None);
    assert_eq!(merge(&["--merge", "--ro-left"]), None);
    assert_eq!(merge(&["a", "b"]), None);
}
