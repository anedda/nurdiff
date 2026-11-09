use std::{fs, path::PathBuf, time::Instant};

use nurdiff_core::{
    compare_dirs, DiffOptions, DiffStore, DirOptions, MergeDirection, OpenedDiff, Row, Session,
    Side, UnifiedRow, MAX_SLICE,
};

fn all_rows(store: &DiffStore, opened: &OpenedDiff) -> Vec<Row> {
    let total = opened.summary.total_rows;
    let mut rows = Vec::with_capacity(total);
    let mut start = 0;
    while start < total {
        rows.extend(store.rows(opened.id, start, start + MAX_SLICE).unwrap());
        start += MAX_SLICE;
    }
    rows
}

fn all_unified(store: &DiffStore, opened: &OpenedDiff) -> Vec<UnifiedRow> {
    let total = opened.summary.unified_total;
    let mut rows = Vec::with_capacity(total);
    let mut start = 0;
    while start < total {
        rows.extend(
            store
                .unified_rows(opened.id, start, start + MAX_SLICE)
                .unwrap(),
        );
        start += MAX_SLICE;
    }
    rows
}

fn state(store: &DiffStore, opened: &OpenedDiff, cmd: &str) -> String {
    format!(
        "{{\"cmd\":\"{cmd}\",\"opened\":{},\"rows\":{}}}",
        serde_json::to_string(opened).unwrap(),
        serde_json::to_string(&all_rows(store, opened)).unwrap()
    )
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let (mode, left, right, out) = (&a[1], PathBuf::from(&a[2]), PathBuf::from(&a[3]), &a[4]);
    let t = Instant::now();
    let json = match mode.as_str() {
        "file" => {
            let session = Session::load(&left, &right, &DiffOptions::default()).unwrap();
            eprintln!(
                "  diff: {:?} ({} righe)",
                t.elapsed(),
                session.diff().rows.len()
            );
            let mut store = DiffStore::new();
            let opened = store.open(session);
            let summary = serde_json::to_string(&opened).unwrap();
            eprintln!("  riepilogo: {:.2} MB", summary.len() as f64 / 1e6);
            let rows = all_rows(&store, &opened);
            let marked = rows
                .iter()
                .filter(|r| r.left.as_ref().is_some_and(|c| !c.marks.is_empty()))
                .count();
            eprintln!("  righe con parti evidenziate: {marked}");
            // The rows of the unified view are only needed for small files (for the UI test).
            let unified = if opened.summary.unified_total <= 20_000 {
                format!(
                    ",\"unified\":{}",
                    serde_json::to_string(&all_unified(&store, &opened)).unwrap()
                )
            } else {
                String::new()
            };
            format!(
                "{{\"opened\":{summary},\"rows\":{}{unified}}}",
                serde_json::to_string(&rows).unwrap()
            )
        }
        // Copies the files to a temporary folder and records, step by step, the real answers
        // of the core to a sequence of commands: it is used to try the UI without Rust.
        "merge" => {
            let dir = std::env::temp_dir().join("nurdiff-merge-fixture");
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            let (l, r) = (dir.join("l.txt"), dir.join("r.txt"));
            fs::copy(&left, &l).unwrap();
            fs::copy(&right, &r).unwrap();
            let mut store = DiffStore::new();
            let s0 = store.open(Session::load(&l, &r, &DiffOptions::default()).unwrap());
            let id = s0.id;
            let mut states = vec![state(&store, &s0, "compare_files")];
            let s1 = store
                .apply_hunk(id, 0, MergeDirection::LeftToRight)
                .unwrap();
            states.push(state(&store, &s1, "merge_hunk"));
            let s2 = store.save(id, Side::Right).unwrap();
            states.push(state(&store, &s2, "save_side"));
            let s3 = store
                .apply_hunk(id, 0, MergeDirection::RightToLeft)
                .unwrap();
            states.push(state(&store, &s3, "merge_hunk"));
            let s4 = store.save(id, Side::Left).unwrap();
            states.push(state(&store, &s4, "save_side"));
            let s5 = store.undo(id).unwrap();
            states.push(state(&store, &s5, "undo_merge"));
            eprintln!(
                "  stati: hunks {:?}, dirty (l,r) {:?}",
                [&s0, &s1, &s2, &s3, &s4, &s5].map(|s| s.summary.hunks.len()),
                [&s0, &s1, &s2, &s3, &s4, &s5].map(|s| (s.left_dirty, s.right_dirty))
            );
            format!("{{\"states\":[{}]}}", states.join(","))
        }
        "bench" => {
            let dir = std::env::temp_dir().join("nurdiff-bench");
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            let (l, r) = (dir.join("l.txt"), dir.join("r.txt"));
            fs::copy(&left, &l).unwrap();
            fs::copy(&right, &r).unwrap();
            let t = Instant::now();
            let mut store = DiffStore::new();
            let s0 = store.open(Session::load(&l, &r, &DiffOptions::default()).unwrap());
            eprintln!(
                "  apertura: {:?} ({} blocchi)",
                t.elapsed(),
                s0.summary.hunks.len()
            );
            let t = Instant::now();
            let s1 = store
                .apply_hunk(s0.id, 1000, MergeDirection::LeftToRight)
                .unwrap();
            eprintln!(
                "  unione di un blocco: {:?} ({} blocchi)",
                t.elapsed(),
                s1.summary.hunks.len()
            );
            let t = Instant::now();
            store.undo(s0.id).unwrap();
            eprintln!("  annulla: {:?}", t.elapsed());
            store
                .apply_hunk(s0.id, 1000, MergeDirection::LeftToRight)
                .unwrap();
            let t = Instant::now();
            store.save(s0.id, Side::Right).unwrap();
            eprintln!(
                "  salvataggio ({} MB): {:?}",
                fs::metadata(&r).unwrap().len() as f64 / 1e6,
                t.elapsed()
            );
            String::new()
        }
        "dir" => {
            let d = compare_dirs(&left, &right, &DirOptions::default()).unwrap();
            eprintln!("  confronto: {:?} ({} voci)", t.elapsed(), d.entries.len());
            serde_json::to_string(&d).unwrap()
        }
        _ => panic!("modo sconosciuto"),
    };
    fs::write(out, &json).unwrap();
    eprintln!("  {} -> {:.1} MB", out, json.len() as f64 / 1e6);
}
