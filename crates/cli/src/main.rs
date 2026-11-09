use std::{
    env,
    ffi::OsString,
    path::{Path, PathBuf},
    process::{Command, ExitCode},
};

use nurdiff_core::{
    classify_texts, compare_dirs, diff_files, file_report, parse_ext_list, read_text_file,
    visible_rows, Cell, DiffOptions, DirOptions, EntryKind, EntryStatus, ExtFilter, MinorCauses,
    ReportFormat, ReportOptions, Row, RowKind, Whitespace,
};

const USAGE: &str = "\
Usage: nurdiff-cli [options] <left> <right>
       nurdiff-cli --gui <left> <right>
       nurdiff-cli --git-external <GIT_EXTERNAL_DIFF arguments>
       nurdiff-cli --merge <file>
       nurdiff-cli --setup-git [--external] [--mergetool]
       nurdiff-cli --remove-git

Compares two text files or two directories.

Options:
  -i, --ignore-case         ignore case
  -w, --ignore-whitespace   ignore all whitespace within lines
  -b, --ignore-space-change ignore whitespace at the end of lines and the amount of whitespace
                            (any run of spaces or tabs counts as one space)
      --ignore-space-at-eol ignore whitespace at the end of lines
      --algorithm <name>    how to pair lines: `myers` (default, the fewest different
                            lines), `patience` or `histogram` (often easier to read on code)
  -U, --context <N>         lines of context around the differences (default 3)
      --report <format>     print a shareable report instead of the side-by-side view:
                            `diff` (unified diff) or `html` (standalone page); files only
      --include <exts>      directories only: compare just the files with these extensions
                            (comma or space separated, e.g. `rs,ts`; `none` stands for files
                            without extension); can be repeated
      --exclude <exts>      directories only: leave out the files with these extensions
                            (same syntax; wins over --include); folders left empty disappear
      --gui                 open the two paths in the graphical application and wait until
                            it is closed (for `git difftool`)
      --git-external        like --gui, but with the arguments git passes to
                            GIT_EXTERNAL_DIFF / diff.external (seven, or nine for renames)
      --merge <file>        open a file with conflict markers in the graphical application to
                            resolve them, and wait until it is closed (for `git mergetool`);
                            exits 0 only if every conflict was resolved and the file saved
      --setup-git           write into your global git configuration what `git difftool` needs
                            to open NurDiff (diff.tool, difftool.nurdiff.cmd, difftool.prompt);
                            it prints every value it changes
      --external            with --setup-git: also make plain `git diff` open NurDiff
                            (diff.external)
      --mergetool           with --setup-git: also make `git mergetool` open NurDiff
      --remove-git          undo --setup-git (the difftool prompt setting stays as it is)
  -h, --help                show this help

The graphical application is looked up in $NURDIFF_GUI, next to this program
(nurdiff) and in the PATH.

Exit codes: 0 identical, 1 differences, 2 error";

struct Args {
    left: PathBuf,
    right: PathBuf,
    opts: DiffOptions,
    context: usize,
    report: Option<ReportFormat>,
    filter: ExtFilter,
    /// The paths as the user wrote them, when `left` / `right` were replaced by the folder of an extracted archive.
    shown: [Option<PathBuf>; 2],
}

impl Args {
    /// The path to show for the left side (and for the right one): what the user wrote, not a temporary folder.
    fn left_shown(&self) -> &Path {
        self.shown[0].as_deref().unwrap_or(&self.left)
    }

    fn right_shown(&self) -> &Path {
        self.shown[1].as_deref().unwrap_or(&self.right)
    }
}

enum Parsed {
    Help,
    Run(Args),
    /// Opens the graphical application on the two paths.
    Gui(Vec<OsString>),
    /// Arguments of `GIT_EXTERNAL_DIFF`.
    GitExternal(Vec<OsString>),
    /// Resolves the conflicts of a file in the graphical application.
    Merge(PathBuf),
    /// Writes the git configuration (`external`: also `diff.external`; `mergetool`: also the merge tool).
    SetupGit {
        external: bool,
        mergetool: bool,
    },
    /// Removes it.
    RemoveGit,
}

