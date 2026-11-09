# Performance

Measured on 26 October 2026 on a development machine (4 cores, 8 GB of RAM, a slow disk), release build of the comparison engine, one comparison at a time. Repeating a measurement can change it by 20% or more. They are orders of magnitude, not guarantees: your files and disk will give different numbers.

**File comparison** (lines of about 75 characters; files of 74 MB each at one million lines):

| Case | Time | Peak memory |
|---|---|---|
| 1,000,000 lines, identical | about 3 s | 630 MB |
| 1,000,000 lines, one different line in 1,000 (Myers) | 3.0 s | 630 MB |
| 40,000 lines, all different | 0.4 s | 30 MB |
| 20,000 lines, unrelated, only 50 distinct lines (worst case) | 0.7 s | 12 MB |
| 200,000 lines, the same worst case | 4.2 s | not measured |

Memory is about eight times the size of the two files together, so very large files (hundreds of MB each) are not a realistic target. Searching the text of a side takes about 0.5 s on a million lines with no match. After the comparison, reading any window of 5,000 rows takes about 1 ms.

**The three algorithms** (chosen in the comparison bar or as the default in the settings), on the same inputs. The memory includes the lines of the two files held in memory:

| Case | Myers | Patience | Histogram |
|---|---|---|---|
| 100,000 lines, one different line in 100 (1,000 blocks) | 0.20 s, 65 MB | 0.23 s, 66 MB | 0.23 s, 66 MB |
| 1,000,000 lines, one different line in 100 (10,000 blocks) | 2.7 s, 630 MB | 3.1 s, 650 MB | 3.0 s, 650 MB |
| 20,000 unrelated lines, 50 distinct (about 4,600 blocks) | 0.7 s, 12 MB | 0.7 s, 12 MB | 0.7 s, 12 MB |

On these inputs the three find the same blocks and take about the same time. They differ when blocks are moved or rewritten: Patience and Histogram start from lines that are unique (or rare) on both sides, which often reads better on code, while Myers gives the smallest number of changed lines (up to the limit described below; the other two never give fewer, and sometimes group the changes into more or fewer blocks). Where a stretch has no unique lines, Patience and Histogram use Myers for that stretch, which is why the last row is identical.

**Folder comparison** (byte by byte):

| Case | Time | Peak memory |
|---|---|---|
| 6,370 real files (a `node_modules`) against a modified copy, warm | 0.25 s | 7 MB |
| The same, cold (first read) | 11 s | 6 MB |
| 2 × 50,000 small files, warm | 1.4 s | 19 MB |
| The same, first read | 24 s | 19 MB |

The answer for 51,600 entries is 8.7 MB of JSON. In the interface (tried in a browser with the bridge to the engine simulated, not in the real window) a tree of 60,600 entries expands, collapses, filters and scrolls in 15–210 ms, using 38 MB of memory: only the visible rows are drawn.

**Test coverage** (measured with `cargo llvm-cov` and Vitest): 93% of the lines of the engine and the command line, 99% of the interface logic. The glue between the window and the engine is covered only by the browser tests.

**What the engine does when the files are very different.** Lines that exist on one side only never take part in the search for the smallest diff. If a region still has more than about 12,000 changed lines that exist on both sides, the search stops at the furthest point it reached and goes on from there, with a smaller limit for the rest of the file (so the time stays proportional to its size): the diff stays correct and precise, but it is no longer guaranteed to be the smallest. For Histogram, regions above 20,000 rows are split first with the lines that are unique on both sides. When that happens the interface shows a note under the comparison bar, the HTML report says so (the unified text report does not, so that it stays a plain patch), and the command line prints a note on the error output.
