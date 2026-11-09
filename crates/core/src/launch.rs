//! Launching the application with two paths on the command line: this is how git (and the CLI
//! with `--gui`) use it as an external comparison tool.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// What to compare at startup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub left: String,
    pub right: String,
    /// Side that cannot be modified (temporary copy made by git): it only applies to files.
    pub left_read_only: bool,
    pub right_read_only: bool,
}

/// The file to resolve at startup (`nurdiff --merge <file>`, which is how `git mergetool` uses the app).
pub fn parse_merge_args(args: &[String], cwd: &Path) -> Option<String> {
    let at = args.iter().position(|a| a == "--merge")?;
    let path = args.get(at + 1).filter(|p| !p.starts_with("--"))?;
    Some(absolute(path, cwd).to_string_lossy().into_owned())
}

/// Wrong number of paths on the command line (two are needed).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchError(pub usize);

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "two paths to compare are needed, {} were given", self.0)
    }
}

impl std::error::Error for LaunchError {}

impl crate::coded::Coded for LaunchError {
    fn coded(&self) -> crate::coded::CodedError {
        crate::coded::CodedError::new("err.launch.count").with("count", self.0)
    }
}

/// `--ro-left` / `--ro-right` force read-only; git's temporary paths are recognized
/// on their own.
///
/// Without paths it gives `Ok(None)` (normal start); with a number of paths other than two, an error.
/// Relative paths are resolved against `cwd`.
pub fn parse_launch_args(
    args: &[String],
    cwd: &Path,
) -> Result<Option<LaunchRequest>, LaunchError> {
    // `--merge <file>` is not a comparison: it has its own request (`parse_merge_args`).
    if args.iter().any(|a| a == "--merge") {
        return Ok(None);
    }
    let (mut ro_left, mut ro_right) = (false, false);
    let mut paths: Vec<&str> = Vec::new();
    let mut only_paths = false;
    for arg in args {
        if only_paths {
            paths.push(arg);
            continue;
        }
        match arg.as_str() {
            "--" => only_paths = true,
            "--ro-left" => ro_left = true,
            "--ro-right" => ro_right = true,
            // The other options (also those of the graphical system) are not ours.
            a if a.starts_with("--") => {}
            a => paths.push(a),
        }
    }
    match paths.as_slice() {
        [] => Ok(None),
        [left, right] => {
            let (left, right) = (absolute(left, cwd), absolute(right, cwd));
            Ok(Some(LaunchRequest {
                left_read_only: ro_left || is_git_temp(&left, Side::Left),
                right_read_only: ro_right || is_git_temp(&right, Side::Right),
                left: left.to_string_lossy().into_owned(),
                right: right.to_string_lossy().into_owned(),
            }))
        }
        other => Err(LaunchError(other.len())),
    }
}

fn absolute(path: &str, cwd: &Path) -> PathBuf {
    let p = Path::new(path);
    if p.is_absolute() || crate::is_null_device(p) {
        p.to_path_buf()
    } else {
        cwd.join(p)
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Side {
    Left,
    Right,
}

/// Copies created by git only for the comparison: `…/git-blob-XXXX/name` (`GIT_EXTERNAL_DIFF`)
/// and `…/git-difftool.XXXX/left/…` (`git difftool --dir-diff`). Changing them would be pointless.
/// The right side of `--dir-diff` is instead the copy that git brings back into the working tree.
fn is_git_temp(path: &Path, side: Side) -> bool {
    let parts: Vec<String> = path
        .components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    if parts.iter().any(|p| p.starts_with("git-blob-")) {
        return true;
    }
    side == Side::Left
        && parts
            .windows(2)
            .any(|w| w[0].starts_with("git-difftool") && w[1] == "left")
}

#[cfg(test)]
mod tests;
