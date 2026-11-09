"""UI test in Chromium with Tauri's `invoke` bridge simulated (see README.md in this folder).

The answers of the commands come from `fixtures/*.json.gz` (run.sh decompresses them into dist/fixtures), which are the real output of the core. It does not test
the Tauri crate or the real window. Usage: ./tools/ui-test/run.sh [suite…]
"""
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("NURDIFF_UI_BASE", "http://localhost:4173")
SHOTS = os.path.join(HERE, "shots")
os.makedirs(SHOTS, exist_ok=True)


# It only simulates Tauri's `invoke` bridge: the data is the real output of the core.
INIT = """
window.__calls = [];
// The content of a configuration "file" (`state`, `settings`, `recents`) as the app saved it.
window.__cfg = (name) => { const t = localStorage.getItem('__file:' + name); return t === null ? null : JSON.parse(t); };
window.__fileFixture = 'small.json';
window.__pick = null;
window.__fail = null;
window.__failRows = false;
window.__nextId = 100;
window.__cursor = 0;
window.__failNext = null;
window.__launch = null;
window.__savePath = '/out/report.html';
window.__confirmAnswer = true;
window.__dialogs = [];
window.__fx = {};      // loaded fixtures: name -> {opened, rows}
window.__open = {};    // comparisons "open" as in Rust: id -> fixture
window.__rowCalls = [];
window.__bytes = { summary: 0, rows: 0 };
window.__load = async (name) => {
  if (!window.__fx[name]) window.__fx[name] = await (await fetch('/fixtures/' + name)).json();
};
// Cancelling a folder comparison: with __compareHold the comparisons stay held until
// `cancel_compare` arrives on their channel, and then they answer null (like the core).
// The epochs are per channel (a tab, a preview), as in the core: __epochs[kind][channel].
window.__epochs = { compare: {}, size: {}, scan: {} };
window.__epoch = (kind, channel) => window.__epochs[kind][channel] || 0;
window.__bump = (kind, channel) => (window.__epochs[kind][channel] = window.__epoch(kind, channel) + 1);
window.__compareHold = false; window.__holdWaiters = [];
window.__held = async (channel) => {
  if (!window.__compareHold) return false;
  const epoch = window.__epoch('compare', channel);
  await new Promise(r => window.__holdWaiters.push({ channel, r }));
  return window.__epoch('compare', channel) !== epoch;
};
window.__cbs = {};
window.__listeners = {};   // event -> [callback id]
window.__kinds = {};       // path -> 'file' | 'dir' | 'other' | 'missing'
window.__emit = (event, payload) => {
  for (const id of (window.__listeners[event] || [])) window.__cbs[id]({ event, id: 1, payload });
};
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  transformCallback: (cb) => { const id = Object.keys(window.__cbs).length + 1; window.__cbs[id] = cb; return id; },
  invoke: async (cmd, args) => {
    window.__calls.push({ cmd, args });
    if (window.__fail) throw window.__fail;
    if (cmd === 'compare_files') {
      await window.__load(window.__fileFixture);
      let fx = window.__fx[window.__fileFixture];
      const id = ++window.__nextId;
      if (fx.states) {           // recorded sequence: state 0 is the comparison just opened
        window.__cursor = 0;
        window.__open[id] = { rows: fx.states[0].rows };
        return { ...fx.states[0].opened, id };
      }
      window.__open[id] = { rows: fx.rows, unified: fx.unified || [], opened: fx.opened, aligns: (args.aligns || []).map(p => [...p]) };
      const out = { ...fx.opened, id, aligns: window.__open[id].aligns, leftReadOnly: !!args.leftReadOnly, rightReadOnly: !!args.rightReadOnly };
      window.__bytes.summary = JSON.stringify(out).length;
      return out;
    }
    if (cmd === 'get_rows') {
      if (window.__failRows) throw 'errore simulato nel caricamento delle righe';
      const fx = window.__open[args.id];
      if (!fx) throw 'confronto ' + args.id + ' non più disponibile';
      const start = Math.min(args.start, fx.rows.length);
      const end = Math.max(start, Math.min(args.end, fx.rows.length, start + 5000));
      window.__rowCalls.push([args.id, start, end]);
      let rows = fx.rows.slice(start, end);
      const al = fx.aligns || [];
      if (al.length) rows = rows.map(r => r.left && al.some(p => p[0] === r.left.number) ? { ...r, aligned: true } : r);
      window.__bytes.rows += JSON.stringify(rows).length;
      return rows;
    }
    if (cmd === 'cancel_search') return null;
    if (cmd === 'search_rows') {
      (window.__searchCalls = window.__searchCalls || []).push(args);
      // `__searchHold`: the answer waits until the test releases it (to look at what the page shows while it is awaited).
      if (window.__searchHold) await new Promise(r => (window.__searchWaiters = window.__searchWaiters || []).push(r));
      const fx = window.__open[args.id];
      if (!fx) throw 'confronto ' + args.id + ' non più disponibile';
      const fold = s => (args.caseSensitive ? s : s.toLowerCase());
      const q = fold(args.text), hits = [];
      let truncated = false;
      for (let i = 0; q && i < fx.rows.length && !truncated; i++) {
        const cell = fx.rows[i][args.side];
        if (!cell) continue;
        const t = fold(cell.text);
        for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + q.length)) {
          if (hits.length === 10000) { truncated = true; break; }
          hits.push({ row: i, start: at, end: at + q.length });
        }
      }
      return { hits, truncated };
    }
    if (cmd === 'get_unified_rows') {
      const fx = window.__open[args.id];
      if (!fx) throw 'confronto ' + args.id + ' non più disponibile';
      const start = Math.min(args.start, fx.unified.length);
      const end = Math.max(start, Math.min(args.end, fx.unified.length, start + 5000));
      (window.__unifiedCalls = window.__unifiedCalls || []).push([args.id, start, end]);
      return fx.unified.slice(start, end);
    }
    if (cmd === 'merge_hunk' || cmd === 'undo_merge' || cmd === 'save_side') {
      if (window.__failNext) { const m = window.__failNext; window.__failNext = null; throw m; }
      const fx = window.__fx['merge.json'];
      const st = fx.states[++window.__cursor];
      if (!st || st.cmd !== cmd) throw 'chiamata inattesa: ' + cmd + ' (atteso ' + (st && st.cmd) + ')';
      window.__open[args.id].rows = st.rows;
      window.__open[args.id].aligns = [];
      return { ...st.opened, id: args.id, aligns: [] };
    }
    if (cmd === 'edit_lines' || cmd === 'merge_row' || cmd === 'merge_rows') {
      window.__rev = (window.__rev || 100) + 1;
      const o = window.__open[args.id].opened || window.__fx['small.json'].opened;
      window.__open[args.id].aligns = [];   // an edit resets the alignments, like the core
      return { ...o, id: args.id, revision: window.__rev, canUndo: true, leftDirty: cmd.startsWith('merge_row') ? args.direction === 'rightToLeft' : args.side === 'left', rightDirty: cmd.startsWith('merge_row') ? args.direction === 'leftToRight' : args.side === 'right', aligns: [] };
    }
    if (cmd === 'align_lines' || cmd === 'unalign_lines' || cmd === 'clear_aligns') {
      const open = window.__open[args.id];
      if (cmd === 'align_lines') {
        if (args.left < 1 || args.right < 1) throw 'le righe da modificare non esistono';
        const others = open.aligns.filter(p => p[0] !== args.left && p[1] !== args.right);
        if (others.some(p => (p[0] < args.left) !== (p[1] < args.right))) throw "questo allineamento incrocia un altro: le righe resterebbero in ordine diverso nei due lati. Rimuovi prima l'altro";
        open.aligns = [...others, [args.left, args.right]].sort((a, b) => a[0] - b[0]);
      } else if (cmd === 'unalign_lines') open.aligns = open.aligns.filter(p => p[0] !== args.left);
      else open.aligns = [];
      window.__rev = (window.__rev || 100) + 1;
      const o = open.opened || window.__fx['small.json'].opened;
      return { ...o, id: args.id, revision: window.__rev, canUndo: false, leftDirty: false, rightDirty: false, aligns: open.aligns.map(p => [...p]) };
    }
    if (cmd === 'set_row_filter') {
      window.__rev = (window.__rev || 100) + 1;
      const o = window.__open[args.id].opened || window.__fx['small.json'].opened;
      return { ...o, id: args.id, revision: window.__rev, canUndo: false, leftDirty: false, rightDirty: false, aligns: window.__open[args.id].aligns || [] };
    }
    if (cmd === 'merge_request') return window.__mergeRequest || null;
    if (cmd === 'open_conflicts' || cmd === 'resolve_conflict' || cmd === 'undo_conflicts' || cmd === 'save_conflicts') {
      // A small model of the conflict session of the core (the real one is tested in Rust).
      if (window.__confFail) throw window.__confFail;
      if (cmd === 'open_conflicts') {
        const lines = (window.__mergeText || '').split('\\n'); if (lines[lines.length - 1] === '') lines.pop();
        const segs = []; let text = [];
        for (let i = 0; i < lines.length; i++) {
          if (/^<{7}( |$)/.test(lines[i])) {
            let j = i + 1; const ours = [], theirs = [], base = []; let part = 0, closed = -1;
            for (; j < lines.length; j++) {
              if (part === 0 && /^\\|{7}( |$)/.test(lines[j])) part = 1;
              else if (lines[j] === '=======') part = 2;
              else if (part === 2 && /^>{7}( |$)/.test(lines[j])) { closed = j; break; }
              else (part === 0 ? ours : part === 1 ? base : theirs).push(lines[j]);
            }
            if (closed >= 0) {
              if (text.length) { segs.push({ t: 'text', lines: text }); text = []; }
              segs.push({ t: 'conflict', ours, theirs, base: base.length || part === 1 ? base : null, oursLabel: lines[i].slice(7).trim(), theirsLabel: lines[closed].slice(7).trim(), res: { kind: 'unresolved' } });
              i = closed; continue;
            }
          }
          text.push(lines[i]);
        }
        if (text.length) segs.push({ t: 'text', lines: text });
        window.__conf = { id: ++window.__nextId, path: args.path, segs, history: [], saved: null };
        window.__conf.saved = JSON.stringify(segs.filter(x => x.t === 'conflict').map(x => x.res));
      }
      const m = window.__conf;
      const confs = () => m.segs.filter(x => x.t === 'conflict');
      const resultOf = (c) => {
        const k = c.res.kind;
        if (k === 'unresolved') return ['<<<<<<< ' + c.oursLabel, ...c.ours, ...(c.base ? ['||||||| base', ...c.base] : []), '=======', ...c.theirs, '>>>>>>> ' + c.theirsLabel];
        return k === 'ours' ? c.ours : k === 'theirs' ? c.theirs : k === 'both' ? [...c.ours, ...c.theirs] : k === 'bothReversed' ? [...c.theirs, ...c.ours] : c.res.lines;
      };
      if (cmd === 'resolve_conflict') {
        const c = confs()[args.index];
        if (!c) throw { code: 'err.merge.noSuchHunk', params: { n: String(args.index + 1) } };
        m.history.push(confs().map(x => x.res)); c.res = args.resolution;
      }
      if (cmd === 'undo_conflicts') { const before = m.history.pop(); confs().forEach((c, i) => { c.res = before[i]; }); }
      if (cmd === 'save_conflicts') m.saved = JSON.stringify(confs().map(x => x.res));
      let line = 1, index = 0;
      const segments = m.segs.map(x => {
        if (x.t === 'text') { const out = { kind: 'text', start: line, lines: x.lines }; line += x.lines.length; return out; }
        const result = resultOf(x);
        const out = { kind: 'conflict', index: index++, start: line, oursLabel: x.oursLabel, theirsLabel: x.theirsLabel, ours: x.ours, base: x.base, theirs: x.theirs, resolution: x.res, result };
        line += result.length; return out;
      });
      return { id: m.id, path: m.path, segments, total: confs().length, unresolved: confs().filter(c => c.res.kind === 'unresolved').length,
               dirty: JSON.stringify(confs().map(x => x.res)) !== m.saved, canUndo: m.history.length > 0 };
    }
    if (cmd === 'git_status' || cmd === 'git_setup' || cmd === 'git_remove') {
      if (window.__gitFail) throw window.__gitFail;
      const g = (window.__git = window.__git || { configured: false, external: false });
      if (cmd === 'git_setup') {
        const changes = [['diff.tool', 'nurdiff'], ['difftool.nurdiff.cmd', 'nurdiff-cli --gui'], ['difftool.prompt', 'false']];
        if (args.external) changes.push(['diff.external', 'nurdiff-cli --git-external']);
        if (args.mergetool) changes.push(['merge.tool', 'nurdiff'], ['mergetool.nurdiff.cmd', 'nurdiff-cli --merge'], ['mergetool.nurdiff.trustExitCode', 'true']);
        g.configured = true; g.external = !!args.external; g.mergetool = !!args.mergetool;
        return changes.map(([key, value]) => ({ key, value, old: null }));
      }
      if (cmd === 'git_remove') { const had = g.configured; g.configured = false; g.external = false; g.mergetool = false; return had ? ['diff.tool', 'difftool.nurdiff'] : []; }
      return { configured: g.configured, external: g.external, mergetool: !!g.mergetool };
    }
    if (cmd === 'locate_line') return window.__locateRow === undefined ? null : window.__locateRow;
    if (cmd === 'plugin:dialog|message') {
      window.__dialogs.push(args);
      const [ok, cancel] = args.buttons.OkCancelCustom;
      return window.__confirmAnswer ? ok : cancel;
    }
    if (cmd === 'release_diff') { delete window.__open[args.id]; return null; }
    if (cmd === 'list_directory') {
      if (window.__listFail) throw window.__listFail;
      const p = args.path;
      if (window.__wide) {   // wide tree: 25 folders per level, to test the Expand limit
        const depth = p.split('/').length - 3;
        return depth <= 1 ? Array.from({length: 25}, (_, i) => ({name: 'd' + String(i).padStart(2, '0'), kind: 'dir', size: 0, modified: 1700000000000}))
                          : [{name: 'f.txt', kind: 'file', size: 1, modified: 1700000000000}];
      }
      const F = n => ({name: n, kind: 'file', size: 1, modified: 1700000000000});
      if (p === '/e/uno') return [F('a.rs'), F('b.md'), F('Makefile'), F('x.log')];
      if (p === '/e/due') return [F('a.rs'), F('Makefile')];
      if (p.endsWith('/sub')) return [{name:'inner.txt',kind:'file',size:5,modified:1700000000000}];
      if (p === '/o/uno') return [{name:'solo-sinistra.txt',kind:'file',size:3,modified:1700000000000},{name:'a.txt',kind:'file',size:1234,modified:1700000000000}];
      if (p === '/o/due') return [{name:'a.txt',kind:'file',size:1234,modified:1700000000000},{name:'solo-destra.txt',kind:'file',size:4,modified:1700000000000}];
      return [{name:'sub',kind:'dir',size:0,modified:1700000000000},{name:'a.txt',kind:'file',size:1234,modified:1700000000000}];
    }
    if (cmd === 'compare_directories') {
      if (await window.__held(args.channel)) return null;
      return await (await fetch('/fixtures/dir.json')).json();
    }
    if (cmd === 'file_diff_stats') {
      (window.__statsCalls = window.__statsCalls || []).push(args);
      window.__statsInflight = (window.__statsInflight || 0) + 1;
      window.__statsMax = Math.max(window.__statsMax || 0, window.__statsInflight);
      try {
        if (window.__statsHold) await new Promise(r => (window.__statsWaiters = window.__statsWaiters || []).push(r));
        if ((window.__statsBinary || []).some(p => args.left.endsWith('/' + p))) return { kind: 'binary' };
        if ((window.__statsTooLarge || []).some(p => args.left.endsWith('/' + p))) return { kind: 'tooLarge' };
        if (window.__statsFail) throw 'errore simulato';
        return { kind: 'lines', equal: 100, changed: 2, leftOnly: 1, rightOnly: 3 };
      } finally { window.__statsInflight--; }
    }
    if (cmd === 'cancel_directory_scan') return window.__bump('scan', args.channel);
    if (cmd === 'scan_directories') {
      (window.__scanCalls = window.__scanCalls || []).push(args);
      if (window.__scanHold) await new Promise(r => { window.__scanRelease = r; });
      if (args.epoch !== window.__epoch('scan', args.channel)) return null;
      const out = { leftOnly: 0, rightOnly: 0, typeMismatch: 0, filePairs: 0, visited: 0, truncated: false };
      const call = window.__TAURI_INTERNALS__.invoke;   // the one that also applies the extension filter
      const walk = async (l, r) => {
        const L = l ? await call('list_directory', { path: l, filter: args.filter }) : [];
        const R = r ? await call('list_directory', { path: r, filter: args.filter }) : [];
        const names = [...new Set([...L.map(i => i.name), ...R.map(i => i.name)])].sort();
        for (const n of names) {
          const a = L.find(i => i.name === n), b = R.find(i => i.name === n);
          out.visited++;
          if (a && !b) { out.leftOnly++; if (a.kind === 'dir') await walk(l + '/' + n, null); }
          else if (!a && b) { out.rightOnly++; if (b.kind === 'dir') await walk(null, r + '/' + n); }
          else if (a.kind === 'dir' && b.kind === 'dir') await walk(l + '/' + n, r + '/' + n);
          else if (a.kind !== b.kind) out.typeMismatch++;
          else out.filePairs++;
        }
      };
      await walk(args.left, args.right);
      if (window.__scanTruncate) { out.truncated = true; out.visited = window.__scanTruncate; }
      return out;
    }
    if (cmd === 'cancel_directory_sizes') return window.__bump('size', args.channel);
    if (cmd === 'directory_size') {
      window.__sizeCalls = (window.__sizeCalls || []); window.__sizeCalls.push(args);
      if (window.__sizeHold) await new Promise(r => { (window.__sizeWaiters = window.__sizeWaiters || []).push(r); window.__sizeRelease = () => window.__sizeWaiters.forEach(w => w()); });
      if (window.__sizeFail && args.path.endsWith('/sub')) throw 'no';
      if (args.epoch !== window.__epoch('size', args.channel)) return null;
      return args.path.startsWith('/d/dir1') ? 1536 : 2048;
    }
    if (cmd === 'cancel_compare') {
      window.__bump('compare', args.channel);
      const waiting = window.__holdWaiters.filter(w => w.channel === args.channel);
      window.__holdWaiters = window.__holdWaiters.filter(w => w.channel !== args.channel);
      waiting.forEach(w => w.r());
      return null;
    }
    if (cmd === 'recompare_entry') {
      if (await window.__held(args.channel)) return null;
      if (window.__recFail) throw window.__recFail;
      if (args.rel === 'sub') {
        const f = { leftSize: 1, rightSize: 1, leftModified: 0, rightModified: 0 };
        return [
          { path: 'sub', leftKind: 'dir', rightKind: 'dir', status: 'different', ...f },
          { path: 'sub/inner.txt', leftKind: 'file', rightKind: 'file', status: 'different', ...f },
          { path: 'sub/solo.txt', leftKind: 'file', rightKind: null, status: 'leftOnly', ...f },
        ];
      }
      const d = await (await fetch('/fixtures/dir.json')).json();
      const base = d.entries.find(e => e.path === args.rel);
      return [{ ...(base || { path: args.rel, leftKind: 'file', rightKind: 'file', leftSize: 1, rightSize: 1, leftModified: 0, rightModified: 0 }), status: window.__recStatus || 'identical', ...(window.__recError ? { error: window.__recError } : {}) }];
    }
    if (cmd === 'plugin:event|listen') {
      (window.__listeners[args.event] = window.__listeners[args.event] || []).push(args.handler);
      return args.handler;
    }
    if (cmd === 'plugin:event|unlisten') return null;
    if (cmd === 'load_config' || cmd === 'save_config' || cmd === 'backup_config') {
      // The "files" of ~/.nurdiff: in the browser storage, under their own names (they survive a reload, as a file does).
      if (window.__configFail) throw { code: 'err.config.io', params: { path: '/home/test/.nurdiff/' + args.file + '.json', reason: 'permesso negato' } };
      const key = '__file:' + args.file;
      if (cmd === 'load_config') return localStorage.getItem(key);
      if (cmd === 'save_config') { localStorage.setItem(key, args.contents); return null; }
      const text = localStorage.getItem(key);
      if (text !== null) localStorage.setItem(key + '.bak', text);
      return null;
    }
    if (cmd === 'config_path') return '/home/test/.nurdiff';
    if (cmd === 'launch_request') return window.__launch;
    if (cmd === 'plugin:dialog|save') return window.__savePath;
    if (cmd === 'file_report_text') { if (window.__fail) throw window.__fail; return 'REPORT ' + args.format + ' ' + args.context; }
    if (cmd === 'export_file_report' || cmd === 'write_text_file') { if (window.__fail) throw window.__fail; return null; }
    if (cmd === 'classify_paths') return args.paths.map(p => window.__kinds[p] || 'missing');
    if (cmd === 'plugin:dialog|open') return window.__pick;
    if (cmd === 'plugin:opener|reveal_item_in_dir') {   // "Show in file manager": recorded by __calls
      if (window.__revealFail) throw window.__revealFail;
      return null;
    }
    if (cmd === 'plugin:window|is_maximized') return !!window.__maximized;
    if (cmd === 'plugin:window|close') { window.__emit('tauri://close-requested'); return null; }
    if (cmd.startsWith('plugin:window|')) return null;
    throw new Error('comando sconosciuto: ' + cmd);
  },
};
// Minor differences: __dirMinor = {path: causes} marks some files of the folder comparison as
// "different only in minor things"; __minorFile adds `minor` to the summary of a file comparison.
{
  const inner = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    const r = await inner(cmd, args);
    // File filter by extension, like the core: removes the files that do not pass (and the folders left empty).
    const f = args && typeof args.filter === 'object' ? args.filter : null;
    const active = f && (f.includeExts.length || f.includeNone || f.excludeExts.length || f.excludeNone);
    if (active) {
      const extOf = n => { const i = n.lastIndexOf('.'); return i <= 0 || i === n.length - 1 ? null : n.slice(i + 1).toLowerCase(); };
      const has = (xs, none, n) => { const e = extOf(n); return e === null ? none : xs.includes(e); };
      const passes = n => (!(f.includeExts.length || f.includeNone) || has(f.includeExts, f.includeNone, n)) && !has(f.excludeExts, f.excludeNone, n);
      if (cmd === 'list_directory') return r.filter(i => i.kind === 'dir' || passes(i.name));
      if (cmd === 'compare_directories' && r) {
        const isDir = e => e.leftKind === 'dir' || e.rightKind === 'dir';
        const keep = r.entries.filter(e => !isDir(e) && passes(e.path.split('/').pop()));
        const entries = r.entries.filter(e => isDir(e) ? keep.some(k => k.path.startsWith(e.path + '/')) : keep.includes(e));
        return { entries, stats: r.stats };
      }
    }
    if (cmd === 'compare_directories' && window.__dirMinor) {
      const m = window.__dirMinor;
      return { entries: r.entries.map(e => m[e.path] ? { ...e, minor: m[e.path] } : e),
               stats: { ...r.stats, minor: Object.keys(m).length } };
    }
    if (cmd === 'compare_files' && window.__minorFile) return { ...r, minor: window.__minorFile };
    if (cmd === 'compare_files' && window.__approximate) return { ...r, approximate: true };
    return r;
  };
}
"""

