//! Filter of files by extension, for the folder comparison.
//!
//! Two sets: those to **include** (if it is not empty only the files in it pass) and those
//! to **exclude** (they never pass; it wins over inclusion). "No extension" is a separate
//! element of each set. The filter only looks at file names: folders have no extension
//! and stay as long as they contain something that passes.

use serde::{Deserialize, Serialize};

/// The extension of a file name, without the dot: `a.tar.gz` → `gz`. A name that starts with the
/// dot and has no other (`.gitignore`) or that ends with a dot (`a.`) has no extension.
pub fn extension(name: &str) -> Option<&str> {
    let dot = name.rfind('.')?;
    let ext = &name[dot + 1..];
    if dot == 0 || ext.is_empty() {
        None
    } else {
        Some(ext)
    }
}

/// Turns a text like `ts, .RS tsx` into clean extensions: lowercase, without leading dot,
/// without duplicates or empty items. Commas, semicolons and spaces separate them.
pub fn parse_ext_list(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for part in text.split(|c: char| c == ',' || c == ';' || c.is_whitespace()) {
        let ext = part.trim().trim_start_matches('.').to_lowercase();
        if !ext.is_empty() && !out.contains(&ext) {
            out.push(ext);
        }
    }
    out
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ExtFilter {
    pub include_exts: Vec<String>,
    /// Also includes files without an extension.
    pub include_none: bool,
    pub exclude_exts: Vec<String>,
    /// Also excludes files without an extension.
    pub exclude_none: bool,
}

impl ExtFilter {
    /// Does the filter remove anything? Otherwise the comparison is the usual one.
    pub fn is_active(&self) -> bool {
        !self.include_exts.is_empty()
            || self.include_none
            || !self.exclude_exts.is_empty()
            || self.exclude_none
    }

    /// The same filter with clean extensions (see [`parse_ext_list`]).
    pub fn normalized(&self) -> ExtFilter {
        let clean = |list: &[String]| parse_ext_list(&list.join(","));
        ExtFilter {
            include_exts: clean(&self.include_exts),
            include_none: self.include_none,
            exclude_exts: clean(&self.exclude_exts),
            exclude_none: self.exclude_none,
        }
    }

    /// Does the file with this name pass the filter? It assumes a normalized filter.
    pub fn accepts(&self, name: &str) -> bool {
        let ext = extension(name).map(str::to_lowercase);
        let listed = |exts: &[String], none: bool| match &ext {
            Some(e) => exts.contains(e),
            None => none,
        };
        let restricts = !self.include_exts.is_empty() || self.include_none;
        (!restricts || listed(&self.include_exts, self.include_none))
            && !listed(&self.exclude_exts, self.exclude_none)
    }
}

#[cfg(test)]
mod tests;
