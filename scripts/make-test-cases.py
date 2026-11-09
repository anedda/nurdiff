#!/usr/bin/env python3
"""Generates the test cases of NurDiff in `dev-local/test-cases/left` and `dev-local/test-cases/right`.

The two trees mirror each other, with known differences, so a comparison of the two folders (and of the files and
archives inside) can be checked by hand. `dev-local/` is not versioned: run this script to create the cases again.

    python3 scripts/make-test-cases.py [output-folder] [--huge N]   (default output: dev-local/test-cases)

    --huge N   lines of the "huge" files (default 150000, about 14 MB each)

Everything is deterministic (fixed seed). `EXPECTED.md` in the output folder says, for every pair, what you should see.
"""
import io
import os
import random
import sys
import tarfile
import warnings
import zipfile

OUT = os.path.join("dev-local", "test-cases")
HUGE = 150_000
args = sys.argv[1:]
while args:
    a = args.pop(0)
    if a == "--huge":
        HUGE = int(args.pop(0))
    else:
        OUT = a

SMALL, MEDIUM, LARGE = 40, 2_000, 50_000
if os.path.isdir(OUT):
    import shutil

    shutil.rmtree(OUT)
LEFT, RIGHT = os.path.join(OUT, "left"), os.path.join(OUT, "right")
DATE = (2026, 3, 14, 8, 30, 0)  # the date of the entries of the archives
manifest = []  # (relative path, what it is, what you should see)
titles = {}

# ------------------------------------------------------------------ content
WORDS = ("the of and to in is that for it as was with be by on not he this are or his from at which but have an "
         "had they you were their one all we can her has there been if more when will would who so no time house "
         "work day road new old big small fast slow water fire earth sky book story word number line file folder "
         "compare change version system project result").split()


def gen_code(n, seed):
    r = random.Random(seed)
    out, i = [], 0
    while len(out) < n:
        out += [f"fn function_{i}(value: i32) -> i32 {{",
                f"    let result = value * {r.randint(2, 99)} + {r.randint(1, 999)};",
                f"    if result > {r.randint(10, 9999)} {{ return result; }}",
                f"    result - {r.randint(1, 50)}",
                "}", ""]
        i += 1
    return out[:n]


def gen_log(n, seed):
    r = random.Random(seed)
    levels = ["INFO ", "INFO ", "INFO ", "WARN ", "ERROR", "DEBUG"]
    out, t = [], 8 * 3600
    for i in range(n):
        t += r.randint(0, 3)
        out.append(f"2026-03-14 {t // 3600 % 24:02d}:{t // 60 % 60:02d}:{t % 60:02d} {r.choice(levels)} "
                   f"[worker-{r.randint(1, 8)}] request {100000 + i} done in {r.randint(3, 900)} ms")
    return out


def gen_text(n, seed):
    r = random.Random(seed)
    out = []
    for _ in range(n):
        line = " ".join(r.choice(WORDS) for _ in range(r.randint(0, 16))).capitalize()
        out.append(line + ("." if line else ""))
    return out


def gen_csv(n, seed):
    r = random.Random(seed)
    out = ["id,name,amount,date"]
    for i in range(n - 1):
        out.append(f"{i},{r.choice(WORDS)} {r.choice(WORDS)},{r.randint(1, 99999) / 100:.2f},2026-0{r.randint(1, 9)}-{r.randint(10, 28)}")
    return out


def make(kind, n, seed):
    return {"code": gen_code, "log": gen_log, "text": gen_text, "csv": gen_csv}[kind](n, seed)


def change(line):
    return line + " (changed)" if line else "(new content)"


def with_changes(lines, indexes):
    out = list(lines)
    for i in indexes:
        out[i] = change(out[i])
    return out


