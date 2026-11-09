use std::{
    fs,
    path::Path,
    process::{Command, Output},
};

fn nurdiff(args: &[&Path]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(args)
        .output()
        .unwrap()
}

fn nurdiff_with_flag(flag: &str, a: &Path, b: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .arg(flag)
        .arg(a)
        .arg(b)
        .output()
        .unwrap()
}

fn stdout(out: &Output) -> String {
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn code(out: &Output) -> i32 {
    out.status.code().unwrap()
}

#[test]
fn file_identici_escono_con_zero() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\n").unwrap();
    fs::write(&b, "uno\ndue\n").unwrap();

    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 0);
    assert!(stdout(&out).contains("identical"));
}

#[test]
fn file_diversi_escono_con_uno_e_mostrano_le_righe() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\ntre\n").unwrap();
    fs::write(&b, "uno\nDUE\ntre\n").unwrap();

    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 1);
    let text = stdout(&out);
    assert!(text.contains("- due"), "{text}");
    assert!(text.contains("+ DUE"), "{text}");
}

#[test]
fn il_contesto_nasconde_le_righe_lontane() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    let many: String = (1..=30).map(|i| format!("riga{i}\n")).collect();
    fs::write(&a, &many).unwrap();
    fs::write(&b, many.replace("riga15", "CAMBIATA")).unwrap();

    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["-U", "1"])
        .arg(&a)
        .arg(&b)
        .output()
        .unwrap();
    let text = stdout(&out);
    assert!(text.contains("riga14") && text.contains("riga16"), "{text}");
    assert!(
        !text.contains("riga1\n") && !text.contains("riga30"),
        "{text}"
    );
    assert!(text.contains("..."), "{text}");
}

#[test]
fn ignore_case_rende_identici_file_che_differiscono_solo_per_maiuscole() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "Ciao\n").unwrap();
    fs::write(&b, "cIAO\n").unwrap();

    assert_eq!(code(&nurdiff(&[&a, &b])), 1);
    assert_eq!(code(&nurdiff_with_flag("-i", &a, &b)), 0);
}

#[test]
fn directory_con_differenze() {
    let tmp = tempfile::tempdir().unwrap();
    let (l, r) = (tmp.path().join("l"), tmp.path().join("r"));
    fs::create_dir(&l).unwrap();
    fs::create_dir(&r).unwrap();
    fs::write(l.join("solo_sx.txt"), "x").unwrap();
    fs::write(l.join("comune.txt"), "uno").unwrap();
    fs::write(r.join("comune.txt"), "due").unwrap();

    let out = nurdiff(&[&l, &r]);
    assert_eq!(code(&out), 1);
    let text = stdout(&out);
    assert!(
        text.contains("left only") && text.contains("solo_sx.txt"),
        "{text}"
    );
    assert!(
        text.contains("different") && text.contains("comune.txt"),
        "{text}"
    );
}

#[test]
fn directory_identiche() {
    let tmp = tempfile::tempdir().unwrap();
    let (l, r) = (tmp.path().join("l"), tmp.path().join("r"));
    fs::create_dir(&l).unwrap();
    fs::create_dir(&r).unwrap();
    fs::write(l.join("f.txt"), "x").unwrap();
    fs::write(r.join("f.txt"), "x").unwrap();

    let out = nurdiff(&[&l, &r]);
    assert_eq!(code(&out), 0);
}

fn dirs_con_estensioni() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
    let tmp = tempfile::tempdir().unwrap();
    let (l, r) = (tmp.path().join("l"), tmp.path().join("r"));
    fs::create_dir(&l).unwrap();
    fs::create_dir(&r).unwrap();
    fs::write(l.join("a.rs"), "1").unwrap();
    fs::write(r.join("a.rs"), "1").unwrap();
    fs::write(l.join("nota.md"), "uno").unwrap();
    fs::write(r.join("nota.md"), "due").unwrap();
    fs::write(l.join("Makefile"), "uno").unwrap();
    fs::write(r.join("Makefile"), "due").unwrap();
    (tmp, l, r)
}

