use super::*;

type Spans = (Vec<(usize, usize)>, Vec<(usize, usize)>);

fn marks(l: &str, r: &str) -> Spans {
    marks_with(l, r, &DiffOptions::default())
}

fn marks_with(l: &str, r: &str, opts: &DiffOptions) -> Spans {
    let (a, b) = inline_marks(l, r, opts);
    let v = |m: Vec<Mark>| m.into_iter().map(|m| (m.start, m.end)).collect();
    (v(a), v(b))
}

fn pieces<'a>(text: &'a str, m: &[(usize, usize)]) -> Vec<&'a str> {
    m.iter().map(|&(s, e)| &text[s..e]).collect()
}

#[test]
fn evidenzia_la_parola_cambiata() {
    let (l, r) = ("il gatto dorme qui", "il cane dorme qui");
    let (lm, rm) = marks(l, r);
    assert_eq!(pieces(l, &lm), vec!["gatto"]);
    assert_eq!(pieces(r, &rm), vec!["cane"]);
}

#[test]
fn aggiunta_solo_a_destra() {
    let (l, r) = ("let x = 1;", "let x = 1 + 2;");
    let (lm, rm) = marks(l, r);
    assert!(lm.is_empty());
    assert_eq!(pieces(r, &rm), vec![" + 2"]);
}

#[test]
fn simboli_e_numeri_sono_token_separati() {
    let (l, r) = ("f(a, b)", "f(a, c)");
    let (lm, rm) = marks(l, r);
    assert_eq!(pieces(l, &lm), vec!["b"]);
    assert_eq!(pieces(r, &rm), vec!["c"]);
}

#[test]
fn spazi_tra_due_parole_cambiate_si_uniscono() {
    let (l, r) = ("uno rosso verde due", "uno blu giallo due");
    let (lm, rm) = marks(l, r);
    assert_eq!(pieces(l, &lm), vec!["rosso verde"]);
    assert_eq!(pieces(r, &rm), vec!["blu giallo"]);
}

#[test]
fn spazi_non_contigui_a_parti_cambiate_restano_fuori() {
    let (l, r) = ("a b c d", "a X c Y");
    let (lm, rm) = marks(l, r);
    assert_eq!(pieces(l, &lm), vec!["b", "d"]);
    assert_eq!(pieces(r, &rm), vec!["X", "Y"]);
}

#[test]
fn senza_parole_in_comune_non_evidenzia_nulla() {
    assert_eq!(marks("alfa beta", "gamma delta"), (vec![], vec![]));
}

#[test]
fn righe_troppo_lunghe_sono_ignorate() {
    let long = "parola ".repeat(MAX_INLINE_BYTES / 4);
    let other = format!("{long}extra");
    assert_eq!(marks(&long, &other), (vec![], vec![]));
}

#[test]
fn posizioni_in_unita_utf16() {
    // 😀 is worth two UTF-16 units (and four UTF-8 bytes).
    let (lm, rm) = marks("😀 ciao mondo", "😀 ciao luna");
    assert_eq!(lm, vec![(8, 13)]);
    assert_eq!(rm, vec![(8, 12)]);
    let (lm, _) = marks("àè x", "àè y");
    assert_eq!(lm, vec![(3, 4)]); // the accents here are one unit each
}

#[test]
fn ignora_maiuscole() {
    let opts = DiffOptions {
        ignore_case: true,
        ..Default::default()
    };
    let (l, r) = ("Ciao Mondo bello", "ciao mondo brutto");
    let (lm, rm) = marks_with(l, r, &opts);
    assert_eq!(pieces(l, &lm), vec!["bello"]);
    assert_eq!(pieces(r, &rm), vec!["brutto"]);
}

#[test]
fn ignora_spazi_non_evidenzia_gli_spazi() {
    let opts = DiffOptions {
        whitespace: Whitespace::All,
        ..Default::default()
    };
    let (l, r) = ("a  b   c x", "a b c y");
    let (lm, rm) = marks_with(l, r, &opts);
    assert_eq!(pieces(l, &lm), vec!["x"]);
    assert_eq!(pieces(r, &rm), vec!["y"]);
}

#[test]
fn solo_la_quantita_non_evidenzia_la_quantita_di_spazi() {
    let opts = DiffOptions {
        whitespace: Whitespace::Amount,
        ..Default::default()
    };
    let (l, r) = ("a  b \t c x  ", "a b c y");
    let (lm, rm) = marks_with(l, r, &opts);
    assert_eq!(pieces(l, &lm), vec!["x"]);
    assert_eq!(pieces(r, &rm), vec!["y"]);
    // no space against one space stays a difference
    let (lm, rm) = marks_with("a b c", "a bc", &opts);
    assert!(!lm.is_empty() && !rm.is_empty());
}

#[test]
fn spazi_diversi_vengono_evidenziati_se_contano() {
    let (l, r) = ("a  b x", "a b y");
    let (lm, rm) = marks(l, r);
    assert_eq!(pieces(l, &lm), vec!["  ", "x"]);
    assert_eq!(pieces(r, &rm), vec![" ", "y"]);
}

#[test]
fn righe_vuote_o_uguali() {
    assert_eq!(marks("", ""), (vec![], vec![]));
    assert_eq!(marks("a b", "a b"), (vec![], vec![]));
    assert_eq!(marks("", "x"), (vec![], vec![]));
}

#[test]
fn tokenizzazione() {
    let t: Vec<&str> = tokenize("foo_bar  (x1)=é").iter().map(|t| t.text).collect();
    assert_eq!(t, vec!["foo_bar", "  ", "(", "x1", ")", "=", "é"]);
    assert!(tokenize("").is_empty());
}
