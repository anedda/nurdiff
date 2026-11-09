"""Dragging, immediate comparison, Browse, start with two paths. A suite of the UI test (see README.md in this folder)."""
from harness import *


def run(browser):
    # ------------------------------------------------------------------ drag & drop
    print("== Trascinamento di file e cartelle ==")
    ctx, page, errors = open_page(browser)
    page.evaluate("""() => { Object.assign(window.__kinds, {
        '/d/a.txt': 'file', '/d/b.txt': 'file', '/d/c.txt': 'file', '/d/dir1': 'dir', '/d/dir2': 'dir', '/d/manca.txt': 'missing' }); }""")
    page.wait_for_function("(window.__listeners['tauri://drag-drop'] || []).length > 0", timeout=5000)
    check("l'app si registra agli eventi di trascinamento", page.evaluate(
        "['tauri://drag-enter','tauri://drag-over','tauri://drag-drop','tauri://drag-leave'].every(e => (window.__listeners[e] || []).length >= 1)"))
    emit = lambda ev, payload=None: page.evaluate("([e, p]) => window.__emit(e, p)", [ev, payload])
    pos = lambda x: {"x": x, "y": 300}
    overlay = lambda: page.locator(".dropzone").count()

    emit("tauri://drag-enter", {"paths": ["/d/a.txt", "/d/b.txt"], "position": pos(200)})
    page.wait_for_selector(".dropzone .zone.both", timeout=3000)
    check("due elementi: un unico riquadro «confronta»", "confrontare" in page.inner_text(".dropzone") and page.locator(".dropzone .zone").count() == 1)
    emit("tauri://drag-leave")
    page.wait_for_timeout(100)
    check("uscendo dalla finestra il riquadro sparisce", overlay() == 0)

    emit("tauri://drag-enter", {"paths": ["/d/a.txt"], "position": pos(200)})
    page.wait_for_selector(".dropzone .zone", timeout=3000)
    active = lambda: page.evaluate("Array.from(document.querySelectorAll('.dropzone .zone')).map(z => z.classList.contains('active') ? z.textContent : '')")
    check("un elemento, puntatore a sinistra: attiva la metà sinistra", active() == ["Sinistra", ""], str(active()))
    emit("tauri://drag-over", {"position": pos(1000)})
    page.wait_for_timeout(100)
    check("puntatore a destra: attiva la metà destra", active() == ["", "Destra"], str(active()))
    page.screenshot(path=f"{SHOTS}/15_drop_overlay.png")
    emit("tauri://drag-leave")

    emit("tauri://drag-enter", {"paths": ["/d/a.txt", "/d/b.txt", "/d/c.txt"], "position": pos(200)})
    page.wait_for_selector(".dropzone .zone.both", timeout=3000)
    check("tre elementi: avviso", "Troppi" in page.inner_text(".dropzone"))
    emit("tauri://drag-drop", {"paths": ["/d/a.txt", "/d/b.txt", "/d/c.txt"], "position": pos(200)})
    page.wait_for_selector(".error", timeout=3000)
    check("tre elementi rilasciati: errore e campi intatti", "3 elementi" in page.inner_text(".error") and page.input_value('input[aria-label="Sinistra"]') == "" and overlay() == 0)

    # a file on the left half and then another on the right
    emit("tauri://drag-drop", {"paths": ["/d/a.txt"], "position": pos(100)})
    page.wait_for_function("document.querySelector('input[aria-label=\"Sinistra\"]').value === '/d/a.txt'")
    check("un file a sinistra riempie solo il campo sinistro", page.input_value('input[aria-label="Destra"]') == "" and not page.locator(".error").count())
    n_cmp = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').length")
    emit("tauri://drag-drop", {"paths": ["/d/b.txt"], "position": pos(1100)})
    page.wait_for_function("document.querySelector('input[aria-label=\"Destra\"]').value === '/d/b.txt'")
    check("un file a destra riempie il campo destro e non confronta da solo", page.input_value('input[aria-label="Sinistra"]') == "/d/a.txt"
          and page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').length") == n_cmp)
    cl = page.evaluate("window.__calls.filter(c => c.cmd === 'classify_paths').slice(-1)[0].args.paths")
    check("classify_paths riceve i percorsi rilasciati", cl == ["/d/b.txt"], str(cl))

    # two files: they fill the fields, the comparison starts only with "Compare"
    n_cmp = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').length")
    emit("tauri://drag-drop", {"paths": ["/d/c.txt", "/d/a.txt"], "position": pos(600)})
    page.wait_for_function("document.querySelector('input[aria-label=\"Sinistra\"]').value === '/d/c.txt'")
    page.wait_for_timeout(300)
    check("due file: i campi si riempiono nell'ordine ricevuto, senza confronto", page.input_value('input[aria-label="Sinistra"]') == "/d/c.txt"
          and page.input_value('input[aria-label="Destra"]') == "/d/a.txt"
          and page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').length") == n_cmp)
    page.click('button[type="submit"]')
    page.wait_for_selector(".viewer", timeout=10_000)
    last = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').slice(-1)[0].args")
    check("«Confronta» confronta i due file", last["left"] == "/d/c.txt" and last["right"] == "/d/a.txt", str(last))

    # the type of a tab does not change: two folders in a file tab give an error
    emit("tauri://drag-drop", {"paths": ["/d/dir1", "/d/dir2"], "position": pos(600)})
    page.wait_for_function("document.querySelector('.tabpage:not([hidden]) .error') && document.querySelector('.tabpage:not([hidden]) .error').textContent.includes('confronta file')")
    check("due cartelle in un tab di file: errore, nessun confronto di cartelle", page.evaluate(
        "window.__calls.filter(c => c.cmd === 'compare_directories').length") == 0)
    emit("tauri://drag-drop", {"paths": ["/d/dir1"], "position": pos(1100)})
    page.wait_for_function("document.querySelector('.tabpage:not([hidden]) .error').textContent.includes('confronta file')")
    check("una cartella in un tab di file: errore e campi intatti", page.input_value('input[aria-label="Destra"]') == "/d/a.txt")

    # errors
    emit("tauri://drag-drop", {"paths": ["/d/a.txt", "/d/dir1"], "position": pos(600)})
    page.wait_for_function("document.querySelector('.error') && document.querySelector('.error').textContent.includes('non un file e una cartella')")
    check("file e cartella insieme: errore", True)
    emit("tauri://drag-drop", {"paths": ["/d/manca.txt"], "position": pos(100)})
    page.wait_for_function("document.querySelector('.error') && document.querySelector('.error').textContent.includes('manca.txt')")
    check("percorso inesistente: errore con il nome", "non esiste" in page.inner_text(".error"), page.inner_text(".error"))
    emit("tauri://drag-drop", {"paths": ["/d/a.txt"], "position": pos(100)})
    page.wait_for_function("!document.querySelector('.error')")
    check("un rilascio valido toglie l'errore precedente", True)
    # on the Home: two folders open a new tab of the right type
    page.locator(".doctab-label").first.click()
    page.wait_for_selector(".home")
    emit("tauri://drag-enter", {"paths": ["/d/dir1", "/d/dir2"], "position": pos(300)})
    page.wait_for_selector(".home .dropzone", timeout=3000)
    n_dirs = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').length")
    emit("tauri://drag-drop", {"paths": ["/d/dir1", "/d/dir2"], "position": pos(300)})
    page.wait_for_selector(".dir-preview .dir-body .vl-row", timeout=10_000)
    check("Home: due cartelle aprono un tab col solo contenuto, senza confronto", page.locator(".doctab").count() == 3
          and page.locator(".dir-preview .dir-body").count() == 1
          and page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').length") == n_dirs)
    names0 = page.evaluate("Array.from(document.querySelectorAll('.dir-preview .dir-body .dir-row')).slice(0,2).map(r => r.querySelectorAll('.half')[0].querySelector('.dir-name').textContent.replace(/[▸▾ ]/g, ''))")
    check("anteprima: primo livello con la cartella prima del file e la cartella chiusa", names0 == ["sub", "a.txt"], str(names0))
    check("anteprima: le due cartelle sono affiancate per nome nella stessa riga",
          page.locator(".dir-preview .dir-body .dir-row").first.locator(".half").count() == 2 and page.locator(".dir-preview .dir-body .dir-row").first.locator(".dir-name").count() == 2)
    check("anteprima: nessuno stato di confronto (nessun colore di stato)",
          page.locator(".dir-preview .dir-row.different, .dir-preview .dir-row.leftOnly").count() == 0)
    page.locator(".dir-preview .dir-body .twisty").first.click()
    page.wait_for_function("document.querySelector('.dir-preview .dir-body').textContent.includes('inner.txt')")
    lp = page.evaluate("window.__calls.filter(c => c.cmd === 'list_directory').slice(-2).map(c => c.args.path).sort()")
    check("anteprima: aprendo una cartella si leggono entrambi i lati", lp == ["/d/dir1/sub", "/d/dir2/sub"], str(lp))
    check("anteprima: la cartella aperta mostra i figli affiancati sulla stessa riga",
          page.locator(".dir-preview .dir-body .dir-row", has_text="inner.txt").first.locator(".dir-name").count() == 2)
    page.screenshot(path=f"{SHOTS}/24_dir_preview.png")
    page.click('.tabpage:not([hidden]) button[type="submit"]')
    page.wait_for_selector(".tabpage:not([hidden]) .diff-view:not(.dir-preview) .dirbar", timeout=10_000)
    last = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').slice(-1)[0].args")
    check("«Confronta» confronta le due cartelle", last["left"] == "/d/dir1" and last["right"] == "/d/dir2"
          and page.locator(".dir-preview").count() == 0, str(last))
    page.locator(".doctab-label").first.click()
    emit("tauri://drag-drop", {"paths": ["/d/a.txt", "/d/dir1"], "position": pos(300)})
    page.wait_for_selector(".home .error", timeout=3000)
    check("Home: file e cartella insieme danno un errore", "non un file e una cartella" in page.inner_text(".home .error"))
    emit("tauri://drag-drop", {"paths": ["/d/a.txt"], "position": pos(1100)})
    page.wait_for_selector('.tabpage:not([hidden]) input[aria-label="Destra"]', timeout=5000)
    check("Home: un file a destra apre un tab di file con solo il lato destro pieno",
          page.input_value('.tabpage:not([hidden]) input[aria-label="Destra"]') == "/d/a.txt"
          and page.input_value('.tabpage:not([hidden]) input[aria-label="Sinistra"]') == "")
    # with the option "Compare folders right away" the comparison starts by itself
    page.click('.menu-title:has-text("Strumenti")'); page.click('.menu-panel button:has-text("Opzioni")')
    check("l'opzione «Confronta subito le cartelle» è disattivata di norma",
          not page.get_by_label("Confronta subito le cartelle").is_checked())
    page.get_by_label("Confronta subito le cartelle").check()
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/dbg_opt.png")
    page.locator(".doctab-label").first.click()
    page.wait_for_selector(".home")
    n_dirs = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').length")
    emit("tauri://drag-enter", {"paths": ["/d/dir2", "/d/dir1"], "position": pos(300)})
    page.wait_for_selector(".home .dropzone", timeout=3000)
    emit("tauri://drag-drop", {"paths": ["/d/dir2", "/d/dir1"], "position": pos(300)})
    page.wait_for_function(f"window.__calls.filter(c => c.cmd === 'compare_directories').length > {n_dirs}", timeout=10_000)
    check("opzione attiva: due cartelle trascinate sulla Home si confrontano subito", True)
    check("nessun errore in console (trascinamento)", not errors, "; ".join(errors[:3]))
    ctx.close()

    print("== File: confronto immediato (impostazione di norma) ==")
    ctx, page, errors = open_page(browser, kind="files", auto_files=True)
    page.evaluate("window.__fileFixture = 'small.json'")
    submit = page.locator('.tabpage:not([hidden]) .controls button[type="submit"]')
    check("prima del primo confronto il pulsante «Confronta» c'è", submit.count() == 1)
    page.evaluate("window.__pick = '/p/uno.txt'")
    page.locator('.tabpage:not([hidden]) .browse-btn').first.click()
    page.wait_for_timeout(300)
    check("Sfoglia: con un solo file scelto non si confronta ancora",
          page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').length") == 0)
    page.evaluate("window.__pick = '/p/due.txt'")
    page.locator('.tabpage:not([hidden]) .browse-btn').nth(1).click()
    page.wait_for_selector(".viewer", timeout=30_000)
    last = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files').slice(-1)[0].args")
    check("Sfoglia: scelti i due file il confronto parte da solo, senza «Confronta»",
          last["left"] == "/p/uno.txt" and last["right"] == "/p/due.txt", str(last))
    check("confronto automatico fatto: il pulsante «Confronta» non c'è", submit.count() == 0)
    page.locator('.tabpage:not([hidden]) input[aria-label="Destra"]').fill("/p/tre.txt")
    check("percorso scritto a mano, non ancora confrontato: il pulsante c'è", submit.count() == 1)
    page.click('.menu-title:has-text("Strumenti")'); page.click('.menu-panel button:has-text("Opzioni")')
    check("opzioni: i file sono attivi di norma, le cartelle no",
          page.get_by_label("Confronta subito i file").is_checked() and not page.get_by_label("Confronta subito le cartelle").is_checked())
    page.keyboard.press("Escape")
    check("nessun errore in console (file immediati)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # "Browse…" follows the same rule: it only loads the content

    print("== Sfoglia senza confronto immediato ==")
    ctx, page, errors = open_page(browser, kind="dirs")
    page.evaluate("window.__pick = '/p/uno'")
    page.locator('.tabpage:not([hidden]) .browse-btn').first.click()
    page.wait_for_selector(".dir-preview .dir-body .vl-row", timeout=5000)
    check("Sfoglia: il campo si riempie e si vede il contenuto, senza confronto", page.input_value('input[aria-label="Sinistra"]') == "/p/uno"
          and page.evaluate("window.__calls.filter(c => c.cmd === 'compare_directories').length") == 0
          and "Destra: nessuna cartella scelta" in page.locator(".preview-msg").inner_text())
    page.evaluate("window.__listFail = 'permesso negato'")
    page.evaluate("window.__pick = '/p/due'")
    page.locator('.tabpage:not([hidden]) .browse-btn').nth(1).click()
    page.wait_for_function("document.querySelector('.dir-preview').textContent.includes('permesso negato')")
    check("cartella illeggibile: messaggio d'errore nel suo elenco", True)
    check("nessun errore in console (Sfoglia)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ------------------------------------------------------------------ start from the command line (git)
    print("== Avvio con due percorsi (git difftool) ==")
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale=LOCALE)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.add_init_script(INIT)
    page.add_init_script("""
      window.__launch = { left: '/tmp/git-blob-x/a.txt', right: '/repo/a.txt', leftReadOnly: true, rightReadOnly: false };
      window.__kinds['/tmp/git-blob-x/a.txt'] = 'file'; window.__kinds['/repo/a.txt'] = 'file';
    """)
    page.goto(BASE)
    page.evaluate("window.__load('small.json')")
    page.wait_for_selector(".viewer", timeout=30_000)
    settled(page)
    cmp = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files')")
    check("all'avvio confronta da solo i due percorsi", len(cmp) == 1 and cmp[0]["args"]["left"] == "/tmp/git-blob-x/a.txt"
          and cmp[0]["args"]["right"] == "/repo/a.txt", str(cmp))
    check("la sola lettura arriva al comando", cmp[0]["args"]["leftReadOnly"] is True and cmp[0]["args"]["rightReadOnly"] is False)
    check("i campi dei percorsi sono riempiti", page.input_value('input[aria-label="Sinistra"]') == "/tmp/git-blob-x/a.txt")
    check("lato sinistro indicato come sola lettura", "sola lettura" in page.inner_text(".file-meta"))
    page.click('button[aria-label="Successiva"]')
    page.wait_for_timeout(150)
    btn = lambda t: page.locator(f'button:has-text("{t}")')
    check("non si può copiare verso il lato in sola lettura", btn("Applica a sx").is_disabled())
    check("si può copiare verso l'altro lato", btn("Applica a dx").is_enabled())
    side_save = lambda i: page.locator(f".file-meta span:nth-child({i}) .meta-save")   # "Save" of a single file, next to "modified"
    check("niente Salva sul lato in sola lettura", side_save(1).count() == 0)
    # automatic comparison and paths already compared: the "Compare" button is not needed and is not there
    submit = page.locator('.controls button[type="submit"]')
    check("confronto automatico, percorsi già confrontati: niente pulsante «Confronta»", submit.count() == 0)
    right_in = page.locator('input[aria-label="Destra"]')
    old_right = right_in.input_value()
    right_in.fill(old_right + "x")
    check("modificando un percorso il pulsante «Confronta» ricompare", submit.count() == 1)
    right_in.fill(old_right)
    check("rimesso il percorso com'era, il pulsante sparisce di nuovo", submit.count() == 0)
    right_in.press("Enter")
    page.wait_for_timeout(500)
    cmp = page.evaluate("window.__calls.filter(c => c.cmd === 'compare_files')")
    check("Invio nel campo rifà il confronto degli stessi percorsi e tiene la sola lettura",
          len(cmp) == 2 and cmp[1]["args"]["leftReadOnly"] is True)
    page.screenshot(path=f"{SHOTS}/12_git_launch.png")
    check("nessun errore in console (avvio)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # Folders (git difftool --dir-diff)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale=LOCALE)
    page = ctx.new_page()
    page.add_init_script(INIT)
    page.add_init_script("""
      window.__launch = { left: '/tmp/git-difftool.X/left/', right: '/tmp/git-difftool.X/right/', leftReadOnly: true, rightReadOnly: false };
      window.__kinds['/tmp/git-difftool.X/left/'] = 'dir'; window.__kinds['/tmp/git-difftool.X/right/'] = 'dir';
    """)
    page.goto(BASE)
    page.wait_for_selector(".dir-body .vl-row", timeout=60_000)
    check("con due cartelle apre il confronto di cartelle", page.evaluate(
        "window.__calls.some(c => c.cmd === 'compare_directories' && c.args.left === '/tmp/git-difftool.X/left/')"))
    ctx.close()