# ------------------------------------------------------------------ writing
def write(side, rel, content, binary=False, newline="\n", final_newline=True, encoding="utf-8"):
    path = os.path.join(LEFT if side == "l" else RIGHT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if binary:
        data = content
    else:
        text = newline.join(content) + (newline if final_newline and content else "")
        data = text.encode(encoding)
    with open(path, "wb") as f:
        f.write(data)
    return path


def pair(rel, left, right, descr, expected, **kw):
    write("l", rel, left, **kw)
    write("r", rel, right, **kw)
    manifest.append((rel, descr, expected))


def section(folder, title):
    titles[folder] = title


def archive_pair(rel, make_left, make_right, descr, expected):
    """`make_left` / `make_right` receive the path to write the archive to."""
    for side, make_it in (("l", make_left), ("r", make_right)):
        path = os.path.join(LEFT if side == "l" else RIGHT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        make_it(path)
    manifest.append((rel, descr, expected))


# ------------------------------------------------------------------ archives
def zip_of(files, compress=zipfile.ZIP_DEFLATED):
    """A function that writes a zip with `files`: (name, bytes or str) pairs, in order."""
    def build(path):
        with zipfile.ZipFile(path, "w", compress) as z:
            for name, data in files:
                info = zipfile.ZipInfo(name, DATE)
                info.compress_type = compress
                if name.endswith("/"):
                    info.external_attr = 0o40755 << 16
                z.writestr(info, data if isinstance(data, bytes) else data.encode("utf-8"))
    return build


def tar_of(files, gz=False):
    def build(path):
        with tarfile.open(path, "w:gz" if gz else "w") as t:
            for name, data in files:
                raw = data if isinstance(data, bytes) else data.encode("utf-8")
                info = tarfile.TarInfo(name)
                info.size, info.mtime, info.mode = len(raw), 1_773_000_000, 0o644
                t.addfile(info, io.BytesIO(raw))
    return build


def sample_files(version):
    """The files of a small project in two versions: 1 and 2 (changed, added and removed files)."""
    files = [
        ("README.md", "# Project\n\nA small project.\n" + ("\nVersion 2 notes.\n" if version == 2 else "")),
        ("src/main.rs", "\n".join(gen_code(30, 1) if version == 1 else with_changes(gen_code(30, 1), [3, 20])) + "\n"),
        ("src/lib.rs", "\n".join(gen_code(20, 2)) + "\n"),
        ("data/table.csv", "\n".join(gen_csv(15, 3)) + "\n"),
        ("docs/guide.txt", "\n".join(gen_text(25, 4)) + "\n"),
    ]
    if version == 1:
        files.append(("old/removed.txt", "only in version 1\n"))
    else:
        files.append(("new/added.txt", "only in version 2\n"))
        files.append(("logo.bin", bytes(range(256)) * 4))
    if version == 1:
        files.append(("logo.bin", bytes(range(256)) * 4))
    return files


# ===================================================================== 01 identical files
section("01-identical", "Identical files")
for kind, n, name in [("text", SMALL, "small"), ("code", MEDIUM, "medium"), ("log", LARGE, "large"), ("csv", MEDIUM, "table")]:
    c = make(kind, n, 10)
    pair(f"01-identical/{name}.{'rs' if kind == 'code' else 'csv' if kind == 'csv' else 'log' if kind == 'log' else 'txt'}",
         c, c, f"{kind}, {n} lines, same on both sides", "identical: =")

# ===================================================================== 02 one line
section("02-one-line", "One different line")
for kind, n, name in [("code", SMALL, "small"), ("text", MEDIUM, "medium"), ("log", LARGE, "large")]:
    c = make(kind, n, 20)
    for where, idx in (("start", 0), ("middle", n // 2), ("end", n - 1)):
        pair(f"02-one-line/{name}-{where}.txt", c, with_changes(c, [idx]),
             f"{n} lines, line {idx + 1} changed ({where})", "1 modified row, 1 block")

# ===================================================================== 03/04 two lines
section("03-two-close-lines", "Two changes close to each other")
c = make("code", MEDIUM, 30)
pair("03-two-close-lines/adjacent.rs", c, with_changes(c, [500, 501]), "two adjacent lines changed", "1 block of 2 modified rows")
pair("03-two-close-lines/one-between.rs", c, with_changes(c, [500, 502]), "two lines with one equal line between", "2 blocks (or 1 with the merge option)")
section("04-two-far-lines", "Two changes far apart")
c = make("text", MEDIUM, 40)
pair("04-two-far-lines/far.txt", c, with_changes(c, [100, 1800]), "two lines far apart", "2 blocks; with context, 'N identical lines' between them")

# ===================================================================== 05 insertions, deletions, moves
section("05-additions-and-cuts", "Insertions, deletions and moved blocks")
c = make("code", MEDIUM, 50)
pair("05-additions-and-cuts/inserted-block.rs", c, c[:700] + ["// added", "// added too", ""] + c[700:], "3 lines inserted", "3 rows only on the right")
pair("05-additions-and-cuts/deleted-block.rs", c, c[:700] + c[710:], "10 lines deleted", "10 rows only on the left")
pair("05-additions-and-cuts/moved-block.rs", c, c[:100] + c[600:650] + c[100:600] + c[650:], "a block of 50 lines moved up",
     "Myers: 50 lines removed and added; Patience/Histogram may group it differently")
log = make("log", MEDIUM, 51)
pair("05-additions-and-cuts/sparse.log", log, [change(l) if i % 100 == 0 else l for i, l in enumerate(log)],
     "one line in 100 changed", "20 blocks of 1 modified row")

# ===================================================================== 06 format only
section("06-format-only", "Differences of format only (minor, marked ≈)")
c = make("code", MEDIUM, 60)
pair("06-format-only/crlf.csv", make("csv", 400, 61), make("csv", 400, 61), "same text, CRLF on the right", "minor: line endings", newline="\n")
write("r", "06-format-only/crlf.csv", make("csv", 400, 61), newline="\r\n")
pair("06-format-only/tab-indent.rs", c, [l.replace("    ", "\t") for l in c], "indent: spaces vs tabs", "different (other whitespace)")
pair("06-format-only/trailing-spaces.rs", c, [l + "   " if i % 7 == 0 else l for i, l in enumerate(c)], "trailing spaces on some lines", "minor: trailing spaces")
pair("06-format-only/case.txt", ["Hello World", "Second Line"], ["hello world", "second line"], "upper/lower case only", "minor: case (with 'ignore case': identical)")
pair("06-format-only/no-final-newline.txt", ["one", "two"], ["one", "two"], "final line break missing on the right", "identical by lines (minor)", final_newline=True)
write("r", "06-format-only/no-final-newline.txt", ["one", "two"], final_newline=False)
pair("06-format-only/extra-blank-lines.txt", ["a", "b", "c"], ["a", "", "", "b", "c"], "two blank lines added", "2 rows only on the right")

# ===================================================================== 07 algorithms
section("07-algorithms", "Where the three algorithms can differ")


def fn(name):
    return [f"fn {name}() {{", "    let x = 1;", "    let y = 2;", "    x + y", "}", ""]


left = fn("alpha") + fn("beta") + fn("gamma") + fn("delta")
right = fn("gamma") + fn("alpha") + fn("delta") + fn("beta")
pair("07-algorithms/functions-moved.rs", left, right, "four similar functions in another order",
     "Myers, Patience and Histogram group the blocks differently")
rep = ["}", "", "{"] * 40
pair("07-algorithms/repeated-lines.txt", rep, rep[5:] + ["}", "x"], "many repeated lines", "same changed lines, blocks may differ")

# ===================================================================== 08 manual alignment
section("08-manual-alignment", "Lines the algorithm pairs wrongly")
pair("08-manual-alignment/mispaired.txt",
     ["header", "item: apple", "item: banana", "item: cherry", "footer"],
     ["header", "item: cherry", "item: apple", "item: banana", "footer"],
     "reordered list", "mark a line on each side to align by hand")

# ===================================================================== 09 folder structure
section("09-structure", "Structure of the folders")
write("l", "09-structure/only-left.txt", ["only on the left"])
write("r", "09-structure/only-right.txt", ["only on the right"])
write("l", "09-structure/only-left-folder/a.txt", ["a"])
write("l", "09-structure/only-left-folder/sub/b.txt", ["b"])
write("r", "09-structure/only-right-folder/c.txt", ["c"])
os.makedirs(os.path.join(LEFT, "09-structure/empty-folder"), exist_ok=True)
os.makedirs(os.path.join(RIGHT, "09-structure/empty-folder"), exist_ok=True)
write("l", "09-structure/file-vs-folder", ["a file on the left"])
write("r", "09-structure/file-vs-folder/inside.txt", ["a folder on the right"])
pair("09-structure/same-size-other-content.txt", ["abcdef"], ["abcxef"], "same size, one byte different", "different")
write("l", "09-structure/same-content-other-date.txt", ["same"])
write("r", "09-structure/same-content-other-date.txt", ["same"])
os.utime(os.path.join(RIGHT, "09-structure/same-content-other-date.txt"), (1_000_000_000, 1_000_000_000))
write("l", "09-structure/empty-vs-full.txt", [])
write("r", "09-structure/empty-vs-full.txt", ["not empty"])
for i in range(60):
    pair(f"09-structure/many-files/f{i:03d}.txt", [f"file {i}"], [f"file {i}"] if i % 10 else [f"file {i} changed"], "", "")
manifest.append(("09-structure/many-files/", "60 files, every tenth differs", "6 different, 54 identical"))
deep = "09-structure/a/b/c/d/e/deep.txt"
pair(deep, ["deep"], ["deep changed"], "a file in 5 nested folders", "different, shown at depth 5")
for rel, what, exp in [
    ("09-structure/only-left.txt", "file only on the left", "left only"),
    ("09-structure/only-right.txt", "file only on the right", "right only"),
    ("09-structure/only-left-folder/", "folder only on the left, with children", "left only (folder and children)"),
    ("09-structure/only-right-folder/", "folder only on the right", "right only"),
    ("09-structure/empty-folder/", "empty folder on both sides", "identical"),
    ("09-structure/file-vs-folder", "a file on the left, a folder on the right", "different type"),
    ("09-structure/same-content-other-date.txt", "same content, other modification date", "identical (the date is shown)"),
    ("09-structure/empty-vs-full.txt", "empty file against a file with content", "different"),
]:
    manifest.append((rel, what, exp))

# ===================================================================== 10 special content
section("10-special-content", "Special content")
pair("10-special-content/accents-and-emoji.txt", ["café", "naïve", "日本語", "emoji 😀 test"], ["café", "naïve", "日本語", "emoji 😀 changed"], "UTF-8, accents, CJK, emoji", "1 modified row")
pair("10-special-content/latin1.txt", ["perché", "così"], ["perché", "cosi"], "Latin-1 without BOM", "1 modified row, encoding Latin-1", encoding="latin-1")
write("l", "10-special-content/utf16.txt", ["utf16 line", "second"], encoding="utf-16")
write("r", "10-special-content/utf16.txt", ["utf16 line", "other"], encoding="utf-16")
manifest.append(("10-special-content/utf16.txt", "UTF-16 with BOM", "1 modified row, encoding UTF-16"))
pair("10-special-content/binary.bin", bytes(range(256)) * 10, bytes(range(256)) * 9 + b"\x00" * 256, "binary file", "different; as a file: 'looks like a binary file'", binary=True)
pair("10-special-content/very-long-line.txt", ["x" * 5000 + " a"], ["x" * 5000 + " b"], "a line of 5000 characters", "1 modified row, no highlight inside the line")
pair("10-special-content/tabs.txt", ["a\tb\tc", "\tindented"], ["a\tb\tc", "\tindented too"], "tabs", "1 modified row")
pair("10-special-content/huge.log", make("log", HUGE, 70), [change(l) if i % 5000 == 0 else l for i, l in enumerate(make("log", HUGE, 70))],
     f"{HUGE} lines, one in 5000 changed", f"{HUGE // 5000 + 1} blocks; opens quickly, scrolls smoothly")

# ===================================================================== 11 archives
section("11-archives", "Archives compared like folders")
archive_pair("11-archives/release.zip", zip_of(sample_files(1)), zip_of(sample_files(2)),
             "zip, version 1 against version 2",
             "open as a pair: README.md, src/main.rs differ; old/removed.txt left only; new/added.txt right only; "
             "logo.bin identical on both sides; the others identical")
archive_pair("11-archives/same.zip", zip_of(sample_files(1)), zip_of(sample_files(1)), "two identical zips", "everything identical")
archive_pair("11-archives/library.jar", zip_of([("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\nMain-Class: app.Main\n"), ("app/Main.class", bytes([0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 52]))]),
             zip_of([("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\nMain-Class: app.Start\n"), ("app/Main.class", bytes([0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 55]))]),
             "jar with a manifest and a class file", "MANIFEST.MF differs by one line; Main.class differs (binary: 'lines not counted')")
archive_pair("11-archives/book.epub",
             zip_of([("mimetype", "application/epub+zip"), ("OEBPS/ch1.xhtml", "<p>" + "</p>\n<p>".join(gen_text(12, 5)) + "</p>\n")], compress=zipfile.ZIP_STORED),
             zip_of([("mimetype", "application/epub+zip"), ("OEBPS/ch1.xhtml", "<p>" + "</p>\n<p>".join(with_changes(gen_text(12, 5), [4])) + "</p>\n")], compress=zipfile.ZIP_STORED),
             "epub: a chapter as text", "ch1.xhtml differs by one paragraph; mimetype identical")
archive_pair("11-archives/app.apk", zip_of([("AndroidManifest.xml", bytes(range(100))), ("classes.dex", b"dex\n035\0" + bytes(200)), ("META-INF/CERT.SF", "Signature-Version: 1.0\n")]),
             zip_of([("AndroidManifest.xml", bytes(range(100))), ("classes.dex", b"dex\n035\0" + bytes(300)), ("META-INF/CERT.SF", "Signature-Version: 1.0\nSHA-256-Digest: x\n")]),
             "apk: mostly binary entries", "classes.dex differs (binary); CERT.SF differs by one line")
archive_pair("11-archives/source.tar", tar_of(sample_files(1)), tar_of(sample_files(2)), "tar, version 1 against 2", "like release.zip")
archive_pair("11-archives/source.tar.gz", tar_of(sample_files(1), gz=True), tar_of(sample_files(2), gz=True), "tar.gz, version 1 against 2", "like release.zip")
archive_pair("11-archives/source.tgz", tar_of(sample_files(1), gz=True), tar_of(sample_files(1), gz=True), "tgz, identical", "everything identical")
archive_pair("11-archives/empty.zip", zip_of([]), zip_of([]), "an empty archive", "identical, nothing to show")


def nested(inner_text):
    def build(path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(zipfile.ZipInfo("inner.txt", DATE), inner_text)
        zip_of([("inner.zip", buf.getvalue()), ("top.txt", "top\n")])(path)
    return build


archive_pair("11-archives/nested.zip", nested("version one\n"), nested("version two\n"),
             "a zip inside a zip", "inner.zip differs (byte level); open nested.zip/inner.zip as a path to see inner.txt differ")
archive_pair("11-archives/unicode-names.zip", zip_of([("café/niño.txt", "x\n"), ("日本語/ファイル.txt", "y\n")]), zip_of([("café/niño.txt", "x\n"), ("日本語/ファイル.txt", "changed\n")]),
             "names with accents and CJK characters", "ファイル.txt differs, the names are shown correctly")
archive_pair("11-archives/many-entries.zip", zip_of([(f"d{i % 20}/f{i:04d}.txt", f"{i}\n") for i in range(3000)]),
             zip_of([(f"d{i % 20}/f{i:04d}.txt", f"{i}\n" if i % 100 else "changed\n") for i in range(3000)]),
             "3000 entries in 20 folders", "30 files differ")
# an archive on one side and a folder on the other: compare the two paths by hand
write("l", "11-archives/as-folder/README.md", ["# Project", "", "A small project."])
write("l", "11-archives/as-folder/src/lib.rs", gen_code(20, 2))
manifest.append(("11-archives/as-folder/", "a folder on the left that matches release.zip partly",
                 "compare left/11-archives/as-folder with left/11-archives/release.zip: archive against folder"))
section("11-archives", "Archives compared like folders")

# ===================================================================== 12 hostile and broken archives
section("12-bad-archives", "Archives that must be refused or handled with care")


def unsafe(path):
    with zipfile.ZipFile(path, "w") as z:
        for name in ("../evil.txt", "/absolute/path.txt", "a/../../escape.txt", "ok/fine.txt"):
            z.writestr(zipfile.ZipInfo(name, DATE), "x\n")


archive_pair("12-bad-archives/unsafe-names.zip", unsafe, unsafe, "entries with .. and absolute names",
             "opens; ok/fine.txt and absolute/path.txt are shown, ../evil.txt and escape.txt are skipped; nothing is written outside")


def with_links(path):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("real.txt", DATE), "real\n")
        info = zipfile.ZipInfo("link-to-passwd", DATE)
        info.external_attr = 0o120777 << 16
        z.writestr(info, "/etc/passwd")


archive_pair("12-bad-archives/with-link.zip", with_links, with_links, "a symbolic link entry", "opens; real.txt only, the link is skipped")


def corrupt(path):
    zip_of([("a.txt", "x" * 5000)])(path)
    data = open(path, "rb").read()
    open(path, "wb").write(data[: len(data) // 2])


archive_pair("12-bad-archives/truncated.zip", corrupt, corrupt, "a zip cut in half", "error: damaged or not an archive")


def encrypted(path):
    zip_of([("secret.txt", "secret\n")])(path)
    data = bytearray(open(path, "rb").read())
    data[6] |= 1
    data[data.find(b"PK\x01\x02") + 8] |= 1
    open(path, "wb").write(bytes(data))


archive_pair("12-bad-archives/password.zip", encrypted, encrypted, "an entry marked as encrypted", "error: needs a password")


def bomb(path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        info = zipfile.ZipInfo("zeros.bin", DATE)
        info.compress_type = zipfile.ZIP_DEFLATED  # with a ZipInfo the archive's setting is ignored
        z.writestr(info, bytes(100 * 1024 * 1024))


archive_pair("12-bad-archives/bomb.zip", bomb, bomb, "100 MB of zeros in about 100 KB", "error: expands far more than a normal archive")


def fake(path):
    with open(path, "w") as f:
        f.write("This is a text file with a .zip name.\n")


archive_pair("12-bad-archives/fake-text.zip", fake, lambda p: open(p, "w").write("Another text file named .zip.\n"),
             "text called .zip", "compared as two text files, not as archives")


def duplicate(path):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with zipfile.ZipFile(path, "w") as z:
            z.writestr(zipfile.ZipInfo("same.txt", DATE), "first\n")
            z.writestr(zipfile.ZipInfo("same.txt", DATE), "second\n")


archive_pair("12-bad-archives/duplicate-names.zip", duplicate, duplicate, "two entries with the same name", "opens with one same.txt")
archive_pair("12-bad-archives/document.docx", zip_of([("word/document.xml", "<w/>")]), zip_of([("word/document.xml", "<w>x</w>")]),
             "a zip-based format that is NOT in the list", "compared as binary files (different); not opened as an archive")

# ===================================================================== expected results
with open(os.path.join(OUT, "EXPECTED.md"), "w", encoding="utf-8") as f:
    f.write("# Expected results\n\nGenerated by `scripts/make-test-cases.py`. Compare `left` with `right`.\n")
    f.write("An archive is compared by giving the path of the two archive files (for example `left/11-archives/release.zip` and\n")
    f.write("`right/11-archives/release.zip`) to a Folders tab, or to `nurdiff-cli`.\n")
    current = None
    for rel, what, expected in manifest:
        folder = rel.split("/")[0]
        if folder != current:
            current = folder
            f.write(f"\n## {folder}: {titles.get(folder, '')}\n\n| Path | What it is | What you should see |\n|---|---|---|\n")
        f.write(f"| `{rel}` | {what} | {expected} |\n")

count = sum(len(files) for _, _, files in os.walk(OUT))
print(f"{count} files in {OUT}/ - see {OUT}/EXPECTED.md")