fn nurdiff_filtrato(l: &Path, r: &Path, filter: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(filter)
        .arg(l)
        .arg(r)
        .output()
        .unwrap()
}

#[test]
fn include_confronta_solo_quelle_estensioni() {
    let (_t, l, r) = dirs_con_estensioni();
    // the differences are in nota.md and Makefile: with .rs only there are none
    let out = nurdiff_filtrato(&l, &r, &["--include", "rs"]);
    assert_eq!(code(&out), 0, "{}", stdout(&out));
    let out = nurdiff_filtrato(&l, &r, &["--include", "rs,md"]);
    let text = stdout(&out);
    assert_eq!(code(&out), 1);
    assert!(
        text.contains("nota.md") && !text.contains("Makefile"),
        "{text}"
    );
}

#[test]
fn none_vale_per_i_file_senza_estensione() {
    let (_t, l, r) = dirs_con_estensioni();
    let out = nurdiff_filtrato(&l, &r, &["--include", "none"]);
    let text = stdout(&out);
    assert_eq!(code(&out), 1);
    assert!(
        text.contains("Makefile") && !text.contains("nota.md"),
        "{text}"
    );
    let out = nurdiff_filtrato(&l, &r, &["--exclude", "none", "--exclude", "md"]);
    assert_eq!(code(&out), 0, "{}", stdout(&out));
}

#[test]
fn exclude_vince_su_include() {
    let (_t, l, r) = dirs_con_estensioni();
    let out = nurdiff_filtrato(&l, &r, &["--include", "rs md", "--exclude", ".MD"]);
    assert_eq!(code(&out), 0, "{}", stdout(&out));
}

#[test]
fn include_senza_valore_e_un_errore() {
    let (_t, l, _r) = dirs_con_estensioni();
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .arg(&l)
        .arg("--include")
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
}

#[test]
fn errori_escono_con_due() {
    let tmp = tempfile::tempdir().unwrap();
    let a = tmp.path().join("a.txt");
    fs::write(&a, "x").unwrap();

    // non-existent file
    assert_eq!(code(&nurdiff(&[&a, &tmp.path().join("manca.txt")])), 2);
    // directory against file
    assert_eq!(code(&nurdiff(&[&a, tmp.path()])), 2);
    // wrong number of arguments
    assert_eq!(code(&nurdiff(&[&a])), 2);
}

#[test]
fn help_esce_con_zero() {
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .arg("--help")
        .output()
        .unwrap();
    assert_eq!(code(&out), 0);
    assert!(stdout(&out).contains("Usage: nurdiff-cli"));
}

/// Fake program in place of the graphical application: it writes the arguments it received to a file.
#[cfg(unix)]
fn fake_gui(dir: &Path, exit: i32) -> (std::path::PathBuf, std::path::PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let log = dir.join("gui.log");
    let script = dir.join("gui.sh");
    fs::write(
        &script,
        format!(
            "#!/bin/sh\nfor a in \"$@\"; do echo \"[$a]\" >> '{}'; done\nexit {exit}\n",
            log.display()
        ),
    )
    .unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    (script, log)
}