fn main() -> ExitCode {
    // `nurdiff-cli … | head`: the default action of SIGPIPE ends the program quietly, instead of a panic of `println!`.
    #[cfg(unix)]
    // SAFETY: restoring the default action of a signal, before any other thread exists.
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }
    match run() {
        Ok(code) => code,
        Err(message) => {
            eprintln!("nurdiff-cli: {message}");
            ExitCode::from(2)
        }
    }
}

/// The arguments are read as `OsString`: on Linux a file name does not have to be UTF-8.
fn parse_args(mut args: impl Iterator<Item = OsString>) -> Result<Parsed, String> {
    let mut paths = Vec::new();
    let mut gui = false;
    let mut opts = DiffOptions::default();
    let mut context = 3usize;
    let mut report = None;
    let mut filter = ExtFilter::default();
    let (mut setup_git, mut external, mut remove_git) = (false, false, false);
    let (mut merge, mut mergetool) = (false, false);

    while let Some(arg) = args.next() {
        // A name that is not UTF-8 is not an option: it can only be a path.
        match arg.to_str().unwrap_or_default() {
            "--merge" => merge = true,
            "--setup-git" => setup_git = true,
            "--external" => external = true,
            "--mergetool" => mergetool = true,
            "--remove-git" => remove_git = true,
            "--git-external" => return Ok(Parsed::GitExternal(args.collect())),
            "--gui" => gui = true,
            "-h" | "--help" => return Ok(Parsed::Help),
            "-i" | "--ignore-case" => opts.ignore_case = true,
            "-w" | "--ignore-whitespace" => opts.whitespace = Whitespace::All,
            "-b" | "--ignore-space-change" => opts.whitespace = Whitespace::Amount,
            "--ignore-space-at-eol" => opts.whitespace = Whitespace::Trailing,
            "--algorithm" => {
                let value = option_value(args.next(), "--algorithm")?;
                opts.algorithm = value.parse()?;
            }
            "-U" | "--context" => {
                let value = option_value(args.next(), "--context")?;
                context = value
                    .parse()
                    .map_err(|_| format!("invalid value for --context: {value}"))?;
            }
            "--include" => {
                let value = option_value(args.next(), "--include")?;
                add_extensions(&value, &mut filter.include_exts, &mut filter.include_none);
            }
            "--exclude" => {
                let value = option_value(args.next(), "--exclude")?;
                add_extensions(&value, &mut filter.exclude_exts, &mut filter.exclude_none);
            }
            "--report" => {
                let value = args
                    .next()
                    .ok_or("missing format for --report (diff or html)")?
                    .to_string_lossy()
                    .into_owned();
                report = Some(match value.as_str() {
                    "diff" => ReportFormat::Unified,
                    "html" => ReportFormat::Html,
                    other => return Err(format!("unknown report format: {other} (diff or html)")),
                });
            }
            s if s.starts_with('-') && s.len() > 1 => {
                return Err(format!("unknown option: {s}"));
            }
            _ => paths.push(PathBuf::from(arg)),
        }
    }

    if merge {
        let [file] = <[PathBuf; 1]>::try_from(paths)
            .map_err(|_| format!("--merge takes exactly one file\n\n{USAGE}"))?;
        if gui || setup_git || remove_git || external || mergetool {
            return Err("--merge cannot be used with the other modes".to_string());
        }
        return Ok(Parsed::Merge(file));
    }
    if setup_git || remove_git || external || mergetool {
        if setup_git == remove_git {
            return Err("--setup-git and --remove-git cannot be used together, and --external and --mergetool go with --setup-git".to_string());
        }
        if !paths.is_empty() || gui {
            return Err("--setup-git and --remove-git take no paths".to_string());
        }
        if (external || mergetool) && !setup_git {
            return Err("--external and --mergetool go with --setup-git".to_string());
        }
        return Ok(if setup_git {
            Parsed::SetupGit {
                external,
                mergetool,
            }
        } else {
            Parsed::RemoveGit
        });
    }
    if gui {
        return Ok(Parsed::Gui(
            paths.into_iter().map(PathBuf::into_os_string).collect(),
        ));
    }
    let [left, right] = <[PathBuf; 2]>::try_from(paths)
        .map_err(|_| format!("exactly two paths are needed\n\n{USAGE}"))?;
    Ok(Parsed::Run(Args {
        left,
        right,
        opts,
        context,
        report,
        filter,
        shown: [None, None],
    }))
}

