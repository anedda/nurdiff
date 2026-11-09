use super::*;

fn os(s: &str) -> Option<OsString> {
    Some(OsString::from(s))
}

#[test]
fn la_cartella_e_quella_richiesta_o_nurdiff_nella_home() {
    assert_eq!(
        resolve_dir(os("/tmp/mia"), os("/home/x")),
        Some(PathBuf::from("/tmp/mia"))
    );
    assert_eq!(
        resolve_dir(None, os("/home/x")),
        Some(PathBuf::from("/home/x/.nurdiff"))
    );
    // an empty variable is as if it were not there
    assert_eq!(
        resolve_dir(os(""), os("/home/x")),
        Some(PathBuf::from("/home/x/.nurdiff"))
    );
    assert_eq!(resolve_dir(None, None), None);
    assert_eq!(resolve_dir(None, os("")), None);
}

#[test]
fn su_windows_la_home_e_userprofile_altrove_home() {
    // MSYS or Cygwin set HOME to a path of their own: on Windows the profile wins
    assert_eq!(
        pick_home(os("/c/Users/x"), os("C:\\Users\\x"), true),
        os("C:\\Users\\x")
    );
    assert_eq!(
        pick_home(os("/home/x"), os("C:\\Users\\x"), false),
        os("/home/x")
    );
    // the other one, if the first is missing or empty
    assert_eq!(pick_home(os("/home/x"), None, true), os("/home/x"));
    assert_eq!(
        pick_home(None, os("C:\\Users\\x"), false),
        os("C:\\Users\\x")
    );
    assert_eq!(
        pick_home(os(""), os("C:\\Users\\x"), false),
        os("C:\\Users\\x")
    );
    assert_eq!(pick_home(None, None, true), None);
}

#[test]
fn i_nomi_dei_file_sono_fissi() {
    assert_eq!(ConfigFile::Settings.file_name(), "settings.json");
    assert_eq!(ConfigFile::Recents.file_name(), "recents.json");
    assert_eq!(ConfigFile::State.file_name(), "state.json");
}

#[test]
fn l_interfaccia_li_nomina_in_minuscolo() {
    for (name, file) in [
        ("settings", ConfigFile::Settings),
        ("recents", ConfigFile::Recents),
        ("state", ConfigFile::State),
    ] {
        let parsed: ConfigFile = serde_json::from_str(&format!("\"{name}\"")).unwrap();
        assert_eq!(parsed, file);
    }
    // any other name is refused: no path comes from outside
    assert!(serde_json::from_str::<ConfigFile>("\"../x\"").is_err());
}

#[test]
fn un_file_che_non_c_e_non_e_un_errore() {
    let tmp = tempfile::tempdir().unwrap();
    assert_eq!(read_config(tmp.path(), ConfigFile::Settings).unwrap(), None);
    // not even the folder
    assert_eq!(
        read_config(&tmp.path().join("manca"), ConfigFile::State).unwrap(),
        None
    );
}

#[test]
fn scrive_creando_la_cartella_e_rilegge() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("a").join(".nurdiff");
    write_config(&dir, ConfigFile::Settings, "{\"tema\":\"scuro\"}").unwrap();
    assert_eq!(
        read_config(&dir, ConfigFile::Settings).unwrap().as_deref(),
        Some("{\"tema\":\"scuro\"}")
    );
    // the files are independent
    assert_eq!(read_config(&dir, ConfigFile::Recents).unwrap(), None);
}

#[test]
fn riscrivere_sostituisce_e_non_lascia_il_file_temporaneo() {
    let tmp = tempfile::tempdir().unwrap();
    write_config(tmp.path(), ConfigFile::Recents, "[1]").unwrap();
    write_config(tmp.path(), ConfigFile::Recents, "[1,2]").unwrap();
    assert_eq!(
        read_config(tmp.path(), ConfigFile::Recents)
            .unwrap()
            .as_deref(),
        Some("[1,2]")
    );
    let mut names: Vec<_> = fs::read_dir(tmp.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(names, ["recents.json"]);
}

#[test]
fn una_scrittura_fallita_non_lascia_il_file_temporaneo() {
    let tmp = tempfile::tempdir().unwrap();
    // a folder where the temporary file should go: the write fails, and nothing stays behind
    let temp = tmp
        .path()
        .join(format!(".settings.json.{}.tmp", std::process::id()));
    fs::create_dir(&temp).unwrap();
    assert!(write_config(tmp.path(), ConfigFile::Settings, "{}").is_err());
    assert!(!tmp.path().join("settings.json").exists());
    fs::remove_dir(&temp).unwrap();
}
