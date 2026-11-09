"""Folder comparison as a tree (20199 entries). A suite of the UI test (see README.md in this folder)."""
from harness import *


def run(browser):
    # ------------------------------------------------------------------ folders
    print("== Cartelle ad albero (20199 voci) ==")
    ctx, page, errors = open_page(browser, kind="dirs")
    page.fill('input[aria-label="Sinistra"]', "/x/l")
    page.fill('input[aria-label="Destra"]', "/x/r")
    page.click('button[type="submit"]')
    page.wait_for_selector(".dir-body .vl-row", timeout=60_000)
    rows = lambda: page.evaluate("""() => { const b = document.querySelector('.dir-body');
        return { rows: b.querySelectorAll('.vl-row').length, h: parseInt(b.firstElementChild.style.height) } }""")
    info = rows()
    check("albero delle sole differenze virtualizzato", info["rows"] < 60 and info["h"] % 22 == 0, str(info))
    check("l'intestazione ha le colonne Nome, Dimensione e Data per i due lati",
          page.locator(".dir-row.head").inner_text().split().count("Dimensione") == 2 and "Data" in page.locator(".dir-row.head").inner_text())
    page.screenshot(path=f"{SHOTS}/9_dir_diff_only.png")
    page.get_by_role("button", name="Tutte", exact=True).click()
    page.get_by_role("button", name="Espandi").click()
    page.wait_for_timeout(300)
    info = rows()
    check("tutte le 20199 voci espanse: altezza = voci x 22px", info["h"] == 20199 * 22, f"{info['h']}")
    check("tutte le voci: poche righe nel DOM", info["rows"] < 60, f"{info['rows']}")
    page.evaluate("document.querySelector('.dir-body').scrollTop = 250000")
    page.wait_for_timeout(250)
    first = page.evaluate("document.querySelector('.dir-body .vl-row .dir-name').textContent")
    check("lo scroll mostra le voci corrispondenti", first.strip() != "", first)
    page.screenshot(path=f"{SHOTS}/10_dir_all_scrolled.png")
    page.get_by_role("button", name="Comprimi").click()
    page.wait_for_timeout(300)
    check("comprimi tutto: restano le voci di primo livello", rows()["h"] == 200 * 22, str(rows()))
    # a folder opens with the arrow
    page.evaluate("document.querySelector('.dir-body').scrollTop = 0")
    page.wait_for_timeout(100)
    page.locator(".dir-body .vl-row").first.locator(".twisty").first.click()
    page.wait_for_timeout(200)
    check("la freccia espande una cartella", rows()["h"] > 200 * 22, str(rows()))
    # toolbar: Minor, Swap, Refresh
    page.get_by_role("button", name="Espandi").click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="Minori").click()
    page.wait_for_timeout(300)
    cls = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row:not(.head)')).map(r => r.className)")
    check("Minor: nessuna voce da un lato solo", not any(('leftOnly' in c) or ('rightOnly' in c) for c in cls), str(cls[:4]))
    page.screenshot(path=f"{SHOTS}/21_dir_minor_marks.png")
    # menu of the filters on the orphans
    page.get_by_role("button", name="Altri filtri").click()
    check("il menu elenca i 7 filtri", page.locator('.dirbar [role="menuitemradio"]').count() == 7)
    page.get_by_role("menuitemradio", name="Mostra orfani a sinistra").click()
    page.wait_for_timeout(300)
    check("il menu si chiude dopo la scelta", page.locator('.dirbar [role="menu"]').count() == 0)
    page.get_by_role("button", name="Espandi").click(); page.wait_for_timeout(300)
    cls = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row:not(.head)')).map(r => r.className)")
    check("Left Orphans: voci solo a sinistra, nessuna solo a destra",
          any('leftOnly' in c for c in cls) and not any('rightOnly' in c for c in cls), str(cls[:4]))
    check("il pulsante del menu risulta attivo", "on" in (page.get_by_role("button", name="Altri filtri").get_attribute("class") or "").split())
    page.get_by_role("button", name="Altri filtri").click()
    check("la voce scelta ha la spunta", page.get_by_role("menuitemradio", name="Mostra orfani a sinistra").get_attribute("aria-checked") == "true")
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    check("Esc chiude il menu", page.locator('.dirbar [role="menu"]').count() == 0)
    page.get_by_role("button", name="Altri filtri").click()
    page.get_by_role("menuitemradio", name="Mostra differenze senza orfani").click(); page.wait_for_timeout(300)
    cls = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row:not(.head)')).map(r => r.className)")
    check("Differences but No Orphans: niente orfani né uguali",
          len(cls) > 0 and not any(('leftOnly' in c) or ('rightOnly' in c) or ('identical' in c) for c in cls), str(cls[:4]))
    # newer on one side: only the different files with the more recent modification date on that side
    def newer_rows(name):
        page.get_by_role("button", name="Altri filtri").click()
        page.get_by_role("menuitemradio", name=name).click(); page.wait_for_timeout(300)
        page.get_by_role("button", name="Espandi").click(); page.wait_for_timeout(300)
        return page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row:not(.head)')).map(r => [r.className, r.querySelector('.dir-name')?.textContent.trim()])")
    right_n = newer_rows("Mostra più recenti a destra")
    check("Right Newer: ci sono voci, tutte diverse (nessun orfano né uguale)",
          len(right_n) > 0 and not any(('leftOnly' in c) or ('rightOnly' in c) or ('identical' in c) for c, _ in right_n), str(right_n[:3]))
    left_n = newer_rows("Mostra più recenti a sinistra")
    check("Left Newer e Right Newer non hanno file in comune",
          not ({n for c, n in left_n if 'dir-folder' not in c and n} & {n for c, n in right_n if 'dir-folder' not in c and n}), f"{len(left_n)} {len(right_n)}")
    page.get_by_role("button", name="Altri filtri").click()
    check("la voce scelta (Mostra più recenti a sinistra) ha la spunta", page.get_by_role("menuitemradio", name="Mostra più recenti a sinistra").get_attribute("aria-checked") == "true")
    page.keyboard.press("Escape"); page.wait_for_timeout(100)
    page.get_by_role("button", name="Minori").click(); page.wait_for_timeout(200)
    n = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').length")
    page.get_by_role("button", name="Refresh").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'compare_directories').length > {n}")
    check("Refresh confronta di nuovo le stesse cartelle", True)
    page.locator(".tabpage:not([hidden]) .swap-btn").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'compare_directories').length > {n + 1}")
    last = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').slice(-1)[0].args")
    check("Swap scambia i due lati", last.get("left") == "/x/r" and last.get("right") == "/x/l", str(last))
    page.locator(".tabpage:not([hidden]) .swap-btn").click()
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'compare_directories').length > {n + 2}")
    page.get_by_role("button", name="Tutte", exact=True).click()
    # colours and dates
    cls = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row')).slice(0,40).map(r => r.className)")
    check("righe colorate per stato", any('different' in c for c in cls) or any('leftOnly' in c for c in cls), str(cls[:3]))
    dates = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-date')).map(e => e.textContent).filter(Boolean)")
    check("la data di modifica è mostrata", len(dates) > 0 and all(len(x) == 16 for x in dates), str(dates[:2]))
    # icons and ≠ marker
    marks = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row')).slice(0,40).map(r => [r.className, r.querySelector('.dir-mark').textContent])")
    check("il ≠ sta sulle voci diverse (file e cartelle)", any('different' in c and m == '≠' for c, m in marks), str(marks[:3]))
    check("nessun ≠ sulle voci uguali o da un lato solo",
          all(m != '≠' for c, m in marks if ('identical' in c or 'leftOnly' in c or 'rightOnly' in c)), str(marks[:3]))
    check("nessun simbolo sulle voci da un lato solo", all(m == '' for c, m in marks if ('leftOnly' in c or 'rightOnly' in c)))
    check("il filtro predefinito è «All»", page.locator('.dirbar .dir-filters .seg-btn[aria-pressed="true"]').inner_text().strip().endswith("Tutte"))
    page.click('.dirbar .seg-btn:has-text("Tutte")')
    page.wait_for_selector(".dir-body .dir-row.identical", timeout=5000)
    ident = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row.identical')).slice(0,20).map(r => [r.querySelector('.dir-mark').textContent, getComputedStyle(r.querySelector('.dir-mark')).fontWeight])")
    check("le voci identiche hanno «=» attenuato (peso normale, grigio), meno evidente del ≠", len(ident) > 0 and all(m == '=' and int(w) < 700 for m, w in ident), str(ident[:2]))
    page.screenshot(path=f"{SHOTS}/eq_marks.png")
    page.click('.dirbar .seg-btn:has-text("Differenze")')
    icons = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row .half .entry-icon')).map(i => i.dataset.icon)")
    check("ogni voce ha la sua icona (cartella o file)", len(icons) > 0 and set(icons) <= {"dir", "dir-open", "file", "link"} and ("dir" in icons or "dir-open" in icons) and "file" in icons, str(set(icons)))
    check("l'intestazione ha la colonna del marcatore", page.locator(".dir-row.head .dir-mark").count() == 1)
    totals = page.evaluate("Array.from(document.querySelectorAll('.dir-body .dir-row')).slice(0,30).filter(r => r.querySelector('.entry-icon[data-icon^=dir]')).flatMap(r => Array.from(r.querySelectorAll('.dir-size.total')).map(x => x.textContent))")
    check("le cartelle mostrano la dimensione totale, in corsivo", len(totals) > 0 and all(t.strip() != "" for t in totals), str(totals[:4]))
    fw = page.evaluate("(() => { const r = Array.from(document.querySelectorAll('.dir-body .dir-row')).find(r => r.querySelector('.dir-size.total')); return r ? getComputedStyle(r.querySelector('.dir-size.total')).fontStyle : ''; })()")
    check("il totale è in corsivo", fw == "italic", fw)
    page.screenshot(path=f"{SHOTS}/dir_totals.png")
    page.screenshot(path=f"{SHOTS}/20_dir_icons.png")
    st = page.evaluate("Array.from(document.querySelectorAll('.dir-body .vl-row')).map(r => [r.style.top, r.querySelector('.dir-row').classList.contains('stripe')]).sort((a,b)=>parseFloat(a[0])-parseFloat(b[0])).slice(0,12).map(x => x[1])")
    check("righe alternate: una sì e una no", len(st) > 6 and all(st[i] != st[i+1] for i in range(len(st)-1)), str(st))
    page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    page.wait_for_timeout(100)
    page.screenshot(path=f"{SHOTS}/22_dir_stripes_dark.png")
    page.evaluate("document.documentElement.removeAttribute('data-theme')")
    # double click: different file -> new tab
    page.get_by_label("Filtra per nome").fill("f00037.txt")
    page.get_by_role("button", name="Espandi").click()
    page.wait_for_timeout(300)
    page.locator(".dir-body .dir-row", has_text="f00037.txt").first.dblclick()
    page.wait_for_selector(".viewer", timeout=30_000)
    cmp_ = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').slice(-1)[0].args")
    check("doppio clic su un file: confronto dei due file corrispondenti",
          cmp_["left"] == "/x/l/d000/f00037.txt" and cmp_["right"] == "/x/r/d000/f00037.txt", str(cmp_))
    check("si apre un nuovo tab e diventa quello attivo", page.locator(".doctab").count() == 3
          and page.locator(".doctab.active").inner_text().strip().startswith("f00037.txt"),
          page.locator(".doctabs").inner_text())
    # going back to the first tab the list is still there, with the filter
    page.locator(".doctab-label").nth(1).click()
    page.wait_for_selector(".dir-body .vl-row")
    check("il primo tab conserva l'elenco e il filtro", page.get_by_label("Filtra per nome").input_value() == "f00037.txt")
    # the same file does not open twice
    page.locator(".dir-body .dir-row", has_text="f00037.txt").first.dblclick()
    page.wait_for_timeout(300)
    check("lo stesso confronto non apre un secondo tab ma porta a quello già aperto",
          page.locator(".doctab").count() == 3 and page.locator(".viewer").is_visible())
    page.locator(".doctab-label").nth(1).click()
    page.wait_for_selector(".dir-body .vl-row")
    # --- comparison of a row in place ---
    row37 = lambda: page.locator(".dir-body .dir-row", has_text="f00037.txt").first
    mark = lambda: row37().locator(".dir-mark").inner_text().strip()
    n_tabs = page.locator(".doctab").count()
    # going back to the tab starts the re-comparison of the opened row: the button says "Comparing…" until it ends
    # Both at once: the button also says "Confronta selezione" before the re-comparison starts, and on a slow machine it starts later.
    page.wait_for_function("""() => document.querySelector('.tabpage:not([hidden]) .controls button.primary')?.textContent.trim() === 'Confronta selezione'
        && [...document.querySelectorAll('.tabpage:not([hidden]) .dir-body .dir-row')].find(r => r.textContent.includes('f00037.txt'))?.querySelector('.dir-mark')?.textContent.trim() === '='""", timeout=10000)
    check("dopo il doppio clic la riga è ancora scelta: il pulsante è «Confronta selezione»", page.locator(".tabpage:not([hidden]) .controls button.primary").inner_text().strip() == "Confronta selezione", page.locator(".tabpage:not([hidden]) .controls button.primary").inner_text())
    check("tornati sul tab, la riga aperta da lì era già stata riconfrontata (il mock dà «uguali»)", mark() == "=", mark())
    page.evaluate("window.__recStatus = 'different'")
    if row37().evaluate("e => !e.classList.contains('selected')"):  # a click on the chosen row would clear the choice
        row37().click()
    check("riga scelta: il pulsante diventa «Confronta selezione»", page.locator(".tabpage:not([hidden]) .controls button.primary").inner_text().strip() == "Confronta selezione")
    summ0 = page.locator(".tabpage:not([hidden]) .summary").inner_text()
    page.evaluate("window.__calls.length = 0")
    page.locator(".tabpage:not([hidden]) .controls button.primary").click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'recompare_entry')")
    page.wait_for_function("document.querySelector('.dir-body').textContent.includes('f00037.txt') && Array.from(document.querySelectorAll('.dir-body .dir-row')).find(r => r.textContent.includes('f00037.txt')).querySelector('.dir-mark').textContent.trim() === '≠'")
    rc = page.evaluate("window.__calls.filter(c => c.cmd === 'recompare_entry')[0].args")
    # the channel of the tab (Cancel in another tab does not stop it) is checked apart
    tab_channel = rc.pop("channel", "").startswith("tab")
    check("«Confronta selezione» riconfronta solo quella riga", tab_channel and rc == {"left": "/x/l", "right": "/x/r", "rel": "d000/f00037.txt", "filter": NOFILTER}, str(rc))
    check("il segno diventa «≠» senza cambiare tab né aprire il file", mark() == "≠" and page.locator(".doctab").count() == n_tabs
          and not any(c["cmd"] == "compare_files" for c in page.evaluate("window.__calls")))
    check("sotto il filtro «Diffs» la riga aggiornata resta visibile", row37().count() == 1)
    check("il riepilogo si aggiorna", page.locator(".tabpage:not([hidden]) .summary").inner_text() != summ0, summ0 + " -> " + page.locator(".tabpage:not([hidden]) .summary").inner_text())
    # context menu
    row37().click(button="right")
    items = page.locator(".ctx-menu button").all_inner_texts()
    check("menu contestuale: confronta, apri in un tab e «Mostra nel file manager» per ogni lato",
          [i.strip() for i in items] == ["Confronta selezione", "Apri in un nuovo tab", "Mostra nel file manager (sinistra)", "Mostra nel file manager (destra)"], str(items))
    page.locator(".ctx-menu button", has_text="Mostra nel file manager (sinistra)").click()
    row37().click(button="right")
    page.locator(".ctx-menu button", has_text="Mostra nel file manager (destra)").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'plugin:opener|reveal_item_in_dir').length === 2", timeout=5000)
    rev = page.evaluate("window.__calls.filter(c => c.cmd === 'plugin:opener|reveal_item_in_dir').map(c => c.args.paths)")
    check("nel confronto: i percorsi sono le radici più il percorso relativo", rev == [["/x/l/d000/f00037.txt"], ["/x/r/d000/f00037.txt"]], str(rev))
    page.evaluate("window.__revealFail = 'file manager non trovato'")
    row37().click(button="right")
    page.locator(".ctx-menu button", has_text="Mostra nel file manager (sinistra)").click()
    page.wait_for_selector(".error")
    check("se il file manager non si apre, l'errore si vede", "file manager non trovato" in page.locator(".error").first.inner_text(), page.locator(".error").first.inner_text())
    page.evaluate("window.__revealFail = null")
    row37().click(button="right")
    page.evaluate("window.__recStatus = 'identical'")
    page.locator(".ctx-menu button", has_text="Confronta selezione").click()
    page.wait_for_function("Array.from(document.querySelectorAll('.dir-body .dir-row')).find(r => r.textContent.includes('f00037.txt')).querySelector('.dir-mark').textContent.trim() === '='")
    check("dal menu: la riga torna «=»", mark() == "=")
    # error
    page.evaluate("window.__recFail = 'boom'")
    if row37().evaluate("e => !e.classList.contains('selected')"):
        row37().click()
    page.locator(".tabpage:not([hidden]) .controls button.primary").click()
    page.wait_for_function("Array.from(document.querySelectorAll('.dir-body .dir-row')).find(r => r.textContent.includes('f00037.txt')).querySelector('.dir-mark').textContent.trim() === '!'")
    check("confronto fallito: segno «!» con il motivo nel suggerimento", "boom" in (row37().locator(".dir-mark").get_attribute("title") or ""))
    page.evaluate("window.__recFail = null")
    # an entry the core could not read: "!" with the reason, and the next comparison takes it away
    mark_is = lambda m: page.wait_for_function("Array.from(document.querySelectorAll('.dir-body .dir-row')).find(r => r.textContent.includes('f00037.txt')).querySelector('.dir-mark').textContent.trim() === '" + m + "'")
    page.evaluate("window.__recError = 'Permission denied'; window.__recStatus = 'different'")
    page.locator(".tabpage:not([hidden]) .controls button.primary").click()
    mark_is("!")
    check("voce illeggibile: segno «!» con «Non leggibile» e il motivo", (row37().locator(".dir-mark").get_attribute("title") or "") == "Non leggibile: Permission denied")
    page.evaluate("window.__recError = null; window.__recStatus = 'identical'")
    page.locator(".tabpage:not([hidden]) .controls button.primary").click()
    mark_is("=")
    check("riconfrontata leggibile: il segno «!» se ne va", mark() == "=")
    # modified paths: "Compare" is back
    page.fill('input[aria-label="Sinistra"]', "/x/altro")
    check("campi modificati: il pulsante torna «Confronta»", page.locator(".tabpage:not([hidden]) .controls button.primary").inner_text().strip() == "Confronta")
    page.fill('input[aria-label="Sinistra"]', "/x/l")
    check("campi ripristinati: di nuovo «Confronta selezione»", page.locator(".tabpage:not([hidden]) .controls button.primary").inner_text().strip() == "Confronta selezione")
    # open in a new tab from the menu and return to the tab: the row is compared again
    row37().click(button="right")
    page.locator(".ctx-menu button", has_text="Apri in un nuovo tab").click()
    page.wait_for_selector(".viewer", timeout=30_000)
    page.evaluate("window.__calls.length = 0; window.__recStatus = 'identical'")
    page.locator(".doctab-label").nth(1).click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'recompare_entry')")
    check("tornando al tab, la riga aperta altrove viene riconfrontata", True)
    page.screenshot(path=f"{SHOTS}/30_dir_row_inplace.png")
    # entry present on one side only
    page.get_by_label("Filtra per nome").fill("f00307.txt")
    page.wait_for_timeout(200)
    page.locator(".dir-body .dir-row", has_text="f00307.txt").first.dblclick()
    page.wait_for_timeout(200)
    check("file presente da un solo lato: avviso", "solo da un lato" in page.inner_text(".notice"), page.inner_text(".notice"))
    n_calls = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').length")
    check("e nessun confronto parte", n_calls == 0, str(n_calls))
    # closing the tab: it frees the comparison
    page.locator(".doctab-close").nth(1).click()  # two × (folders, files): the Home does not have its own
    page.wait_for_timeout(300)
    check("chiusa la scheda restano Home e cartelle, e il confronto è rilasciato", page.locator(".doctab").count() == 2
          and page.evaluate("window.__calls.some(c => c.cmd === 'release_diff')"))
    page.locator(".doctab-add").click()
    check("il + apre un tab nuovo con la scelta del tipo", page.locator(".doctab").count() == 3
          and page.locator(".doctab.active").inner_text().strip().startswith("Nuovo") and page.locator(".chooser .card").count() == 2)
    check("nel tab nuovo non ci sono i campi dei percorsi", page.locator('.tabpage:not([hidden]) input[aria-label="Sinistra"]').count() == 0)
    page.click('.chooser .card:has-text("File")')
    check("scelto il tipo compaiono i campi e la scelta sparisce", page.locator('.tabpage:not([hidden]) input[aria-label="Sinistra"]').count() == 1
          and page.locator(".chooser").count() == 0)
    check("non c'è più il commutatore File/Cartelle", page.locator("button.tab").count() == 0)
    page.keyboard.press("Control+t")
    check("Ctrl+T apre un altro tab nuovo", page.locator(".doctab").count() == 4 and page.locator(".chooser").count() == 1)
    page.locator(".doctab-label").first.click()
    check("la Home non si chiude", page.locator(".doctab").first.locator(".doctab-close").count() == 0)
    check("nessun errore in console (cartelle)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== Cartelle: togliere la scelta della riga, Espandi e Comprimi nella mappa ==")
    ctx, page, errors = open_page(browser, kind="dirs")
    page.fill('input[aria-label="Sinistra"]', "/x/l")
    page.fill('input[aria-label="Destra"]', "/x/r")
    page.click('button[type="submit"]')
    page.wait_for_selector(".dir-body .vl-row", timeout=60_000)
    sel = lambda: page.locator(".dir-body .dir-row.selected").count()
    main_btn = page.locator('.tabpage:not([hidden]) .paths button.primary')
    first = lambda: page.locator(".dir-body .dir-row").first
    first().locator(".half").first.click()
    check("un clic sceglie la riga e il pulsante diventa «Confronta selezione»", sel() == 1 and main_btn.inner_text().strip() == "Confronta selezione")
    first().locator(".half").first.click()
    check("un secondo clic sulla riga scelta toglie la scelta", sel() == 0 and main_btn.inner_text().strip() == "Confronta")
    first().locator(".half").first.click()
    page.locator(".tabpage:not([hidden]) .diff-view .summary-row").click(position={"x": 4, "y": 4})
    check("un clic sullo sfondo, fuori dalla tabella, toglie la scelta", sel() == 0)
    first().locator(".half").first.click()
    page.keyboard.press("Escape")
    check("Esc toglie la scelta", sel() == 0 and main_btn.inner_text().strip() == "Confronta")
    first().locator(".half").first.click()
    page.locator(".tabpage:not([hidden]) .dirbar .view-switch .seg-btn", has_text="Unificato").click()
    page.wait_for_selector(".dir-list.unified .dir-body .dir-row")
    check("un clic su un controllo della barra (la vista) non toglie la scelta", sel() == 1, str(sel()))
    page.locator(".tabpage:not([hidden]) .dirbar .view-switch .seg-btn", has_text="Affiancato").click()
    page.wait_for_selector(".dir-body .dir-row")
    page.locator(".tabpage:not([hidden]) .dirbar .view-switch .seg-btn", has_text="Mappa").click()
    page.wait_for_selector(".dir-map .map-cell")
    ex, co = page.locator('.tabpage:not([hidden]) .dir-tools button[aria-label="Espandi"]'), page.locator('.tabpage:not([hidden]) .dir-tools button[aria-label="Comprimi"]')
    check("nella mappa Espandi e Comprimi sono disattivati, con il suggerimento che dice perché",
          ex.is_disabled() and co.is_disabled() and "non per la mappa" in ex.get_attribute("title"))
    page.locator(".tabpage:not([hidden]) .dirbar .view-switch .seg-btn", has_text="Affiancato").click()
    check("nell'elenco tornano attivi", ex.is_enabled() and co.is_enabled())
    check("nessun errore in console (scelta della riga)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ archives
    print("== Archivi: due archivi si confrontano come cartelle ==")
    ctx, page, errors = open_page(browser, kind="dirs")

    def with_archive(route):
        import json
        data = route.fetch().json()
        row = {"path": "pack.zip", "status": "different", "leftKind": "file", "rightKind": "file",
               "leftSize": 120, "rightSize": 130, "leftModified": 1792097082717, "rightModified": 1792097083283}
        data["entries"].insert(1, row)
        data["stats"]["different"] += 1
        route.fulfill(body=json.dumps(data), content_type="application/json")

    page.route("**/fixtures/dir.json", with_archive)
    # For the core an archive is a folder: the same answer for the two sides of the row.
    page.evaluate("Object.assign(window.__kinds, {'/x/l/pack.zip': 'dir', '/x/r/pack.zip': 'dir'})")
    page.fill('input[aria-label="Sinistra"]', "/x/l")
    page.fill('input[aria-label="Destra"]', "/x/r")
    page.click('button[type="submit"]')
    page.wait_for_selector(".dir-body .vl-row", timeout=60_000)
    page.get_by_label("Filtra per nome").fill("pack.zip")
    page.get_by_role("button", name="Espandi").click()
    page.wait_for_timeout(300)
    page.locator(".dir-body .dir-row", has_text="pack.zip").first.dblclick()
    page.wait_for_selector(".doctab.active", timeout=30_000)
    page.wait_for_timeout(500)
    calls = page.evaluate("window.__calls.map(c => [c.cmd, c.args.left, c.args.right])")
    check("doppio clic su due archivi: si apre un tab di cartelle, non di file",
          ["compare_directories", "/x/l/pack.zip", "/x/r/pack.zip"] in calls
          and not any(c[0] == "compare_files" and c[1] == "/x/l/pack.zip" for c in calls),
          str([c for c in calls if "pack.zip" in str(c)]))
    check("il nuovo tab ha il nome dell'archivio e mostra il confronto delle cartelle",
          page.locator(".doctab.active").inner_text().strip().startswith("pack.zip")
          and page.locator(".tabpage:not([hidden]) .dir-body").count() == 1,
          page.locator(".doctabs").inner_text())
    check("nessun errore in console (archivi)", not errors, "; ".join(errors[:3]))
    ctx.close()
