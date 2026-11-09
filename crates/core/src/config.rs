//! The files of the user's configuration, in `~/.nurdiff/`: `settings.json` (the choices of the user), `recents.json`
//! (the comparisons already made) and `state.json` (the state of the window, like the sidebar).
//!
//! The core only reads and writes them as text: what is in them is up to the interface, which knows its own settings.
//! The folder can be changed with the `NURDIFF_CONFIG_DIR` variable (for tests, or to carry the configuration around).

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::{fmt, fs, io};

use serde::Deserialize;

use crate::coded::{Coded, CodedError};

/// A configuration file. The interface names it, the core decides where it lives: no path comes from outside.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigFile {
    Settings,
    Recents,
    State,
}

impl ConfigFile {
    pub fn file_name(self) -> &'static str {
        match self {
            ConfigFile::Settings => "settings.json",
            ConfigFile::Recents => "recents.json",
            ConfigFile::State => "state.json",
        }
    }
}

#[derive(Debug)]
pub enum ConfigError {
    /// The folder of the configuration cannot be found: there is no home folder.
    NoDir,
    Io {
        path: PathBuf,
        source: io::Error,
    },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::NoDir => write!(f, "cannot find the home folder"),
            ConfigError::Io { path, source } => write!(f, "{}: {}", path.display(), source),
        }
    }
}

impl std::error::Error for ConfigError {}

impl Coded for ConfigError {
    fn coded(&self) -> CodedError {
        match self {
            ConfigError::NoDir => CodedError::new("err.config.noDir"),
            ConfigError::Io { path, source } => CodedError::new("err.config.io")
                .with("path", path.display())
                .with("reason", source),
        }
    }
}

/// The folder from the two variables (pure, so it can be tested): the one asked for, or `.nurdiff` in the home.
fn resolve_dir(chosen: Option<OsString>, home: Option<OsString>) -> Option<PathBuf> {
    let chosen = chosen.filter(|d| !d.is_empty());
    if let Some(dir) = chosen {
        return Some(PathBuf::from(dir));
    }
    let home = home.filter(|h| !h.is_empty())?;
    Some(PathBuf::from(home).join(".nurdiff"))
}

/// The home folder from the two variables, in the order of the system: on Windows `USERPROFILE` comes first (`HOME` is
/// set by some shells, like MSYS or Cygwin, to a path of their own), elsewhere `HOME`.
fn pick_home(
    home: Option<OsString>,
    userprofile: Option<OsString>,
    windows: bool,
) -> Option<OsString> {
    let (first, second) = if windows {
        (userprofile, home)
    } else {
        (home, userprofile)
    };
    first.filter(|h| !h.is_empty()).or(second)
}

/// The folder of the configuration: `NURDIFF_CONFIG_DIR`, or `~/.nurdiff` (`%USERPROFILE%\.nurdiff` on Windows).
pub fn config_dir() -> Option<PathBuf> {
    let home = pick_home(
        std::env::var_os("HOME"),
        std::env::var_os("USERPROFILE"),
        cfg!(windows),
    );
    resolve_dir(std::env::var_os("NURDIFF_CONFIG_DIR"), home)
}

/// The text of a file, or `None` if it does not exist yet.
pub fn read_config(dir: &Path, file: ConfigFile) -> Result<Option<String>, ConfigError> {
    let path = dir.join(file.file_name());
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(ConfigError::Io { path, source }),
    }
}

/// Writes a file. It first writes a temporary file next to it and then renames it: if the program stops in the
/// middle, the old content is still there and not half of the new one. It creates the folder if needed.
/// The temporary file has the number of the process in its name: two copies of the application that save at
/// the same moment do not use the same one, and a failed write does not leave it behind.
pub fn write_config(dir: &Path, file: ConfigFile, contents: &str) -> Result<(), ConfigError> {
    let path = dir.join(file.file_name());
    let io_error = |path: &Path| {
        let path = path.to_path_buf();
        move |source| ConfigError::Io { path, source }
    };
    fs::create_dir_all(dir).map_err(io_error(dir))?;
    let temp = dir.join(format!(".{}.{}.tmp", file.file_name(), std::process::id()));
    if let Err(source) = fs::write(&temp, contents) {
        let _ = fs::remove_file(&temp);
        return Err(ConfigError::Io { path: temp, source });
    }
    fs::rename(&temp, &path).map_err(|source| {
        let _ = fs::remove_file(&temp);
        ConfigError::Io {
            path: path.clone(),
            source,
        }
    })
}

/// Keeps a copy of the file as `<name>.json.bak` (the interface does it when it finds the content unreadable, before
/// the next saving replaces it). Nothing happens if the file does not exist.
pub fn backup_config(dir: &Path, file: ConfigFile) -> Result<(), ConfigError> {
    let path = dir.join(file.file_name());
    let backup = dir.join(format!("{}.bak", file.file_name()));
    match fs::copy(&path, &backup) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(ConfigError::Io {
            path: backup,
            source,
        }),
    }
}

pub fn load_config(file: ConfigFile) -> Result<Option<String>, ConfigError> {
    read_config(&config_dir().ok_or(ConfigError::NoDir)?, file)
}

pub fn save_config(file: ConfigFile, contents: &str) -> Result<(), ConfigError> {
    write_config(&config_dir().ok_or(ConfigError::NoDir)?, file, contents)
}

pub fn backup_config_file(file: ConfigFile) -> Result<(), ConfigError> {
    backup_config(&config_dir().ok_or(ConfigError::NoDir)?, file)
}

#[cfg(test)]
mod tests;
