// Avoids the terminal window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};

use nurdiff_archive::{ArchiveCache, Want};
use nurdiff_core::{
    cli_name, command_for, compare_entry_cancellable, git_config_status, parse_launch_args,
    parse_merge_args, remove_git_config, setup_git_config, Algorithm, Coded, CodedError,
    ConfigFile, ConflictSession, ConflictView, DiffOptions, DiffStore, DirDiff, DirEntryDiff,
    DirListing, DirOptions, ExtFilter, GitChange, GitSetup, GitStatus, LaunchRequest, LineCount,
    MergeDirection, NotADirectory, OpenedDiff, PathKind, ReportFormat, ReportLabels, ReportOptions,
    Resolution, Row, RowFilter, SearchResult, Session, Side, UnifiedRow, Whitespace,
};
use tauri::{Manager, State};

// All the logic is in the core: here there is only the link with the UI.
// The commands are asynchronous and the heavy work runs on a dedicated thread,
// so the window stays responsive even with large files or directories.

/// Open file comparisons. The rows stay here: the UI only receives the summary and then,
/// on request, the blocks of visible rows (`get_rows`). Merges and saves
/// also happen here.
struct AppState {
    diffs: Arc<Mutex<DiffStore>>,
}

type SharedStore = Arc<Mutex<DiffStore>>;

/// An internal error (not caused by the user): the UI shows it with the original text.
fn internal(e: impl ToString) -> CodedError {
    CodedError::new("err.internal").with("reason", e.to_string())
}

/// A folder reading error: "not a folder" has its own code, the rest the system text.
fn io_error(e: std::io::Error) -> CodedError {
    if let Some(n) = e.get_ref().and_then(|r| r.downcast_ref::<NotADirectory>()) {
        return CodedError::new("err.dir.notDir").with("path", n.0.display());
    }
    CodedError::new("err.io").with("reason", e)
}

/// The archives opened so far, extracted into a temporary folder (deleted when the program ends).
fn archives() -> &'static ArchiveCache {
    static CACHE: OnceLock<ArchiveCache> = OnceLock::new();
    CACHE.get_or_init(ArchiveCache::new)
}

/// The path of the disk that a path of the UI stands for: an archive (or a path inside it) is read as a folder, from its
/// extracted copy. Any other path is returned as it is. `want` says what the command needs (see `Want`).
fn on_disk(path: &str, want: Want) -> Result<nurdiff_archive::Resolved, CodedError> {
    archives()
        .resolve(Path::new(path), want)
        .map_err(|e| e.coded())
}

fn lock(store: &SharedStore) -> Result<MutexGuard<'_, DiffStore>, CodedError> {
    store
        .lock()
        .map_err(|_| CodedError::new("err.internal.state"))
}

