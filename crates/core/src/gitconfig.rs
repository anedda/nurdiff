//! The git configuration that makes NurDiff git's diff tool: `diff.tool`, `difftool.nurdiff.cmd`,
//! `difftool.prompt` and, on request, `diff.external`. It is written in the global configuration with `git config`, so the
//! user's own `git` (and its rules) does the work. Used by `nurdiff-cli --setup-git` and by the options of the app.

use std::{
    env,
    ffi::OsString,
    fmt,
    path::{Path, PathBuf},
    process::Command,
};

use serde::Serialize;

use crate::coded::{Coded, CodedError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitConfigError {
    /// `git` cannot be run (not installed, not in the `PATH`).
    NoGit(String),
    /// `git config` refused: the text it gave.
    Failed(String),
}

impl fmt::Display for GitConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GitConfigError::NoGit(reason) => write!(f, "cannot run git: {reason}"),
            GitConfigError::Failed(reason) => write!(f, "git config failed: {reason}"),
        }
    }
}

impl std::error::Error for GitConfigError {}

impl Coded for GitConfigError {
    fn coded(&self) -> CodedError {
        match self {
            GitConfigError::NoGit(reason) => {
                CodedError::new("err.git.noGit").with("reason", reason)
            }
            GitConfigError::Failed(reason) => {
                CodedError::new("err.git.failed").with("reason", reason)
            }
        }
    }
}

/// One setting written: the key, the new value and the one it replaced (if there was one).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitChange {
    pub key: &'static str,
    pub value: String,
    pub old: Option<String>,
}

/// What the global configuration says now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitStatus {
    /// `git difftool` opens NurDiff.
    pub configured: bool,
    /// Plain `git diff` opens NurDiff too.
    pub external: bool,
    /// `git mergetool` opens NurDiff.
    pub mergetool: bool,
}

/// The name of the command-line program on this system.
pub fn cli_name() -> &'static str {
    if cfg!(windows) {
        "nurdiff-cli.exe"
    } else {
        "nurdiff-cli"
    }
}

/// How git must call the program at `exe`: just `nurdiff-cli` if that is what the `PATH` finds, otherwise the full path
/// in quotes with forward slashes (git runs the command with a shell, also on Windows).
pub fn command_for(exe: &Path) -> String {
    let exe = exe.canonicalize().unwrap_or_else(|_| exe.to_path_buf());
    let found = find_in_path(cli_name()).is_some_and(|p| p.canonicalize().unwrap_or(p) == exe);
    command_name(&exe, found)
}

fn command_name(exe: &Path, found_in_path: bool) -> String {
    if found_in_path {
        return "nurdiff-cli".to_string();
    }
    format!("\"{}\"", exe.to_string_lossy().replace('\\', "/"))
}

/// The first `name` file found in the directories of the `PATH`.
fn find_in_path(name: &str) -> Option<PathBuf> {
    let path: OsString = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

/// What to set up besides `git difftool`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct GitSetup {
    /// Plain `git diff` opens NurDiff too (`diff.external`).
    pub external: bool,
    /// `git mergetool` opens NurDiff to resolve the conflicts.
    pub mergetool: bool,
}

/// What goes into the configuration: (key, value). `command` is how git calls the program.
fn plan(command: &str, setup: GitSetup) -> Vec<(&'static str, String)> {
    let mut plan = vec![
        ("diff.tool", "nurdiff".to_string()),
        (
            "difftool.nurdiff.cmd",
            format!("{command} --gui \"$LOCAL\" \"$REMOTE\""),
        ),
        ("difftool.prompt", "false".to_string()),
    ];
    if setup.external {
        plan.push(("diff.external", format!("{command} --git-external")));
    }
    if setup.mergetool {
        plan.push(("merge.tool", "nurdiff".to_string()));
        plan.push((
            "mergetool.nurdiff.cmd",
            format!("{command} --merge \"$MERGED\""),
        ));
        // Git takes the file as resolved only if the program exits with 0 (NurDiff does so when every conflict is resolved and saved).
        plan.push(("mergetool.nurdiff.trustExitCode", "true".to_string()));
    }
    plan
}

/// Runs `git config --global <args>`: its output, or `None` if the key is not set.
fn git_config(args: &[&str]) -> Result<Option<String>, GitConfigError> {
    let out = Command::new("git")
        .args(["config", "--global"])
        .args(args)
        .output()
        .map_err(|e| GitConfigError::NoGit(e.to_string()))?;
    if out.status.success() {
        Ok(Some(
            String::from_utf8_lossy(&out.stdout).trim_end().to_string(),
        ))
    } else if out.status.code() == Some(1) {
        Ok(None) // `--get` of a key that does not exist; `--unset` of one that does not exist
    } else {
        Err(GitConfigError::Failed(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ))
    }
}

