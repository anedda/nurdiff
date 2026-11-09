use super::*;

fn filter(include: &str, include_none: bool, exclude: &str, exclude_none: bool) -> ExtFilter {
    ExtFilter {
        include_exts: parse_ext_list(include),
        include_none,
        exclude_exts: parse_ext_list(exclude),
        exclude_none,
    }
}

#[test]
fn estensione_dei_nomi() {
    assert_eq!(extension("a.rs"), Some("rs"));
    assert_eq!(extension("a.tar.gz"), Some("gz"));
    assert_eq!(extension("Makefile"), None);
    assert_eq!(extension(".gitignore"), None);
    assert_eq!(extension("a."), None);
    assert_eq!(extension(".config.json"), Some("json"));
}

#[test]
fn elenco_di_estensioni_pulito() {
    assert_eq!(parse_ext_list(" TS, .rs;tsx  ts ."), ["ts", "rs", "tsx"]);
    assert!(parse_ext_list(" , ").is_empty());
}

#[test]
fn senza_filtro_passa_tutto() {
    let f = ExtFilter::default();
    assert!(!f.is_active());
    assert!(f.accepts("a.rs") && f.accepts("Makefile"));
}

#[test]
fn includi_solo_alcune_estensioni() {
    let f = filter("rs ts", false, "", false);
    assert!(f.accepts("a.rs") && f.accepts("B.TS"));
    assert!(!f.accepts("a.md") && !f.accepts("Makefile"));
}

#[test]
fn includi_anche_i_senza_estensione() {
    let f = filter("rs", true, "", false);
    assert!(f.accepts("a.rs") && f.accepts("Makefile") && f.accepts(".gitignore"));
    assert!(!f.accepts("a.md"));
    let solo = filter("", true, "", false);
    assert!(solo.accepts("LICENSE") && !solo.accepts("a.rs"));
}

#[test]
fn escludi_estensioni_e_senza_estensione() {
    let f = filter("", false, "log o", false);
    assert!(!f.accepts("a.log") && !f.accepts("b.O") && f.accepts("a.rs") && f.accepts("Makefile"));
    let g = filter("", false, "", true);
    assert!(!g.accepts("Makefile") && g.accepts("a.rs"));
}

#[test]
fn l_esclusione_vince_sull_inclusione() {
    let f = filter("rs md", false, "md", false);
    assert!(f.accepts("a.rs") && !f.accepts("a.md"));
    let g = filter("", true, "", true);
    assert!(!g.accepts("Makefile"));
}

#[test]
fn normalizza_le_estensioni() {
    let f = ExtFilter {
        include_exts: vec![".RS".into(), "rs".into(), " ".into()],
        ..ExtFilter::default()
    }
    .normalized();
    assert_eq!(f.include_exts, ["rs"]);
}