failures = []
STATS = {"pass": 0, "fail": 0}


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   [{detail}]" if detail else ""))
    STATS["pass" if ok else "fail"] += 1
    if not ok:
        failures.append(name)


PANES = """
() => {
  const l = document.querySelector('.pane.left'), r = document.querySelector('.pane.right');
  const rows = el => Array.from(el.querySelectorAll('.vrow'));
  const lr = rows(l), rr = rows(r);
  const topOf = (el, pane) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  // on-screen position of the rows with the same index in the two panes
  const byTop = rs => Object.fromEntries(rs.map(e => [e.style.top, e]));
  const lm = byTop(lr), rm = byTop(rr);
  let maxMisalign = 0, common = 0;
  for (const k of Object.keys(lm)) if (rm[k]) { common++; maxMisalign = Math.max(maxMisalign, Math.abs(topOf(lm[k], l) - topOf(rm[k], r))); }
  return {
    lTop: l.scrollTop, rTop: r.scrollTop, lLeft: l.scrollLeft, rLeft: r.scrollLeft,
    lRows: lr.length, rRows: rr.length, common, maxMisalign,
    rScrollW: r.scrollWidth, rClientW: r.clientWidth, rScrollH: r.scrollHeight, rClientH: r.clientHeight,
    sameSet: JSON.stringify(Object.keys(lm).sort()) === JSON.stringify(Object.keys(rm).sort()),
  };
}
"""