/// The value that follows an option: text, unlike the paths.
fn option_value(value: Option<OsString>, name: &str) -> Result<String, String> {
    value
        .ok_or_else(|| format!("missing value for {name}"))?
        .into_string()
        .map_err(|v| format!("invalid value for {name}: {}", v.to_string_lossy()))
}

/// Adds to `exts` the extensions of `list`; `none` (without a dot) stands for "files without an extension".
fn add_extensions(list: &str, exts: &mut Vec<String>, none: &mut bool) {
    for ext in parse_ext_list(list) {
        if ext == "none" {
            *none = true;
        } else if !exts.contains(&ext) {
            exts.push(ext);
        }
    }
}

fn run() -> Result<ExitCode, String> {
    let args = match parse_args(env::args_os().skip(1))? {
        Parsed::Help => {
            println!("{USAGE}");
            return Ok(ExitCode::SUCCESS);
        }
        Parsed::Gui(paths) => return open_gui(&paths),
        Parsed::GitExternal(args) => return git_external(&args),
        Parsed::Merge(file) => return open_merge(&file),
        Parsed::SetupGit {
            external,
            mergetool,
        } => return setup_git(external, mergetool),
        Parsed::RemoveGit => return remove_git(),
        Parsed::Run(args) => args,
    };

    // An archive is compared as a folder: it is extracted into a temporary folder, deleted at the end.
    let mut args = args;
    let cache = nurdiff_archive::ArchiveCache::new();
    let outcome = open_archives(&cache, &mut args).and_then(|()| compare(&args));
    cache.purge();
    outcome
}

fn compare(args: &Args) -> Result<ExitCode, String> {
    match (args.left.is_dir(), args.right.is_dir()) {
        (true, true) if args.report.is_some() => {
            Err("--report only works on files, not on directories".to_string())
        }
        (true, true) => run_dirs(args),
        (false, false) => run_files(args),
        _ => Err("cannot compare a directory with a file".to_string()),
    }
}

/// Replaces the paths that are (or go through) an archive with the folder it is extracted to.
fn open_archives(cache: &nurdiff_archive::ArchiveCache, args: &mut Args) -> Result<(), String> {
    let [shown_left, shown_right] = &mut args.shown;
    for (path, shown) in [(&mut args.left, shown_left), (&mut args.right, shown_right)] {
        let resolved = cache
            .resolve(path, nurdiff_archive::Want::Dir)
            .map_err(|e| e.to_string())?;
        if resolved.skipped > 0 {
            eprintln!(
                "note: {} not extracted from {} (links, unsafe or duplicate names)",
                if resolved.skipped == 1 {
                    "1 entry was".to_string()
                } else {
                    format!("{} entries were", resolved.skipped)
                },
                path.display()
            );
        }
        if resolved.in_archive {
            *shown = Some(path.clone());
        }
        *path = resolved.path;
    }
    Ok(())
}

fn run_files(args: &Args) -> Result<ExitCode, String> {
    let diff = diff_files(&args.left, &args.right, &args.opts).map_err(|e| e.to_string())?;

    if diff.left.encoding != diff.right.encoding {
        eprintln!(
            "note: different encodings ({:?} / {:?})",
            diff.left.encoding, diff.right.encoding
        );
    }
    if diff.left.eol != diff.right.eol {
        eprintln!(
            "note: different line endings ({:?} / {:?})",
            diff.left.eol, diff.right.eol
        );
    }

    if diff.approximate {
        eprintln!(
            "note: approximate comparison: the result is correct, but it may have more changed lines than the minimum"
        );
    }

    // Line breaks, trailing spaces and the like: say so, even when the rows match.
    if !diff.identical
        || diff.left.eol != diff.right.eol
        || diff.left.encoding != diff.right.encoding
    {
        if let (Ok(l), Ok(r)) = (read_text_file(&args.left), read_text_file(&args.right)) {
            if let Some(causes) = classify_texts(&l, &r).filter(MinorCauses::any) {
                eprintln!(
                    "note: {} only in minor ways: {}",
                    if diff.identical {
                        "the files are equal under the current options and differ"
                    } else {
                        "the files differ"
                    },
                    causes.labels().join(", ")
                );
            }
        }
    }

    if let Some(format) = args.report {
        let options = ReportOptions {
            context: Some(args.context),
            ..Default::default()
        };
        let text = file_report(
            &diff,
            &args.left_shown().display().to_string(),
            &args.right_shown().display().to_string(),
            format,
            &options,
        );
        print!("{text}");
        return Ok(ExitCode::from(u8::from(!diff.identical)));
    }

    if diff.identical {
        println!("The files are identical");
        return Ok(ExitCode::SUCCESS);
    }

    println!("--- {}", args.left_shown().display());
    println!("+++ {}", args.right_shown().display());
    print_rows(&diff.rows, args.context);
    eprintln!(
        "{} modified, {} left only, {} right only",
        diff.stats.changed, diff.stats.left_only, diff.stats.right_only
    );
    Ok(ExitCode::from(1))
}