/// Runs an operation on the store on a dedicated thread (merging and saving can
/// take a while with large files). Every command that touches the store goes through here, the short ones too:
/// waiting for the lock on the async runtime (or, for a synchronous command, on the main thread of the window)
/// would block it while another tab saves a large file.
async fn with_store<T, F>(state: &State<'_, AppState>, work: F) -> Result<T, CodedError>
where
    T: Send + 'static,
    F: FnOnce(&mut DiffStore) -> Result<T, CodedError> + Send + 'static,
{
    let store = Arc::clone(&state.diffs);
    tauri::async_runtime::spawn_blocking(move || work(&mut *lock(&store)?))
        .await
        .map_err(internal)?
}

/// Compares two text files and returns the summary (without rows) with an identifier.
/// Callable from the UI with `invoke("compare_files", ...)`.
// The parameters are those the UI passes with `invoke("compare_files", ...)`: one per option.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
async fn compare_files(
    state: State<'_, AppState>,
    left: String,
    right: String,
    ignore_case: bool,
    ignore_whitespace: Whitespace,
    left_read_only: Option<bool>,
    right_read_only: Option<bool>,
    row_filter: Option<RowFilter>,
    algorithm: Option<Algorithm>,
    aligns: Option<Vec<[usize; 2]>>,
) -> Result<OpenedDiff, CodedError> {
    let opts = DiffOptions {
        ignore_case,
        whitespace: ignore_whitespace,
        algorithm: algorithm.unwrap_or_default(),
    };
    let (left_ro, right_ro) = (
        left_read_only.unwrap_or(false),
        right_read_only.unwrap_or(false),
    );
    // Reading and comparison happen outside the store lock.
    let session = tauri::async_runtime::spawn_blocking(move || {
        // An archive is compared as a folder, not as a file: the UI is told so, instead of "binary file".
        for p in [&left, &right] {
            if nurdiff_archive::kind_of(Path::new(p)).is_some() {
                return Err(CodedError::new("err.archive.useFolders").with("path", p));
            }
        }
        // A file inside an archive is read from its extracted copy, and cannot be saved.
        let (l, r) = (on_disk(&left, Want::File)?, on_disk(&right, Want::File)?);
        Session::load_read_only(
            &l.path,
            &r.path,
            &opts,
            left_ro || l.in_archive,
            right_ro || r.in_archive,
        )
        .map_err(|e| e.coded())
    })
    .await
    .map_err(internal)??;
    let mut session = session;
    // The manual alignments of a comparison redone on the same files (Refresh, options, Swap).
    // If the files changed and they are no longer valid it opens without them: the UI sees it from the summary.
    if let Some(aligns) = aligns.filter(|a| !a.is_empty()) {
        let _ = session.set_aligns(&aligns);
    }
    session.set_filter(row_filter.unwrap_or_default());
    with_store(&state, move |store| Ok(store.open(session))).await
}

/// The arguments of the process, as text. The UI only handles text paths: a name that is not UTF-8 is an
/// error, since converting it could point to another file (one whose name has the replacement character).
fn process_args() -> Result<Vec<String>, CodedError> {
    std::env::args_os()
        .skip(1)
        .map(|a| {
            a.into_string().map_err(|a| {
                CodedError::new("err.launch.encoding").with("arg", a.to_string_lossy())
            })
        })
        .collect()
}

/// Comparison requested from the command line (`nurdiff <left> <right>`, so also from
/// git and from `nurdiff --gui`). `None` if the app was started without paths.
#[tauri::command]
fn launch_request() -> Result<Option<LaunchRequest>, CodedError> {
    let args = process_args()?;
    let cwd = std::env::current_dir().map_err(io_error)?;
    parse_launch_args(&args, &cwd).map_err(|e| e.coded())
}

/// The file to resolve if the app was started by `git mergetool` (`nurdiff --merge <file>`).
#[tauri::command]
fn merge_request() -> Result<Option<String>, CodedError> {
    let args = process_args()?;
    let cwd = std::env::current_dir().map_err(io_error)?;
    Ok(parse_merge_args(&args, &cwd))
}

/// Opens a file with conflict markers: its conflicts, to choose one by one.
#[tauri::command]
async fn open_conflicts(
    state: State<'_, AppState>,
    path: String,
) -> Result<ConflictView, CodedError> {
    let session = tauri::async_runtime::spawn_blocking(move || {
        ConflictSession::load(&PathBuf::from(path)).map_err(|e| e.coded())
    })
    .await
    .map_err(internal)??;
    with_store(&state, move |store| Ok(store.open_conflicts(session))).await
}

/// Chooses what goes in place of a conflict.
#[tauri::command]
async fn resolve_conflict(
    state: State<'_, AppState>,
    id: u64,
    index: usize,
    resolution: Resolution,
) -> Result<ConflictView, CodedError> {
    with_store(&state, move |store| {
        store
            .resolve_conflict(id, index, resolution)
            .map_err(|e| e.coded())
    })
    .await
}

#[tauri::command]
async fn undo_conflicts(state: State<'_, AppState>, id: u64) -> Result<ConflictView, CodedError> {
    with_store(&state, move |store| {
        store.undo_conflicts(id).map_err(|e| e.coded())
    })
    .await
}

#[tauri::command]
async fn save_conflicts(state: State<'_, AppState>, id: u64) -> Result<ConflictView, CodedError> {
    with_store(&state, move |store| {
        store.save_conflicts(id).map_err(|e| e.coded())
    })
    .await
}

/// Whether git is set up to open NurDiff (global configuration).
#[tauri::command]
async fn git_status() -> Result<GitStatus, CodedError> {
    tauri::async_runtime::spawn_blocking(|| git_config_status().map_err(|e| e.coded()))
        .await
        .map_err(internal)?
}

/// Sets git up to open NurDiff (`external`: also for plain `git diff`). It calls the `nurdiff-cli` that sits next
/// to the app: without it git could not start NurDiff.
#[tauri::command]
async fn git_setup(external: bool, mergetool: bool) -> Result<Vec<GitChange>, CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        let cli = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.canonicalize().ok())
            .and_then(|exe| exe.parent().map(|dir| dir.join(cli_name())))
            .filter(|cli| cli.is_file())
            .ok_or_else(|| CodedError::new("err.git.noCli"))?;
        setup_git_config(
            &command_for(&cli),
            GitSetup {
                external,
                mergetool,
            },
        )
        .map_err(|e| e.coded())
    })
    .await
    .map_err(internal)?
}

