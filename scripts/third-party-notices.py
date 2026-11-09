#!/usr/bin/env python3
"""Writes THIRD-PARTY-NOTICES.md from Cargo.lock (through `cargo metadata`) and package-lock.json.

Usage:
  ./scripts/dev.sh run bash -c 'cargo metadata --format-version 1 --locked > target/cargo-metadata.json'
  python3 scripts/third-party-notices.py target/cargo-metadata.json > THIRD-PARTY-NOTICES.md

Rust: the crates the app and the command line are built from (normal and build dependencies; dev dependencies are
left out). JavaScript: what the interface ships (`dependencies` of package.json and what they need).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def rust_rows(meta):
    packages = {p["id"]: p for p in meta["packages"]}
    nodes = {n["id"]: n for n in meta["resolve"]["nodes"]}
    roots = [p["id"] for p in meta["packages"] if p["source"] is None and p["name"] in ("nurdiff", "nurdiff-cli")]
    seen, todo = set(), list(roots)
    while todo:
        pid = todo.pop()
        if pid in seen:
            continue
        seen.add(pid)
        for dep in nodes[pid]["deps"]:
            if any(k["kind"] in (None, "build") for k in dep["dep_kinds"]):
                todo.append(dep["pkg"])
    rows = []
    for pid in seen:
        p = packages[pid]
        if p["source"] is None:  # our own crates
            continue
        macro = " (proc-macro)" if any("proc-macro" in t["kind"] for t in p["targets"]) else ""
        rows.append((p["name"].lower(), f"| {p['name']} v{p['version']}{macro} | {p.get('license') or 'see the crate'} | {p.get('repository') or p.get('homepage') or ''} |"))
    return [r for _, r in sorted(rows)]


def js_rows():
    lock = json.loads((ROOT / "package-lock.json").read_text())["packages"]
    top = json.loads((ROOT / "package.json").read_text()).get("dependencies", {})

    def find(frm, name):
        """The entry of `name` as Node resolves it from the package at `frm`."""
        base = frm
        while True:
            key = f"{base}/node_modules/{name}" if base else f"node_modules/{name}"
            if key in lock:
                return key
            if not base:
                return None
            base = base.rsplit("/node_modules/", 1)[0] if "/node_modules/" in base else ""

    seen, todo = set(), [find("", n) for n in top]
    while todo:
        key = todo.pop()
        if key is None or key in seen:
            continue
        seen.add(key)
        for field in ("dependencies", "optionalDependencies"):
            todo += [find(key, n) for n in lock[key].get(field, {})]
    rows = []
    for key in seen:
        e = lock[key]
        name = e.get("name") or key.rsplit("node_modules/", 1)[1]
        rows.append((name.lower(), f"| {name} | {e['version']} | {e.get('license', 'see the package')} |"))
    return [r for _, r in sorted(rows)]


def main():
    meta = json.loads(Path(sys.argv[1]).read_text())
    out = [
        "# Third-party notices",
        "",
        "NurDiff is released under the GNU General Public License, version 3 or later (see `LICENSE`). It includes or links the components below, each under its own license. The list is generated from `Cargo.lock` and `package-lock.json` by `scripts/third-party-notices.py`; the license texts are in the source of each component.",
        "",
        "## Font",
        "",
        "- JetBrains Mono, SIL Open Font License 1.1 (`src/fonts/OFL-JetBrainsMono.txt`).",
        "",
        "## JavaScript (shipped in the application)",
        "",
        "| Package | Version | License |",
        "| --- | --- | --- |",
        *js_rows(),
        "",
        "## Rust (the application and the command line, all platforms)",
        "",
        "| Crate | License | Source |",
        "| --- | --- | --- |",
        *rust_rows(meta),
        "",
    ]
    print("\n".join(out), end="")


main()