#[cfg(unix)]
#[test]
fn gui_passa_i_due_percorsi_all_applicazione() {
    let tmp = tempfile::tempdir().unwrap();
    let (script, log) = fake_gui(tmp.path(), 0);
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .env("NURDIFF_GUI", &script)
        .args(["--gui", "con spazi.txt", "b.txt"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 0);
    assert_eq!(
        fs::read_to_string(log).unwrap(),
        "[--]\n[con spazi.txt]\n[b.txt]\n"
    );
}

#[cfg(unix)]
#[test]
fn gui_restituisce_il_codice_dell_applicazione() {
    let tmp = tempfile::tempdir().unwrap();
    let (script, _) = fake_gui(tmp.path(), 3);
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .env("NURDIFF_GUI", &script)
        .args(["--gui", "a", "b"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 3);
}

#[test]
fn gui_senza_due_percorsi_e_un_errore() {
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--gui", "solo"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
}

#[test]
fn gui_non_trovata_e_un_errore_comprensibile() {
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .env("NURDIFF_GUI", "/non/esiste/nurdiff")
        .args(["--gui", "a", "b"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
    assert!(String::from_utf8_lossy(&out.stderr).contains("cannot start"));
}

#[cfg(unix)]
#[test]
fn git_external_prende_file_vecchio_e_nuovo() {
    let tmp = tempfile::tempdir().unwrap();
    let (script, log) = fake_gui(tmp.path(), 1);
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .env("NURDIFF_GUI", &script)
        .args([
            "--git-external",
            "f.txt",
            "/tmp/git-blob-x/f.txt",
            "abc",
            "100644",
            "f.txt",
            "def",
            "100644",
        ])
        .output()
        .unwrap();
    // git wants zero even if the application exits with another code.
    assert_eq!(code(&out), 0);
    assert_eq!(
        fs::read_to_string(log).unwrap(),
        "[--]\n[/tmp/git-blob-x/f.txt]\n[f.txt]\n"
    );
}

#[test]
fn git_external_file_non_unito_non_fa_nulla() {
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--git-external", "conflitto.txt"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 0);
}

#[test]
fn git_external_senza_applicazione_stampa_le_differenze() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\n").unwrap();
    fs::write(&b, "due\n").unwrap();
    // An empty folder as PATH and no $NURDIFF_GUI: the application is not there. The CLI also looks for
    // the app next to itself (in target/debug there may be a compiled `nurdiff`): so it is
    // copied into an isolated folder.
    let cli = tmp.path().join("bin").join("nurdiff-cli");
    fs::create_dir(cli.parent().unwrap()).unwrap();
    fs::copy(env!("CARGO_BIN_EXE_nurdiff-cli"), &cli).unwrap();
    // A freshly copied executable can turn out to be "busy" (ETXTBSY) if, at the same moment,
    // another test starts a program and the child inherits the file still open for writing: it is retried.
    let run = |a: &Path, b: &Path| {
        let mut tries = 0;
        loop {
            let run = Command::new(&cli)
                .env_remove("NURDIFF_GUI")
                .env("PATH", tmp.path())
                .args(["--git-external", "x"])
                .arg(a)
                .args(["h", "m"])
                .arg(b)
                .args(["h", "m"])
                .output();
            match run {
                Err(e) if e.raw_os_error() == Some(26) && tries < 50 => {
                    tries += 1;
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                other => break other.unwrap(),
            }
        }
    };
    let out = run(&a, &b);
    assert_eq!(code(&out), 0);
    assert!(stdout(&out).contains("- uno") || stdout(&out).contains("uno"));
    assert!(stdout(&out).contains("due"));

    // a binary file is said on stderr, and git goes on with the next ones (exit code 0)
    let bin = tmp.path().join("img.bin");
    fs::write(&bin, b"\x89PNG\0\0\x01").unwrap();
    let out = run(&a, &bin);
    assert_eq!(code(&out), 0, "{}", String::from_utf8_lossy(&out.stderr));
    assert!(String::from_utf8_lossy(&out.stderr).contains("img.bin"));
    // an added file: git passes the null device as the old side
    let out = run(Path::new("/dev/null"), &b);
    assert_eq!(code(&out), 0);
    assert!(stdout(&out).contains("due"));
}

#[test]
fn report_diff_stampa_un_diff_unificato() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\ntre\n").unwrap();
    fs::write(&b, "uno\nDUE\ntre\n").unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--report", "diff"])
        .arg(&a)
        .arg(&b)
        .output()
        .unwrap();
    assert_eq!(code(&out), 1);
    let text = stdout(&out);
    assert!(
        text.contains("@@ -1,3 +1,3 @@\n uno\n-due\n+DUE\n tre\n"),
        "{text}"
    );
}

#[test]
fn report_html_e_identici() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "x\n").unwrap();
    fs::write(&b, "x\n").unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--report", "html"])
        .arg(&a)
        .arg(&b)
        .output()
        .unwrap();
    assert_eq!(code(&out), 0);
    assert!(stdout(&out).starts_with("<!doctype html>"));
}

#[test]
fn report_con_formato_sconosciuto_o_cartelle_e_un_errore() {
    let tmp = tempfile::tempdir().unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--report", "pdf", "a", "b"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--report", "html"])
        .arg(tmp.path())
        .arg(tmp.path())
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
    assert!(String::from_utf8_lossy(&out.stderr).contains("only works on files"));
}