/// Takes the NurDiff settings out of the git configuration; returns what it removed.
#[tauri::command]
async fn git_remove() -> Result<Vec<&'static str>, CodedError> {
    tauri::async_runtime::spawn_blocking(|| remove_git_config().map_err(|e| e.coded()))
        .await
        .map_err(internal)?
}

/// Rows `start..end` of an open comparison. Callable with `invoke("get_rows", ...)`.
#[tauri::command]
async fn get_rows(
    state: State<'_, AppState>,
    id: u64,
    start: usize,
    end: usize,
) -> Result<Vec<Row>, CodedError> {
    with_store(&state, move |store| {
        store.rows(id, start, end).map_err(|e| e.coded())
    })
    .await
}

/// Epochs of the text searches, one per channel (the search of a tab): a new search stops the one that is still
/// running, because a search holds the store for as long as it runs and the old one is of no use any more.
static SEARCH_EPOCHS: Epochs = Epochs::new();

/// Where a text appears in the lines of a side of an open comparison (over the rows the view shows); `None` if a newer
/// search on the same channel (or `cancel_search`) stopped this one.
#[tauri::command]
async fn search_rows(
    state: State<'_, AppState>,
    id: u64,
    side: Side,
    text: String,
    case_sensitive: bool,
    channel: String,
) -> Result<Option<SearchResult>, CodedError> {
    // The epoch changes before the store is asked for: the previous search, which has it, sees it and gives it back.
    let epoch = SEARCH_EPOCHS.bump(&channel);
    let cancelled = SEARCH_EPOCHS.cancelled(&channel, epoch);
    with_store(&state, move |store| {
        store
            .search(id, side, &text, case_sensitive, &cancelled)
            .map_err(|e| e.coded())
    })
    .await
}

/// Stops the search of the channel that is still running (the search bar was closed or the text emptied).
#[tauri::command]
fn cancel_search(channel: String) {
    SEARCH_EPOCHS.bump(&channel);
}

/// Rows `start..end` of the unified view of an open comparison.
#[tauri::command]
async fn get_unified_rows(
    state: State<'_, AppState>,
    id: u64,
    start: usize,
    end: usize,
) -> Result<Vec<UnifiedRow>, CodedError> {
    with_store(&state, move |store| {
        store.unified_rows(id, start, end).map_err(|e| e.coded())
    })
    .await
}

/// Copies a difference from one side to the other (`"leftToRight"` or `"rightToLeft"`).
#[tauri::command]
async fn merge_hunk(
    state: State<'_, AppState>,
    id: u64,
    hunk: usize,
    direction: MergeDirection,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.apply_hunk(id, hunk, direction).map_err(|e| e.coded())
    })
    .await
}

/// Copies one row (index among those the view shows) from one side to the other.
#[tauri::command]
async fn merge_row(
    state: State<'_, AppState>,
    id: u64,
    row: usize,
    direction: MergeDirection,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.apply_row(id, row, direction).map_err(|e| e.coded())
    })
    .await
}