/// Prints the different rows with a few rows of context; the equal stretches far
/// from the differences are replaced by "...".
fn print_rows(rows: &[Row], context: usize) {
    let visible = visible_rows(rows, Some(context));
    let mut skipping = false;
    for (row, &show) in rows.iter().zip(&visible) {
        if !show {
            if !skipping {
                println!("  ...");
                skipping = true;
            }
            continue;
        }
        skipping = false;

        match row.kind {
            RowKind::Equal => print_line(
                row.left.as_ref(),
                row.right.as_ref(),
                ' ',
                row.left.as_ref(),
            ),
            RowKind::LeftOnly => print_line(row.left.as_ref(), None, '-', row.left.as_ref()),
            RowKind::RightOnly => print_line(None, row.right.as_ref(), '+', row.right.as_ref()),
            RowKind::Changed => {
                print_line(row.left.as_ref(), None, '-', row.left.as_ref());
                print_line(None, row.right.as_ref(), '+', row.right.as_ref());
            }
        }
    }
}

fn print_line(left: Option<&Cell>, right: Option<&Cell>, marker: char, text: Option<&Cell>) {
    let number = |c: Option<&Cell>| c.map_or(String::new(), |c| c.number.to_string());
    println!(
        "{:>5} {:>5} {} {}",
        number(left),
        number(right),
        marker,
        text.map_or("", |c| c.text.as_str())
    );
}

fn run_dirs(args: &Args) -> Result<ExitCode, String> {
    let opts = DirOptions {
        filter: args.filter.clone(),
    };
    let diff = compare_dirs(&args.left, &args.right, &opts).map_err(|e| e.to_string())?;

    let mut any = false;
    for entry in &diff.entries {
        // Directories present on both sides only summarize their children: the children are printed
        // (unless the folder could not be read).
        if entry.left_kind == Some(EntryKind::Dir)
            && entry.right_kind == Some(EntryKind::Dir)
            && entry.error.is_none()
        {
            continue;
        }
        let label = match entry.status {
            _ if entry.error.is_some() => "unreadable",
            EntryStatus::Identical => continue,
            EntryStatus::Different if entry.minor.is_some() => "different (minor)",
            EntryStatus::Different => "different",
            EntryStatus::LeftOnly => "left only",
            EntryStatus::RightOnly => "right only",
            EntryStatus::TypeMismatch => "type differs",
        };
        let is_dir =
            entry.left_kind == Some(EntryKind::Dir) || entry.right_kind == Some(EntryKind::Dir);
        println!(
            "{label:<14} {}{}{}",
            entry.path,
            if is_dir { "/" } else { "" },
            entry
                .minor
                .map(|m| format!("  [{}]", m.labels().join(", ")))
                .or_else(|| entry.error.as_ref().map(|e| format!("  ({e})")))
                .unwrap_or_default()
        );
        any = true;
    }

    if !any {
        println!("The directories are identical");
        return Ok(ExitCode::SUCCESS);
    }
    let s = &diff.stats;
    let minor = if s.minor > 0 {
        format!(" ({} only minor)", s.minor)
    } else {
        String::new()
    };
    eprintln!(
        "{} identical, {} different{minor}, {} left only, {} right only, {} of different type",
        s.identical, s.different, s.left_only, s.right_only, s.type_mismatch
    );
    Ok(ExitCode::from(1))
}

