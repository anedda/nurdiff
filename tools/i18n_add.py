"""Adds entries to the `en` and `it` catalogues (sorted, in parity).

Usage, from the project root:

    python3 -c "import sys; sys.path.insert(0, 'tools'); from i18n_add import add; add({'key': ('English', 'Italiano')})"

It prints "RISCRITTA" (rewritten) if a key already existed with a different text. Keys are used with
`t("key", { params })`; plurals have the suffixes `_one` / `_other`. The tests (`npx vitest run`)
check that the two catalogues have the same keys and the same placeholders, and that every key
used in the code exists.
"""
import json
import os

D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "i18n", "locales")


def _load(code):
    p = f"{D}/{code}.json"
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}


def add(entries):
    en, it = _load("en"), _load("it")
    for k, (e, i) in entries.items():
        if k in en and (en[k] != e or it.get(k) != i):
            print("RISCRITTA", k)
        en[k], it[k] = e, i
    for code, cat in (("en", en), ("it", it)):
        with open(f"{D}/{code}.json", "w", encoding="utf-8") as f:
            json.dump(dict(sorted(cat.items())), f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(len(en), "voci")
