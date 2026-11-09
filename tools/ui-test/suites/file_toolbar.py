"""Toolbar of the file comparison. A suite of the UI test (see README.md in this folder)."""
from harness import *


def run(browser):
    # ------------------------------------------------------------------ toolbar (files)
    print("== Barra degli strumenti del confronto di file ==")
    ctx, page, errors = open_page(browser)
    calls_of = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    check("prima del confronto le opzioni stanno accanto ai percorsi (maiuscole, spazi, algoritmo)",
          page.locator(".options label.check").count() == 1 and page.locator(".options select").count() == 2)
    run_files(page, "small.json")
    bar = page.locator(".tabpage:not([hidden]) .dirbar")
    tb = lambda name: bar.locator(f'button:has-text("{name}")').first
    optb = lambda name: bar.locator(f'.options-bar button[aria-label^="{name}"]')
    check("barra con i pulsanti (solo Refresh, senza Swap): navigazione, unione e filtro delle righe stanno a parte", bar.locator(".tb-btn").count() == 0, str(bar.locator(".tb-btn").count()))
    check("le opzioni non sono più accanto ai percorsi", page.locator(".options").count() == 0)
    check("la barra non ha più i vecchi gruppi di pulsanti con il testo", bar.locator(".tb-group").count() == 0)
    rf = lambda name: page.locator(".tabpage:not([hidden]) .summary-row .seg .seg-btn", has_text=name)
    check("il filtro delle righe è un controllo segmentato nella riga del riepilogo, non più nella barra",
          page.locator(".tabpage:not([hidden]) .summary-row .seg").count() == 1 and bar.locator(".diff-nav .seg, .merge-bar .seg").count() == 0
          and [b.inner_text().strip() for b in page.locator(".tabpage:not([hidden]) .summary-row .seg .seg-btn").all()] == ["Tutte", "Differenze", "Con contesto"])
    sg, sm = page.locator(".tabpage:not([hidden]) .summary-row .seg").bounding_box(), page.locator(".tabpage:not([hidden]) .toolbar .summary").bounding_box()
    check("è a destra del riepilogo, sulla stessa riga", sg["x"] > sm["x"] + sm["width"] and abs((sg["y"] + sg["height"] / 2) - (sm["y"] + sm["height"] / 2)) < sg["height"], f"{sg} {sm}")
    check("«Tutte» è il filtro attivo", rf("Tutte").get_attribute("aria-pressed") == "true" and rf("Differenze").get_attribute("aria-pressed") == "false" and rf("Con contesto").get_attribute("aria-pressed") == "false")
    page.screenshot(path=f"{SHOTS}/toolbar_segmented.png", clip={"x": 0, "y": 60, "width": 1280, "height": 150})
    st = page.evaluate("window.__fx['small.json'].opened.stats")
    summ = page.locator(".tabpage:not([hidden]) .diff-summary")
    flat_sum = " ".join(summ.inner_text().split())
    check("il riepilogo ha tre pillole come quello delle cartelle (modificate, solo a sinistra, solo a destra) senza ripetere il numero di blocchi (c'è nel contatore)",
          flat_sum == f"{st['changed']} modificate {st['leftOnly']} solo a sinistra {st['rightOnly']} solo a destra", flat_sum)
    check("niente barra proporzionale, e ogni pillola ha il suo pallino", summ.locator(".summary-bar, .seg-fill").count() == 0 and summ.locator(".stat .dot").count() == 3)
    dots = page.evaluate("() => ['changed','leftOnly','rightOnly'].map(k => getComputedStyle(document.querySelector('.tabpage:not([hidden]) .diff-summary .stat.' + k + ' .dot')).backgroundColor)")
    check("i tre pallini hanno tinte diverse", len(set(dots)) == 3, str(dots))
    label = summ.get_attribute("aria-label")
    check("a parole (lettori di schermo): «N modificate, N solo a sinistra, N solo a destra»",
          label == f"{st['changed']} modificate, {st['leftOnly']} solo a sinistra, {st['rightOnly']} solo a destra", label)
    tl = summ.locator(".stat.leftOnly").get_attribute("title")
    check("i suggerimenti hanno la quantità e la quota, con parole neutre", f"{st['leftOnly']} righe solo a sinistra" in tl and "%" in tl, tl)
    check("il riepilogo vecchio a parole non c'è più", "modificate ·" not in page.locator(".tabpage:not([hidden]) .toolbar").inner_text())
    page.locator(".tabpage:not([hidden]) .toolbar").screenshot(path=f"{SHOTS}/summary_bar.png")
    row = page.locator(".tabpage:not([hidden]) .summary-row")
    rb = row.bounding_box()
    bar_b = bar.bounding_box()
    meta_b = page.locator(".tabpage:not([hidden]) .file-meta").bounding_box()
    widths = row.evaluate("e => { const c = getComputedStyle(e); return [c.borderTopWidth, c.borderBottomWidth, c.borderTopStyle, c.borderBottomStyle]; }")
    check("la barra degli strumenti è un riquadro con bordo e angoli arrotondati, e il riepilogo non ha più linee orizzontali",
          bar.evaluate("e => { const c = getComputedStyle(e); return c.borderTopWidth === '1px' && c.borderBottomWidth === '1px' && parseFloat(c.borderTopLeftRadius) >= 8; }") and widths == ["0px", "0px", "none", "none"], str(widths))
    check("sta tra la barra degli strumenti e le intestazioni dei file, a tutta larghezza",
          bar_b["y"] + bar_b["height"] <= rb["y"] and rb["y"] + rb["height"] <= meta_b["y"] and abs(rb["width"] - meta_b["width"] - (meta_b["x"] - rb["x"]) * 2) < 2, f"{bar_b} {rb} {meta_b}")
    fields = page.locator(".tabpage:not([hidden]) .path-field")
    fb0, fb1 = fields.nth(0).bounding_box(), fields.nth(1).bounding_box()
    sb = page.locator(".tabpage:not([hidden]) .swap-btn").bounding_box()
    ib = page.locator(".tabpage:not([hidden]) .browse-btn").first.bounding_box()
    check("lo scambio sta tra i due campi, a metà altezza", fb0["x"] + fb0["width"] <= sb["x"] and sb["x"] + sb["width"] <= fb1["x"] and abs((sb["y"] + sb["height"] / 2) - (fb0["y"] + fb0["height"] / 2)) < 2, f"{fb0} {sb} {fb1}")
    check("l'icona «Sfoglia» è dentro il campo, a sinistra, e non ci sono pulsanti di testo «Sfoglia…»",
          fb0["x"] <= ib["x"] and ib["x"] + ib["width"] < fb0["x"] + 60 and page.locator(".tabpage:not([hidden]) .paths button:has-text(\"Sfoglia\")").count() == 0, f"{fb0} {ib}")
    lf = page.input_value('.tabpage:not([hidden]) input[aria-label="Sinistra"]')
    page.fill('.tabpage:not([hidden]) input[aria-label="Sinistra"]', "/x/scritto-a-mano.txt")
    n_cmp0 = len(calls_of("compare_files"))
    page.locator(".tabpage:not([hidden]) .swap-btn").click()
    page.wait_for_timeout(150)
    check("campi cambiati a mano: lo scambio inverte solo i testi, senza confrontare",
          page.input_value('.tabpage:not([hidden]) input[aria-label="Destra"]') == "/x/scritto-a-mano.txt" and page.input_value('.tabpage:not([hidden]) input[aria-label="Sinistra"]') != "/x/scritto-a-mano.txt" and len(calls_of("compare_files")) == n_cmp0)
    page.locator(".tabpage:not([hidden]) .swap-btn").click()
    page.fill('.tabpage:not([hidden]) input[aria-label="Sinistra"]', lf)
    top = bar.evaluate("e => { const c = getComputedStyle(e); return [c.borderTopWidth, c.borderTopStyle]; }")
    paths_b = page.locator(".tabpage:not([hidden]) .paths").bounding_box()
    check("il riquadro sta sotto gli indirizzi",
          paths_b["y"] + paths_b["height"] <= bar_b["y"], f"{paths_b} {bar_b}")
    page.screenshot(path=f"{SHOTS}/toolbar_rows.png", clip={"x": 0, "y": 60, "width": 1280, "height": 200})
    n = page.evaluate("window.__fx['small.json'].opened.hunks.length")
    # navigation: [↑] [ 3 of 9 ] [↓], with "Diffs" below
    nav = bar.locator(".diff-nav")
    pill = nav.locator(".nav-count")
    arrows = nav.locator("button.tb-square")
    flat = lambda loc: " ".join(loc.inner_text().split())
    check("la navigazione è un solo gruppo: due frecce e il contatore, senza Prima e Ultima",
          nav.count() == 1 and arrows.count() == 2 and pill.count() == 1 and bar.locator('button[aria-label="Prima"], button[aria-label="Ultima"], button:has-text("Prima"), button:has-text("Ultima")').count() == 0)
    check("senza una differenza scelta il contatore dice «– di N»", flat(pill) == f"– di {n}", flat(pill))
    box = lambda loc: loc.bounding_box()
    a0, a1, pb = box(arrows.nth(0)), box(arrows.nth(1)), box(pill)
    check("le frecce sono quadrate da 28 px (alte 32) e il contatore è largo almeno 48 px",
          round(a0["width"]) == 28 and round(a0["height"]) == 32 and round(a1["width"]) == 28 and pb["width"] >= 48, f"{a0} {pb}")
    check("frecce e pillola stanno sullo stesso asse: ↑, contatore, ↓ da sinistra a destra",
          abs((a0["y"] + a0["height"] / 2) - (pb["y"] + pb["height"] / 2)) < 1 and a0["x"] < pb["x"] < a1["x"])
    nb = nav.bounding_box()
    check("il controllo di navigazione è stretto: frecce da 28 px e contatore di 48 px, in tutto meno di 112 px", nb["width"] < 112, str(nb))
    check("la navigazione non ha etichette sotto: sta in un solo controllo con bordo", nav.locator(".group-caption").count() == 0 and nav.evaluate("e => getComputedStyle(e).borderTopWidth") == "1px")
    check("le frecce hanno nome e suggerimento con la scorciatoia",
          arrows.nth(0).get_attribute("aria-label") == "Precedente" and "Alt+↑" in arrows.nth(0).get_attribute("title")
          and arrows.nth(1).get_attribute("aria-label") == "Successiva" and "Alt+↓" in arrows.nth(1).get_attribute("title"))
    check("il contatore ricorda Alt+Home e Alt+Fine", "Alt+Home" in pill.get_attribute("title") and "Alt+Fine" in pill.get_attribute("title"), pill.get_attribute("title"))
    arrows.nth(1).click()
    check("↓ porta alla prima differenza: «1 di N»", flat(pill) == f"1 di {n}" and counter(page) == f"Differenza 1 di {n}", flat(pill))
    colors = page.evaluate("() => { const p = document.querySelector('.tabpage:not([hidden]) .nav-count'); return [getComputedStyle(p.querySelector('strong')).color, getComputedStyle(p.querySelector('.nav-of')).color, getComputedStyle(document.querySelector('.tabpage:not([hidden]) .tb-icon')).color]; }")
    check("il numero corrente ha il colore di accento, «di N» è attenuato", colors[0] == colors[2] and colors[1] != colors[0], str(colors))
    arrows.nth(0).click()
    bar.screenshot(path=f"{SHOTS}/toolbar_nav.png")
    check("↑ dalla prima differenza passa all'ultima (giro)", flat(pill) == f"{n} di {n}", flat(pill))
    page.keyboard.press("Alt+End")
    check("Alt+Fine: ultima differenza", f"Differenza {n} di {n}" in counter(page), counter(page))
    page.keyboard.press("Alt+Home")
    check("Alt+Home: prima differenza", f"Differenza 1 di {n}" in counter(page), counter(page))
    merge = bar.locator(".merge-bar")
    mb = merge.locator("button")
    texts = [" ".join(b.inner_text().split()) for b in mb.all()]
    check("unione: «Applica a dx» e «Applica a sx» con il testo (in quest'ordine), poi due pulsanti con la sola icona",
          mb.count() == 4 and texts == ["Applica a dx", "Applica a sx", "", ""], str(texts))
    boxes = [b.bounding_box() for b in mb.all()]
    check("i testi non vanno a capo: tutti i pulsanti sono alti 32 px e sulla stessa riga",
          all(round(b["height"]) == 32 for b in boxes) and len({round(b["y"]) for b in boxes}) == 1, str(boxes))
    check("Annulla e Salva sono quadrati da 32 px, con icona SVG e nome per i lettori di schermo",
          round(boxes[2]["width"]) == 32 and round(boxes[3]["width"]) == 32 and mb.nth(2).locator("svg").count() == 1 and mb.nth(3).locator("svg").count() == 1
          and mb.nth(2).get_attribute("aria-label") == "Annulla" and mb.nth(3).get_attribute("aria-label") == "Salva")
    check("Annulla e Salva ricordano le scorciatoie", "Ctrl+Z" in mb.nth(2).get_attribute("title") and "Ctrl+S" in mb.nth(3).get_attribute("title"))
    check("nessuna etichetta sotto i gruppi della barra", bar.locator(".group-caption").count() == 0)
    check("senza modifiche Annulla e Salva sono disattivati, le copie funzionano con una differenza scelta", mb.nth(2).is_disabled() and mb.nth(3).is_disabled() and mb.nth(0).is_enabled() and mb.nth(1).is_enabled())
    bar.screenshot(path=f"{SHOTS}/toolbar_merge.png")
    seps = bar.locator(".tb-sep")
    sx = [b["x"] for b in (e.bounding_box() for e in seps.all())]
    groups = [bar.locator(sel).first.bounding_box() for sel in (".diff-nav", ".merge-bar", ".view-switch", ".options-bar")]
    check("tre separatori verticali tra i quattro gruppi della barra, ciascuno tra due gruppi",
          seps.count() == 3 and all(g["x"] + g["width"] <= x + 1 for g, x in zip(groups, sx)) and all(x < g["x"] + 1 for g, x in zip(groups[1:], sx)), f"{sx} {[(g['x'], g['width']) for g in groups]}")
    sb = seps.first.bounding_box()
    check("sono linee sottili (1 px) di circa 24 px, con il ruolo di separatore", round(sb["width"]) == 1 and 22 <= sb["height"] <= 26 and seps.first.get_attribute("role") == "separator", str(sb))
    ob = bar.locator(".options-bar")
    osq = ob.locator("button.tb-square")
    obox = [x.bounding_box() for x in osq.all()]
    check("il gruppo «Options» ha ¶ e Aa quadrati da 32 px, e due menu (spazi, algoritmo) con la freccia",
          osq.count() == 2 and all(round(b["width"]) == 32 and round(b["height"]) == 32 for b in obox) and ob.locator("select").count() == 2 and ob.locator(".opt-chevron").count() == 2
          and [x.inner_text().strip() for x in osq.all()] == ["", "Aa"] and osq.nth(0).locator("svg").count() == 1, str(obox))
    check("le due icone hanno nome e suggerimento, e i menu hanno il nome davanti al valore (Spazi, Algoritmo)",
          osq.nth(0).get_attribute("aria-label") == "Mostra spazi e tabulazioni" and osq.nth(1).get_attribute("aria-label") == "Ignora maiuscole" and all(x.get_attribute("title") for x in osq.all())
          and [x.inner_text().strip() for x in ob.locator(".opt-name").all()] == ["Spazi", "Algoritmo"])
    alg = ob.locator('select[aria-label="Algoritmo di confronto"]')
    check("il menu dell'algoritmo mostra «Myers» e tutti i menu stanno sulla stessa riga delle icone",
          alg.evaluate("s => s.options[s.selectedIndex].text") == "Myers" and len({round(x.bounding_box()["y"] + x.bounding_box()["height"] / 2) for x in ob.locator(".opt-select, button.tb-square").all()}) == 1)
    bar.screenshot(path=f"{SHOTS}/toolbar_options.png")
    allbtn = bar.locator("button.tb-square, button.merge-btn, button.seg-btn")
    hs = {round(x.bounding_box()["height"]) for x in allbtn.all()}
    check("tutti i pulsanti della barra sono alti 32 px (o 26 dentro il controllo segmentato di 32)", hs <= {32, 26} and round(bar.locator(".view-switch .seg").bounding_box()["height"]) == 32, str(hs))
    check("tutte le icone sono SVG (tranne «Aa»): chevron, ¶, Undo, Salva, Refresh senza caratteri di testo",
          all(x.locator("svg").count() == 1 for x in bar.locator("button.tb-square").all() if x.inner_text().strip() != "Aa") and bar.locator(".tb-icon:not(.tb-text) svg").count() >= 8)
    rb = bar.locator('button[aria-label="Refresh"]')
    check("Refresh ha icona e testo, è alto 32 px e sta all'estremo destro del riquadro", round(rb.bounding_box()["height"]) == 32 and rb.inner_text().strip() == "Refresh" and rb.locator("svg").count() == 1 and bar_b["x"] + bar_b["width"] - (rb.bounding_box()["x"] + rb.bounding_box()["width"]) < 14, str(rb.bounding_box()))
    vs = bar.locator(".view-switch")
    vb = vs.locator(".seg-btn")
    vbox = [b.bounding_box() for b in vb.all()]
    check("il gruppo «View» ha Affiancato (attivo) e Unificato (disponibile)",
          vb.count() == 2 and [" ".join(b.inner_text().split()) for b in vb.all()] == ["Affiancato", "Unificato"]
          and vb.nth(0).get_attribute("aria-pressed") == "true" and vb.nth(1).get_attribute("aria-pressed") == "false" and vb.nth(1).is_enabled() and vb.nth(0).is_enabled())
    check("hanno un'icona e non vanno a capo", all(b.locator("svg").count() == 1 for b in vb.all()) and len({round(b["y"]) for b in vbox}) == 1, str(vbox))
    check("Unificato ha un suggerimento che spiega la vista", "unificata" in vb.nth(1).get_attribute("title").lower() or "unified" in vb.nth(1).get_attribute("title").lower())
    # --- unified view ---
    fxo = page.evaluate("() => { const o = window.__fx['small.json'].opened; return { hunks: o.hunks.map(h => [h.start, h.end]), spans: o.unifiedHunks.map(h => [h.start, h.end]), total: o.unifiedTotal, rows: o.totalRows }; }")
    tp = ".tabpage:not([hidden])"
    vb.nth(1).click()
    page.wait_for_selector(f"{tp} .pane.unified .urow:not(.loading)")
    check("Unificato: un solo pannello al posto dei due, e il pulsante è premuto",
          page.locator(f"{tp} .pane.unified").count() == 1 and page.locator(f"{tp} .pane.left").count() == 0 and page.locator(f"{tp} .pane.right:not(.unified)").count() == 0
          and vb.nth(1).get_attribute("aria-pressed") == "true" and vb.nth(0).get_attribute("aria-pressed") == "false" and page.locator(f"{tp} .linepanel").count() == 0)
    check("l'altezza dell'area è quella delle righe unificate (più di quelle affiancate)",
          abs(page.evaluate(f"document.querySelector('{tp} .pane.unified .pane-inner').offsetHeight") - fxo["total"] * 20) <= 1 and fxo["total"] > fxo["rows"])
    page.evaluate(f"document.querySelector('{tp} .pane.unified').scrollTop = 0")
    page.wait_for_function(f"document.querySelector('{tp} .urow .num') && document.querySelector('{tp} .urow .num').textContent === '1'")
    first = page.locator(f"{tp} .urow").first
    check("la prima riga è uguale: due numeri (1 e 1), nessun segno e il testo",
          [x.inner_text() for x in first.locator(".num").all()] == ["1", "1"] and first.locator(".u-sign").inner_text().strip() == "" and "function_0" in first.inner_text())
    page.keyboard.press("Alt+ArrowDown")
    page.wait_for_selector(f"{tp} .urow.del")
    d0, a0 = page.locator(f"{tp} .urow.del").first, page.locator(f"{tp} .urow.add").first
    dbox, abox = d0.bounding_box(), a0.bounding_box()
    check("un blocco: prima la riga tolta (− e solo il numero a sinistra), subito sotto l'aggiunta (+ e solo il numero a destra)",
          d0.locator(".u-sign").inner_text() == "−" and a0.locator(".u-sign").inner_text() == "+"
          and d0.locator(".num").nth(0).inner_text() != "" and d0.locator(".num").nth(1).inner_text() == ""
          and a0.locator(".num").nth(0).inner_text() == "" and a0.locator(".num").nth(1).inner_text() != ""
          and abs(abox["y"] - dbox["y"] - 20) < 2, f"{dbox} {abox}")
    check("il blocco corrente è segnato sulle righe e sulla panoramica; le parti cambiate sono evidenziate",
          page.locator(f"{tp} .urow.current").count() == 2 and page.locator(f"{tp} .overview .mark.current").count() == 1 and page.locator(f"{tp} .urow mark.ie").count() > 0)
    check("le righe unificate si chiedono a Rust, non quelle affiancate", len(page.evaluate("window.__unifiedCalls || []")) > 0)
    a0.click()
    check("un clic seleziona la riga", page.locator(f"{tp} .urow.selected").count() == 1)
    sel_top = lambda: page.locator(f"{tp} .urow.selected").first.evaluate("e => parseInt(e.style.top)")
    t0 = sel_top()
    page.keyboard.press("ArrowDown")
    check("le frecce spostano la selezione di una riga", page.locator(f"{tp} .urow.selected").count() == 1 and sel_top() == t0 + 20, f"{t0} {sel_top()}")
    # position: scroll to the middle, go back to side by side and the top row is the corresponding one
    page.evaluate(f"document.querySelector('{tp} .pane.unified').scrollTop = 1000 * 20")
    page.wait_for_timeout(200)
    vb.nth(0).click()
    page.wait_for_selector(f"{tp} .pane.left .vrow:not(.loading)")
    exp = 1000
    for (hs, he), (us, ue) in zip(fxo["hunks"], fxo["spans"]):
        if exp < us: break
        if exp < ue: exp = hs; break
        exp -= (ue - us) - (he - hs)
    got = page.evaluate(f"Math.round(document.querySelector('{tp} .pane.right').scrollTop / 20)")
    check("tornando all'Affiancato la posizione resta quella (riga corrispondente)", abs(got - exp) <= 1 and page.locator(f"{tp} .pane.left").count() == 1 and page.locator(f"{tp} .pane.unified").count() == 0, f"{got} {exp}")
    check("l'Affiancato è tornato com'era (due pannelli, riga selezionata sotto)", vb.nth(0).get_attribute("aria-pressed") == "true" and page.locator(f"{tp} .linepanel").count() == 1)
    n_rf = len(calls_of("set_row_filter"))
    vb.nth(0).click()
    check("cliccare Affiancato (già attivo) non cambia nulla", len(calls_of("set_row_filter")) == n_rf and vb.nth(0).get_attribute("aria-pressed") == "true")
    bar.screenshot(path=f"{SHOTS}/toolbar_view.png")
    # compact bar (View menu): one row, icons only, summary in the bar, "Options" with the two menus
    toggle_compact = lambda: (page.click('.menu-title:has-text("Vista")'), page.click('.menu-panel button:has-text("Barra strumenti compatta")'))
    check("di norma la barra non è compatta (il menu Vista ha la voce, non spuntata)",
          "tb-compact" not in (bar.get_attribute("class") or "") and page.locator(".tabpage:not([hidden]) .summary-row").count() == 1)
    toggle_compact()
    page.wait_for_selector(".tabpage:not([hidden]) .dirbar.tb-compact")
    check("compatta: il riepilogo è dentro la barra, senza la riga a parte",
          page.locator(".tabpage:not([hidden]) .summary-row").count() == 0 and bar.locator(".tb-summary .stat").count() == 3
          and "differenze" not in bar.locator(".tb-summary .diff-summary").inner_text() and bar.locator(".row-filter-label").count() == 0)
    cb = bar.locator(".tb-summary .seg .seg-btn")
    check("compatta: il filtro segmentato c'è ancora, senza «Mostra»", [x.inner_text().strip() for x in cb.all()] == ["Tutte", "Differenze", "Con contesto"])
    mbc = bar.locator(".merge-bar .merge-btn")
    check("compatta: «Applica a dx/sx» e «Affiancato/Unificato» solo icone, con nome e suggerimento",
          [x.inner_text().strip() for x in mbc.all()] == ["", ""] and mbc.nth(0).get_attribute("aria-label") == "Applica a dx" and round(mbc.nth(0).bounding_box()["width"]) == 32
          and [x.inner_text().strip() for x in bar.locator(".view-switch .seg-btn").all()] == ["", ""] and bar.locator(".view-switch .seg-btn").nth(0).get_attribute("aria-label") == "Affiancato")
    rbc = bar.locator('button[aria-label="Refresh"]')
    check("compatta: Refresh è un quadrato con la sola icona, ultimo a destra", rbc.inner_text().strip() == "" and round(rbc.bounding_box()["width"]) == 32)
    check("compatta: i menu spazi e algoritmo non sono nella barra: c'è «Options», senza puntino se è tutto predefinito",
          bar.locator(".opt-select select").count() == 0 and bar.locator(".opts-button").count() == 1 and bar.locator(".opts-dot").count() == 0)
    bar.locator(".opts-button").click()
    panel = bar.locator(".opts-panel")
    check("«Options» apre un pannello con i due menu, con i nomi", panel.count() == 1 and panel.locator("select").count() == 2 and "Spazi" in panel.inner_text() and "Algoritmo" in panel.inner_text())
    page.keyboard.press("Escape")
    check("Esc chiude il pannello", bar.locator(".opts-panel").count() == 0)
    hb = bar.bounding_box()["height"]
    check("compatta: la barra è su una riga sola e tutta la parte sopra i file è più bassa", hb < 60 and page.locator(".tabpage:not([hidden]) .file-meta").bounding_box()["y"] < 200, str(hb))
    check("la scelta resta salvata nelle impostazioni", page.evaluate("window.__cfg('settings')").get("compactToolbar") is True)
    bar.screenshot(path=f"{SHOTS}/toolbar_compact.png")
    toggle_compact()
    page.wait_for_selector(".tabpage:not([hidden]) .summary-row")
    check("tolta la barra compatta torna quella normale", "tb-compact" not in (bar.get_attribute("class") or "") and bar.locator(".opt-select select").count() == 2)
    check("Copia e Annulla sono nella barra", bar.locator('button:has-text("Applica a sx")').is_enabled() and bar.locator('button[aria-label="Annulla"]').is_disabled())

    # row filter
    rf("Differenze").click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'set_row_filter')")
    check("«Differenze» chiede al core il filtro", calls_of("set_row_filter")[-1]["filter"] == "diffs", str(calls_of("set_row_filter")))
    page.wait_for_function("document.querySelector('.tabpage:not([hidden]) .summary-row .seg .seg-btn[aria-pressed=true]').textContent.includes('Differenze')")
    check("il filtro attivo cambia e la vista riparte", f"{n} differenze" in counter(page), counter(page))
    rf("Con contesto").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'set_row_filter').length === 2")
    check("«Con contesto» usa il filtro con contesto", calls_of("set_row_filter")[-1]["filter"] == "context")
    rf("Con contesto").click()
    page.wait_for_timeout(200)
    check("riscegliere lo stesso filtro non chiama il core", len(calls_of("set_row_filter")) == 2)
    # the filter stays when the comparison is redone
    bar.locator('button[aria-label="Refresh"]').click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 2")
    check("Refresh rifà il confronto con lo stesso filtro", calls_of("compare_files")[-1]["rowFilter"] == "context", str(calls_of("compare_files")[-1]))
    settled(page)
    check("e con gli stessi percorsi", calls_of("compare_files")[-1]["left"] == "/x/a.txt" and calls_of("compare_files")[-1]["right"] == "/x/b.txt")

    # Swap
    page.locator(".tabpage:not([hidden]) .swap-btn").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 3")
    c = calls_of("compare_files")[-1]
    check("Swap confronta di nuovo a lati scambiati", c["left"] == "/x/b.txt" and c["right"] == "/x/a.txt", str(c))
    check("e scambia anche i campi dei percorsi", page.input_value('.tabpage:not([hidden]) input[aria-label="Sinistra"]') == "/x/b.txt")
    settled(page)

    # quick options
    optb("Ignora maiuscole").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 4")
    c = calls_of("compare_files")[-1]
    check("«Ignora maiuscole» rifà il confronto con l'opzione", c["ignoreCase"] is True and c["ignoreWhitespace"] == "none", str(c))
    settled(page)
    check("il pulsante risulta attivo", optb("Ignora maiuscole").get_attribute("aria-pressed") == "true")
    ws = page.locator('.tabpage:not([hidden]) .toolbar select[aria-label="Ignora spazi"], .tabpage:not([hidden]) select[aria-label="Ignora spazi"]').first
    check("il selettore degli spazi c'è e parte da «Non ignorare»",
          ws.count() == 1 and ws.input_value() == "none"
          and [o.inner_text() for o in ws.locator("option").all()] == ["Nessuno", "Fine riga", "Quantità", "Tutti"])
    ov = ws.locator("xpath=ancestor::label[1]").locator(".opt-value")
    check("il menu degli spazi mostra il valore scelto e il select vero sta sopra, trasparente e della stessa misura",
          ov.inner_text() == "Nessuno" and ws.evaluate("s => getComputedStyle(s).opacity") == "0" and abs(ws.bounding_box()["width"] - ws.locator("xpath=ancestor::label[1]").bounding_box()["width"]) < 3)
    ws.select_option("amount")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 5")
    c = calls_of("compare_files")[-1]
    check("«Solo la quantità» rifà il confronto e si somma alle maiuscole", c["ignoreCase"] is True and c["ignoreWhitespace"] == "amount", str(c))
    settled(page)
    check("il selettore mostra il livello scelto", ws.input_value() == "amount" and ov.inner_text() == "Quantità", ov.inner_text())
    ws.select_option("trailing")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 6")
    check("«A fine riga» arriva al comando", calls_of("compare_files")[-1]["ignoreWhitespace"] == "trailing")
    settled(page)
    ws.select_option("none")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 7")
    check("tornare a «Non ignorare» toglie l'opzione", calls_of("compare_files")[-1]["ignoreWhitespace"] == "none")
    settled(page)

    # comparison algorithm
    sel = page.locator('.tabpage:not([hidden]) select[aria-label="Algoritmo di confronto"]')
    check("il selettore dell'algoritmo c'è e parte da Myers", sel.count() == 1 and sel.input_value() == "myers")
    check("compare_files riceve l'algoritmo predefinito", calls_of("compare_files")[-1]["algorithm"] == "myers", str(calls_of("compare_files")[-1]))
    sel.select_option("patience")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 8")
    c = calls_of("compare_files")[-1]
    check("scegliere Patience rifà il confronto con quell'algoritmo", c["algorithm"] == "patience" and c["ignoreCase"] is True, str(c))
    settled(page)
    check("il selettore ora mostra Patience", sel.input_value() == "patience")
    bar.locator('button[aria-label="Refresh"]').click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 9")
    check("Refresh mantiene l'algoritmo", calls_of("compare_files")[-1]["algorithm"] == "patience")
    settled(page)
    sel.select_option("histogram")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 10")
    check("anche Histogram", calls_of("compare_files")[-1]["algorithm"] == "histogram")
    settled(page)
    sel.select_option("myers")
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 11")
    check("e si torna a Myers", calls_of("compare_files")[-1]["algorithm"] == "myers" and sel.input_value() == "myers")
    settled(page)
    # the bar must stay on a single row at 1100 px
    vp = page.viewport_size
    bh = bar.evaluate("e => e.getBoundingClientRect().height")
    page.set_viewport_size({"width": 1100, "height": vp["height"]})
    page.wait_for_timeout(150)
    page.wait_for_timeout(600)
    h = bar.evaluate("e => e.getBoundingClientRect().height")
    check("a 1100 px la barra normale passa da sola alla compatta e resta su una riga (la scelta nel menu Vista non è cambiata)",
          "tb-compact" in (bar.get_attribute("class") or "") and h < bh * 1.3 and bar.locator(".tb-summary").count() == 1
          and (page.evaluate("window.__cfg('settings')") or {}).get("compactToolbar") is not True and bar.locator(".summary-blocks").is_hidden(), f"{h} contro {bh}")
    bar.screenshot(path=f"{SHOTS}/24_toolbar_algorithm.png")
    page.set_viewport_size(vp)
    page.wait_for_timeout(200)
    check("tornati larghi la barra è di nuovo quella normale, senza oscillare", "tb-compact" not in (bar.get_attribute("class") or "") and bar.locator(".opt-select select").count() == 2)
    page.set_viewport_size({"width": 1180, "height": vp["height"]})
    page.wait_for_timeout(300)
    check("a 1180 px la barra normale sta su una riga e non è compatta (la compatta torna solo quando la normale ci sta)", "tb-compact" not in (bar.get_attribute("class") or "") and bar.evaluate("e => e.getBoundingClientRect().height") < bh * 1.3)
    page.set_viewport_size({"width": 1100, "height": vp["height"]})
    page.wait_for_timeout(300)
    check("e a 1100 px è di nuovo compatta", "tb-compact" in (bar.get_attribute("class") or ""))
    page.set_viewport_size(vp)
    page.wait_for_timeout(200)
    # the calls made here do not count for the following checks
    page.evaluate("(() => { let n = 0; window.__calls = window.__calls.filter(c => c.cmd !== 'compare_files' || ++n <= 6); })()")

    # visible spaces
    before = page.locator(".pane.left .vrow .code").all_inner_texts()
    check("senza «Mostra spazi» non ci sono puntini", not any("·" in t for t in before))
    optb("Mostra spazi").click()
    after = page.locator(".pane.left .vrow .code").all_inner_texts()
    check("«Mostra spazi» mette i puntini", any("·" in t for t in after))
    check("e non rifà il confronto", len(calls_of("compare_files")) == 6)
    optb("Mostra spazi").click()
    check("un secondo clic li toglie", not any("·" in t for t in page.locator(".pane.left .vrow .code").all_inner_texts()))

    # the rows hidden by the filter are marked
    page.evaluate("window.__fx['small.json'].rows[5].gap = true")
    bar.locator('button[aria-label="Refresh"]').click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'compare_files').length === 7")
    settled(page)
    check("una riga preceduta da righe nascoste è segnata", page.locator(".pane.left .vrow.gap").count() >= 1)
    page.evaluate("delete window.__fx['small.json'].rows[5].gap")

    # unsaved changes: the options do not change if one gives up
    page.click('button[aria-label="Successiva"]'); page.wait_for_timeout(200); settled(page)
    row = page.locator(".pane.right .vrow.chg").first
    row.locator(".num").dblclick(); page.locator("input.line-edit").fill("x"); page.keyboard.press("Enter")
    page.wait_for_function("document.querySelectorAll('.file-meta .dirty').length === 1")
    page.evaluate("window.__confirmAnswer = false")
    ws.select_option("all")
    page.wait_for_timeout(400)
    check("con modifiche non salvate e «Annulla» il confronto non si rifà", len(calls_of("compare_files")) == 7)
    check("e l'opzione non risulta cambiata", ws.input_value() == "none")
    page.evaluate("window.__confirmAnswer = true")
    check("nessun errore in console (barra file)", not errors, "; ".join(errors[:3]))
    page.screenshot(path=f"{SHOTS}/31_file_toolbar.png")
    ctx.close()
