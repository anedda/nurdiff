//! "Coded" errors: instead of a text in a single language, the UI receives a stable code
//! (`err.merge.noSuchHunk`, …) and its parameters, and translates them into the chosen language.
//! The `Display` of the errors stays in English: it is used by the CLI, the logs and the tests.

use std::collections::BTreeMap;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CodedError {
    pub code: &'static str,
    pub params: BTreeMap<&'static str, String>,
}

impl CodedError {
    pub fn new(code: &'static str) -> Self {
        CodedError {
            code,
            params: BTreeMap::new(),
        }
    }

    pub fn with(mut self, key: &'static str, value: impl ToString) -> Self {
        self.params.insert(key, value.to_string());
        self
    }
}

/// An error that can tell its own code and parameters.
pub trait Coded {
    fn coded(&self) -> CodedError;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_params() {
        let e = CodedError::new("err.x").with("n", 3).with("path", "/a");
        assert_eq!(e.params["n"], "3");
        assert_eq!(e.code, "err.x");
    }
}