fn setup_git(external: bool, mergetool: bool) -> Result<ExitCode, String> {
    let exe = env::current_exe().map_err(|e| format!("cannot find this program: {e}"))?;
    let changes = nurdiff_core::setup_git_config(
        &nurdiff_core::command_for(&exe),
        nurdiff_core::GitSetup {
            external,
            mergetool,
        },
    )
    .map_err(|e| e.to_string())?;
    for c in &changes {
        match &c.old {
            Some(old) if *old == c.value => println!("{}: already {}", c.key, c.value),
            Some(old) => println!("{}: {}   (was: {old})", c.key, c.value),
            None => println!("{}: {}", c.key, c.value),
        }
    }
    if gui_executable().is_err() {
        eprintln!("warning: the graphical application (nurdiff) was not found next to nurdiff-cli or in the PATH: git will not be able to open it until it is (or $NURDIFF_GUI points to it)");
    }
    println!("Done. Try: git difftool   (or: git difftool --dir-diff --no-symlinks)");
    Ok(ExitCode::SUCCESS)
}

fn remove_git() -> Result<ExitCode, String> {
    let removed = nurdiff_core::remove_git_config().map_err(|e| e.to_string())?;
    if removed.is_empty() {
        println!("Nothing to remove: git is not set up for NurDiff.");
    }
    for key in removed {
        println!("{key}: removed");
    }
    Ok(ExitCode::SUCCESS)
}

/// The two paths to compare in the arguments that git passes to an external program:
/// `path old-file old-hex old-mode new-file new-hex new-mode`, plus
/// `new-path rename` if the file was renamed. With the path only (unmerged file,
/// in conflict) there is nothing to compare.
fn git_external_paths(args: &[OsString]) -> Result<Option<(OsString, OsString)>, String> {
    match args.len() {
        1 => Ok(None),
        7 | 9 => Ok(Some((args[1].clone(), args[4].clone()))),
        n => Err(format!(
            "git passed {n} arguments, 7 are needed (or 9 for renames)"
        )),
    }
}

fn git_external(args: &[OsString]) -> Result<ExitCode, String> {
    let Some((old, new)) = git_external_paths(args)? else {
        eprintln!(
            "nurdiff-cli: {} is unmerged: nothing to compare",
            args[0].to_string_lossy()
        );
        return Ok(ExitCode::SUCCESS);
    };
    // For git an external program that exits with a non-zero code is an error: even
    // if the comparison finds differences (or the GUI is missing) it exits with zero.
    if gui_executable().is_err() {
        // Without a graphical application `git diff` still prints the differences, as text.
        let args = Args {
            left: PathBuf::from(old),
            right: PathBuf::from(new),
            opts: DiffOptions::default(),
            context: 3,
            report: None,
            filter: ExtFilter::default(),
            shown: [None, None],
        };
        let outcome = if args.left.is_dir() && args.right.is_dir() {
            run_dirs(&args)
        } else {
            run_files(&args)
        };
        // A file that cannot be compared as text (binary, unreadable) must not stop the files that follow.
        if let Err(e) = outcome {
            eprintln!("nurdiff-cli: {}: {e}", args.right.display());
        }
        return Ok(ExitCode::SUCCESS);
    }
    open_gui(&[old, new]).map(|_| ExitCode::SUCCESS)
}

fn gui_executable() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("NURDIFF_GUI").filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let name = if cfg!(windows) {
        "nurdiff.exe"
    } else {
        "nurdiff"
    };
    // The real place of the executable, not of a link to it (`/usr/local/bin/nurdiff-cli` -> the app bundle).
    if let Some(dir) = env::current_exe()
        .ok()
        .map(|e| e.canonicalize().unwrap_or(e))
        .and_then(|e| e.parent().map(Path::to_path_buf))
    {
        let sibling = dir.join(name);
        if sibling.is_file() {
            return Ok(sibling);
        }
    }
    let path: OsString = env::var_os("PATH").unwrap_or_default();
    env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            format!("graphical application ({name}) not found: put it next to nurdiff-cli, in the PATH or in $NURDIFF_GUI")
        })
}

