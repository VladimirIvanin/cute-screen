use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use thiserror::Error;

pub const FAKE_PLATFORM_SENTINEL: &str = "cute-screen:fake-platform";
const DEFAULT_SCENARIO: &str = include_str!("../../tests/fake-platform/default.json");
const SCENARIO_ENV: &str = "CUTE_SCREEN_FAKE_PLATFORM_SCENARIO";

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FakePlatformScenario {
    pub clock: String,
    pub ids: Vec<String>,
    pub monitors: Vec<FakeMonitor>,
    pub permissions: BTreeMap<String, String>,
    pub dialogs: Vec<FakeDialog>,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FakeMonitor {
    pub id: String,
    pub logical_bounds: Bounds,
    pub physical_bounds: Bounds,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FakeDialog {
    pub kind: String,
    pub response: Option<String>,
}

#[derive(Debug, Error)]
pub enum FakeScenarioError {
    #[error("failed to read fake-platform scenario {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("invalid fake-platform scenario {source_name}: {source}")]
    Invalid {
        source_name: String,
        #[source]
        source: serde_json::Error,
    },
}

pub fn load_scenario(path: Option<&Path>) -> Result<FakePlatformScenario, FakeScenarioError> {
    match path {
        Some(path) => {
            let json = fs::read_to_string(path).map_err(|source| FakeScenarioError::Read {
                path: path.to_path_buf(),
                source,
            })?;
            parse_scenario(&json, &path.display().to_string())
        }
        None => parse_scenario(DEFAULT_SCENARIO, "built-in default"),
    }
}

pub fn load_scenario_from_env() -> Result<FakePlatformScenario, FakeScenarioError> {
    let path = env::var_os(SCENARIO_ENV).map(PathBuf::from);
    load_scenario(path.as_deref())
}

fn parse_scenario(
    json: &str,
    source_name: &str,
) -> Result<FakePlatformScenario, FakeScenarioError> {
    serde_json::from_str(json).map_err(|source| FakeScenarioError::Invalid {
        source_name: source_name.to_owned(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::{FakeScenarioError, load_scenario, parse_scenario};

    #[test]
    fn default_scenario_is_deterministic() {
        let first = load_scenario(None).expect("default scenario should load");
        let second = load_scenario(None).expect("default scenario should load twice");

        assert_eq!(first, second);
        assert_eq!(first.clock, "2026-01-02T03:04:05Z");
        assert_eq!(first.ids[0], "00000000-0000-4000-8000-000000000001");
    }

    #[test]
    fn invalid_scenario_has_a_typed_error() {
        let error = parse_scenario("{not-json", "inline-test")
            .expect_err("invalid JSON must not be accepted");

        assert!(matches!(error, FakeScenarioError::Invalid { .. }));
        assert!(error.to_string().contains("inline-test"));
    }
}