/// Copies a block of rows (index among those the view shows, `first..=last`) from one side to the other.
#[tauri::command]
async fn merge_rows(
    state: State<'_, AppState>,
    id: u64,
    first: usize,
    last: usize,
    direction: MergeDirection,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store
            .apply_rows(id, first, last, direction)
            .map_err(|e| e.coded())
    })
    .await
}

/// Replaces `remove` rows of the side starting from `start` (from 0) with `lines`.
#[tauri::command]
async fn edit_lines(
    state: State<'_, AppState>,
    id: u64,
    side: Side,
    start: usize,
    remove: usize,
    lines: Vec<String>,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store
            .edit_lines(id, side, start, remove, &lines)
            .map_err(|e| e.coded())
    })
    .await
}

/// Index of the row of the view that shows the row `number` (from 1) of the side.
#[tauri::command]
async fn locate_line(
    state: State<'_, AppState>,
    id: u64,
    side: Side,
    number: usize,
) -> Result<Option<usize>, CodedError> {
    with_store(&state, move |store| {
        store.locate_line(id, side, number).map_err(|e| e.coded())
    })
    .await
}

/// Changes the rows shown: `"all"`, `"diffs"` or `"context"`.
#[tauri::command]
async fn set_row_filter(
    state: State<'_, AppState>,
    id: u64,
    filter: RowFilter,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.set_filter(id, filter).map_err(|e| e.coded())
    })
    .await
}

/// Places by hand the row `left` of the left side next to the row `right` of the right side (numbers from 1).
#[tauri::command]
async fn align_lines(
    state: State<'_, AppState>,
    id: u64,
    left: usize,
    right: usize,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.align(id, left, right).map_err(|e| e.coded())
    })
    .await
}

/// Removes the manual alignment that goes through the row `left` of the left side (from 1).
#[tauri::command]
async fn unalign_lines(
    state: State<'_, AppState>,
    id: u64,
    left: usize,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.unalign(id, left).map_err(|e| e.coded())
    })
    .await
}

/// Removes all the manual alignments.
#[tauri::command]
async fn clear_aligns(state: State<'_, AppState>, id: u64) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.clear_aligns(id).map_err(|e| e.coded())
    })
    .await
}

/// Undoes the last merge.
#[tauri::command]
async fn undo_merge(state: State<'_, AppState>, id: u64) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| store.undo(id).map_err(|e| e.coded())).await
}

/// Saves a side (`"left"` or `"right"`) to its file.
#[tauri::command]
async fn save_side(
    state: State<'_, AppState>,
    id: u64,
    side: Side,
) -> Result<OpenedDiff, CodedError> {
    with_store(&state, move |store| {
        store.save(id, side).map_err(|e| e.coded())
    })
    .await
}

/// The report of an open comparison as text (format `"html"` or `"unified"`; `context` = equal rows around the
/// differences, absent = the whole file). It is the text that `export_file_report` writes, and the one the UI copies.
async fn file_report_string(
    state: &State<'_, AppState>,
    id: u64,
    format: ReportFormat,
    context: Option<usize>,
    labels: Option<ReportLabels>,
) -> Result<String, CodedError> {
    let options = ReportOptions {
        context,
        labels: labels.unwrap_or_default(),
    };
    with_store(state, move |store| {
        store.report(id, format, &options).map_err(|e| e.coded())
    })
    .await
}

/// The report of an open comparison, to copy it (see `file_report_string`).
#[tauri::command]
async fn file_report_text(
    state: State<'_, AppState>,
    id: u64,
    format: ReportFormat,
    context: Option<usize>,
    labels: Option<ReportLabels>,
) -> Result<String, CodedError> {
    file_report_string(&state, id, format, context, labels).await
}

/// Writes to the file `path` the report of an open comparison (see `file_report_string`).
#[tauri::command]
async fn export_file_report(
    state: State<'_, AppState>,
    id: u64,
    format: ReportFormat,
    context: Option<usize>,
    labels: Option<ReportLabels>,
    path: String,
) -> Result<(), CodedError> {
    let text = file_report_string(&state, id, format, context, labels).await?;
    write_text_file(path, text).await
}