/// Starts the graphical application on the two paths and waits for it to close: git resumes
/// (and, with `--dir-diff`, brings the changes back into the working tree) only when the
/// program exits.
fn open_gui(paths: &[OsString]) -> Result<ExitCode, String> {
    if paths.len() != 2 {
        return Err(format!("exactly two paths are needed\n\n{USAGE}"));
    }
    let gui = gui_executable()?;
    let status = Command::new(&gui)
        .arg("--")
        .args(paths)
        .status()
        .map_err(|e| format!("cannot start {}: {e}", gui.display()))?;
    Ok(exit_code(status))
}

fn exit_code(status: std::process::ExitStatus) -> ExitCode {
    match status.code() {
        Some(0) => ExitCode::SUCCESS,
        Some(c) => ExitCode::from(u8::try_from(c).unwrap_or(2)),
        None => ExitCode::from(2),
    }
}

/// Starts the graphical application on a file with conflict markers and waits for it to close: git takes the file
/// as resolved only if the exit code is 0, which the application gives when every conflict has a choice and the file
/// is saved.
fn open_merge(file: &Path) -> Result<ExitCode, String> {
    if !file.is_file() {
        return Err(format!("{} is not a file", file.display()));
    }
    let gui = gui_executable()?;
    let status = Command::new(&gui)
        .arg("--merge")
        .arg(file)
        .status()
        .map_err(|e| format!("cannot start {}: {e}", gui.display()))?;
    Ok(exit_code(status))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<OsString> {
        a.iter().map(OsString::from).collect()
    }

    #[test]
    fn argomenti_di_git() {
        let a = v(&[
            "f.txt",
            "/tmp/git-blob-x/f.txt",
            "abc",
            "100644",
            "f.txt",
            "def",
            "100644",
        ]);
        assert_eq!(
            git_external_paths(&a),
            Ok(Some(("/tmp/git-blob-x/f.txt".into(), "f.txt".into())))
        );
        let r = v(&[
            "n",
            "o",
            "1",
            "m",
            "p",
            "2",
            "m",
            "n2",
            "similarity index 90%",
        ]);
        assert_eq!(git_external_paths(&r), Ok(Some(("o".into(), "p".into()))));
        assert_eq!(git_external_paths(&v(&["unito.txt"])), Ok(None));
        assert!(git_external_paths(&v(&["a", "b"])).is_err());
    }

    #[test]
    fn le_opzioni_di_git_si_riconoscono_e_non_si_mescolano() {
        let parse = |a: &[&str]| parse_args(v(a).into_iter());
        assert!(matches!(
            parse(&["--setup-git"]),
            Ok(Parsed::SetupGit {
                external: false,
                mergetool: false
            })
        ));
        assert!(matches!(
            parse(&["--setup-git", "--external"]),
            Ok(Parsed::SetupGit {
                external: true,
                mergetool: false
            })
        ));
        assert!(matches!(parse(&["--remove-git"]), Ok(Parsed::RemoveGit)));
        assert!(parse(&["--external"]).is_err());
        assert!(parse(&["--setup-git", "--remove-git"]).is_err());
        assert!(parse(&["--setup-git", "a.txt"]).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn un_percorso_non_utf8_resta_com_e() {
        use std::os::unix::ffi::OsStringExt;
        let latin1 = OsString::from_vec(b"caf\xe9.txt".to_vec());
        let parsed = parse_args([latin1.clone(), "b.txt".into()].into_iter());
        assert!(matches!(parsed, Ok(Parsed::Run(a)) if a.left == Path::new(&latin1)));
        let parsed = parse_args(["--context".into(), latin1].into_iter());
        assert!(parsed.is_err_and(|e| e.starts_with("invalid value for --context")));
    }

    #[test]
    fn merge_toma_un_solo_file_e_non_si_mescola() {
        let parse = |a: &[&str]| parse_args(v(a).into_iter());
        assert!(
            matches!(parse(&["--merge", "f.txt"]), Ok(Parsed::Merge(p)) if p == Path::new("f.txt"))
        );
        assert!(parse(&["--merge"]).is_err());
        assert!(parse(&["--merge", "a", "b"]).is_err());
        assert!(parse(&["--merge", "a", "--gui"]).is_err());
        assert!(parse(&["--merge", "a", "--setup-git"]).is_err());
        assert!(matches!(
            parse(&["--setup-git", "--mergetool"]),
            Ok(Parsed::SetupGit {
                external: false,
                mergetool: true
            })
        ));
        assert!(parse(&["--mergetool"]).is_err());
    }
}