/// Writes the settings; returns each one with the value it replaced.
pub fn setup(command: &str, setup: GitSetup) -> Result<Vec<GitChange>, GitConfigError> {
    let mut changes = Vec::new();
    for (key, value) in plan(command, setup) {
        let old = git_config(&["--get", key])?;
        git_config(&[key, &value])?;
        changes.push(GitChange { key, value, old });
    }
    Ok(changes)
}

/// Takes the settings out (`difftool.prompt` stays: there is no telling it was not already so). Returns what it removed.
pub fn remove() -> Result<Vec<&'static str>, GitConfigError> {
    let mut removed = Vec::new();
    if git_config(&["--get", "diff.tool"])?.as_deref() == Some("nurdiff") {
        git_config(&["--unset", "diff.tool"])?;
        removed.push("diff.tool");
    }
    if git_config(&["--get", "difftool.nurdiff.cmd"])?.is_some() {
        git_config(&["--remove-section", "difftool.nurdiff"])?;
        removed.push("difftool.nurdiff");
    }
    if git_config(&["--get", "diff.external"])?.is_some_and(|v| v.contains("nurdiff-cli")) {
        git_config(&["--unset", "diff.external"])?;
        removed.push("diff.external");
    }
    if git_config(&["--get", "merge.tool"])?.as_deref() == Some("nurdiff") {
        git_config(&["--unset", "merge.tool"])?;
        removed.push("merge.tool");
    }
    if git_config(&["--get", "mergetool.nurdiff.cmd"])?.is_some() {
        git_config(&["--remove-section", "mergetool.nurdiff"])?;
        removed.push("mergetool.nurdiff");
    }
    Ok(removed)
}

/// Whether git is set up for NurDiff now.
pub fn status() -> Result<GitStatus, GitConfigError> {
    let tool = git_config(&["--get", "diff.tool"])?;
    let cmd = git_config(&["--get", "difftool.nurdiff.cmd"])?;
    let external = git_config(&["--get", "diff.external"])?;
    let merge = git_config(&["--get", "merge.tool"])?;
    let merge_cmd = git_config(&["--get", "mergetool.nurdiff.cmd"])?;
    Ok(GitStatus {
        configured: tool.as_deref() == Some("nurdiff") && cmd.is_some(),
        external: external.is_some_and(|v| v.contains("nurdiff-cli")),
        mergetool: merge.as_deref() == Some("nurdiff") && merge_cmd.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn il_comando_per_git_e_il_nome_o_il_percorso_tra_virgolette() {
        let exe = Path::new("/usr/bin/nurdiff-cli");
        assert_eq!(command_name(exe, true), "nurdiff-cli");
        assert_eq!(command_name(exe, false), "\"/usr/bin/nurdiff-cli\"");
        // Windows: backslashes become slashes, spaces stay inside the quotes
        let win = Path::new("C:\\Program Files\\NurDiff\\nurdiff-cli.exe");
        assert_eq!(
            command_name(win, false),
            "\"C:/Program Files/NurDiff/nurdiff-cli.exe\""
        );
    }

    #[test]
    fn la_configurazione_ha_le_tre_voci_e_a_richiesta_diff_external() {
        let p = plan("nurdiff-cli", GitSetup::default());
        let keys: Vec<_> = p.iter().map(|(k, _)| *k).collect();
        assert_eq!(
            keys,
            ["diff.tool", "difftool.nurdiff.cmd", "difftool.prompt"]
        );
        assert_eq!(p[1].1, "nurdiff-cli --gui \"$LOCAL\" \"$REMOTE\"");
        let p = plan(
            "\"/a b/nurdiff-cli\"",
            GitSetup {
                external: true,
                mergetool: false,
            },
        );
        assert_eq!(
            p.last().unwrap(),
            &(
                "diff.external",
                "\"/a b/nurdiff-cli\" --git-external".to_string()
            )
        );
        // the merge tool: the file to resolve and trust in the exit code
        let p = plan(
            "nurdiff-cli",
            GitSetup {
                external: false,
                mergetool: true,
            },
        );
        let get = |k: &str| p.iter().find(|(key, _)| *key == k).map(|(_, v)| v.as_str());
        assert_eq!(get("merge.tool"), Some("nurdiff"));
        assert_eq!(
            get("mergetool.nurdiff.cmd"),
            Some("nurdiff-cli --merge \"$MERGED\"")
        );
        assert_eq!(get("mergetool.nurdiff.trustExitCode"), Some("true"));
        assert_eq!(get("diff.external"), None);
    }

    #[test]
    fn gli_errori_hanno_il_codice_per_la_ui() {
        assert_eq!(
            GitConfigError::NoGit("x".into()).coded().code,
            "err.git.noGit"
        );
        assert_eq!(
            GitConfigError::Failed("x".into()).coded().code,
            "err.git.failed"
        );
    }
}