/// The text of a configuration file (`~/.nurdiff/<name>.json`), or `None` if it does not exist yet.
#[tauri::command]
async fn load_config(file: ConfigFile) -> Result<Option<String>, CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        nurdiff_core::load_config(file).map_err(|e| e.coded())
    })
    .await
    .map_err(internal)?
}

/// Writes a configuration file (see `load_config`).
#[tauri::command]
async fn save_config(file: ConfigFile, contents: String) -> Result<(), CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        nurdiff_core::save_config(file, &contents).map_err(|e| e.coded())
    })
    .await
    .map_err(internal)?
}

/// Keeps a copy of a configuration file as `.bak`: the interface does it when it cannot read the content.
#[tauri::command]
async fn backup_config(file: ConfigFile) -> Result<(), CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        nurdiff_core::backup_config_file(file).map_err(|e| e.coded())
    })
    .await
    .map_err(internal)?
}

/// The folder of the configuration, to say where it is.
#[tauri::command]
fn config_path() -> Option<String> {
    nurdiff_core::config_dir().map(|p| p.display().to_string())
}

/// Writes a text file (UTF-8): it is used for the reports that the UI composes on its own.
#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&path, contents).map_err(|e| {
            CodedError::new("err.writeFile")
                .with("path", &path)
                .with("reason", e)
        })
    })
    .await
    .map_err(internal)?
}

/// Type (file, folder, …) of the paths dragged onto the window, in the same order.
#[tauri::command]
async fn classify_paths(paths: Vec<String>) -> Result<Vec<PathKind>, CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| {
                // A path inside an archive (an archive in an archive) is looked at in its extracted copy.
                let path = on_disk(p, Want::File)
                    .map(|r| r.path)
                    .unwrap_or_else(|_| PathBuf::from(p));
                match nurdiff_core::path_kind(&path) {
                    // An archive is opened as a folder.
                    PathKind::File if nurdiff_archive::kind_of(&path).is_some() => PathKind::Dir,
                    kind => kind,
                }
            })
            .collect()
    })
    .await
    .map_err(internal)
}

/// Frees the memory of a comparison that the UI no longer shows.
#[tauri::command]
async fn release_diff(state: State<'_, AppState>, id: u64) -> Result<(), CodedError> {
    with_store(&state, move |store| {
        store.release(id);
        Ok(())
    })
    .await
}

/// Epochs of cancellation, one per channel: the UI gives each tab (and each preview) its own, so cancelling
/// in one does not stop the work of the others. A request reads the epoch of its channel when it starts and
/// stops if it changed in the meantime.
struct Epochs(Mutex<BTreeMap<String, Arc<AtomicU64>>>);

impl Epochs {
    const fn new() -> Self {
        Epochs(Mutex::new(BTreeMap::new()))
    }

    fn counter(&self, channel: &str) -> Arc<AtomicU64> {
        let mut map = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        Arc::clone(map.entry(channel.to_string()).or_default())
    }

    /// Cancels what runs on the channel and returns the new epoch.
    fn bump(&self, channel: &str) -> u64 {
        self.counter(channel).fetch_add(1, Ordering::SeqCst) + 1
    }

    /// The test that tells a request started at `epoch` that it was cancelled.
    fn cancelled(&self, channel: &str, epoch: u64) -> impl Fn() -> bool {
        let counter = self.counter(channel);
        move || counter.load(Ordering::SeqCst) != epoch
    }

    fn current(&self, channel: &str) -> u64 {
        self.counter(channel).load(Ordering::SeqCst)
    }
}

/// Epochs of the size computations: every request carries the one it started with and stops if
/// it changed in the meantime (different folders, tab closed).
static SIZE_EPOCHS: Epochs = Epochs::new();

/// Cancels the size computations in progress on the channel and returns the new epoch for those that follow.
#[tauri::command]
fn cancel_directory_sizes(channel: String) -> u64 {
    SIZE_EPOCHS.bump(&channel)
}