#[test]
fn un_contesto_enorme_mostra_tutto_senza_errori() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\n").unwrap();
    fs::write(&b, "uno\nDUE\n").unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["-U", &usize::MAX.to_string()])
        .arg(&a)
        .arg(&b)
        .output()
        .unwrap();
    assert_eq!(code(&out), 1, "{}", String::from_utf8_lossy(&out.stderr));
    assert!(stdout(&out).contains("DUE"));
}

fn con_algoritmo(name: &str, a: &Path, b: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--algorithm", name, "--report", "diff"])
        .arg(a)
        .arg(b)
        .output()
        .unwrap()
}

fn righe(ids: &[u8]) -> String {
    ids.iter().map(|d| format!("riga{d}\n")).collect()
}

#[test]
fn l_algoritmo_si_sceglie_da_riga_di_comando() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    // Same sequences as the test on the algorithms in the core: Patience groups them differently.
    fs::write(&a, righe(&[4, 1, 4, 3, 2, 4, 2])).unwrap();
    fs::write(&b, righe(&[4, 3, 2, 1, 2, 0, 4, 4, 4, 1])).unwrap();

    let myers = con_algoritmo("myers", &a, &b);
    let predefinito = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--report", "diff"])
        .arg(&a)
        .arg(&b)
        .output()
        .unwrap();
    assert_eq!(code(&myers), 1);
    assert_eq!(
        stdout(&myers),
        stdout(&predefinito),
        "Myers è il predefinito"
    );
    for name in ["patience", "histogram", "PATIENCE"] {
        assert_eq!(code(&con_algoritmo(name, &a, &b)), 1, "{name}");
    }
    assert_ne!(stdout(&myers), stdout(&con_algoritmo("patience", &a, &b)));
}

#[test]
fn un_algoritmo_sconosciuto_o_mancante_e_un_errore() {
    let tmp = tempfile::tempdir().unwrap();
    let a = tmp.path().join("a.txt");
    fs::write(&a, "x\n").unwrap();
    let out = con_algoritmo("lcs", &a, &a);
    assert_eq!(code(&out), 2);
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown algorithm"));
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .arg("--algorithm")
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
}

fn stderr(out: &Output) -> String {
    String::from_utf8_lossy(&out.stderr).into_owned()
}

#[test]
fn file_con_sole_differenze_minori_lo_dicono() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno  \ndue\n").unwrap();
    fs::write(&b, "uno\r\ndue\r\n").unwrap();

    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 1, "resta una differenza");
    let err = stderr(&out);
    assert!(
        err.contains("minor ways") && err.contains("line endings") && err.contains("trailing"),
        "{err}"
    );

    // A real difference: no note about minor differences
    fs::write(&b, "uno\ndue!\n").unwrap();
    assert!(!stderr(&nurdiff(&[&a, &b])).contains("minor ways"));
}

#[test]
fn file_uguali_a_parte_la_fine_riga_lo_dicono_ma_escono_con_zero() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    fs::write(&a, "uno\ndue\n").unwrap();
    fs::write(&b, "uno\r\ndue\r\n").unwrap();

    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 0);
    let err = stderr(&out);
    assert!(
        err.contains("minor ways") && err.contains("line endings"),
        "{err}"
    );
}

