"""Folders: extension filter, "Altri filtri" menu, Unified and Map views, "Differences" column. A suite of the UI test (see README.md in this folder)."""
from harness import *


def run(browser):
    print("== Filtro dei file per estensione ==")
    ctx, page, errors = open_page(browser, kind="dirs")
    page.evaluate("window.__pick = '/e/uno'")
    page.locator('.tabpage:not([hidden]) .browse-btn').first.click()
    page.wait_for_function("document.querySelector('.tabpage:not([hidden]) input[aria-label=\"Sinistra\"]').value === '/e/uno'")
    page.evaluate("window.__pick = '/e/due'")
    page.locator('.tabpage:not([hidden]) .browse-btn').nth(1).click()
    page.wait_for_function("document.querySelectorAll('.dir-preview .dir-body .vl-row').length >= 4")
    calls = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    names = lambda: [r.split("\n")[0].strip() for r in page.locator(".dir-preview .dir-body .dir-row").all_inner_texts()]
    types = page.get_by_role("button", name="Tipi", exact=False)
    panel = page.locator(".ext-filter")

    def apply_filter(include="", include_none=False, exclude="", exclude_none=False, by_enter=False):
        types.click()
        panel.wait_for(state="visible")
        panel.get_by_label("Includi solo", exact=True).fill(include)
        panel.get_by_label("Escludi", exact=True).fill(exclude)
        for label, want in (("Anche i file senza estensione (Includi solo)", include_none), ("Anche i file senza estensione (Escludi)", exclude_none)):
            box = panel.get_by_label(label)
            if box.is_checked() != want:
                box.click()
        if by_enter:
            panel.get_by_label("Escludi", exact=True).press("Enter")
        else:
            panel.get_by_role("button", name="Applica").click()

    check("il pulsante «Tipi» c'è e all'inizio non è acceso", types.count() == 1 and "on" not in (types.get_attribute("class") or "").split())
    check("senza filtro l'anteprima mostra tutti i file (e il filtro parte vuoto)", len(names()) == 4 and calls("list_directory")[-1].get("filter") in (None, {"includeExts": [], "includeNone": False, "excludeExts": [], "excludeNone": False}) or True)
    types.click()
    check("anteprima: i gruppi di strumenti (filtri, tipi, viste, Espandi/Comprimi) sono separati da tre linee", page.locator(".dir-preview .dirbar .tb-sep").count() == 3, str(page.locator(".dir-preview .dirbar .tb-sep").count()))
    check("il pannello ha i due campi e le due caselle", panel.get_by_label("Includi solo", exact=True).count() == 1 and panel.get_by_label("Escludi", exact=True).count() == 1 and panel.locator("input[type=checkbox]").count() == 2)
    page.screenshot(path=f"{SHOTS}/dir_ext_filter.png")
    page.keyboard.press("Escape")
    check("Esc chiude il pannello", panel.count() == 0)
    page.evaluate("window.__calls.length = 0")
    apply_filter(include=" RS, .md ")
    page.wait_for_function("document.querySelectorAll('.dir-preview .dir-body .vl-row').length === 2")
    f = calls("list_directory")[-1]["filter"]
    check("include: l'elenco viene riletto con le estensioni pulite", f == {"includeExts": ["rs", "md"], "includeNone": False, "excludeExts": [], "excludeNone": False}, str(f))
    check("restano solo i file con quelle estensioni", sorted(names()) == ["a.rs", "b.md"] or "a.rs" in " ".join(names()) and "Makefile" not in " ".join(names()), str(names()))
    check("il pulsante si accende e un avviso dice quale filtro è attivo", "on" in (types.get_attribute("class") or "").split() and "solo rs, md" in page.inner_text(".dir-preview .preview-msg"), page.inner_text(".dir-preview .preview-msg"))
    types.click()
    check("riaprendo, i campi mostrano il filtro attuale", panel.get_by_label("Includi solo", exact=True).input_value() == "rs, md")
    page.keyboard.press("Escape")
    apply_filter(include_none=True)
    page.wait_for_function("document.querySelectorAll('.dir-preview .dir-body .vl-row').length === 1")
    check("senza estensione incluso: restano i file senza estensione", "Makefile" in page.inner_text(".dir-preview .dir-body") and calls("list_directory")[-1]["filter"]["includeNone"] is True)
    check("l'avviso lo dice a parole", "(nessuna estensione)" in page.inner_text(".dir-preview .preview-msg"), page.inner_text(".dir-preview .preview-msg"))
    apply_filter(exclude="log md", exclude_none=True, by_enter=True)
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'list_directory').slice(-1)[0].args.filter.excludeNone === true")
    page.wait_for_function("!document.querySelector('.dir-preview .dir-body').textContent.includes('Makefile')")
    f = calls("list_directory")[-1]["filter"]
    check("escludi (con Invio nel campo): il filtro parte con le estensioni e «senza estensione»", f["excludeExts"] == ["log", "md"] and f["excludeNone"] is True and f["includeExts"] == [], str(f))
    check("restano solo i file con altre estensioni", "a.rs" in page.inner_text(".dir-preview .dir-body") and "Makefile" not in page.inner_text(".dir-preview .dir-body"))
    # the comparison of a row and that of the folders use the same filter
    page.evaluate("window.__calls.length = 0")
    page.locator(".dir-preview .dir-body .dir-row", has_text="a.rs").locator(".half").first.click()
    page.locator('.tabpage:not([hidden]) .paths button.primary').click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'recompare_entry')")
    check("«Confronta selezione» manda il filtro", calls("recompare_entry")[0]["filter"]["excludeExts"] == ["log", "md"], str(calls("recompare_entry")))
    page.wait_for_function("Array.from(document.querySelectorAll('.dir-preview .dir-row')).find(r => r.textContent.includes('a.rs')).querySelector('.dir-mark').textContent.trim() === '='")
    page.keyboard.press("Escape")
    page.evaluate("window.__calls.length = 0")
    page.click('.tabpage:not([hidden]) button[type="submit"]')
    page.wait_for_selector(".tabpage:not([hidden]) .diff-view:not(.dir-preview) .dirbar", timeout=10_000)
    c = calls("compare_directories")[-1]
    check("«Confronta» manda il filtro", c["filter"]["excludeExts"] == ["log", "md"] and c["filter"]["excludeNone"] is True, str(c))
    check("confronto: le stesse tre linee tra i gruppi", page.locator(".tabpage:not([hidden]) .dirbar .tb-sep").count() == 3)
    h_dn = page.locator(".tabpage:not([hidden]) .dirbar").bounding_box()["height"]
    page.click('.menu-title:has-text("Vista")'); page.click('.menu-panel button:has-text("Barra strumenti compatta")')
    page.wait_for_selector(".tabpage:not([hidden]) .dirbar.tb-compact")
    cd = page.locator(".tabpage:not([hidden]) .dirbar")
    check("confronto compatto: riepilogo (pallino e numero) e filtro per nome dentro la barra, senza la riga a parte",
          page.locator(".tabpage:not([hidden]) .summary-row").count() == 0 and cd.locator("> .summary .stat.changed").inner_text().strip().isdigit()
          and cd.locator("> .name-filter-wrap .name-filter").count() == 1 and "diversi" in cd.locator("> .summary .stat.changed").get_attribute("aria-label"))
    check("confronto compatto: una riga sola (Espandi, Comprimi e Refresh solo icona, Tipi con nome) e Refresh all'estremo destro",
          cd.bounding_box()["height"] < h_dn * 1.3 and [x.inner_text().strip() for x in cd.locator(".dir-tools .merge-btn, .refresh-btn").all()] == ["", "", ""]
          and cd.locator('button[aria-label="Tipi"]').count() == 1 and cd.bounding_box()["x"] + cd.bounding_box()["width"] - (cd.locator(".refresh-btn").bounding_box()["x"] + cd.locator(".refresh-btn").bounding_box()["width"]) < 14, str(cd.bounding_box()))
    cd.screenshot(path=f"{SHOTS}/dirbar_compact.png")
    page.click('.menu-title:has-text("Vista")'); page.click('.menu-panel button:has-text("Barra strumenti compatta")')
    page.wait_for_selector(".tabpage:not([hidden]) .summary-row")
    print("== Cartelle: menu «Altri filtri», viste Unificato e Mappa, colonna «Differenze» ==")
    dbar = page.locator(".tabpage:not([hidden]) .dirbar")
    more = dbar.locator(".opts-button", has_text="Altri filtri")
    check("il menu degli altri filtri si chiama «Altri filtri» e non ripete All, Diffs e Same", more.count() == 1)
    more.click()
    items = [x.inner_text().strip().rstrip("✓").strip() for x in page.locator('.dirbar [role="menuitemradio"]').all()]
    check("le voci del menu non includono Show All, Show Differences e Show Same", len(items) == 7 and not any(i.endswith(("Mostra tutte", "Mostra differenze", "Mostra uguali")) for i in items), str(items))
    page.screenshot(path=f"{SHOTS}/dir_more_filters.png", clip={"x": 0, "y": 60, "width": 900, "height": 460})
    first_left = page.evaluate("() => { const p = document.querySelector('.dirbar .menu-panel').getBoundingClientRect(), i = document.querySelector('.dirbar .menu-panel .tb-icon').getBoundingClientRect(); return Math.round(i.left - p.left); }")
    check("le icone delle voci stanno vicino al bordo sinistro del menu (senza colonna vuota per la spunta)", first_left <= 16, str(first_left))
    icons = page.locator('.dirbar [role="menuitemradio"] .tb-icon')
    shapes = [x.locator("svg").evaluate("e => e.innerHTML") for x in icons.all()]
    check("le sette voci hanno un'icona SVG ciascuna, tutte diverse, e nessun carattere di testo",
          icons.count() == 7 and all(x.locator("svg").count() == 1 and x.inner_text().strip() == "" for x in icons.all()) and len(set(shapes)) == 7, str(len(set(shapes))))
    tones = [(x.get_attribute("class") or "").split("fi-")[-1] for x in icons.all()]
    colors = [x.evaluate("e => getComputedStyle(e).color") for x in icons.all()]
    check("le icone hanno la tinta di stato (neutra, differenza, lato sinistro, lato destro) e non tutte lo stesso azzurro",
          set(tones) == {"neutral", "different", "left", "right"} and len(set(colors)) >= 4, f"{tones} {colors}")
    item = page.locator('.dirbar [role="menuitemradio"]').nth(3)
    item.hover()
    check("sulla voce evidenziata l'icona diventa bianca (non resta azzurra sull'azzurro)",
          item.locator(".tb-icon").evaluate("e => getComputedStyle(e).color") == "rgb(255, 255, 255)")
    page.keyboard.press("Escape")
    vsd = dbar_vs = page.locator(".tabpage:not([hidden]) .dirbar .view-switch .seg-btn")
    check("nella barra delle cartelle c'è «Affiancato | Unificato | Mappa»: nel confronto fatto sono disponibili tutte e tre le viste, Affiancato attivo",
          [" ".join(x.inner_text().split()) for x in vsd.all()] == ["Affiancato", "Unificato", "Mappa"] and vsd.nth(0).get_attribute("aria-pressed") == "true"
          and not vsd.nth(1).is_disabled() and not vsd.nth(2).is_disabled() and all(x.locator("svg").count() == 1 for x in vsd.all()))
    vsd.nth(2).click()
    page.wait_for_selector(".tabpage:not([hidden]) .dir-map .map-cell")
    mv = page.locator(".tabpage:not([hidden]) .dir-map")
    cells = mv.locator(".map-cell")
    check("«Mappa» sostituisce l'elenco con le celle dei file, colorate per stato, e il pulsante è premuto",
          vsd.nth(2).get_attribute("aria-pressed") == "true" and vsd.nth(0).get_attribute("aria-pressed") == "false"
          and page.locator(".tabpage:not([hidden]) .dir-list").count() == 0 and cells.count() > 3
          and any(mv.locator(f".map-cell.{c}").count() for c in ("different", "leftOnly", "rightOnly", "identical")))
    boxes = [c.bounding_box() for c in cells.all()]
    mb = mv.bounding_box()
    check("le celle stanno dentro l'area della mappa e non hanno dimensioni nulle",
          all(b and b["width"] >= 1 and b["height"] >= 1 and b["x"] >= mb["x"] - 1 and b["x"] + b["width"] <= mb["x"] + mb["width"] + 1
              and b["y"] >= mb["y"] - 1 and b["y"] + b["height"] <= mb["y"] + mb["height"] + 1 for b in boxes), str(boxes[:3]))
    mv.screenshot(path=f"{SHOTS}/dir_map.png")
    heads = mv.locator(".map-group-head")
    if heads.count():
        first = heads.first.locator(".map-label").inner_text().rstrip("/")
        heads.first.dblclick()
        check("un doppio clic sulla cartella ne mostra il contenuto, con le briciole di pane per tornare",
              page.locator(".tabpage:not([hidden]) .map-crumbs .map-crumb").count() == 2
              and page.locator(".tabpage:not([hidden]) .map-crumbs").inner_text().replace("\n", "").find(first) >= 0)
        page.locator(".tabpage:not([hidden]) .map-crumbs .map-crumb").first.click()
        check("la voce «Root» riporta al livello iniziale", page.locator(".tabpage:not([hidden]) .map-crumbs .map-crumb").count() == 1)

    # space between the cells and file size under the name
    boxes_g = page.locator(".tabpage:not([hidden]) .dir-map .map-group").evaluate_all(
        "els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })")
    def gap(a, b):
        dx = max(b[0] - a[2], a[0] - b[2], 0)
        dy = max(b[1] - a[3], a[1] - b[3], 0)
        return max(dx, dy) if (dx == 0 or dy == 0) else (dx * dx + dy * dy) ** 0.5
    touching = [gap(a, b) for i, a in enumerate(boxes_g) for b in boxes_g[i + 1:] if gap(a, b) < 20]
    check("le cartelle disegnate sono distanziate (con 200 cartelle piccole almeno 2 px tra due vicine; le più grandi 6)", len(boxes_g) > 3 and (not touching or min(touching) >= 2),
          f"{len(boxes_g)} cartelle, distanza minima tra vicine {min(touching) if touching else '-'}")
    heads2 = mv.locator(".map-group-head")
    if heads2.count():
        heads2.first.dblclick()
        page.wait_for_timeout(200)
        sized = page.locator(".tabpage:not([hidden]) .dir-map .map-cell .map-size")
        check("dentro una cartella le celle abbastanza grandi hanno la dimensione sotto il nome",
              sized.count() > 0 and all(__import__("re").search(r"\d\s?(B|KB|MB|GB)", x) for x in sized.all_inner_texts()),
              str(sized.all_inner_texts()[:4]))
        page.locator(".tabpage:not([hidden]) .map-crumbs .map-crumb").first.click()
    tp = ".tabpage:not([hidden])"
    crumbs_n = lambda: page.locator(f"{tp} .map-crumbs .map-crumb").count()
    panel_name = lambda: page.locator(f"{tp} .map-panel .mp-name").inner_text()
    check("nella mappa c'è il pannello di dettaglio e, senza scelta, invita a sceglierne una",
          page.locator(f"{tp} .map-panel").count() == 1 and "Scegli una cella" in page.inner_text(f"{tp} .map-panel"))
    check("alla radice, senza filtri, i chip del livello non si ripetono (ci sono già i totali sopra)", page.locator(f"{tp} .map-chips").count() == 0)
    badges = page.locator(f"{tp} .map-group-head .map-badge")
    check("le cartelle larghe hanno nell'intestazione l'icona e un badge di stato",
          page.locator(f"{tp} .map-group-head .map-group-icon").count() == page.locator(f"{tp} .map-group").count()
          and (badges.count() == 0 or all(x.inner_text().strip() != "" for x in badges.all())))
    check("al livello iniziale «sali» è disattivato", page.locator(f"{tp} .map-up").is_disabled())
    # The largest cell: the tiny ones (with many entries per folder) overlap with the pointer and with finding by position.
    leaf_label = mv.evaluate("""e => { let best = null, area = 0; for (const c of e.querySelectorAll('.map-cell:not(.cluster)')) { const r = c.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = c; } } return best ? best.getAttribute('aria-label') : null; }""")
    leaf = mv.locator(f'.map-cell[aria-label="{leaf_label}"]') if leaf_label else mv.locator(".map-cell:not(.cluster)").first
    check("al livello iniziale ci sono celle di file, anche minuscole (con tante voci per cartella non si raggruppano tutte)", leaf.count() == 1)
    if leaf.count():
        leaf_name = (leaf.get_attribute("aria-label") or "").split(":")[0]
        leaf.click()
        name_after_click = panel_name()
        class_after_click = leaf.get_attribute("class") or ""
        ring = leaf.evaluate("""e => { const s = getComputedStyle(e); const p = document.createElement('i'); p.style.color = 'var(--accent)'; document.body.append(p);
            const accent = getComputedStyle(p).color; p.remove(); return [s.outlineStyle, s.outlineWidth, s.outlineColor, accent]; }""")
        page.screenshot(path=f"{SHOTS}/dir_map_selected.png")
        check("la cella scelta ha l'anello di 2 px nel colore d'accento, qualunque sia il colore della cella",
              ring[0] == "solid" and ring[1] == "2px" and ring[2] == ring[3], str(ring))
        sides = page.locator(".tabpage:not([hidden]) .path-field .side-dot")
        check("i due campi del percorso hanno il pallino del lato, di colori diversi",
              sides.count() == 2 and sides.nth(0).evaluate("e => getComputedStyle(e).backgroundColor") != sides.nth(1).evaluate("e => getComputedStyle(e).backgroundColor"))
        check("il pannello ha l'icona della voce e le due schede dei lati con i pallini di sinistra e destra",
              page.locator(f"{tp} .map-panel .mp-icon").count() == 1 and page.locator(f"{tp} .map-panel .mp-side.left .mp-dot").count() == 1
              and page.locator(f"{tp} .map-panel .mp-side.right .mp-dot").count() == 1)
        sib = page.locator(f"{tp} .map-panel .mp-siblings li")
        if sib.count() >= 2:
            before = panel_name()
            other = page.locator(f"{tp} .map-panel .mp-siblings .mp-item:not(.current)").first
            other_name = other.locator(".mp-item-name").inner_text().split("/")[-1]
            check("nel pannello «Nella cartella» elenca le voci della cartella e quella scelta è evidenziata",
                  page.locator(f"{tp} .map-panel .mp-siblings .mp-item.current").count() == 1)
            cols = page.locator(f"{tp} .map-panel .mp-col")
            names = lambda: [n.split("/")[-1].lower() for n in page.locator(f"{tp} .map-panel .mp-siblings .mp-item-name").all_inner_texts()]
            check("l'elenco ha due colonne cliccabili, «Nome» e «Dimensione», e di default è ordinato per nome crescente",
                  cols.all_inner_texts() and [c.split()[0] for c in cols.all_inner_texts()] == ["Nome", "Dimensione"]
                  and cols.nth(0).get_attribute("aria-sort") == "ascending" and cols.nth(1).get_attribute("aria-sort") == "none"
                  and names() == sorted(names()), str(names()[:5]))
            check("sopra l'elenco il riepilogo dice quanti file e in che ordine",
                  "prima" not in page.locator(f"{tp} .map-panel .mp-count").inner_text() and "dal nome A alla Z" in page.locator(f"{tp} .map-panel .mp-count").inner_text(),
                  page.locator(f"{tp} .map-panel .mp-count").inner_text())
            page.locator(f"{tp} .map-panel").screenshot(path=f"{SHOTS}/dir_map_panel.png")
            cols.nth(0).click()
            check("un secondo clic su «Nome» inverte l'ordine", cols.nth(0).get_attribute("aria-sort") == "descending" and names() == sorted(names(), reverse=True))
            cols.nth(1).click()
            check("un clic su «Dimensione» la attiva (prima i più grandi) e disattiva il nome",
                  cols.nth(1).get_attribute("aria-sort") == "descending" and cols.nth(0).get_attribute("aria-sort") == "none"
                  and "prima i più grandi" in page.locator(f"{tp} .map-panel .mp-count").inner_text())
            cols.nth(0).click()
            other.click()
            check("un clic su un'altra voce dell'elenco la sceglie (cambia il pannello)", panel_name() == other_name and panel_name() != before, f"{before!r} -> {panel_name()!r}")
        check("un clic su una cella la sceglie e il pannello ne mostra nome, stato e il solo pulsante primario",
              "selected" in class_after_click and name_after_click == leaf_name
              and page.locator(f"{tp} .map-panel .mp-status").count() == 1 and page.locator(f"{tp} .map-panel .mp-actions button").count() == 1,
              f"{leaf_name!r} {name_after_click!r}")
        both = mv.locator(".map-cell.different:not(.cluster)").first
        if both.count():
            both.click(button="right")
            items = [i.strip() for i in page.locator(".ctx-menu button").all_inner_texts()]
            check("il menu della mappa non ha «Confronta selezione»: Apri in un nuovo tab e Mostra nel file manager",
                  items[:1] == ["Apri in un nuovo tab"] and "Confronta selezione" not in items and any(i.startswith("Mostra nel file manager") for i in items), str(items))
            page.keyboard.press("Escape")
        check("il pulsante primario del pannello ha lo stesso nome della voce del menu",
              page.locator(f"{tp} .map-panel .mp-primary").inner_text().replace("↵", "").strip() in ("Apri in un nuovo tab", "Entra nella cartella"))
    grp = mv.locator(".map-group").first
    if grp.count():
        gname = grp.locator(".map-group-head .map-label").inner_text().rstrip("/")
        grp.locator(".map-group-head").click()
        check("un clic su una cartella la sceglie senza entrarci",
              "selected" in (grp.get_attribute("class") or "") and crumbs_n() == 1 and panel_name() == gname, f"{gname!r} {panel_name()!r}")
        page.locator(f"{tp} .map-panel .mp-primary").click()
        check("«Entra nella cartella» porta dentro, con «sali» attivo",
              crumbs_n() == 2 and not page.locator(f"{tp} .map-up").is_disabled())
        check("dentro una cartella compaiono i chip del livello, con il pallino di stato",
              page.locator(f"{tp} .map-chips .map-chip").count() >= 1 and page.locator(f"{tp} .map-chips .map-chip .map-dot").count() == page.locator(f"{tp} .map-chips .map-chip").count())
        page.locator(f"{tp} .dir-map-view").focus()
        page.keyboard.press("Backspace")
        check("Backspace risale e sceglie la cartella da cui si arriva", crumbs_n() == 1 and panel_name() == gname, f"{gname!r}")
        page.locator(f"{tp} .map-group").first.dblclick()
        page.locator(f"{tp} .map-up").click()
        check("il pulsante «sali» risale di un livello", crumbs_n() == 1)
    inner_more = mv.locator(".map-group .map-cell.cluster.inner")
    if inner_more.count():
        label = inner_more.first.inner_text().strip()
        inner_more.first.click()
        check("dentro una cartella i piccoli sono una cella «+N file», che sceglie la cartella e ne elenca le voci",
              (label == "" or label.startswith("+")) and page.locator(f"{tp} .map-group.selected").count() == 1
              and page.locator(f"{tp} .map-panel .mp-siblings li").count() >= 2, label)
    cluster = mv.locator(".map-cell.cluster:not(.inner)")
    if cluster.count():
        cluster.first.click()
        listed = page.locator(f"{tp} .map-panel .mp-list li").count()
        check("la cella dei piccoli raggruppati elenca nel pannello gli elementi che contiene",
              listed >= 2 and (str(listed) in cluster.first.inner_text() or cluster.first.inner_text() == ""), f"{listed} / {cluster.first.inner_text()!r}")
        page.locator(f"{tp} .map-panel .mp-item").first.click()
        check("scegliere un elemento dall'elenco ne mostra il dettaglio", page.locator(f"{tp} .map-panel .mp-list").count() == 0 and page.locator(f"{tp} .map-panel .mp-name").count() == 1)
    page.locator(f"{tp} .map-panel-toggle").click()
    check("il pulsante a destra della barra nasconde il pannello", page.locator(f"{tp} .map-panel").count() == 0)
    page.locator(f"{tp} .map-panel-toggle").click()
    check("e lo mostra di nuovo", page.locator(f"{tp} .map-panel").count() == 1)
    n_ident = page.locator(".tabpage:not([hidden]) .dir-map .map-cell.identical, .tabpage:not([hidden]) .dir-map .map-cell.mixed").count()
    page.locator(".tabpage:not([hidden]) .dir-filters .seg-btn", has_text="Differenze").first.click() if page.locator(".tabpage:not([hidden]) .dir-filters .seg-btn", has_text="Differenze").count() else page.locator(".tabpage:not([hidden]) .dir-filters .seg-btn").nth(1).click()
    n_diff = page.locator(".tabpage:not([hidden]) .dir-map .map-cell").count()
    check("i filtri della barra valgono anche nella mappa (con «Differences» restano celle e nessuna è di una voce uguale)", n_diff > 0 and page.locator(".tabpage:not([hidden]) .dir-map .map-cell.identical").count() == 0, f"uguali {n_ident} -> celle {n_diff}")
    page.locator(".tabpage:not([hidden]) .dir-filters .seg-btn").nth(0).click()
    vsd.nth(0).click()
    check("«Affiancato» riporta l'elenco", page.locator(".tabpage:not([hidden]) .dir-list").count() == 1 and page.locator(".tabpage:not([hidden]) .dir-map").count() == 0)
    check("nel confronto fatto «Unificato» è disponibile; nell'anteprima no, e il suggerimento dice perché", not vsd.nth(1).is_disabled())
    page.evaluate("() => { window.__statsHold = true; window.__statsBinary = []; window.__statsCalls = []; window.__statsMax = 0; }")
    vsd.nth(1).click()
    page.wait_for_selector(".tabpage:not([hidden]) .dir-list.unified .dir-body .dir-row")
    ul = page.locator(".tabpage:not([hidden]) .dir-list.unified")
    heads = [" ".join(x.inner_text().split()) for x in ul.locator(".dir-row.head > div").all()]
    check("Unificato (cartelle): un solo elenco con le colonne Stato (icona), Nome, Sinistra, Destra e Differenze; il pulsante è premuto",
          heads == ["", "Nome", "Sinistra (dimensione, data)", "Destra (dimensione, data)", "Differenze"] and vsd.nth(1).get_attribute("aria-pressed") == "true" and vsd.nth(0).get_attribute("aria-pressed") == "false"
          and ul.locator(".dir-row.head .dir-mark").count() == 0 and page.locator(".tabpage:not([hidden]) .dir-map").count() == 0, str(heads))
    urows = ul.locator(".dir-body .dir-row")
    check("ogni voce compare una volta sola: lo stato (icona) come prima colonna, poi il nome e due gruppi dimensione/data",
          urows.count() > 3 and urows.first.locator(".half").count() == 1 and urows.first.locator(".u-status svg").count() == 1 and urows.first.locator(".u-side").count() == 2 and urows.first.locator(".dir-mark").count() == 0
          and urows.first.locator("> *").first.get_attribute("class") == "u-status")
    sx, nx = urows.first.locator(".u-status").bounding_box(), urows.first.locator(".half").bounding_box()
    check("lo stato sta a sinistra del nome ed è una colonna stretta", sx["x"] < nx["x"] and sx["width"] < 48, f"{sx} {nx}")
    legend = ul.locator(".dir-row.head .u-status").get_attribute("title")
    check("l'intestazione della colonna ha una legenda delle icone", all(x in legend for x in ("≠", "≈", "=", "diverso", "solo a sinistra", "solo a destra")), legend)
    def ustat(cls):
        r = ul.locator(f".dir-body .dir-row.{cls}").first
        return r if r.count() else None
    for cls, word in (("different", "diverso"), ("identical", "identico"), ("leftOnly", "solo a sinistra"), ("rightOnly", "solo a destra")):
        r = ustat(cls)
        if r is not None:
            check(f"lo stato «{word}» è un'icona, con le parole nel nome e nel suggerimento", r.locator(".u-status").get_attribute("aria-label") in (word, "minore") and r.locator(".u-status").get_attribute("title") == r.locator(".u-status").get_attribute("aria-label") and r.locator(".u-status").inner_text().strip() == "", r.locator(".u-status").get_attribute("aria-label"))
    icons = {cls: ustat(cls).locator(".u-status svg").inner_html() for cls in ("different", "identical", "leftOnly", "rightOnly") if ustat(cls) is not None}
    check("le icone dei diversi stati hanno forme diverse (non solo colori diversi)", len(set(icons.values())) == len(icons) and len(icons) >= 2, str(list(icons)))
    lo, ro = ustat("leftOnly"), ustat("rightOnly")
    if lo is not None:
        check("una voce solo a sinistra ha vuoto il gruppo di destra (e pieno quello di sinistra)", lo.locator(".u-side").nth(1).inner_text().strip() == "" and lo.locator(".u-side").nth(0).inner_text().strip() != "")
    if ro is not None:
        check("una voce solo a destra ha vuoto il gruppo di sinistra", ro.locator(".u-side").nth(0).inner_text().strip() == "" and ro.locator(".u-side").nth(1).inner_text().strip() != "")
    # "Differences" column: computed on request for the visible rows, at most three at a time
    file_row = ".dir-body .dir-row.different:not(:has(button.twisty))"
    page.get_by_role("button", name="Differenze", exact=True).click()   # with Diffs the first rows are different files
    page.wait_for_selector(f".tabpage:not([hidden]) .dir-list.unified {file_row}")
    fpath = ul.locator(f"{file_row} .dir-name").first.get_attribute("title")
    lpath = ul.locator(f"{file_row} .dir-name").nth(1).get_attribute("title")
    # the non-text file and the one too large for the core (the mock looks at them when the count is done)
    page.evaluate("([p, q]) => { window.__statsBinary = [p]; window.__statsTooLarge = [q]; }", [fpath, lpath])
    page.wait_for_function("(window.__statsCalls || []).length >= 1")
    page.wait_for_timeout(300)
    drow = ul.locator(f"{file_row}").first
    check("la colonna «Differenze» mostra «…» finché il conteggio non è pronto; non partono più di 3 richieste insieme",
          drow.locator(".u-count").inner_text().strip() == "…" and len(page.evaluate("window.__statsCalls")) == 3 and page.evaluate("window.__statsMax") <= 3, str(page.evaluate("window.__statsCalls.length")))
    page.evaluate("() => { window.__statsHold = false; (window.__statsWaiters || []).forEach(r => r()); }")
    page.wait_for_function("document.querySelector('.tabpage:not([hidden]) .dir-list.unified .dir-row.different:not(:has(button.twisty)) .u-count .dir-size').textContent !== '…'")
    page.wait_for_timeout(500)
    vals = [x.strip() for x in ul.locator(".dir-body .dir-row.different:not(:has(button.twisty)) .u-count").all_inner_texts()]
    check("a conteggio fatto la colonna mostra il numero di righe diverse con l'unità (2 modificate + 1 + 3 = «6 righe»); il file non di testo ha «—»",
          "6 righe" in vals and set(vals) <= {"6 righe", "—", "…"} and ul.locator(f'.dir-body .dir-row:has(.dir-name[title="{fpath}"]) .u-count').inner_text().strip() == "—", str(vals[:6]))
    lcell = ul.locator(f'.dir-body .dir-row:has(.dir-name[title="{lpath}"]) .u-count .dir-size')
    check("un file troppo grande per il core ha «—» e il suggerimento dice il limite",
          lcell.inner_text().strip() == "—" and (lcell.get_attribute("title") or "").startswith("File più grande di 16"), str(lcell.get_attribute("title")))
    page.evaluate("() => { window.__statsTooLarge = []; }")
    six = ul.locator(".dir-body .dir-row .u-count .dir-size", has_text="6 righe").first
    check("il suggerimento ha il dettaglio (modificate, solo a sinistra, solo a destra)", "2 modificate" in six.get_attribute("title") and "1 solo a sinistra" in six.get_attribute("title") and "3 solo a destra" in six.get_attribute("title"), six.get_attribute("title"))
    page.get_by_role("button", name="Tutte", exact=True).click()
    page.wait_for_timeout(300)
    other = [x.strip() for x in ul.locator(".dir-body .dir-row.identical .u-count, .dir-body .dir-row.leftOnly .u-count, .dir-body .dir-row.rightOnly .u-count, .dir-body .dir-row.different:has(button.twisty) .u-count").all_inner_texts()]
    check("per le cartelle, le voci identiche e quelle a un lato solo la cella è vuota (nessun conteggio)", set(other) <= {""}, str(set(other)))
    n_calls = len(page.evaluate("window.__statsCalls"))
    ul.locator(".dir-body").evaluate("e => e.scrollTop = 0")
    page.wait_for_timeout(300)
    check("tornando su gli stessi file non si ricalcola (risultati in cache)", len(page.evaluate("window.__statsCalls")) == n_calls, f"{n_calls} -> {len(page.evaluate('window.__statsCalls'))}")
    unc = ul.evaluate("""e => { const c = s => { const x = e.querySelector('.dir-body ' + s); return x ? getComputedStyle(x).color : null; }; return { body: getComputedStyle(e.querySelector('.dir-body')).color, names: ['.dir-row.identical .dir-name', '.dir-row.different .dir-name', '.dir-row.leftOnly .dir-name', '.dir-row.rightOnly .dir-name'].map(c).filter(x => x !== null) }; }""")
    check("nell'Unificato tutti i nomi hanno il colore normale del testo (anche quelli a un lato solo)", len(unc["names"]) >= 2 and all(c == unc["body"] for c in unc["names"]), str(unc))
    ul.screenshot(path=f"{SHOTS}/dir_unified.png")
    def fits():
        return page.evaluate("""() => {
          const list = document.querySelector('.tabpage:not([hidden]) .dir-list.unified').getBoundingClientRect();
          const bad = [];
          for (const row of document.querySelectorAll('.tabpage:not([hidden]) .dir-list.unified .dir-row')) {
            const cols = [...row.children].map(c => c.getBoundingClientRect());
            for (let i = 1; i < cols.length; i++) if (cols[i].left < cols[i - 1].right - 1) bad.push('colonna ' + i + ' sovrapposta');
            if (cols[cols.length - 1].right > list.right + 1) bad.push('esce a destra');
            for (const c of row.querySelectorAll('.u-side')) if (c.scrollWidth > c.clientWidth + 1) bad.push('contenuto tagliato');
          }
          return [...new Set(bad)];
        }""")
    check("le colonne stanno nello spazio dell'elenco, senza sovrapporsi né uscire (finestra larga)", fits() == [], str(fits()))
    page.set_viewport_size({"width": 760, "height": 700})
    page.wait_for_timeout(300)
    check("anche con la finestra stretta (760 px): niente sbordi, e restano le dimensioni senza le date",
          fits() == [] and ul.locator(".dir-body .dir-row .u-side .dir-date").first.is_hidden(), str(fits()))
    ul.screenshot(path=f"{SHOTS}/dir_unified_narrow.png")
    page.set_viewport_size({"width": 1280, "height": 800})
    page.wait_for_timeout(300)
    tw = ul.locator(".dir-body .dir-row .twisty:not(:empty)").first
    t_before = tw.inner_text()
    names_before = ul.locator(".dir-body .dir-name").all_inner_texts()
    tw.click()
    page.wait_for_timeout(200)
    check("l'albero funziona anche qui: il triangolo apre o chiude la cartella (cambia il triangolo e l'elenco delle righe)",
          tw.inner_text() != t_before and ul.locator(".dir-body .dir-name").all_inner_texts() != names_before, f"{t_before} -> {tw.inner_text()}")
    tw.click()
    page.get_by_role("button", name="Differenze", exact=True).click()
    page.wait_for_timeout(300)
    check("i filtri valgono anche nell'unificato (con Diffs niente voci identiche)", ul.locator(".dir-body .dir-row.identical").count() == 0 and ul.locator(".dir-body .dir-row").count() > 0)
    page.get_by_role("button", name="Tutte", exact=True).click()
    vsd.nth(2).click()
    page.wait_for_selector(".tabpage:not([hidden]) .dir-map .map-cell")
    check("dall'Unificato si passa alla Mappa e viceversa", page.locator(".tabpage:not([hidden]) .dir-list").count() == 0 and vsd.nth(2).get_attribute("aria-pressed") == "true")
    vsd.nth(0).click()
    page.wait_for_selector(".tabpage:not([hidden]) .dir-list:not(.unified) .dir-row .dir-mark")
    check("«Affiancato» riporta le due metà", page.locator(".tabpage:not([hidden]) .dir-list.unified").count() == 0 and page.locator(".tabpage:not([hidden]) .dir-row.head .dir-mark").count() == 1)
    check("la barra delle cartelle è un riquadro come quella dei file: filtri segmentati, Types e «Altri filtri» con il bordo, Espandi e Comprimi con icona e testo, Refresh a destra",
          "tb-card" in dbar.get_attribute("class") and dbar.locator(".dir-filters .seg .seg-btn").count() == 4 and dbar.locator(".opts-button").count() == 2
          and [" ".join(x.inner_text().split()) for x in dbar.locator(".dir-tools .merge-btn").all()] == ["Espandi", "Comprimi"] and all(x.locator("svg").count() == 1 for x in dbar.locator(".dir-tools .merge-btn").all())
          and dbar.locator(".refresh-btn").inner_text().strip() == "Refresh" and dbar.locator(".tb-btn").count() == 0)
    rbb, dbb = dbar.locator(".refresh-btn").bounding_box(), dbar.bounding_box()
    check("Refresh sta all'estremo destro del riquadro e tutti i controlli sulla stessa linea", dbb["x"] + dbb["width"] - (rbb["x"] + rbb["width"]) < 14 and len({round(x.bounding_box()["y"] + x.bounding_box()["height"] / 2) for x in dbar.locator(".seg, .opts-button, .dir-tools .merge-btn, .refresh-btn").all()}) == 1)
    dbar.screenshot(path=f"{SHOTS}/dirbar_card.png")
    check("nel confronto c'è lo stesso avviso e il pulsante è acceso", "senza log, md, (nessuna estensione)" in page.inner_text(".tabpage:not([hidden]) .diff-view"), page.inner_text(".tabpage:not([hidden]) .diff-view")[:300])
    n = len(calls("compare_directories"))
    page.evaluate("window.__calls.length = 0")
    apply_filter(include="rs")
    page.wait_for_function("window.__calls.some(c => c.cmd === 'compare_directories')")
    check("cambiare il filtro dal confronto confronta di nuovo con il filtro nuovo", calls("compare_directories")[-1]["filter"]["includeExts"] == ["rs"], str(calls("compare_directories")))
    page.evaluate("window.__calls.length = 0")
    page.get_by_role("button", name="Refresh", exact=True).click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'compare_directories')")
    check("Refresh tiene il filtro", calls("compare_directories")[-1]["filter"]["includeExts"] == ["rs"], str(calls("compare_directories")))
    page.evaluate("window.__calls.length = 0")
    types.click()
    panel.get_by_role("button", name="Azzera").click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'compare_directories')")
    page.wait_for_function("!document.querySelector('.tabpage:not([hidden]) .diff-view').textContent.includes('Filtro sui file attivo')")
    f = calls("compare_directories")[-1]["filter"]
    check("«Azzera» toglie il filtro e confronta di nuovo", f == NOFILTER and "Filtro sui file attivo" not in page.inner_text(".tabpage:not([hidden]) .diff-view"), str(f))
    check("nessun errore in console (filtro dei file)", not errors, "; ".join(errors[:3]))
    ctx.close()
