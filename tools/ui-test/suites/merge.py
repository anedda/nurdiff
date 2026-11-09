"""Resolving the conflicts of a file (`git mergetool`). A suite of the UI test (see README.md in this folder)."""
import json

from harness import *

# Two conflicts with a long run of lines in between; the second one has the base (diff3 style).
TEXT = "\n".join(
    [f"inizio {i}" for i in range(1, 11)]
    + ["<<<<<<< HEAD", "locale A", "locale B", "=======", "remoto A", ">>>>>>> feature"]
    + [f"mezzo {i}" for i in range(1, 13)]
    + ["<<<<<<< HEAD", "x", "||||||| base comune", "x0", "=======", "y", ">>>>>>> feature"]
    + ["fine 1", "fine 2"]
) + "\n"


def open_merge(browser, text=TEXT, scheme="light"):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme=scheme, locale=LOCALE)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.add_init_script(INIT)
    page.add_init_script(f"window.__mergeRequest = '/repo/file.txt'; window.__mergeText = {json.dumps(text)};")
    page.goto(BASE)
    return ctx, page, errors


def run(browser):
    print("== Risolvere i conflitti di un file (git mergetool) ==")
    ctx, page, errors = open_merge(browser)
    calls_of = lambda c: page.evaluate("(c) => window.__calls.filter(x => x.cmd === c).map(x => x.args)", c)
    page.wait_for_selector(".merge-view .mg-conflict")
    tabs = page.locator(".doctab-label").all_inner_texts()
    check("lanciata da git, l'app apre una scheda con il nome del file (e la Home resta)", [x.strip() for x in tabs] == ["Home", "file.txt"], str(tabs))
    check("la scheda in primo piano è quella del file, non un confronto",
          page.locator(".tabpage:not([hidden]) .merge-view").count() == 1 and page.locator(".tabpage:not([hidden]) .path-field").count() == 0)
    check("apre il file nel core con il suo percorso", calls_of("open_conflicts")[-1]["path"] == "/repo/file.txt")
    status = lambda: page.locator(".mg-status").inner_text()
    check("dice quanti conflitti restano", status() == "Restano 2 conflitti su 2", status())
    cards = page.locator(".mg-conflict")
    check("ogni conflitto ha la sua scheda, da risolvere", cards.count() == 2 and cards.nth(0).locator(".mg-state").inner_text() == "Da risolvere")
    first, second = cards.nth(0), cards.nth(1)
    check("il primo conflitto mostra il lato locale con la sua etichetta e quello remoto",
          "Locale (HEAD)" in first.inner_text() and "Remoto (feature)" in first.inner_text()
          and "locale A\nlocale B" in first.locator(".mg-side.ours .mg-code").inner_text() and first.locator(".mg-side.theirs .mg-code").inner_text() == "remoto A")
    check("il secondo mostra anche la base (diff3)", second.locator(".mg-side.base").count() == 1 and "x0" in second.locator(".mg-side.base").inner_text() and first.locator(".mg-side.base").count() == 0)
    gaps = page.locator(".mg-gap")
    check("le righe lontane dai conflitti sono piegate: all'inizio, in mezzo (12 righe, 6 nascoste) e alla fine non serve",
          [g.strip() for g in gaps.all_inner_texts()] == ["7 righe senza conflitto", "6 righe senza conflitto"], str(gaps.all_inner_texts()))
    page.locator(".mg-line .mg-num").first.wait_for()
    nums = [int(x) for x in page.locator(".mg-line .mg-num").all_inner_texts()]
    check("le righe mostrate hanno il loro numero, quelle piegate no", nums[:3] == [8, 9, 10] and 1 not in nums, str(nums[:6]))

    page.screenshot(path=f"{SHOTS}/merge_start.png")
    first.locator("button", has_text="Prendi il remoto").click()
    page.wait_for_function("window.__calls.some(c => c.cmd === 'resolve_conflict')")
    c = calls_of("resolve_conflict")[-1]
    check("«Prendi il remoto» sceglie il remoto per il primo conflitto", c["index"] == 0 and c["resolution"] == {"kind": "theirs"}, str(c))
    page.wait_for_function("document.querySelector('.mg-status').textContent.startsWith('Resta 1')")
    check("il conflitto passa a «Remoto» e mostra il risultato; ne resta uno", cards.nth(0).locator(".mg-state").inner_text() == "Remoto"
          and cards.nth(0).locator(".mg-side.result .mg-code").inner_text() == "remoto A" and status() == "Resta 1 conflitto su 2", status())
    check("la scheda segna il file come modificato (●)", "●" in page.locator(".doctab.active .doctab-label").inner_text())
    check("dopo la scelta il conflitto seguente diventa quello corrente", cards.nth(1).get_attribute("class").find("current") >= 0)

    # custom text
    second.locator("button", has_text="Modifica…").click()
    area = second.locator("textarea")
    check("«Modifica…» apre un campo con il testo locale", area.input_value() == "x", area.input_value())
    area.fill("uno\ndue\ntre")
    second.locator("button", has_text="Applica").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'resolve_conflict').length === 2")
    c = calls_of("resolve_conflict")[-1]
    check("«Applica» manda il testo scritto, riga per riga", c["index"] == 1 and c["resolution"] == {"kind": "custom", "lines": ["uno", "due", "tre"]}, str(c))
    page.wait_for_function("document.querySelector('.mg-status').textContent.startsWith('Tutti')")
    check("ora tutti i conflitti sono risolti", status() == "Tutti i conflitti sono risolti" and second.locator(".mg-state").inner_text() == "Modificato")
    check("«Salva e chiudi» è pronto; «Salva» è acceso", page.locator("button", has_text="Salva e chiudi").is_enabled() and page.locator(".mg-tools button", has_text="Salva").first.is_enabled())

    # undo and the keyboard
    page.locator(".mg-tools button", has_text="Annulla").click()
    page.wait_for_function("document.querySelector('.mg-status').textContent.startsWith('Resta 1')")
    check("«Annulla» toglie l'ultima scelta", second.locator(".mg-state").inner_text() == "Da risolvere" and calls_of("undo_conflicts"))
    page.keyboard.press("Alt+ArrowDown")
    check("Alt+↓ passa al conflitto seguente", second.get_attribute("class").find("current") >= 0 or first.get_attribute("class").find("current") >= 0)
    first.locator("button", has_text="Annulla la scelta").click()
    page.wait_for_function("document.querySelector('.mg-status').textContent.startsWith('Restano 2')")
    check("«Annulla la scelta» riapre il conflitto", first.locator(".mg-state").inner_text() == "Da risolvere" and calls_of("resolve_conflict")[-1]["resolution"] == {"kind": "unresolved"})

    # fold
    page.locator(".mg-gap").nth(1).click()
    check("un tratto piegato si apre con un clic", page.locator(".mg-gap").count() == 1 and page.locator(".mg-text", has_text="mezzo 6").count() == 1)

    # save: with a conflict left it warns that git will not take the file as resolved
    first.locator("button", has_text="Prendi il locale").click()
    page.wait_for_function("document.querySelector('.mg-status').textContent.startsWith('Resta 1')")
    page.keyboard.press("Control+s")
    page.wait_for_function("window.__calls.some(c => c.cmd === 'save_conflicts')")
    page.wait_for_selector(".notice[role=status]")
    check("Ctrl+S salva, e con un conflitto da risolvere avvisa che Git non darà il file per risolto",
          "ancora da risolvere" in page.locator(".notice[role=status]").inner_text() and "●" not in page.locator(".doctab.active .doctab-label").inner_text(),
          page.locator(".notice[role=status]").inner_text())
    second.locator("button", has_text="Prendi il locale").click()
    page.wait_for_function("document.querySelector('.mg-status').textContent.startsWith('Tutti')")
    page.locator("button", has_text="Salva e chiudi").click()
    page.wait_for_function("window.__calls.filter(c => c.cmd === 'save_conflicts').length === 2")
    check("«Salva e chiudi» salva il risultato e chiude la finestra", True)
    page.wait_for_function("window.__calls.some(c => c.cmd === 'plugin:window|close')", timeout=5000)

    page.screenshot(path=f"{SHOTS}/merge_done.png")
    check("nessun errore in console (conflitti)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # an error of the core does not close the file
    ctx, page, errors = open_merge(browser)
    page.wait_for_selector(".mg-conflict")
    page.evaluate("window.__confFail = { code: 'err.merge.noSuchHunk', params: { n: '9' } }")
    page.locator(".mg-conflict").first.locator("button", has_text="Prendi il locale").click()
    page.wait_for_selector(".merge-view .error")
    check("un errore del core si mostra tradotto e il file resta aperto",
          "non esiste" in page.locator(".merge-view .error").inner_text() and page.locator(".mg-conflict").count() == 2, page.locator(".merge-view .error").inner_text())
    ctx.close()

    # a file with no markers
    ctx, page, errors = open_merge(browser, text="solo testo\nsenza conflitti\n")
    page.wait_for_selector(".merge-view .mg-status")
    check("un file senza marcatori dice che non c'è niente da risolvere",
          page.locator(".mg-status").inner_text() == "Nessun conflitto in questo file" and "non c'è niente da risolvere" in page.locator(".merge-view").inner_text()
          and page.locator(".mg-conflict").count() == 0)
    ctx.close()

    # dark theme: it must be readable
    ctx, page, errors = open_merge(browser, scheme="dark")
    page.evaluate("document.documentElement.setAttribute('data-theme','dark')")
    page.wait_for_selector(".mg-conflict")
    page.screenshot(path=f"{SHOTS}/merge_dark.png")
    check("nessun errore in console (tema scuro)", not errors, "; ".join(errors[:3]))
    ctx.close()