#[test]
fn directory_con_file_minori() {
    let tmp = tempfile::tempdir().unwrap();
    let (l, r) = (tmp.path().join("l"), tmp.path().join("r"));
    fs::create_dir(&l).unwrap();
    fs::create_dir(&r).unwrap();
    fs::write(l.join("eol.txt"), "a\nb\n").unwrap();
    fs::write(r.join("eol.txt"), "a\r\nb\r\n").unwrap();
    fs::write(l.join("vera.txt"), "a\n").unwrap();
    fs::write(r.join("vera.txt"), "b\n").unwrap();

    let out = nurdiff(&[&l, &r]);
    assert_eq!(code(&out), 1);
    let text = stdout(&out);
    let eol_line = text.lines().find(|l| l.contains("eol.txt")).unwrap();
    assert!(
        eol_line.contains("different (minor)") && eol_line.contains("line endings"),
        "{text}"
    );
    let vera = text.lines().find(|l| l.contains("vera.txt")).unwrap();
    assert!(!vera.contains("minor"), "{text}");
    assert!(
        stderr(&out).contains("2 different (1 only minor)"),
        "{}",
        stderr(&out)
    );
}

#[test]
fn livelli_di_spazi_come_git() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.txt"), tmp.path().join("b.txt"));
    // only trailing spaces
    fs::write(&a, "x = 1  \n").unwrap();
    fs::write(&b, "x = 1\n").unwrap();
    assert_eq!(code(&nurdiff(&[&a, &b])), 1);
    assert_eq!(code(&nurdiff_with_flag("--ignore-space-at-eol", &a, &b)), 0);
    assert_eq!(code(&nurdiff_with_flag("-b", &a, &b)), 0);
    assert_eq!(code(&nurdiff_with_flag("-w", &a, &b)), 0);
    // only the amount of spaces inside the row
    fs::write(&b, "x  =\t1\n").unwrap();
    assert_eq!(code(&nurdiff_with_flag("--ignore-space-at-eol", &a, &b)), 1);
    assert_eq!(code(&nurdiff_with_flag("-b", &a, &b)), 0);
    assert_eq!(code(&nurdiff_with_flag("--ignore-space-change", &a, &b)), 0);
    // spaces that appear where there were none
    fs::write(&b, "x=1\n").unwrap();
    assert_eq!(code(&nurdiff_with_flag("-b", &a, &b)), 1);
    assert_eq!(code(&nurdiff_with_flag("-w", &a, &b)), 0);
}

/// Runs the command line with a global git configuration of its own (a file in a temporary folder).
fn nurdiff_git(config: &Path, args: &[&str]) -> Output {
    // Cargo may put the folder of the binary in the PATH (it does on Windows): take it out, so the program is
    // not found there and the configuration gets its full path.
    let exe = Path::new(env!("CARGO_BIN_EXE_nurdiff-cli"));
    let path = std::env::var_os("PATH").unwrap_or_default();
    let path = std::env::join_paths(
        std::env::split_paths(&path).filter(|dir| Some(dir.as_path()) != exe.parent()),
    )
    .unwrap();
    Command::new(exe)
        .args(args)
        .env("PATH", path)
        .env("GIT_CONFIG_GLOBAL", config)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("HOME", config.parent().unwrap())
        .output()
        .unwrap()
}

