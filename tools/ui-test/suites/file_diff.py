"""File comparison: small and large file, selection, direct editing, merge, alignment, minor differences. A suite of the UI test (see README.md in this folder)."""
from harness import *


def run(browser):
    # ------------------------------------------------------------------ small file
    print("== File piccolo (2036 righe) ==")
    ctx, page, errors = open_page(browser)
    dt = run_files(page, "small.json")
    page.screenshot(path=f"{SHOTS}/1_small_light.png")
    s = page.evaluate(PANES)
    check("compare_files chiamato con i parametri giusti", page.evaluate(
        "window.__calls.some(c => c.cmd==='compare_files' && c.args.left==='/x/a.txt' && c.args.ignoreCase===false)"))
    calls = page.evaluate("window.__rowCalls")
    check("il riepilogo non contiene righe e le righe arrivano a blocchi",
          page.evaluate("window.__bytes.summary") < 20_000 and 1 <= len(calls) <= 3 and all(c[2] - c[1] <= 500 for c in calls),
          f"riepilogo {page.evaluate('window.__bytes.summary')} B, richieste {calls}")
    check("virtualizzazione: poche righe nel DOM", s["rRows"] < 80 and s["lRows"] < 80, f"{s['lRows']}/{s['rRows']} su 2036")
    check("i due pannelli disegnano le stesse righe", s["sameSet"])
    check("barra di scorrimento verticale a destra presente", s["rScrollH"] > s["rClientH"])
    check("riga lunga: scroll orizzontale disponibile", s["rScrollW"] > s["rClientW"], f"{s['rScrollW']} > {s['rClientW']}")
    c0 = counter(page)
    check("contatore iniziale", "differenze" in c0, c0)
    n = int(c0.split()[0])

    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(150)
    check("Successiva -> 'Differenza 1 di N'", counter(page) == f"Differenza 1 di {n}", counter(page))
    cur = page.evaluate(CURRENT)
    check("il blocco corrente è evidenziato e visibile", cur is not None and cur["visible"], str(cur))

    for _ in range(3):
        page.keyboard.press("Alt+ArrowDown")
    page.wait_for_timeout(150)
    check("Alt+↓ x3 -> differenza 4", counter(page) == f"Differenza 4 di {n}", counter(page))
    page.keyboard.press("Alt+ArrowUp")
    page.wait_for_timeout(150)
    check("Alt+↑ -> differenza 3", counter(page) == f"Differenza 3 di {n}", counter(page))
    cur = page.evaluate(CURRENT)
    check("dopo la navigazione il blocco è visibile", cur is not None and cur["visible"], str(cur))
    s = page.evaluate(PANES)
    check("pannelli allineati dopo la navigazione", s["lTop"] == s["rTop"] and s["maxMisalign"] < 1, f"{s['lTop']} vs {s['rTop']}, sfasamento {s['maxMisalign']:.2f}px")
    page.screenshot(path=f"{SHOTS}/2_small_navigated.png")

    # full cycle: from the last one we go back to the first
    for _ in range(n):
        page.keyboard.press("Alt+ArrowDown")
    page.wait_for_timeout(150)
    check("il giro completo riporta alla stessa differenza", counter(page) == f"Differenza 3 di {n}", counter(page))

    # synchronized scroll (vertical and horizontal)
    page.evaluate("document.querySelector('.pane.right').scrollTop = 7000")
    page.wait_for_timeout(200)
    settled(page)
    s = page.evaluate(PANES)
    check("scroll verticale destro -> sinistro", abs(s["lTop"] - s["rTop"]) <= 1, f"{s['lTop']} vs {s['rTop']}")
    check("righe disegnate seguono lo scroll", s["rRows"] > 0 and s["sameSet"] and s["maxMisalign"] < 1)
    page.evaluate("document.querySelector('.pane.left').scrollTop = 12000")
    page.wait_for_timeout(200)
    s = page.evaluate(PANES)
    check("scroll verticale sinistro -> destro", abs(s["lTop"] - s["rTop"]) <= 1, f"{s['lTop']} vs {s['rTop']}")
    page.evaluate("document.querySelector('.pane.right').scrollLeft = 400")
    page.wait_for_timeout(200)
    s = page.evaluate(PANES)
    check("scroll orizzontale destro -> sinistro", abs(s["lLeft"] - s["rLeft"]) <= 1 and s["rLeft"] > 100, f"{s['lLeft']} vs {s['rLeft']}")
    page.screenshot(path=f"{SHOTS}/3_small_hscroll.png")
    page.evaluate("document.querySelector('.pane.right').scrollLeft = 0")

    # at the bottom of the two panes the rows must still match
    page.evaluate("document.querySelector('.pane.right').scrollTop = 1e9")
    page.wait_for_timeout(250)
    settled(page)
    s = page.evaluate(PANES)
    check("in fondo: stessa posizione di scroll", abs(s["lTop"] - s["rTop"]) <= 1, f"{s['lTop']} vs {s['rTop']}")
    check("in fondo: righe allineate al pixel", s["maxMisalign"] < 1, f"{s['maxMisalign']:.2f}px")
    page.screenshot(path=f"{SHOTS}/4_small_bottom.png")

    # click on the overview
    box = page.locator(".overview").bounding_box()
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] * 0.5)
    page.wait_for_timeout(250)
    s = page.evaluate(PANES)
    ratio = s["rTop"] / (s["rScrollH"] - s["rClientH"])
    check("clic sulla panoramica porta circa a metà", 0.35 < ratio < 0.65, f"{ratio:.2f}")
    # click at the centre of a mark: it selects that block (even if the nearby marks overlap)
    isolated = page.evaluate("""() => {
        const ms = Array.from(document.querySelectorAll('.overview .mark')).map(m => m.getBoundingClientRect());
        const out = [];
        for (let i = 1; i < ms.length - 1; i++)
          if (ms[i].top - ms[i-1].bottom > 3 && ms[i+1].top - ms[i].bottom > 3) out.push(i);
        return out; }""")
    targets = [isolated[len(isolated) * k // 4] for k in (1, 2, 3)] if len(isolated) >= 4 else isolated
    check("ci sono segni isolati da cliccare", len(targets) == 3, str(isolated))
    for target in targets:
        info = page.evaluate("""(i) => { const m = document.querySelectorAll('.overview .mark')[i];
            const r = m.getBoundingClientRect();
            return { hunk: +m.dataset.hunk, x: r.x + r.width / 2, y: r.y + r.height / 2 } }""", target)
        page.mouse.click(info["x"], info["y"])
        page.wait_for_timeout(250)
        check(f"clic sul segno {target} seleziona il suo blocco", counter(page) == f"Differenza {info['hunk'] + 1} di {n}",
              f"{counter(page)} (atteso blocco {info['hunk'] + 1})")
        cur = page.evaluate(CURRENT)
        check(f"il blocco scelto dal segno {target} è visibile", cur is not None and cur["visible"], str(cur))
    # click far from any block: it only scrolls, without changing the selection
    before = counter(page)
    box = page.locator(".overview").bounding_box()
    far = page.evaluate("""() => { const m = Array.from(document.querySelectorAll('.overview .mark'))
        .map(x => { const r = x.getBoundingClientRect(); return [r.top, r.bottom]; });
        // find a point of the bar at least 12px from all the marks
        const bar = document.querySelector('.overview').getBoundingClientRect();
        for (let y = bar.top + 5; y < bar.bottom - 5; y += 1)
          if (m.every(([t, b]) => y < t - 12 || y > b + 12)) return y;
        return null; }""")
    if far is None:
        print("  (nessun punto della barra lontano dai segni: controllo saltato)")
    else:
        page.mouse.click(box["x"] + box["width"] / 2, far)
        page.wait_for_timeout(250)
        check("clic lontano dai blocchi non cambia la selezione", counter(page) == before, f"{before} -> {counter(page)}")
    page.screenshot(path=f"{SHOTS}/5_small_overview.png")

    # ---- diff inside the row
    page.evaluate("document.querySelector('.pane.right').scrollTop = 70 * 20")
    page.wait_for_timeout(250)
    settled(page)
    ie = page.evaluate("""() => {
        const rowOf = (pane) => Array.from(document.querySelectorAll('.pane.' + pane + ' .vrow'))
            .find(r => r.querySelector('.num').textContent === '77');
        const l = rowOf('left'), r = rowOf('right');
        const marks = row => Array.from(row.querySelectorAll('mark.ie')).map(m => m.textContent);
        return { l: marks(l), r: marks(r), lText: l.querySelector('.code').textContent,
                 rText: r.querySelector('.code').textContent,
                 bg: getComputedStyle(l.querySelector('mark.ie')).backgroundColor,
                 rowBg: getComputedStyle(l).backgroundColor };
    }""")
    check("riga 77: evidenziata solo la parola cambiata (sinistra)", ie["l"] == ["result"], str(ie["l"]))
    check("riga 77: evidenziata solo la parola cambiata (destra)", ie["r"] == ["outcome"], str(ie["r"]))
    check("il testo della riga resta intero con l'evidenziazione", ie["lText"].strip() == "let result = value * 15 + offset;", repr(ie["lText"]))
    check("l'evidenziazione si distingue dal fondo della riga", ie["bg"] != ie["rowBg"], f"{ie['bg']} vs {ie['rowBg']}")
    page.screenshot(path=f"{SHOTS}/12_inline.png")
    # a modified row with no words in common has no highlights
    page.evaluate("document.querySelector('.pane.right').scrollTop = 40 * 20")
    page.wait_for_timeout(250)
    settled(page)
    none = page.evaluate("""() => {
        const row = Array.from(document.querySelectorAll('.pane.right .vrow')).find(r => r.querySelector('.num').textContent === '51');
        return { exists: !!row, marks: row ? row.querySelectorAll('mark.ie').length : -1, cls: row ? row.className : '' }; }""")
    check("riga 51 (tutta diversa): colorata ma senza parti evidenziate", none["exists"] and none["marks"] == 0 and "chg" in none["cls"], str(none))
    page.evaluate("document.querySelector('.pane.right').scrollTop = 0")
    page.wait_for_timeout(150)

    check("nessun errore in console (file piccolo)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ dark theme
    ctx, page, errors = open_page(browser, "dark")
    run_files(page, "small.json")
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/6_small_dark.png")
    page.evaluate("document.querySelector('.pane.right').scrollTop = 70 * 20")
    page.wait_for_timeout(250)
    settled(page)
    page.screenshot(path=f"{SHOTS}/13_inline_dark.png")
    check("nessun errore in console (tema scuro)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ large file
    print("== File grande (300496 righe, JSON 46.9 MB) ==")
    ctx, page, errors = open_page(browser)
    dt = run_files(page, "big.json")
    print(f"        dal clic alla vista pronta: {dt:.2f}s (IPC simulato: il tempo di Rust si misura a parte)")
    s = page.evaluate(PANES)
    check("virtualizzazione su 300k righe", s["rRows"] < 80, f"{s['rRows']} righe nel DOM")
    check("altezza dell'area scorrevole = righe x 20px", abs(s["rScrollH"] - (300496 * 20 + 0)) <= 20, f"{s['rScrollH']}")
    page.screenshot(path=f"{SHOTS}/7_big_top.png")
    sb = page.evaluate("window.__bytes.summary")
    rc = page.evaluate("window.__rowCalls")
    print(f"        riepilogo: {sb/1e6:.2f} MB (prima: 46.9 MB); righe richieste all'apertura: {sum(c[2]-c[1] for c in rc)} in {len(rc)} richieste")
    check("apertura: riepilogo piccolo e poche righe richieste", sb < 1_000_000 and sum(c[2]-c[1] for c in rc) <= 1500, f"{sb} B, {rc}")
    check("il contenuto visibile è quello del file (prima riga)", page.evaluate(
        "document.querySelector('.pane.right .vrow .num').textContent") == "1")

    nbig = int(counter(page).split()[0])
    t = time.time()
    for _ in range(100):
        page.keyboard.press("Alt+ArrowDown")
    page.wait_for_function("document.querySelector('.counter').getAttribute('aria-label').includes('Differenza 100 di')", timeout=60_000)
    per = (time.time() - t) / 100 * 1000
    check("100 passi di navigazione", True, f"{per:.0f} ms per passo, {nbig} blocchi")
    # after 100 quick steps the scroll and the drawing arrive a moment after the counter
    page.wait_for_function("""() => { const l = document.querySelector('.pane.left'), r = document.querySelector('.pane.right');
        return Math.abs(l.scrollTop - r.scrollTop) < 1 && !!r.querySelector('.vrow.current'); }""", timeout=10_000)
    settled(page)
    cur = page.evaluate(CURRENT)
    check("il blocco corrente è visibile (file grande)", cur is not None and cur["visible"], str(cur))
    s = page.evaluate(PANES)
    check("pannelli allineati (file grande)", s["lTop"] == s["rTop"] and s["maxMisalign"] < 1, f"{s['lTop']} vs {s['rTop']}")

    t = time.time()
    page.evaluate("document.querySelector('.pane.right').scrollTop = 1e9")
    page.wait_for_timeout(300)
    s = page.evaluate(PANES)
    check("in fondo al file grande", abs(s["lTop"] - s["rTop"]) <= 1 and s["maxMisalign"] < 1 and s["rRows"] < 80,
          f"scrollTop {s['rTop']:.0f}, righe nel DOM {s['rRows']}")
    settled(page)
    last = page.evaluate("Array.from(document.querySelectorAll('.pane.right .vrow .num')).slice(-1)[0].textContent")
    check("in fondo: ultima riga caricata dal blocco finale", last == "300000", last)
    page.screenshot(path=f"{SHOTS}/8_big_bottom.png")

    # continuous scroll: many jumps, measures the average update time
    t = time.time()
    for i in range(200):
        page.evaluate(f"document.querySelector('.pane.right').scrollTop = {i * 29_000}")
    page.wait_for_timeout(200)
    settled(page)
    nreq = len(page.evaluate("window.__rowCalls"))
    mb = page.evaluate("window.__bytes.rows") / 1e6
    print(f"        200 salti di scroll: {(time.time() - t) / 200 * 1000:.1f} ms ciascuno; richieste totali {nreq}, {mb:.1f} MB di righe trasferite")
    # going back to where we just were requires nothing (cache)
    page.evaluate("document.querySelector('.pane.right').scrollTop = 199 * 29000")
    page.wait_for_timeout(150)
    settled(page)
    n0 = len(page.evaluate("window.__rowCalls"))
    page.evaluate("document.querySelector('.pane.right').scrollTop = 199 * 29000 + 20")
    page.wait_for_timeout(150)
    check("restare nella stessa zona non rifa richieste", len(page.evaluate("window.__rowCalls")) == n0)
    check("richieste limitate a blocchi", all(c[2] - c[1] <= 500 for c in page.evaluate("window.__rowCalls")))
    # new comparison: the old one is freed in Rust
    old_ids = page.evaluate("Object.keys(window.__open)")
    page.evaluate("window.__fileFixture = 'small.json'")
    page.evaluate("window.__load('small.json')")
    page.click('button[type="submit"]')
    page.wait_for_function("document.querySelector('.file-meta').textContent.includes('2036') || document.querySelector('.file-meta').textContent.includes('righe')")
    page.wait_for_timeout(300)
    settled(page)
    now_ids = page.evaluate("Object.keys(window.__open)")
    check("il confronto precedente viene liberato", len(now_ids) == 1 and now_ids[0] not in old_ids, f"{old_ids} -> {now_ids}")
    check("nessun errore dopo il cambio di confronto", not page.locator(".error").count(), page.locator(".error").all_inner_texts().__str__())
    # error loading a block: shown, then it recovers
    page.evaluate("document.querySelector('.pane.right').scrollTop = 0")
    page.wait_for_timeout(200)
    settled(page)
    page.evaluate("window.__failRows = true")
    page.evaluate("document.querySelector('.pane.right').scrollTop = 30000")  # rows ~1500: blocks never loaded
    page.wait_for_selector(".error", timeout=5000)
    check("errore di get_rows mostrato", "Impossibile caricare le righe" in page.inner_text(".error"), page.inner_text(".error"))
    page.evaluate("window.__failRows = false")
    page.evaluate("document.querySelector('.pane.right').scrollTop = 15000")  # another area, blocks not yet in the cache
    page.wait_for_timeout(200)
    settled(page)
    check("dopo l'errore le righe si caricano di nuovo", page.locator(".pane.right .vrow.loading").count() == 0)
    s = page.evaluate(PANES)
    check("dopo i salti i pannelli restano allineati", s["sameSet"] and s["maxMisalign"] < 1)
    check("nessun errore in console (file grande)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ merge
    print("== Selezione di una riga ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(200); settled(page)
    check("all'inizio nessuna riga è selezionata", page.locator(".vrow.selected").count() == 0)
    r = page.locator(".pane.right .vrow.chg").first
    r_num = r.locator(".num").inner_text()
    r.click()
    check("un clic seleziona la riga nei due pannelli", page.locator(".pane.left .vrow.selected").count() == 1
          and page.locator(".pane.right .vrow.selected").count() == 1)
    top_l = page.locator(".pane.left .vrow.selected").evaluate("e => e.style.top")
    top_r = page.locator(".pane.right .vrow.selected").evaluate("e => e.style.top")
    check("è la stessa riga della vista nei due pannelli", top_l == top_r and top_l != "")
    check("la riga cliccata è quella selezionata", page.locator(".pane.right .vrow.selected .num").inner_text() == r_num)
    check("una riga dentro una differenza la rende corrente", "Differenza" in counter(page))
    page.keyboard.press("ArrowDown")
    t2 = int(page.locator(".pane.right .vrow.selected").evaluate("e => e.style.top").replace("px", ""))
    check("freccia giù: la selezione scende di una riga", t2 == int(top_r.replace("px", "")) + 20, f"{top_r} -> {t2}")
    page.keyboard.press("ArrowUp"); page.keyboard.press("ArrowUp")
    t3 = int(page.locator(".pane.right .vrow.selected").evaluate("e => e.style.top").replace("px", ""))
    check("freccia su: la selezione sale", t3 == int(top_r.replace("px", "")) - 20, str(t3))
    page.keyboard.press("End")
    page.wait_for_timeout(200); settled(page)
    last = page.locator(".pane.right .vrow.selected")
    check("Fine: seleziona l'ultima riga e la porta in vista", last.count() == 1
          and last.evaluate("e => parseInt(e.style.top) + 20") == page.evaluate("document.querySelector('.pane.right .pane-inner').offsetHeight"))
    page.keyboard.press("Home")
    page.wait_for_timeout(200); settled(page)
    check("Home: seleziona la prima riga e torna in cima", page.locator(".pane.right .vrow.selected .num").inner_text() == "1"
          and page.evaluate("document.querySelector('.pane.right').scrollTop") == 0)
    page.keyboard.press("Enter")
    check("Invio sulla riga selezionata apre la modifica (sul lato cliccato: destro)", page.locator(".pane.right input.line-edit").count() == 1)
    page.keyboard.press("Escape")
    check("Esc chiude la modifica e la selezione resta", page.locator("input.line-edit").count() == 0 and page.locator(".vrow.selected").count() == 2)
    page.locator(".pane.left .vrow").nth(3).click()
    page.keyboard.press("F2")
    check("F2 modifica la riga sul lato su cui si è cliccato (sinistro)", page.locator(".pane.left input.line-edit").count() == 1)
    page.keyboard.press("Escape")
    check("nessun errore in console (selezione)", not errors, "; ".join(errors[:3]))
    page.screenshot(path=f"{SHOTS}/27_selected_row.png")
    ctx.close()

    print("== Panoramica come barra di scorrimento ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    ov = page.locator(".overview").bounding_box()
    check("il pannello destro non ha una barra verticale propria", page.evaluate("(() => { const r = document.querySelector('.pane.right'); return r.offsetWidth - r.clientWidth; })()") == 0)
    page.mouse.move(ov["x"] + 8, ov["y"] + 10)
    page.mouse.down()
    page.mouse.move(ov["x"] + 8, ov["y"] + ov["height"] * 0.5, steps=8)
    page.mouse.up()
    page.wait_for_timeout(200)
    st = page.evaluate("document.querySelector('.pane.right').scrollTop")
    h = page.evaluate("document.querySelector('.pane.right').scrollHeight")
    check("trascinando la panoramica si scorre (circa a metà)", 0.35 * h < st + 200 and st > 0.3 * h - 400 and st < 0.6 * h, f"{st} / {h}")
    check("la selezione non è cambiata dal trascinamento", counter(page).startswith("53") or "differenz" in counter(page))
    page.mouse.move(ov["x"] + 8, ov["y"] + 5); page.mouse.down(); page.mouse.move(ov["x"] + 8, ov["y"] + 5, steps=2)
    page.mouse.up()
    page.wait_for_timeout(200)
    check("un clic fermo salta ancora (o seleziona la differenza vicina)", page.evaluate("document.querySelector('.pane.right').scrollTop") < st)
    check("nessun errore in console (panoramica)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Ricerca nel testo (Ctrl+F) ==")
    import gzip, json, pathlib
    fx = json.load(gzip.open(pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "small.json.gz"))
    n_right = sum(r["right"]["text"].lower().count("return") for r in fx["rows"] if r["right"])
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    calls = lambda: page.evaluate("window.__searchCalls || []")
    count = lambda: page.locator(".searchbar .search-count").inner_text().strip()
    marks = lambda side, cls="mark.find": page.locator(f".pane.{side} {cls}")
    in_view = lambda: page.evaluate("""() => {
      const m = document.querySelector('.pane.right mark.find.current'); if (!m) return false;
      const r = m.getBoundingClientRect(), p = document.querySelector('.pane.right').getBoundingClientRect();
      return r.top >= p.top && r.bottom <= p.bottom && r.left >= p.left && r.right <= p.right;
    }""")
    wait_count = lambda text: page.wait_for_function("(t) => document.querySelector('.searchbar .search-count')?.textContent.trim() === t", arg=text, timeout=10_000)
    def hold_search(on):
        """Holds back the answers of the search (on) or lets them go (off): the state of the page while one is awaited does not depend on how fast the machine is."""
        page.evaluate("(on) => { window.__searchHold = on; if (!on) { (window.__searchWaiters || []).forEach(r => r()); window.__searchWaiters = []; } }", on)

    def eventually(js, timeout=5_000):
        """True if `js` becomes true within the time: the page updates after the event, not always before the next line runs."""
        try:
            page.wait_for_function(js, timeout=timeout)
            return True
        except Exception:
            return False

    wait_call = lambda **want: page.wait_for_function("(w) => { const c = (window.__searchCalls || []).at(-1); return !!c && Object.entries(w).every(([k, v]) => c[k] === v); }", arg=want, timeout=10_000)
    # a new text starts from the row that is seen, not from the first match of the file: only the total is known
    wait_total = lambda: page.wait_for_function("(n) => new RegExp('^\\\\d+ di ' + n + '$').test(document.querySelector('.searchbar .search-count')?.textContent.trim() || '')", arg=n_right, timeout=10_000)
    check("senza Ctrl+F la barra non c'è", page.locator(".searchbar").count() == 0)
    page.locator(".pane.right .vrow").nth(2).dispatch_event("pointerdown", {"button": 0, "pointerId": 1, "bubbles": True})
    page.keyboard.press("Control+f")
    page.wait_for_selector(".searchbar")
    page.wait_for_function("document.activeElement === document.querySelector('.searchbar input')")
    check("Ctrl+F apre la barra, sul lato dell'ultimo riquadro cliccato, con il campo che ha il focus",
          page.locator(".searchbar [role='group'] .seg-btn[aria-pressed='true']").inner_text() == "Destra")
    check("la barra sta sopra la riga «righe · codifica · fine riga» che fa da intestazione ai riquadri",
          page.evaluate("!!(document.querySelector('.searchbar').compareDocumentPosition(document.querySelector('.file-meta')) & Node.DOCUMENT_POSITION_FOLLOWING)"))
    hold_search(True)
    page.locator(".searchbar input").fill("return")
    check("finché la risposta non c'è il campo non è rosso e non dice «Nessun risultato»",
          eventually("!document.querySelector('.search-field.none') && document.querySelector('.search-field .search-count').textContent.trim() === ''"))
    hold_search(False)
    wait_count(f"1 di {n_right}")
    check("cerca nel core sul lato scelto, senza distinguere maiuscole, e il contatore dice «1 di N»",
          {k: v for k, v in calls()[-1].items() if k != "channel"} == {"id": calls()[-1]["id"], "side": "right", "text": "return", "caseSensitive": False} and n_right > 2, str(calls()[-1:]))
    check("la ricerca ha il canale del tab (lo stesso a ogni richiesta), così il core ferma quella vecchia",
          calls()[-1]["channel"].startswith("search") and len({c["channel"] for c in calls()}) == 1, str({c["channel"] for c in calls()}))
    page.wait_for_selector(".pane.right mark.find.current")
    check("le corrispondenze sono evidenziate solo nel riquadro cercato, e una sola è quella corrente",
          marks("right").count() >= 1 and marks("left").count() == 0 and marks("right", "mark.find.current").count() == 1
          and marks("right", "mark.find.current").inner_text() == "return")
    page.screenshot(path=f"{SHOTS}/file_search.png")
    page.keyboard.press("Enter")
    wait_count(f"2 di {n_right}")
    page.keyboard.press("F3")
    wait_count(f"3 di {n_right}")
    page.keyboard.press("Shift+F3")
    wait_count(f"2 di {n_right}")
    page.keyboard.press("Shift+Enter")
    wait_count(f"1 di {n_right}")
    check("Invio e F3 vanno avanti, Maiusc+Invio e Maiusc+F3 indietro", count() == f"1 di {n_right}")
    page.keyboard.press("Shift+Enter")
    wait_count(f"{n_right} di {n_right}")
    page.wait_for_function("(() => { const m = document.querySelector('.pane.right mark.find.current'); return !!m; })()", timeout=10_000)
    page.wait_for_timeout(300)
    check("dall'inizio «indietro» passa all'ultima corrispondenza, in fondo al file: il riquadro scorre e la mostra",
          page.evaluate("document.querySelector('.pane.right').scrollTop") > 1000 and in_view(), str(page.evaluate("document.querySelector('.pane.right').scrollTop")))
    page.locator(".searchbar input").fill("RETURN")
    wait_call(text="RETURN")
    wait_total()
    check("senza «Maiusc./minusc.» «RETURN» trova le stesse corrispondenze di «return» (stesso totale)", calls()[-1]["text"] == "RETURN" and calls()[-1]["caseSensitive"] is False)
    page.locator(".searchbar .seg-btn", has_text="Maiusc./minusc.").click()
    page.wait_for_function("document.querySelector('.searchbar .search-count')?.textContent.trim() === 'Nessun risultato'")
    page.locator(".searchbar").screenshot(path=f"{SHOTS}/file_search_none.png")
    check("con «Maiusc./minusc.» «RETURN» non c'è: «Nessun risultato», nessun segno e frecce spente",
          calls()[-1]["caseSensitive"] is True and marks("right").count() == 0
          and page.locator(".search-field.none").count() == 1 and page.locator(".search-field .search-count").count() == 1
          and all(page.locator(f".searchbar [aria-label='{n}']").is_disabled() for n in ("Corrispondenza precedente (Maiusc+Invio, Maiusc+F3)", "Corrispondenza successiva (Invio, F3)")))
    page.locator(".searchbar .seg-btn", has_text="Maiusc./minusc.").click()
    page.locator(".searchbar input").fill("return")
    wait_call(text="return", caseSensitive=False)
    wait_total()
    hold_search(True)
    page.locator(".searchbar .seg-btn", has_text="Sinistra").click()
    check("cambiando lato le corrispondenze del lato di prima spariscono: non si disegnano a caso sull'altro testo, e il campo non è rosso",
          eventually("document.querySelectorAll('.pane mark.find').length === 0 && !document.querySelector('.search-field.none')"))
    hold_search(False)
    wait_call(side="left")
    page.wait_for_selector(".pane.left mark.find.current")
    check("scegliendo «Sinistra» cerca nell'altro lato e le corrispondenze passano al riquadro sinistro",
          calls()[-1]["side"] == "left" and marks("left").count() >= 1 and marks("right").count() == 0)
    check("il contatore sta dentro il campo e i pallini dei lati hanno i colori dei percorsi (blu e viola)",
          page.locator(".search-field .search-count").inner_text().strip() != ""
          and page.evaluate("[...document.querySelectorAll('.searchbar .sb-dot')].map(d => getComputedStyle(d).backgroundColor).join('|')")
          == page.evaluate("['left', 'right'].map(s => { const d = document.createElement('i'); d.className = 'side-dot ' + s; document.body.append(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }).join('|')"))
    page.locator(".searchbar .search-clear").click()
    check("il pulsante di cancellazione svuota il campo, toglie i segni e lascia il focus nel campo",
          eventually("""(() => { const i = document.querySelector('.searchbar input');
            return i.value === '' && document.querySelectorAll('.pane mark.find').length === 0
              && !document.querySelector('.search-clear') && document.activeElement === i; })()"""))
    page.locator(".searchbar input").fill("return")
    wait_call(text="return", side="left")
    page.wait_for_function("/^\\d+ di \\d+$/.test(document.querySelector('.searchbar .search-count')?.textContent.trim() || '')", timeout=10_000)
    page.locator(".searchbar input").focus()
    n_cancel = page.evaluate("window.__calls.filter(c => c.cmd === 'cancel_search').length")
    page.keyboard.press("Escape")
    page.wait_for_function("document.querySelectorAll('.searchbar').length === 0")
    check("chiudere la barra ferma la ricerca ancora in corso (cancel_search sul canale del tab)",
          eventually(f"window.__calls.filter(c => c.cmd === 'cancel_search').length > {n_cancel}")
          and page.evaluate("window.__calls.filter(c => c.cmd === 'cancel_search').slice(-1)[0].args.channel") == calls()[-1]["channel"])
    check("Esc chiude la barra, toglie i segni e rida il focus al riquadro cercato",
          marks("left").count() == 0 and page.evaluate("document.activeElement.className") == "pane left")
    page.keyboard.press("Control+f")
    page.wait_for_selector(".searchbar")
    check("Ctrl+F riapre la barra con il testo di prima", page.locator(".searchbar input").input_value() == "return")
    page.locator(".view-switch .seg-btn", has_text="Unificato").first.click()
    page.wait_for_selector(".pane.unified .vrow")
    check("nella vista Unificato la barra si chiude e Ctrl+F non la apre", page.locator(".searchbar").count() == 0)
    page.keyboard.press("Control+f")
    page.wait_for_timeout(300)
    check("(Unificato) Ctrl+F non apre la ricerca", page.locator(".searchbar").count() == 0)
    check("nessun errore in console (ricerca)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Pannello della riga selezionata ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    panel = page.locator(".linepanel")

    def click_row(i, side="right"):
        page.evaluate(f"document.querySelector('.pane.right').scrollTop = {max(0, i * 20 - 100)}")
        page.wait_for_timeout(250); settled(page)
        page.locator(f'.pane.{side} .vrow[style*="top: {i * 20}px"]').click()

    check("il pannello c'è subito, con un invito a selezionare una riga", panel.count() == 1 and "Seleziona una riga" in panel.inner_text())
    h0 = panel.evaluate("e => e.getBoundingClientRect().height")
    click_row(76)
    lines = panel.locator(".lp-line")
    check("dopo il clic mostra due righe, sinistra sopra e destra sotto", lines.count() == 2
          and lines.nth(0).get_attribute("data-side") == "left" and lines.nth(1).get_attribute("data-side") == "right")
    check("l'altezza del pannello non cambia", abs(panel.evaluate("e => e.getBoundingClientRect().height") - h0) < 1)
    rt = page.locator('.pane.right .vrow[style*="top: 1520px"] .code').inner_text()
    pt = lines.nth(1).locator(".lp-text").inner_text()
    check("la riga di destra è quella cliccata, con spazi come puntini e segno di fine riga",
          pt.endswith("¶") and pt[:-1] == rt.replace(" ", "·").replace("\t", "→   "), f"{rt!r} / {pt!r}")
    check("la tabulazione iniziale è una freccia che arriva alla colonna successiva", pt.startswith("→   let"), pt)
    check("il numero di riga è mostrato", lines.nth(1).locator(".lp-num").inner_text() == "77")
    check("la riga modificata ha le parti diverse evidenziate nei due testi", lines.nth(0).locator("mark.ie").count() == 1 and lines.nth(1).locator("mark.ie").count() == 1)
    # row present on one side only: the other side is empty
    click_row(167, "left")
    lines = panel.locator(".lp-line")
    check("riga solo a sinistra: il lato destro è una riga vuota", lines.nth(1).locator(".lp-text").inner_text() == ""
          and lines.nth(1).locator(".lp-num").inner_text() == "" and lines.nth(0).locator(".lp-text").inner_text() != "")
    check("riga solo a sinistra: la sinistra ha il colore delle eliminazioni", "del" in lines.nth(0).get_attribute("class"))
    # the selection outside the window stays in the pane
    before = lines.nth(0).locator(".lp-text").inner_text()
    page.evaluate("document.querySelector('.pane.right').scrollTop = 30000")
    page.wait_for_timeout(300); settled(page)
    check("scorrendo via, il pannello conserva la riga selezionata", panel.locator(".lp-line").nth(0).locator(".lp-text").inner_text() == before)
    page.locator('.pane.left').focus()
    page.keyboard.press("Home")
    page.wait_for_timeout(300); settled(page)
    check("con le frecce il pannello segue la selezione", panel.locator(".lp-line").nth(1).locator(".lp-num").inner_text() == "1")
    # a very long line scrolls inside the panel: the copy buttons stay in their own cell, to the right of the text
    page.evaluate("document.querySelectorAll('.linepanel .lp-text').forEach(e => { e.textContent = 'x'.repeat(1500) + ' fine' })")
    page.wait_for_timeout(200)
    geo = page.evaluate("""() => {
      const r = e => e.getBoundingClientRect(), sc = r(document.querySelector('.linepanel .lp-scroll'));
      return [...document.querySelectorAll('.linepanel .lp-copy')].map(b => {
        const q = r(b), el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        return { fuori: q.left >= sc.right, cliccabile: !!el && !!el.closest('.lp-copy'), dentro: q.top >= sc.top && q.bottom <= r(document.querySelector('.linepanel')).bottom };
      });
    }""")
    check("con una riga lunghissima i due bottoni di copia stanno in una cella a destra del testo, fuori dall'area che scorre, e si possono cliccare",
          len(geo) == 2 and all(g["fuori"] and g["cliccabile"] and g["dentro"] for g in geo), str(geo))
    check("nessun errore in console (pannello)", not errors, "; ".join(errors[:3]))
    page.screenshot(path=f"{SHOTS}/28_line_panel.png")
    ctx.close()

    print("== Copia di una riga nell'altro lato ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    calls_of = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(200)
    settled(page)
    lrow, rrow = page.locator(".pane.left .vrow.chg").first, page.locator(".pane.right .vrow.chg").first
    lrow.wait_for()
    idx = rrow.evaluate("e => Math.round(parseInt(e.style.top) / 20)")
    check("le righe uguali non hanno il pulsante di copia", page.locator(".pane .vrow:not(.chg):not(.del):not(.add):not(.void):not(.loading) .row-copy").count() == 0)
    check("una riga modificata ha il pulsante in tutti e due i lati, nascosto finché non ci si passa sopra",
          lrow.locator(".row-copy button").count() == 1 and rrow.locator(".row-copy button").count() == 1
          and lrow.locator(".row-copy").evaluate("e => getComputedStyle(e).opacity") == "0")
    lrow.hover()
    check("passando il mouse sulla riga il pulsante compare", lrow.locator(".row-copy").evaluate("e => getComputedStyle(e).opacity") == "1")
    lb, pb = lrow.locator(".row-copy button").bounding_box(), page.locator(".pane.left").bounding_box()
    check("il pulsante sta sul bordo interno: a destra nel riquadro sinistro, senza uscirne", lb["x"] + lb["width"] <= pb["x"] + pb["width"] + 1 and lb["x"] + lb["width"] > pb["x"] + pb["width"] - 40, f"{lb} {pb}")
    rb, qb = rrow.locator(".row-copy button").bounding_box(), page.locator(".pane.right").bounding_box()
    check("e a sinistra nel riquadro destro", rb["x"] >= qb["x"] - 1 and rb["x"] < qb["x"] + 40, f"{rb} {qb}")
    lrow.locator(".row-copy button").click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'merge_row')")
    c = calls_of("merge_row")[-1]
    check("un clic sulla freccia del lato sinistro copia quella riga a destra", c["row"] == idx and c["direction"] == "leftToRight", str(c))
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length >= 1")
    check("dopo la copia Annulla si attiva", page.locator('.dirbar button[aria-label="Annulla"]').is_enabled())
    settled(page)
    rrow.hover()
    rrow.locator(".row-copy button").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'merge_row').length === 2")
    c = calls_of("merge_row")[-1]
    check("la freccia del lato destro copia la riga a sinistra", c["row"] == idx and c["direction"] == "rightToLeft", str(c))
    settled(page)
    lrow.click(button="right")
    items = [i.strip() for i in page.locator(".ctx-menu button").all_inner_texts()]
    check("il menu del tasto destro ha «Copia la riga a destra» (non a sinistra) sul riquadro sinistro", "Copia la riga a destra" in items and "Copia la riga a sinistra" not in items, str(items))
    page.locator(".ctx-menu button", has_text="Copia la riga a destra").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'merge_row').length === 3")
    check("la voce del menu copia la riga", calls_of("merge_row")[-1]["direction"] == "leftToRight")
    settled(page)
    rrow.click(button="right")
    items = [i.strip() for i in page.locator(".ctx-menu button").all_inner_texts()]
    check("sul riquadro destro la voce è «Copia la riga a sinistra»", "Copia la riga a sinistra" in items and "Copia la riga a destra" not in items, str(items))
    page.keyboard.press("Escape")
    # a block of rows: select with the pointer in the left pane, a button next to "Copy" copies it to the right
    page.evaluate("window.getSelection().removeAllRanges()")
    top = int(page.evaluate("document.querySelector('.pane.left').scrollTop") // 20) + 2   # rows really in view, not the overscan
    lrow = lambda k: page.locator(f'.pane.left .vrow[data-row="{top + k}"]')
    page.evaluate("document.querySelectorAll('.pane').forEach(p => { p.scrollLeft = 0; })")
    drag = lambda r0, c0, r1, c1: (
        page.mouse.move(pane_box["x"] + c0, lrow(r0).bounding_box()["y"] + 10),
        page.mouse.down(),
        page.mouse.move(pane_box["x"] + c1, lrow(r1).bounding_box()["y"] + 10, steps=8),
        page.mouse.up(),
    )
    pane_box = page.locator(".pane.left").bounding_box()
    drag(0, 110, 3, 220)
    page.wait_for_selector(".pane.left .pane-copy-range")
    rng = page.locator(".pane.left .pane-copy-range")
    first_row, last_row = top, top + 3
    check("selezionando più righe in un riquadro compare, accanto a «Copia», il pulsante col numero di righe",
          rng.inner_text().strip() == "4" and "Copia le 4 righe selezionate a destra" in rng.get_attribute("title") and page.locator(".pane.right .pane-copy-range").count() == 0,
          f"{rng.inner_text()!r} {rng.get_attribute('title')!r}")
    page.screenshot(path=f"{SHOTS}/copy_rows_button.png")
    rng.click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'merge_rows')")
    c = calls_of("merge_rows")[-1]
    check("il pulsante copia il blocco a destra, dalla prima all'ultima riga toccata", c["first"] == first_row and c["last"] == last_row and c["direction"] == "leftToRight", str(c))
    settled(page)
    page.evaluate("window.getSelection().removeAllRanges()")
    drag(0, 110, 2, 220)
    page.mouse.click(pane_box["x"] + 150, lrow(2).bounding_box()["y"] + 10, button="right")
    page.wait_for_selector(".ctx-menu")
    items = [x.strip() for x in page.locator(".ctx-menu button").all_inner_texts()]
    check("il menu del tasto destro sulla selezione propone di copiare le righe a destra", "Copia le 3 righe selezionate a destra" in items, str(items))
    page.locator(".ctx-menu button", has_text="righe selezionate a destra").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'merge_rows').length === 2")
    check("e la voce copia il blocco", calls_of("merge_rows")[-1]["direction"] == "leftToRight")
    settled(page)
    # a single row: the arrow of the row is enough, there is no block button
    page.evaluate("window.getSelection().removeAllRanges()")
    drag(0, 110, 0, 170)
    page.wait_for_timeout(200)
    check("con la selezione dentro una sola riga non c'è il pulsante del blocco", page.locator(".pane-copy-range").count() == 0)
    solo = page.locator(".pane.right .vrow.add").first
    if solo.count():
        solo.hover()
        check("una riga solo a destra ha il pulsante a destra, non a sinistra",
              solo.locator(".row-copy button").count() == 1 and page.locator(".pane.left .vrow.void").first.locator(".row-copy button").count() == 0)
    check("nessun errore in console (copia di una riga)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Copia di una riga nella vista unificata ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    calls_of = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    page.locator('.view-switch .seg-btn', has_text="Unificato").first.click()
    page.wait_for_selector(".pane.unified .vrow")
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(300)
    page.wait_for_timeout(200)
    rem, add = page.locator(".pane.unified .vrow.del").first, page.locator(".pane.unified .vrow.add").first
    rem.wait_for()
    at = lambda r: int(r.evaluate("e => Math.round(parseInt(e.style.top) / 20)"))
    want = lambda i: page.evaluate("(i) => Object.values(window.__open)[0].unified[i].row", i)
    check("le righe uguali della vista unificata non hanno il pulsante di copia",
          page.locator(".pane.unified .vrow:not(.del):not(.add):not(.loading) .row-copy").count() == 0)
    rem.hover()
    check("una riga tolta ha il pulsante, sul bordo destro del pannello unico",
          rem.locator(".row-copy button").count() == 1 and rem.locator(".row-copy").evaluate("e => getComputedStyle(e).opacity") == "1"
          and rem.locator(".row-copy button").get_attribute("aria-label") == "Copia questa riga a destra")
    ub, pb = rem.locator(".row-copy button").bounding_box(), page.locator(".pane.unified").bounding_box()
    check("e sta dentro il pannello, a destra", ub["x"] + ub["width"] <= pb["x"] + pb["width"] + 1 and ub["x"] > pb["x"] + pb["width"] / 2, f"{ub} {pb}")
    i = at(rem)
    rem.locator(".row-copy button").click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'merge_row')")
    c = calls_of("merge_row")[-1]
    check("la riga tolta (sinistra) si copia a destra, con la riga del confronto affiancato", c["direction"] == "leftToRight" and c["row"] == want(i), f"{c} {want(i)}")
    page.wait_for_timeout(300)
    add = page.locator(".pane.unified .vrow.add").first
    add.hover()
    check("una riga aggiunta ha la freccia verso sinistra", add.locator(".row-copy button").get_attribute("aria-label") == "Copia questa riga a sinistra")
    j = at(add)
    add.locator(".row-copy button").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'merge_row').length === 2")
    c = calls_of("merge_row")[-1]
    check("la riga aggiunta (destra) si copia a sinistra", c["direction"] == "rightToLeft" and c["row"] == want(j), f"{c} {want(j)}")
    page.wait_for_timeout(300)
    page.locator(".pane.unified .vrow.add").first.click(button="right", position={"x": 150, "y": 8})
    page.wait_for_selector(".ctx-menu")
    items = [x.strip() for x in page.locator(".ctx-menu button").all_inner_texts()]
    check("il menu del tasto destro su una riga aggiunta ha «Copia la riga a sinistra»", "Copia la riga a sinistra" in items and "Copia la riga a destra" not in items, str(items))
    page.keyboard.press("Escape")
    check("nessun errore in console (copia di una riga, vista unificata)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Modifica diretta delle righe ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    calls_of = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(200)
    settled(page)
    row = page.locator(".pane.right .vrow.chg").first
    row.wait_for()
    num = int(row.locator(".num").inner_text())
    old = row.locator(".code").inner_text()
    row.locator(".num").dblclick()
    inp = page.locator(".pane.right input.line-edit")
    check("doppio clic: la riga diventa un campo col suo testo", inp.count() == 1 and inp.input_value() == old, old)
    page.keyboard.press("Escape")
    check("Esc annulla senza chiamare il core", page.locator("input.line-edit").count() == 0 and not calls_of("edit_lines"))
    row.locator(".num").dblclick()
    page.keyboard.press("Enter")
    check("Invio senza cambiare il testo non chiama il core", page.locator("input.line-edit").count() == 0 and not calls_of("edit_lines"))
    row.locator(".num").dblclick()
    page.locator("input.line-edit").fill("testo nuovo")
    page.keyboard.press("Enter")
    page.wait_for_function("window.__calls.some(c => c.cmd === 'edit_lines')")
    c = calls_of("edit_lines")[-1]
    check("Invio: edit_lines sostituisce la riga a destra", c["side"] == "right" and c["start"] == num - 1 and c["remove"] == 1 and c["lines"] == ["testo nuovo"], str(c))
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 1")
    check("dopo la modifica il lato risulta modificato e Annulla si attiva", page.locator('.dirbar button[aria-label="Annulla"]').is_enabled())
    settled(page)
    # click elsewhere confirms
    row.locator(".num").dblclick()
    page.locator("input.line-edit").fill("altro testo")
    page.locator(".tabpage:not([hidden]) .summary").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'edit_lines').length === 2")
    check("un clic altrove conferma la modifica", calls_of("edit_lines")[-1]["lines"] == ["altro testo"])
    settled(page)
    # Ctrl+Enter: confirms and opens a new row below
    page.evaluate("(r) => { window.__locateRow = r; }", row.evaluate("e => Math.round(parseInt(e.style.top) / 20) + 1"))
    row.locator(".num").dblclick()
    page.locator("input.line-edit").fill("prima")
    page.keyboard.press("Control+Enter")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'edit_lines').length === 3")
    c = calls_of("edit_lines")[-1]
    check("Ctrl+Invio: sostituisce la riga con due (testo e riga vuota)", c["start"] == num - 1 and c["remove"] == 1 and c["lines"] == ["prima", ""], str(c))
    loc = calls_of("locate_line")[-1]
    check("Ctrl+Invio: cerca la riga nuova e la mette in modifica", loc["side"] == "right" and loc["number"] == num + 1
          and page.locator(".pane.right input.line-edit").count() == 1 and page.locator(".pane.right input.line-edit").input_value() == "", str(loc))
    page.keyboard.press("Escape")
    settled(page)
    # Ctrl+Del deletes the row
    row.locator(".num").dblclick()
    page.keyboard.press("Control+Delete")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'edit_lines').length === 4")
    c = calls_of("edit_lines")[-1]
    check("Ctrl+Canc: elimina la riga", c["remove"] == 1 and c["lines"] == [] and c["start"] == num - 1, str(c))
    settled(page)
    # empty row (void): insertion
    void = page.locator(".pane.left .vrow.void").first
    if void.count():
        void.dblclick()
        inp = page.locator(".pane.left input.line-edit")
        check("riga vuota: doppio clic apre un campo per inserire", inp.count() == 1 and inp.input_value() == "")
        inp.fill("inserita")
        page.keyboard.press("Enter")
        page.wait_for_function("window.__calls.filter(c => c.cmd === 'edit_lines').length === 5")
        c = calls_of("edit_lines")[-1]
        check("inserimento: remove 0 sul lato sinistro", c["side"] == "left" and c["remove"] == 0 and c["lines"] == ["inserita"], str(c))
    # menu of the row: insert and delete without knowing the keyboard shortcuts
    settled(page)
    check("il suggerimento del riquadro modificabile cita Ctrl+Invio e Ctrl+Canc",
          "Ctrl+Invio" in (page.locator(".pane.right").get_attribute("title") or "") and "Ctrl+Canc" in (page.locator(".pane.right").get_attribute("title") or ""))
    nedits = len(calls_of("edit_lines"))
    row.locator(".num").click(button="right")
    items = [i.strip() for i in page.locator(".ctx-menu button").all_inner_texts()]
    check("il menu di una riga modificabile ha Inserisci sotto, Inserisci sopra ed Elimina",
          all(x in items for x in ("Inserisci una riga sotto", "Inserisci una riga sopra", "Elimina la riga")), str(items))
    page.evaluate("(r) => { window.__locateRow = r; }", row.evaluate("e => Math.round(parseInt(e.style.top) / 20) + 1"))
    page.locator(".ctx-menu button", has_text="Inserisci una riga sotto").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'edit_lines').length === {nedits + 1}")
    c = calls_of("edit_lines")[-1]
    check("«Inserisci una riga sotto»: inserisce una riga vuota dopo quella scelta", c["side"] == "right" and c["start"] == num and c["remove"] == 0 and c["lines"] == [""], str(c))
    check("e la riga nuova si apre per scrivere", page.locator(".pane.right input.line-edit").count() == 1 and page.locator(".pane.right input.line-edit").input_value() == "")
    page.keyboard.press("Escape")
    settled(page)
    row.locator(".num").click(button="right")
    page.locator(".ctx-menu button", has_text="Inserisci una riga sopra").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'edit_lines').length === {nedits + 2}")
    c = calls_of("edit_lines")[-1]
    check("«Inserisci una riga sopra»: la inserisce prima di quella scelta", c["start"] == num - 1 and c["remove"] == 0 and c["lines"] == [""], str(c))
    page.keyboard.press("Escape")
    settled(page)
    row.locator(".num").click(button="right")
    page.locator(".ctx-menu button", has_text="Elimina la riga").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'edit_lines').length === {nedits + 3}")
    c = calls_of("edit_lines")[-1]
    check("«Elimina la riga»: toglie quella riga", c["start"] == num - 1 and c["remove"] == 1 and c["lines"] == [], str(c))
    settled(page)
    gap = page.locator(".pane.right .vrow.void").first
    if gap.count():
        gap.locator(".num").click(button="right")
        items = [i.strip() for i in page.locator(".ctx-menu button").all_inner_texts()]
        check("su una riga vuota il menu offre «Inserisci una riga qui» e non Elimina", "Inserisci una riga qui" in items and "Elimina la riga" not in items, str(items))
        page.keyboard.press("Escape")
    check("nessun errore in console (modifica righe)", not errors, "; ".join(errors[:3]))
    page.screenshot(path=f"{SHOTS}/25_edit_line.png")
    ctx.close()

    print("== Merge a blocchi (risposte registrate dal core) ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "merge.json")
    n0 = int(counter(page).split()[0])
    btn = lambda name: page.locator(f'.dirbar button:has-text("{name}"), .dirbar button[aria-label="{name}"]')
    side_save = lambda i: page.locator(f".file-meta span:nth-child({i}) .meta-save")   # "Save" of a single file, next to "modified"
    check("senza selezione le copie sono disattivate", btn("Applica a dx").is_disabled() and btn("Applica a sx").is_disabled())
    check("senza modifiche: Salva e Annulla disattivati", all(btn(n).is_disabled() for n in ("Salva", "Annulla")) and side_save(1).count() == 0 and side_save(2).count() == 0)
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(150)
    check("dopo la selezione le copie si attivano", btn("Applica a dx").is_enabled() and btn("Applica a sx").is_enabled())

    def calls_of(cmd):
        return page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", cmd)

    dirty = lambda i: page.locator(f".file-meta span:nth-child({i}) .dirty").count()
    btn("Applica a dx").click()
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 1")
    check("il tab segnala le modifiche non salvate", page.locator('.doctab.active .dirty').count() == 1)
    settled(page)
    c = calls_of("merge_hunk")
    check("merge_hunk: blocco 0, da sinistra a destra", len(c) == 1 and c[0]["hunk"] == 0 and c[0]["direction"] == "leftToRight", str(c))
    check("il lato destro risulta modificato, il sinistro no", dirty(2) == 1 and dirty(1) == 0)
    page.locator(".tabpage:not([hidden]) .dirbar").screenshot(path=f"{SHOTS}/toolbar_merge_dirty.png")
    page.locator(".file-meta").screenshot(path=f"{SHOTS}/file_meta_dirty.png")
    check("dopo l'unione la differenza copiata sparisce", counter(page) == f"Differenza 1 di {n0 - 1}", counter(page))
    check("Salva e Annulla attivi; «Salva» per lato solo sul file modificato (destra)", btn("Salva").is_enabled() and btn("Annulla").is_enabled() and side_save(2).count() == 1 and side_save(1).count() == 0)
    page.wait_for_selector(".pane.right .vrow.current", timeout=3000)
    cur = page.evaluate(CURRENT)
    check("la differenza che prende il posto è visibile", cur is not None and cur["visible"], str(cur))
    page.screenshot(path=f"{SHOTS}/14_merged.png")

    side_save(2).click()
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 0")
    check("save_side: lato destro", calls_of("save_side")[-1]["side"] == "right", str(calls_of("save_side")))
    check("dopo il salvataggio Salva si disattiva e il «Salva» del lato sparisce", btn("Salva").is_disabled() and side_save(2).count() == 0)

    page.keyboard.press("Alt+ArrowLeft")
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 1")
    settled(page)
    c = calls_of("merge_hunk")[-1]
    check("Alt+← copia da destra a sinistra", c["direction"] == "rightToLeft" and c["hunk"] == 0, str(c))
    check("ora è modificato il lato sinistro", dirty(1) == 1 and dirty(2) == 0)
    check("contatore dopo la seconda unione", counter(page) == f"Differenza 1 di {n0 - 2}", counter(page))

    page.keyboard.press("Control+s")
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 0")
    check("Ctrl+S salva il lato modificato (sinistro)", calls_of("save_side")[-1]["side"] == "left" and len(calls_of("save_side")) == 2)
    n_saves = len(calls_of("save_side"))
    page.keyboard.press("Control+s")
    page.wait_for_timeout(200)
    check("Ctrl+S senza modifiche non salva nulla", len(calls_of("save_side")) == n_saves)

    page.keyboard.press("Control+z")
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 1")
    settled(page)
    check("Ctrl+Z chiama undo_merge", len(calls_of("undo_merge")) == 1)
    check("l'annullamento riseleziona la differenza ripristinata", counter(page) == f"Differenza 1 di {n0 - 1}", counter(page))
    check("c'è ancora un'altra unione da annullare", btn("Annulla").is_enabled())
    cur = page.evaluate(CURRENT)
    check("la differenza ripristinata è visibile", cur is not None and cur["visible"], str(cur))

    # Ctrl+Z inside a text field does not undo the merges
    page.fill('input[aria-label="Sinistra"]', "/x/a.txt")
    page.focus('input[aria-label="Sinistra"]')
    page.keyboard.press("Control+z")
    page.wait_for_timeout(150)
    check("Ctrl+Z in un campo di testo non chiama undo_merge", len(calls_of("undo_merge")) == 1)

    # save error: shown and nothing changes
    page.evaluate("window.__failNext = 'impossibile salvare /x/a.txt: disco pieno'")
    side_save(1).click()
    page.wait_for_selector(".error", timeout=5000)
    check("errore di salvataggio mostrato", "disco pieno" in page.inner_text(".error"), page.inner_text(".error"))
    check("dopo l'errore il file resta segnato come modificato", dirty(1) == 1 and side_save(1).is_enabled() and btn("Salva").is_enabled())

    # new comparison with unsaved changes: it asks for confirmation
    page.fill('input[aria-label="Destra"]', "/x/b.txt")
    n_cmp = len(calls_of("compare_files"))
    page.evaluate("window.__confirmAnswer = false")
    page.click('button[type="submit"]')
    try:  # the message arrives after an asynchronous click: we wait instead of trusting a fixed time
        page.wait_for_function("window.__dialogs.length >= 1", timeout=5_000)
    except Exception:
        pass
    dialogs = page.evaluate("window.__dialogs")
    check("conferma richiesta prima di scartare", len(dialogs) == 1 and dialogs[0]["buttons"]["OkCancelCustom"][0] == "Scarta", str(dialogs))
    check("annullando la conferma non si confronta di nuovo", len(calls_of("compare_files")) == n_cmp)
    check("le modifiche sono ancora lì", dirty(1) == 1)
    old_ids = page.evaluate("Object.keys(window.__open)")
    page.evaluate("window.__confirmAnswer = true")
    page.click('button[type="submit"]')
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 0", timeout=10_000)
    settled(page)
    check("confermando si ripete il confronto", len(calls_of("compare_files")) == n_cmp + 1)
    check("il confronto con le modifiche scartate viene liberato", page.evaluate("Object.keys(window.__open)") != old_ids and len(page.evaluate("Object.keys(window.__open)")) == 1)
    check("nuovo confronto: riparte dall'inizio, nessuna selezione", counter(page).endswith("differenze"), counter(page))
    check("nessun errore in console (merge)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Menu Modifica (comandi del tab in primo piano) ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "merge.json")
    calls_of = lambda cmd: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", cmd)

    def edit_menu():
        """Opens Edit and returns {label: disabled}; the menu stays open."""
        page.click('.menu-title:has-text("Modifica")')
        return dict(page.evaluate("() => [...document.querySelectorAll('.menu-panel button')].map(b => [b.querySelector('.menu-label').textContent, b.disabled])"))

    items = edit_menu()
    check("Modifica, senza selezione: Annulla e Applica spenti, Cerca attivo",
          items == {"Annulla": True, "Cerca…": False, "Applica la differenza a destra": True, "Applica la differenza a sinistra": True}, str(items))
    page.screenshot(path=f"{SHOTS}/menu_edit.png", clip={"x": 0, "y": 0, "width": 700, "height": 260})
    check("le scorciatoie sono scritte accanto alle voci",
          page.locator(".menu-panel .menu-shortcut").all_inner_texts() == ["Ctrl+Z", "Ctrl+F", "Alt+→", "Alt+←"])
    page.click('.menu-panel button:has-text("Cerca…")')
    page.wait_for_selector(".searchbar")
    check("Modifica > Cerca… apre la barra di ricerca, col focus nel campo e il menu chiuso",
          page.locator(".menu-panel").count() == 0 and page.evaluate("document.activeElement === document.querySelector('.searchbar input')"))
    page.keyboard.press("Escape")
    page.wait_for_function("document.querySelectorAll('.searchbar').length === 0")
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(150)
    items = edit_menu()
    check("con una differenza scelta Applica si attiva (a destra e a sinistra), Annulla resta spento",
          items["Applica la differenza a destra"] is False and items["Applica la differenza a sinistra"] is False and items["Annulla"] is True, str(items))
    page.click('.menu-panel button:has-text("Applica la differenza a destra")')
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 1")
    settled(page)
    c = calls_of("merge_hunk")
    check("Modifica > Applica a destra fa la stessa unione del pulsante (merge_hunk, da sinistra a destra)",
          len(c) == 1 and c[0]["direction"] == "leftToRight", str(c))
    items = edit_menu()
    check("dopo l'unione Annulla è attivo (lo stato è letto all'apertura del menu)", items["Annulla"] is False, str(items))
    page.click('.menu-panel button:has-text("Annulla")')
    page.wait_for_function("window.__calls.some(c => c.cmd === 'undo_merge')")
    check("Modifica > Annulla chiama undo_merge e chiude il menu", len(calls_of("undo_merge")) == 1 and page.locator(".menu-panel").count() == 0)
    check("nessun errore in console (menu Modifica)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ minor differences
    print("== Differenze minori («≈») ==")
    ctx, page, errors = open_page(browser, kind="dirs")
    CAUSE = "{eol:true,encoding:false,trailingSpace:false,whitespace:false,case:false}"
    page.evaluate("window.__dirMinor = {'d000/f00037.txt': %s, 'd001/f00111.txt': %s}" % (CAUSE, CAUSE))
    page.fill('input[aria-label="Sinistra"]', "/x/l")
    page.fill('input[aria-label="Destra"]', "/x/r")
    page.click('button[type="submit"]')
    page.wait_for_selector(".dir-body .vl-row", timeout=60_000)
    summary = page.locator(".toolbar .summary").first.inner_text()

    ds = page.locator(".tabpage:not([hidden]) .toolbar .dir-pills")
    pill = lambda k: " ".join(ds.locator(f".stat.{k}").inner_text().split())
    check("il riepilogo delle cartelle ha una pillola per stato con le parole, e le identiche",
          ds.count() == 1 and pill("changed").startswith("537 diversi") and "2 minori" in pill("changed") and pill("leftOnly").endswith("solo a sinistra") and pill("rightOnly").endswith("solo a destra") and pill("identical").endswith("identici"), pill("changed"))
    dots = ds.evaluate("e => ['changed','leftOnly','rightOnly','identical'].map(k => getComputedStyle(e.querySelector('.stat.' + k + ' .dot')).backgroundColor)")
    words = ds.evaluate("e => ['leftOnly','rightOnly','identical'].map(k => getComputedStyle(e.querySelector('.stat.' + k)).color)")
    check("le parole delle pillole sono tutte attenuate (nessun rosso o verde del riepilogo dei file)", len(set(words)) == 1, str(words))
    check("i pallini hanno quattro tinte diverse", len(set(dots)) == 4, str(dots))
    check("nel confronto di cartelle non c'è la barra proporzionale (come nell'immagine di riferimento)", ds.locator(".summary-bar").count() == 0)
    ph = ds.locator(".stat.leftOnly").bounding_box()["height"]
    nf = page.locator(".tabpage:not([hidden]) .name-filter").bounding_box()["height"]
    check("le pillole sono alte come il campo del filtro (32 px), che ha la lente a sinistra e il numero in evidenza",
          round(ph) == 32 and round(nf) == 32 and page.locator(".tabpage:not([hidden]) .name-filter-wrap svg").count() == 1
          and ds.locator(".stat.leftOnly strong").evaluate("e => getComputedStyle(e).color") != ds.locator(".stat.leftOnly").evaluate("e => getComputedStyle(e).color"), f"{ph} {nf}")
    mk = page.locator(".tabpage:not([hidden]) .dir-row.different .mark-badge").first
    check("nella colonna centrale i diversi hanno l'etichetta con sfondo leggero", mk.count() == 1 and mk.evaluate("e => getComputedStyle(e).backgroundColor") != "rgba(0, 0, 0, 0)")
    ident = page.locator(".tabpage:not([hidden]) .dir-row.identical .mark-badge").first
    check("e «=» è grigio e senza sfondo", ident.count() == 0 or ident.evaluate("e => getComputedStyle(e).backgroundColor") == "rgba(0, 0, 0, 0)")
    page.locator(".tabpage:not([hidden]) .toolbar").first.screenshot(path=f"{SHOTS}/dir_summary.png")
    nc = page.evaluate("""() => {
      const col = sel => { const e = document.querySelector('.tabpage:not([hidden]) .dir-body ' + sel); return e ? getComputedStyle(e).color : null; };
      return { body: getComputedStyle(document.querySelector('.tabpage:not([hidden]) .dir-body')).color, ident: col('.dir-row.identical .dir-name'), diff: col('.dir-row.different .dir-name'), diffSize: col('.dir-row.different .dir-size:not(.total)'), identSize: col('.dir-row.identical .dir-size'), left: col('.dir-row.leftOnly .dir-name'), right: col('.dir-row.rightOnly .dir-name') };
    }""")
    check("i nomi dei file non sono colorati dallo stato: identici e diversi hanno lo stesso colore del testo (non più grigio né rosso), e le dimensioni dei diversi non sono rosse",
          nc["ident"] == nc["diff"] == nc["body"] and (nc["diffSize"] in (None, nc["identSize"])), str(nc))
    check("restano colorati solo i nomi delle voci a un lato solo (blu a sinistra, viola a destra)",
          (nc["left"] is None or nc["left"] != nc["body"]) and (nc["right"] is None or nc["right"] != nc["body"]) and (nc["left"] is None or nc["right"] is None or nc["left"] != nc["right"]), str(nc))
    check("i suggerimenti dicono «voci» con la quota, e il minore compare in quello dei diversi",
          "voci" in ds.locator(".stat.leftOnly").get_attribute("title") and "%" in ds.locator(".stat.leftOnly").get_attribute("title") and "sole differenze minori" in ds.locator(".stat.changed").get_attribute("title"), ds.locator(".stat.changed").get_attribute("title"))
    page.get_by_role("button", name="Minori", exact=True).click()
    page.wait_for_timeout(300)
    minor_rows = page.locator(".dir-row.minor")
    check("filtro Minor: solo i due file minori (più le cartelle che li contengono)", minor_rows.count() == 2, str(minor_rows.count()))
    check("il segno dei file minori è «≈»", all(minor_rows.nth(i).locator(".dir-mark").inner_text().strip() == "\u2248" for i in range(minor_rows.count())))
    tip = minor_rows.first.get_attribute("title") or ""
    check("il suggerimento della riga dice che è minore e perché", "minori" in tip and "fine riga" in tip, tip)
    page.screenshot(path=f"{SHOTS}/dir_minor.png")
    page.get_by_role("button", name="Differenze", exact=True).click()
    page.wait_for_timeout(300)
    check("«Diffs» comprende anche le differenze minori (il primo file minore è visibile)",
          page.locator(".dir-row.different.minor").count() >= 1)
    check("nessun errore in console (differenze minori, cartelle)", not errors, "; ".join(errors[:3]))
    ctx.close()

    ctx, page, errors = open_page(browser, kind="files")
    page.evaluate("window.__fileFixture = 'small.json'")
    page.evaluate("window.__minorFile = {eol:true,encoding:false,trailingSpace:true,whitespace:false,case:false}")
    page.fill('input[aria-label="Sinistra"]', "/x/a.txt")
    page.fill('input[aria-label="Destra"]', "/x/b.txt")
    page.click('button[type="submit"]')
    page.wait_for_selector(".viewer", timeout=30_000)
    note = page.locator(".minor-note")
    check("file diversi solo per cose minori: avviso con le cause",
          note.count() == 1 and "solo per cose minori" in note.inner_text() and "fine riga, spazi a fine riga" in note.inner_text(),
          note.inner_text() if note.count() else "nessun avviso")
    page.screenshot(path=f"{SHOTS}/file_minor.png")
    page.evaluate("window.__minorFile = null")
    page.click('button[type="submit"]')
    page.wait_for_timeout(500)
    check("senza differenze minori nessun avviso", page.locator(".minor-note").count() == 0)
    check("nessun errore in console (differenze minori, file)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Confronto approssimato ==")
    ctx, page, errors = open_page(browser, kind="files")
    page.evaluate("window.__fileFixture = 'small.json'")
    page.evaluate("window.__approximate = true")
    page.fill('input[aria-label="Sinistra"]', "/x/a.txt")
    page.fill('input[aria-label="Destra"]', "/x/b.txt")
    page.click('button[type="submit"]')
    page.wait_for_selector(".viewer", timeout=30_000)
    note = page.locator(".approximate-note")
    check("confronto approssimato: avviso sotto la barra, con la spiegazione nel tooltip",
          note.count() == 1 and "Confronto approssimato" in note.inner_text() and "più righe del minimo" in (note.get_attribute("title") or ""),
          note.inner_text() if note.count() else "nessun avviso")
    page.screenshot(path=f"{SHOTS}/file_approximate.png")
    page.evaluate("window.__approximate = false")
    page.click('button[type="submit"]')
    page.wait_for_timeout(500)
    check("confronto normale: nessun avviso di approssimazione", page.locator(".approximate-note").count() == 0)
    check("nessun errore in console (confronto approssimato)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Inserire una riga dove il lato non ne ha ==")
    ctx, page, errors = open_page(browser)
    run_files(page, "small.json")
    h = page.evaluate("window.__fx['small.json'].opened.hunks[17]")
    page.evaluate(f"document.querySelector('.pane.right').scrollTop = {h['start']} * 20 - 200")
    page.wait_for_timeout(400); settled(page)
    cell = page.locator(f'.pane.left .vrow[style*="top: {h["start"] * 20}px"]')
    cell.dblclick()
    page.locator("input.line-edit").fill("riga nuova")
    page.keyboard.press("Enter")
    page.wait_for_function("window.__calls.some(c => c.cmd === 'edit_lines')")
    c = page.evaluate("window.__calls.filter(c => c.cmd === 'edit_lines')[0].args")
    check("la riga si inserisce dove dice il blocco (leftAt)", c["side"] == "left" and c["start"] == h["leftAt"] and c["remove"] == 0 and c["lines"] == ["riga nuova"], f"{c} / {h}")
    ctx.close()

    print("== Allineamento manuale ==")
    ctx, page, errors = open_page(browser)
    calls_of = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    run_files(page, "small.json")
    pane = lambda side: page.locator(f".pane.{side} .vrow")
    num = lambda side, i: pane(side).nth(i).locator(".num").inner_text()
    menu_items = lambda: page.locator(".ctx-menu button").all_inner_texts()
    l1, r2 = num("left", 0), num("right", 1)
    pane("left").nth(0).click(button="right")
    page.wait_for_selector(".ctx-menu")
    items = menu_items()
    check("il clic destro apre il menu contestuale con «Segna…»", any(t.startswith(f"Segna la riga {l1} (sinistra)") for t in items), str(items))
    check("senza riga segnata non c'è «Allinea con»", not any(t.startswith("Allinea con") for t in items))
    check("e senza allineamenti non c'è nulla da rimuovere", not any("Rimuovi" in t for t in items))
    settled(page); page.evaluate("document.querySelector('.pane.right').scrollLeft = 0"); page.wait_for_timeout(300)
    page.screenshot(path=f"{SHOTS}/25_context_menu.png", clip={"x": 0, "y": 230, "width": 1280, "height": 140})
    page.keyboard.press("Escape")
    check("Esc chiude il menu", page.locator(".ctx-menu").count() == 0)
    pane("left").nth(0).click(button="right")
    page.click('.ctx-menu button:has-text("Segna la riga")')
    check("la riga segnata ha il contorno tratteggiato", pane("left").locator(".marked").count() == 0 and page.locator(".pane.left .vrow.marked").count() == 1)
    check("compare l'avviso con il numero della riga", f"Riga {l1} di sinistra segnata" in page.inner_text(".align-hint"), page.inner_text(".align-hint"))
    pane("right").nth(1).click(button="right")
    page.wait_for_selector(".ctx-menu")
    items = menu_items()
    check("a destra il menu propone «Allinea con la riga N di sinistra»", f"Allinea con la riga {l1} di sinistra" in items, str(items))
    page.click(f'.ctx-menu button:has-text("Allinea con la riga {l1} di sinistra")')
    page.wait_for_function("window.__calls.some(c => c.cmd === 'align_lines')")
    c = calls_of("align_lines")[-1]
    check("align_lines riceve i due numeri di riga", c["left"] == int(l1) and c["right"] == int(r2), str(c))
    page.wait_for_function("document.querySelectorAll('.pane.left .vrow.aligned').length === 1")
    check("la riga allineata è segnata in entrambi i pannelli", page.locator(".pane.right .vrow.aligned").count() == 1)
    check("e l'avviso e la riga segnata spariscono", page.locator(".align-hint").count() == 0 and page.locator(".vrow.marked").count() == 0)
    pane("left").nth(6).click(); settled(page); page.evaluate("document.querySelector('.pane.right').scrollLeft = 0"); page.wait_for_timeout(300)
    page.screenshot(path=f"{SHOTS}/26_aligned_row.png", clip={"x": 0, "y": 230, "width": 1280, "height": 140})
    # the menu on an aligned row offers to remove it
    page.locator(".pane.left .vrow.aligned").first.click(button="right")
    page.wait_for_selector(".ctx-menu")
    items = menu_items()
    check("sulla riga allineata: «Rimuovi questo allineamento» e «Rimuovi tutti (1)»",
          "Rimuovi questo allineamento" in items and "Rimuovi tutti gli allineamenti (1)" in items, str(items))
    page.keyboard.press("Escape")
    # an alignment that crosses is rejected and the reason can be read
    pane("left").nth(2).click(button="right")
    page.click('.ctx-menu button:has-text("Segna la riga")')
    pane("right").nth(0).click(button="right")
    page.click('.ctx-menu button:has-text("Allinea con la riga")')
    page.wait_for_selector(".error")
    check("un incrocio è rifiutato con il motivo", "incrocia" in page.inner_text(".error"), page.inner_text(".error"))
    check("e l'allineamento di prima resta", page.locator(".pane.left .vrow.aligned").count() == 1)
    # Refresh and Swap keep the alignments
    tbn = lambda name: page.locator(f'.tabpage:not([hidden]) .dirbar button:has-text("{name}")').first
    n = len(calls_of("compare_files"))
    page.locator('.tabpage:not([hidden]) .dirbar button[aria-label="Refresh"]').click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'compare_files').length > {n}")
    check("Refresh passa gli allineamenti al nuovo confronto", calls_of("compare_files")[-1]["aligns"] == [[int(l1), int(r2)]], str(calls_of("compare_files")[-1].get("aligns")))
    settled(page)
    check("e dopo Refresh la riga è ancora allineata", page.locator(".pane.left .vrow.aligned").count() == 1)
    page.locator(".tabpage:not([hidden]) .swap-btn").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'compare_files').length > {n + 1}")
    check("Swap scambia le coppie", calls_of("compare_files")[-1]["aligns"] == [[int(r2), int(l1)]], str(calls_of("compare_files")[-1].get("aligns")))
    settled(page)
    # remove an alignment
    page.locator(".pane.left .vrow.aligned").first.click(button="right")
    page.click('.ctx-menu button:has-text("Rimuovi questo allineamento")')
    page.wait_for_function("window.__calls.some(c => c.cmd === 'unalign_lines')")
    check("unalign_lines riceve la riga di sinistra", calls_of("unalign_lines")[-1]["left"] == int(r2), str(calls_of("unalign_lines")[-1]))
    page.wait_for_function("document.querySelectorAll('.vrow.aligned').length === 0")
    # remove all
    for k in range(2):
        pane("left").nth(0).click(button="right"); page.click('.ctx-menu button:has-text("Segna la riga")')
        pane("right").nth(0).click(button="right"); page.click('.ctx-menu button:has-text("Allinea con la riga")')
        page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'align_lines').length >= {k + 2}")
        page.wait_for_function("document.querySelectorAll('.pane.left .vrow.aligned').length === 1")
        if k == 0:
            page.locator(".pane.left .vrow.aligned").first.click(button="right")
            page.click('.ctx-menu button:has-text("Rimuovi tutti gli allineamenti")')
            page.wait_for_function("window.__calls.some(c => c.cmd === 'clear_aligns')")
            page.wait_for_function("document.querySelectorAll('.vrow.aligned').length === 0")
            check("«Rimuovi tutti» chiama clear_aligns e toglie i segni", True)
    # an edit resets the alignments and says so
    pane("left").nth(3).dblclick()
    page.locator("input.line-edit").fill("modificata")
    page.keyboard.press("Enter")
    page.wait_for_function("window.__calls.some(c => c.cmd === 'edit_lines')")
    page.wait_for_selector(".align-note")
    check("una modifica azzera gli allineamenti e avvisa", "tolti" in page.inner_text(".align-note") and page.locator(".vrow.aligned").count() == 0, page.inner_text(".align-note"))
    # Esc clears the marked row
    pane("left").nth(0).click(button="right"); page.click('.ctx-menu button:has-text("Segna la riga")')
    check("riga segnata", page.locator(".vrow.marked").count() == 1)
    page.keyboard.press("Escape")
    check("Esc la toglie", page.locator(".vrow.marked").count() == 0 and page.locator(".align-hint").count() == 0)
    # a click outside closes the menu
    pane("left").nth(1).click(button="right")
    page.wait_for_selector(".ctx-menu")
    page.mouse.click(5, 300)
    check("un clic fuori chiude il menu", page.locator(".ctx-menu").count() == 0)
    check("nessun errore in console (allineamento)", not [e for e in errors if "incrocia" not in e], "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ copy without the row numbers
    print("== Copia del testo senza i numeri di riga ==")
    ctx, page, errors = open_page(browser)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    run_files(page, "small.json")
    clip = lambda: page.evaluate("navigator.clipboard.readText()")
    pane = lambda s: page.locator(f".pane.{s} .vrow")
    codes = lambda s, i, j: page.evaluate("([s, i, j]) => [...document.querySelectorAll(`.pane.${s} .vrow`)].slice(i, j).map(r => r.querySelector('.code').textContent)", [s, i, j])
    select = lambda s, a_sel, a_off, b_sel, b_off: page.evaluate(
        """([s, a, ao, b, bo]) => {
          const rows = [...document.querySelectorAll(`.pane.${s} .vrow`)];
          const node = (r, sel) => { const el = rows[r].querySelector(sel); return el.firstChild || el; };
          getSelection().setBaseAndExtent(node(a[0], a[1]), ao, node(b[0], b[1]), bo);
        }""", [s, [a_sel[0], a_sel[1]], a_off, [b_sel[0], b_sel[1]], b_off])

    # whole rows, from the text of the third to that of the sixth
    select("left", (2, ".code"), 0, (5, ".code"), len(codes("left", 5, 6)[0]))
    page.keyboard.press("Control+c")
    page.wait_for_timeout(300)
    check("copiando più righe si ottiene solo il testo, una riga per riga", clip() == "\n".join(codes("left", 2, 6)), repr(clip())[:160])

    # a selection that starts from the row number: the number does not end up on the clipboard
    select("left", (1, ".num"), 0, (3, ".code"), len(codes("left", 3, 4)[0]))
    page.keyboard.press("Control+c")
    page.wait_for_timeout(300)
    got = clip()
    check("una selezione che comprende i numeri copia comunque solo il testo", got == "\n".join(codes("left", 1, 4)), repr(got)[:160])

    # rows cut at the start and at the end
    first = codes("left", 2, 3)[0]
    last = codes("left", 5, 6)[0]
    select("left", (2, ".code"), 2, (5, ".code"), 3)
    page.keyboard.press("Control+c")
    page.wait_for_timeout(300)
    check("la prima e l'ultima riga sono tagliate dove finisce la selezione",
          len(first) > 3 and len(last) > 3 and clip() == "\n".join([first[2:], *codes("left", 3, 5), last[:3]]), repr(clip())[:160])

    # the copy icon at the top right of the pane that has the selection
    select("left", (2, ".code"), 0, (4, ".code"), len(codes("left", 4, 5)[0]))
    page.wait_for_selector(".pane.left .pane-copy-btn", timeout=3000)
    check("con del testo selezionato compare l'icona di copia nel pannello della selezione, e solo lì",
          page.locator(".pane.left .pane-copy-btn").count() == 1 and page.locator(".pane.right .pane-copy-btn").count() == 0)
    box = page.locator(".pane.left .pane-copy-btn").bounding_box()
    pbox = page.locator(".pane.left").bounding_box()
    check("sta in alto a destra del pannello", box["x"] + box["width"] > pbox["x"] + pbox["width"] - 40 and box["y"] < pbox["y"] + 40,
          f"{box} {pbox}")
    sel_before = page.evaluate("getSelection().toString()")
    page.evaluate("navigator.clipboard.writeText('vecchio')")
    page.locator(".pane.left .pane-copy-btn").click()
    page.wait_for_timeout(300)
    check("un clic sull'icona copia la selezione senza numeri, e la lascia selezionata",
          clip() == "\n".join(codes("left", 2, 5)) and page.evaluate("getSelection().toString()") == sel_before, repr(clip())[:100])
    check("e compare «Copiato»", page.locator(".copy-toast").count() == 1)
    page.evaluate("getSelection().removeAllRanges()")
    page.wait_for_timeout(250)
    check("tolta la selezione l'icona sparisce", page.locator(".pane-copy-btn").count() == 0)
    # a selection spanning the two panes is not "of one pane": no icon
    page.evaluate("""() => {
      const l = document.querySelector('.pane.left .vrow .code'); const r = document.querySelector('.pane.right .vrow .code');
      getSelection().setBaseAndExtent(l.firstChild || l, 0, r.firstChild || r, 1);
    }""")
    page.wait_for_timeout(250)
    check("una selezione a cavallo dei due pannelli non mostra l'icona", page.locator(".pane-copy-btn").count() == 0)
    page.evaluate("getSelection().removeAllRanges()")

    # the acknowledgement and the right click
    check("dopo la copia compare «Copiato»", page.locator(".copy-toast").count() == 1 and page.locator(".copy-toast").inner_text() == "Copiato")
    select("left", (2, ".code"), 0, (4, ".code"), len(codes("left", 4, 5)[0]))
    pane("left").nth(3).click(button="right")
    items = [x.strip() for x in page.locator(".ctx-menu button").all_inner_texts()]
    check("con del testo selezionato il menu del clic destro ha «Copia», in testa", items and items[0].startswith("Copia"), str(items))
    page.locator(".ctx-menu button", has_text="Copia").first.click()
    page.wait_for_timeout(300)
    check("«Copia» dal menu mette il testo negli appunti, senza numeri", clip() == "\n".join(codes("left", 2, 5)), repr(clip())[:160])

    # a right click inside a text selection does not lose it, does not move the selected row and the focus goes back to the pane
    page.keyboard.press("Escape")
    page.evaluate("getSelection().removeAllRanges()")  # a drag that starts inside a selection drags the text, it does not make a new one
    page.evaluate("document.querySelectorAll('.pane').forEach(p => { p.scrollLeft = 0; })")  # the programmatic selections from before may have scrolled the panes sideways
    a = pane("left").nth(2).locator(".code").bounding_box()
    b = pane("left").nth(4).locator(".code").bounding_box()
    page.mouse.move(a["x"] + 5, a["y"] + a["height"] / 2)
    page.mouse.down()
    page.mouse.move(b["x"] + 60, b["y"] + b["height"] / 2, steps=6)
    page.mouse.up()
    before_sel = page.evaluate("getSelection().toString()")
    selected_before = page.locator(".vrow.selected").count()
    c = pane("left").nth(3).locator(".code").bounding_box()
    page.mouse.click(c["x"] + 20, c["y"] + c["height"] / 2, button="right")
    page.wait_for_selector(".ctx-menu")
    check("il clic destro dentro la selezione la conserva", before_sel != "" and page.evaluate("getSelection().toString()") == before_sel)
    check("e non sposta la riga selezionata", page.locator(".vrow.selected").count() == selected_before)
    check("con il menu aperto il fuoco resta nel pannello (così l'evidenziazione della selezione non sparisce)",
          page.evaluate("document.activeElement.classList.contains('pane')"), page.evaluate("document.activeElement.className || document.activeElement.nodeName"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    check("chiuso il menu, il fuoco torna al pannello (le frecce funzionano ancora)",
          page.evaluate("document.activeElement.classList.contains('pane')"), page.evaluate("document.activeElement.className || document.activeElement.nodeName"))
    page.evaluate("getSelection().removeAllRanges()")

    # without a selection the menu has no "Copy"
    page.evaluate("getSelection().removeAllRanges()")
    pane("left").nth(1).click(button="right")
    items = [x.strip() for x in page.locator(".ctx-menu button").all_inner_texts()]
    check("senza testo selezionato il menu non ha «Copia»", not any(i.startswith("Copia") for i in items), str(items))
    page.keyboard.press("Escape")

    # the selection stays in the pane where it starts
    pane("left").nth(2).dispatch_event("pointerdown", {"button": 0, "pointerId": 1, "bubbles": True})
    check("al clic in un pannello l'altro non si può selezionare",
          page.locator(".viewer").get_attribute("data-select") == "left"
          and page.evaluate("getComputedStyle(document.querySelector('.pane.right')).userSelect") == "none")
    pane("right").nth(2).dispatch_event("pointerdown", {"button": 0, "pointerId": 1, "bubbles": True})
    check("e viceversa", page.locator(".viewer").get_attribute("data-select") == "right"
          and page.evaluate("getComputedStyle(document.querySelector('.pane.left')).userSelect") == "none")

    # the selected-row panel has an icon to copy the row of each side
    pane("left").nth(2).click()
    left_text = codes("left", 2, 3)[0]
    page.locator(".lp-copy").first.click()
    page.wait_for_timeout(300)
    check("l'icona nel pannello della riga copia il testo di quel lato, senza numero", clip() == left_text, repr(clip())[:120])
    # unified view: neither the two numbers nor the sign end up on the clipboard
    page.locator('.view-switch .seg-btn', has_text="Unificato").first.click()
    page.wait_for_selector(".pane.unified .vrow")
    settled(page)
    texts = page.evaluate("[...document.querySelectorAll('.pane.unified .vrow')].slice(1, 5).map(r => r.querySelector('.code').textContent)")
    page.locator(".pane.unified").focus()  # the copy starts from the element with the focus, as after a drag in the pane
    page.evaluate("""() => {
      const rows = [...document.querySelectorAll('.pane.unified .vrow')];
      const code = (i) => rows[i].querySelector('.code'); const num = rows[1].querySelector('.num');
      getSelection().setBaseAndExtent(num.firstChild || num, 0, code(4).firstChild || code(4), (code(4).textContent || '').length);
    }""")
    page.keyboard.press("Control+c")
    page.wait_for_timeout(300)
    check("nella vista unificata si copia solo il testo, senza numeri né segni", clip() == "\n".join(texts), repr(clip())[:160])
    page.wait_for_selector(".pane.unified .pane-copy-btn", timeout=3000)
    check("nella vista unificata l'icona di copia compare nell'unico pannello", page.locator(".pane.unified .pane-copy-btn").count() == 1)
    # in the unified view the right click has the same menu (before there was the browser's: the highlighting changed colour)
    page.evaluate("document.querySelectorAll('.pane').forEach(p => { p.scrollLeft = 0; })")
    page.evaluate("getSelection().removeAllRanges()")
    ua = page.locator(".pane.unified .vrow").nth(1).locator(".code").bounding_box()
    ub = page.locator(".pane.unified .vrow").nth(3).locator(".code").bounding_box()
    page.mouse.move(ua["x"] + 3, ua["y"] + ua["height"] / 2)
    page.mouse.down()
    page.mouse.move(ub["x"] + 40, ub["y"] + ub["height"] / 2, steps=6)
    page.mouse.up()
    usel = page.evaluate("getSelection().toString()")
    mid = page.locator(".pane.unified .vrow").nth(2).locator(".code").bounding_box()
    page.mouse.click(mid["x"] + 10, mid["y"] + mid["height"] / 2, button="right")
    page.wait_for_selector(".ctx-menu")
    uitems = [x.strip() for x in page.locator(".ctx-menu button").all_inner_texts()]
    check("vista unificata: con del testo selezionato il menu ha «Copia», e la selezione resta",
          uitems[:1] == ["Copia"] and all(x.startswith("Copia la riga") for x in uitems[1:]) and usel != "" and page.evaluate("getSelection().toString()") == usel, f"{uitems} {usel!r}"[:120])
    check("e il fuoco resta nel pannello", page.evaluate("document.activeElement.classList.contains('unified')"),
          page.evaluate("document.activeElement.className || document.activeElement.nodeName"))
    page.locator(".ctx-menu button", has_text="Copia").first.click()
    page.wait_for_timeout(300)
    check("«Copia» nella vista unificata mette il testo selezionato negli appunti", clip().replace("\n", "") != "" and clip() != "", repr(clip())[:80])
    page.evaluate("getSelection().removeAllRanges()")
    row_text = page.locator(".pane.unified .vrow").nth(2).locator(".code").inner_text()
    page.locator(".pane.unified .vrow").nth(2).click(button="right")
    page.wait_for_selector(".ctx-menu")
    uitems2 = [x.strip() for x in page.locator(".ctx-menu button").all_inner_texts()]
    check("senza selezione il menu unificato ha «Copia la riga»", uitems2 == ["Copia la riga"], str(uitems2))
    page.locator(".ctx-menu button").first.click()
    page.wait_for_timeout(300)
    check("«Copia la riga» copia il testo della riga e la seleziona", clip() == row_text and page.locator(".pane.unified .vrow.selected").count() == 1, repr(clip())[:80])
    check("nessun errore in console (copia)", not errors, "; ".join(errors[:3]))
    ctx.close()