/// Sum of the files contained in a folder; `None` if the computation was cancelled.
#[tauri::command]
async fn directory_size(
    path: String,
    epoch: u64,
    channel: String,
) -> Result<Option<u64>, CodedError> {
    let cancelled = SIZE_EPOCHS.cancelled(&channel, epoch);
    tauri::async_runtime::spawn_blocking(move || {
        let dir = on_disk(&path, Want::Dir)?;
        nurdiff_core::dir_size(&dir.path, &cancelled).map_err(io_error)
    })
    .await
    .map_err(internal)?
}

/// Equal, modified and one-side-only rows of two text files ("Differences" column of the folder
/// comparison), or why they are not counted (not text, too large). With the default options of the comparison.
#[tauri::command]
async fn file_diff_stats(left: String, right: String) -> Result<LineCount, CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        let (l, r) = (on_disk(&left, Want::File)?, on_disk(&right, Want::File)?);
        nurdiff_core::file_diff_stats(&l.path, &r.path, &DiffOptions::default())
            .map_err(|e| e.coded())
    })
    .await
    .map_err(internal)?
}

/// Epochs of the scan of the preview folders: they change at every cancellation request.
static SCAN_EPOCHS: Epochs = Epochs::new();

/// How many entries a scan visits at most before stopping (the counts are then partial).
const SCAN_LIMIT: usize = 100_000;

/// Cancels the scans in progress on the channel and returns the epoch to use for the new ones.
#[tauri::command]
fn cancel_directory_scan(channel: String) -> u64 {
    SCAN_EPOCHS.bump(&channel)
}

/// Counts the entries of two folders without reading the files (one side only, different type, pairs of
/// files to compare); `None` if the scan was cancelled by `cancel_directory_scan`.
#[tauri::command]
async fn scan_directories(
    left: String,
    right: String,
    filter: Option<ExtFilter>,
    epoch: u64,
    channel: String,
) -> Result<Option<nurdiff_core::DirScan>, CodedError> {
    let cancelled = SCAN_EPOCHS.cancelled(&channel, epoch);
    tauri::async_runtime::spawn_blocking(move || {
        let opts = DirOptions {
            filter: filter.unwrap_or_default(),
        };
        let (l, r) = (on_disk(&left, Want::Dir)?, on_disk(&right, Want::Dir)?);
        nurdiff_core::scan_dirs(&l.path, &r.path, &opts, SCAN_LIMIT, &cancelled).map_err(io_error)
    })
    .await
    .map_err(internal)?
}

/// Lists the first level of a folder, without comparing it; the filter removes the files that do not pass.
#[tauri::command]
async fn list_directory(
    path: String,
    filter: Option<ExtFilter>,
) -> Result<Vec<DirListing>, CodedError> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = on_disk(&path, Want::Dir)?;
        nurdiff_core::list_directory(&dir.path, &filter.unwrap_or_default()).map_err(io_error)
    })
    .await
    .map_err(internal)?
}

/// Epochs of the folder comparisons: they change at every cancellation request. A folder comparison reads the epoch of its channel when it starts
/// and stops if it changed in the meantime: so "Cancel" stops all the comparisons in progress in that tab.
static COMPARE_EPOCHS: Epochs = Epochs::new();

/// Cancels the folder comparisons in progress on the channel (those that start afterwards are not touched).
#[tauri::command]
fn cancel_compare(channel: String) {
    COMPARE_EPOCHS.bump(&channel);
}

/// Compares two directories; `None` if the comparison was cancelled. Callable from the UI with
/// `invoke("compare_directories", ...)`.
#[tauri::command]
async fn compare_directories(
    left: String,
    right: String,
    filter: Option<ExtFilter>,
    channel: String,
) -> Result<Option<DirDiff>, CodedError> {
    let cancelled = COMPARE_EPOCHS.cancelled(&channel, COMPARE_EPOCHS.current(&channel));
    tauri::async_runtime::spawn_blocking(move || {
        let (l, r) = (on_disk(&left, Want::Dir)?, on_disk(&right, Want::Dir)?);
        nurdiff_core::compare_dirs_cancellable(
            &l.path,
            &r.path,
            &DirOptions {
                filter: filter.unwrap_or_default(),
            },
            &cancelled,
        )
        .map_err(io_error)
    })
    .await
    .map_err(internal)?
}