CURRENT = """
() => {
  const r = document.querySelector('.pane.right');
  const cur = r.querySelector('.vrow.current');
  if (!cur) return null;
  const rr = r.getBoundingClientRect(), cr = cur.getBoundingClientRect();
  return { visible: cr.top >= rr.top - 1 && cr.bottom <= rr.bottom + 1,
           count: r.querySelectorAll('.vrow.current').length };
}
"""


def counter(page):
    """The counter in words ("Difference 3 of 9"): it is in the pill's label, the visible text is "3 of 9"."""
    return page.get_attribute(".counter", "aria-label").strip()


LOCALE = "it-IT"
NOFILTER = {"includeExts": [], "includeNone": False, "excludeExts": [], "excludeNone": False}


def open_page(browser, scheme="light", kind="files", auto_files=False, locale=None):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme=scheme, locale=locale or LOCALE)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.add_init_script(INIT)
    if not auto_files:  # the historical tests exercise the "by hand" case: files are compared with the button
        page.add_init_script("try { if (!localStorage.getItem('__file:settings')) localStorage.setItem('__file:settings', JSON.stringify({compareFilesOnDrop:false})); } catch (e) {}")
    page.goto(BASE)
    if kind:  # we start from the Home: the tab of the wanted type opens with its card
        page.locator(".home button.card").nth(0 if kind == "files" else 1).click()
        page.wait_for_selector('.tabpage:not([hidden]) .path-field input')
    return ctx, page, errors


def settled(page, timeout=30_000):
    """Waits until all the visible rows have arrived (no placeholders)."""
    page.wait_for_function(
        "document.querySelectorAll('.pane .vrow').length > 0 && document.querySelectorAll('.pane .vrow.loading').length === 0",
        timeout=timeout)


def run_files(page, fixture, left="/x/a.txt", right="/x/b.txt"):
    page.evaluate(f"window.__fileFixture = '{fixture}'")
    page.evaluate(f"window.__load('{fixture}')")  # the fetch of the test data is not part of the measurement
    page.locator(".tabpage:not([hidden]) .path-field input").nth(0).fill(left)
    page.locator(".tabpage:not([hidden]) .path-field input").nth(1).fill(right)
    t = time.time()
    page.click('button[type="submit"]')
    page.wait_for_selector(".viewer", timeout=120_000)
    page.wait_for_selector(".pane.right .vrow", timeout=60_000)
    settled(page, 60_000)
    return time.time() - t