fn git_get(config: &Path, key: &str) -> Option<String> {
    let out = Command::new("git")
        .args(["config", "--file"])
        .arg(config)
        .args(["--get", key])
        .output()
        .unwrap();
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[test]
fn setup_git_scrive_la_configurazione_e_remove_git_la_toglie() {
    if Command::new("git").arg("--version").output().is_err() {
        return; // without git there is nothing to configure
    }
    let tmp = tempfile::tempdir().unwrap();
    let config = tmp.path().join("gitconfig");

    let out = nurdiff_git(&config, &["--setup-git"]);
    assert_eq!(code(&out), 0, "{}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(git_get(&config, "diff.tool").as_deref(), Some("nurdiff"));
    let cmd = git_get(&config, "difftool.nurdiff.cmd").unwrap();
    assert!(cmd.ends_with("--gui \"$LOCAL\" \"$REMOTE\""), "{cmd}");
    assert!(cmd.starts_with('"') && cmd.contains("nurdiff-cli"), "{cmd}"); // not in the PATH: the full path
    assert_eq!(
        git_get(&config, "difftool.prompt").as_deref(),
        Some("false")
    );
    assert_eq!(git_get(&config, "diff.external"), None); // only on request
    assert!(stdout(&out).contains("diff.tool: nurdiff"));

    // a second time says it is already so; with --external it also sets diff.external
    let again = nurdiff_git(&config, &["--setup-git", "--external"]);
    assert_eq!(code(&again), 0);
    assert!(stdout(&again).contains("diff.tool: already nurdiff"));
    assert!(git_get(&config, "diff.external")
        .unwrap()
        .ends_with("--git-external"));

    let out = nurdiff_git(&config, &["--remove-git"]);
    assert_eq!(code(&out), 0);
    assert_eq!(git_get(&config, "diff.tool"), None);
    assert_eq!(git_get(&config, "difftool.nurdiff.cmd"), None);
    assert_eq!(git_get(&config, "diff.external"), None);
    assert!(stdout(&nurdiff_git(&config, &["--remove-git"])).contains("Nothing to remove"));
}

#[test]
fn setup_git_dice_cosa_c_era_prima() {
    if Command::new("git").arg("--version").output().is_err() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let config = tmp.path().join("gitconfig");
    fs::write(&config, "[diff]\n\ttool = vimdiff\n").unwrap();
    let out = nurdiff_git(&config, &["--setup-git"]);
    assert_eq!(code(&out), 0);
    assert!(
        stdout(&out).contains("diff.tool: nurdiff   (was: vimdiff)"),
        "{}",
        stdout(&out)
    );
}

#[cfg(unix)]
#[test]
fn merge_passa_il_file_all_applicazione_e_ne_restituisce_il_codice() {
    let tmp = tempfile::tempdir().unwrap();
    let file = tmp.path().join("conflitto.txt");
    fs::write(&file, "<<<<<<< a\nx\n=======\ny\n>>>>>>> b\n").unwrap();
    for exit in [0, 1] {
        let dir = tmp.path().join(format!("gui{exit}"));
        fs::create_dir(&dir).unwrap();
        let (script, log) = fake_gui(&dir, exit);
        let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
            .env("NURDIFF_GUI", &script)
            .arg("--merge")
            .arg(&file)
            .output()
            .unwrap();
        // git reads the exit code: 0 only if the application says the conflicts are resolved
        assert_eq!(code(&out), exit);
        assert_eq!(
            fs::read_to_string(log).unwrap(),
            format!("[--merge]\n[{}]\n", file.display())
        );
    }
}

#[test]
fn merge_con_un_file_che_non_c_e_e_un_errore() {
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .args(["--merge", "/non/esiste.txt"])
        .output()
        .unwrap();
    assert_eq!(code(&out), 2);
    assert!(String::from_utf8_lossy(&out.stderr).contains("not a file"));
}

#[test]
fn setup_git_con_mergetool_scrive_e_toglie_anche_lo_strumento_di_merge() {
    if Command::new("git").arg("--version").output().is_err() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let config = tmp.path().join("gitconfig");
    let out = nurdiff_git(&config, &["--setup-git", "--mergetool"]);
    assert_eq!(code(&out), 0, "{}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(git_get(&config, "merge.tool").as_deref(), Some("nurdiff"));
    let cmd = git_get(&config, "mergetool.nurdiff.cmd").unwrap();
    assert!(cmd.ends_with("--merge \"$MERGED\""), "{cmd}");
    assert_eq!(
        git_get(&config, "mergetool.nurdiff.trustExitCode").as_deref(),
        Some("true")
    );
    assert_eq!(git_get(&config, "diff.tool").as_deref(), Some("nurdiff"));

    let out = nurdiff_git(&config, &["--remove-git"]);
    assert_eq!(code(&out), 0);
    assert_eq!(git_get(&config, "merge.tool"), None);
    assert_eq!(git_get(&config, "mergetool.nurdiff.cmd"), None);
}

fn zip_of(path: &Path, files: &[(&str, &str)]) {
    use std::io::Write;
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    for (name, text) in files {
        zip.start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(text.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

#[test]
fn due_archivi_si_confrontano_come_due_cartelle() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("v1.zip"), tmp.path().join("v2.zip"));
    zip_of(
        &a,
        &[
            ("uguale.txt", "x\n"),
            ("cambia.txt", "uno\n"),
            ("solo_sx.txt", "l\n"),
        ],
    );
    zip_of(
        &b,
        &[
            ("uguale.txt", "x\n"),
            ("cambia.txt", "due\n"),
            ("solo_dx.txt", "r\n"),
        ],
    );
    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 1, "{}", stderr(&out));
    let text = stdout(&out);
    assert!(
        text.contains("different") && text.contains("cambia.txt"),
        "{text}"
    );
    assert!(
        text.contains("left only") && text.contains("solo_sx.txt"),
        "{text}"
    );
    assert!(
        text.contains("right only") && text.contains("solo_dx.txt"),
        "{text}"
    );
    assert!(
        !text.contains("uguale.txt") || text.contains("identical"),
        "{text}"
    );
}

#[test]
fn due_archivi_uguali_escono_con_zero() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.zip"), tmp.path().join("b.jar"));
    zip_of(&a, &[("f.txt", "same\n")]);
    zip_of(&b, &[("f.txt", "same\n")]);
    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 0, "{}", stderr(&out));
}

#[test]
fn un_archivo_si_confronta_con_una_cartella() {
    let tmp = tempfile::tempdir().unwrap();
    let zip = tmp.path().join("rel.zip");
    zip_of(&zip, &[("a.txt", "a\n"), ("b.txt", "b\n")]);
    let dir = tmp.path().join("src");
    fs::create_dir(&dir).unwrap();
    fs::write(dir.join("a.txt"), "a\n").unwrap();
    let out = nurdiff(&[&zip, &dir]);
    assert_eq!(code(&out), 1, "{}", stderr(&out));
    assert!(stdout(&out).contains("b.txt"), "{}", stdout(&out));
}

#[test]
fn un_file_di_testo_chiamato_zip_resta_un_file() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.zip"), tmp.path().join("b.zip"));
    fs::write(&a, "una riga\n").unwrap();
    fs::write(&b, "altra riga\n").unwrap();
    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 1, "{}", stderr(&out));
    assert!(stdout(&out).contains("altra riga"), "{}", stdout(&out));
}