/// Compares again an entry of a folder comparison (and, if it is a folder, its children):
/// `rel` is the relative path with `/`. Returns the updated entries, the entry itself first; `None` if
/// the comparison was cancelled.
#[tauri::command]
async fn recompare_entry(
    left: String,
    right: String,
    rel: String,
    filter: Option<ExtFilter>,
    channel: String,
) -> Result<Option<Vec<DirEntryDiff>>, CodedError> {
    let cancelled = COMPARE_EPOCHS.cancelled(&channel, COMPARE_EPOCHS.current(&channel));
    tauri::async_runtime::spawn_blocking(move || {
        let opts = DirOptions {
            filter: filter.unwrap_or_default(),
        };
        let (l, r) = (on_disk(&left, Want::Dir)?, on_disk(&right, Want::Dir)?);
        compare_entry_cancellable(&l.path, &r.path, &rel, &opts, &cancelled).map_err(io_error)
    })
    .await
    .map_err(internal)?
}

fn main() {
    // Folders of archives left by an earlier run that was killed.
    std::thread::spawn(|| {
        ArchiveCache::purge_stale(
            &std::env::temp_dir(),
            std::time::Duration::from_secs(24 * 3600),
        );
    });
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            diffs: Arc::new(Mutex::new(DiffStore::new())),
        })
        .invoke_handler(tauri::generate_handler![
            compare_files,
            launch_request,
            merge_request,
            open_conflicts,
            resolve_conflict,
            undo_conflicts,
            save_conflicts,
            git_status,
            git_setup,
            git_remove,
            compare_directories,
            cancel_compare,
            directory_size,
            file_diff_stats,
            cancel_directory_sizes,
            scan_directories,
            cancel_directory_scan,
            recompare_entry,
            list_directory,
            get_rows,
            search_rows,
            cancel_search,
            get_unified_rows,
            merge_hunk,
            merge_row,
            merge_rows,
            undo_merge,
            edit_lines,
            locate_line,
            set_row_filter,
            align_lines,
            unalign_lines,
            clear_aligns,
            save_side,
            classify_paths,
            export_file_report,
            file_report_text,
            load_config,
            save_config,
            backup_config,
            config_path,
            write_text_file,
            release_diff
        ])
        .build(tauri::generate_context!())
        .expect("error while building the NurDiff app")
        .run(|app, event| {
            // Started by `git mergetool`: the exit code tells git whether the conflicts were resolved and saved.
            if let tauri::RunEvent::Exit = event {
                archives().purge();
                if std::env::args_os().any(|a| a == "--merge") {
                    let pending = app
                        .state::<AppState>()
                        .diffs
                        .lock()
                        .map(|store| store.conflicts_pending())
                        .unwrap_or(true);
                    std::process::exit(if pending { 1 } else { 0 });
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::Epochs;

    #[test]
    fn annullare_su_un_canale_non_tocca_gli_altri() {
        let epochs = Epochs::new();
        let a = epochs.cancelled("tab1", epochs.current("tab1"));
        let b = epochs.cancelled("tab2", epochs.current("tab2"));
        assert!(!a() && !b());
        assert_eq!(epochs.bump("tab1"), 1);
        assert!(a(), "il canale annullato si ferma");
        assert!(!b(), "l'altro canale continua");
        // what starts after the cancellation is not touched
        let later = epochs.cancelled("tab1", epochs.current("tab1"));
        assert!(!later());
    }

    #[test]
    fn una_ricerca_nuova_ferma_la_precedente_dello_stesso_tab_e_non_quella_di_un_altro() {
        let epochs = Epochs::new();
        // each search moves the epoch of its channel and takes the new one, as `search_rows` does
        let search = |channel: &str| {
            let epoch = epochs.bump(channel);
            epochs.cancelled(channel, epoch)
        };
        let first = search("search1");
        let other_tab = search("search2");
        let second = search("search1");
        assert!(first(), "the older search of the same tab stops");
        assert!(!second(), "the newer one goes on");
        assert!(!other_tab(), "the search of another tab is not touched");
    }
}