#[test]
fn un_archivio_rovinato_e_un_errore_chiaro() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.zip"), tmp.path().join("b.zip"));
    fs::write(&a, b"PK\x03\x04 not really a zip").unwrap();
    zip_of(&b, &[("f.txt", "x\n")]);
    let out = nurdiff(&[&a, &b]);
    assert_eq!(code(&out), 2);
    assert!(
        stderr(&out).contains("damaged or not an archive"),
        "{}",
        stderr(&out)
    );
}

#[test]
fn le_cartelle_temporanee_degli_archivi_si_cancellano() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("a.zip"), tmp.path().join("b.zip"));
    zip_of(&a, &[("f.txt", "1\n")]);
    zip_of(&b, &[("f.txt", "2\n")]);
    let temp = tmp.path().join("tmp");
    fs::create_dir(&temp).unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_nurdiff-cli"))
        .env("TMPDIR", &temp)
        .env("TMP", &temp)
        .env("TEMP", &temp)
        .arg(&a)
        .arg(&b)
        .output()
        .unwrap();
    assert_eq!(code(&out), 1);
    let left: Vec<_> = fs::read_dir(&temp).unwrap().collect();
    assert!(left.is_empty(), "{left:?}");
}

#[test]
fn un_file_dentro_un_archivio_mostra_il_percorso_dell_archivio() {
    let tmp = tempfile::tempdir().unwrap();
    let (a, b) = (tmp.path().join("v1.zip"), tmp.path().join("v2.zip"));
    zip_of(&a, &[("dir/f.txt", "uno\n")]);
    zip_of(&b, &[("dir/f.txt", "due\n")]);
    let (fa, fb) = (a.join("dir/f.txt"), b.join("dir/f.txt"));
    let out = nurdiff(&[&fa, &fb]);
    assert_eq!(code(&out), 1, "{}", stderr(&out));
    let text = stdout(&out);
    assert!(text.contains(&format!("--- {}", fa.display())), "{text}");
    assert!(text.contains(&format!("+++ {}", fb.display())), "{text}");
    assert!(!text.contains("nurdiff-archives"), "{text}");
}
