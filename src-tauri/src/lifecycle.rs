use clap::{Parser, Subcommand};
use serde::Serialize;

pub trait AutostartService {
    fn enabled(&self) -> Result<bool, String>;
    fn set_enabled(&mut self, enabled: bool) -> Result<(), String>;
}

#[derive(Debug, Default)]
pub struct MemoryAutostartService {
    enabled: bool,
}

impl AutostartService for MemoryAutostartService {
    fn enabled(&self) -> Result<bool, String> {
        Ok(self.enabled)
    }

    fn set_enabled(&mut self, enabled: bool) -> Result<(), String> {
        self.enabled = enabled;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchIntentV1 {
    ShowEditor,
    Background,
}

#[derive(Debug, Parser)]
#[command(
    name = "cute-screen",
    version,
    about = "Local screenshot capture and annotation"
)]
struct Cli {
    #[arg(long)]
    background: bool,
    #[cfg(feature = "test-harness")]
    #[arg(long = "e2e-harness-query", hide = true)]
    e2e_harness_query: Option<String>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    Show,
}

pub fn parse_launch<I, T>(args: I) -> Result<LaunchIntentV1, clap::Error>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let cli = Cli::try_parse_from(args)?;
    Ok(if cli.background {
        LaunchIntentV1::Background
    } else {
        LaunchIntentV1::ShowEditor
    })
}

#[cfg(feature = "test-harness")]
pub fn parse_e2e_harness_query<I, T>(args: I) -> Option<String>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let cli = Cli::try_parse_from(args).ok()?;
    cli.e2e_harness_query.or_else(|| {
        std::env::var("CUTE_SCREEN_E2E_HARNESS_QUERY")
            .ok()
            .filter(|value| !value.is_empty())
    })
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct LifecycleState {
    tray_available: bool,
    quitting: bool,
}

impl LifecycleState {
    pub fn with_tray(tray_available: bool) -> Self {
        Self {
            tray_available,
            quitting: false,
        }
    }

    pub fn set_tray_available(&mut self, available: bool) {
        self.tray_available = available;
    }
    pub fn begin_quit(&mut self) {
        self.quitting = true;
    }
    pub fn should_hide_on_close(&self) -> bool {
        self.tray_available && !self.quitting
    }
    pub fn tray_available(&self) -> bool {
        self.tray_available
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AutostartService, LaunchIntentV1, LifecycleState, MemoryAutostartService, parse_launch,
    };

    #[test]
    fn parses_foreground_and_background_lifecycle_intents() {
        assert_eq!(
            parse_launch(["cute-screen"]).unwrap(),
            LaunchIntentV1::ShowEditor
        );
        assert_eq!(
            parse_launch(["cute-screen", "show"]).unwrap(),
            LaunchIntentV1::ShowEditor
        );
        assert_eq!(
            parse_launch(["cute-screen", "--background"]).unwrap(),
            LaunchIntentV1::Background
        );
    }

    #[test]
    fn rejects_capture_until_m04_defines_its_contract() {
        assert!(parse_launch(["cute-screen", "capture", "--mode", "area"]).is_err());
    }

    #[test]
    fn close_hides_only_while_a_tray_is_available_and_quit_is_not_requested() {
        let mut state = LifecycleState::with_tray(true);
        assert!(state.should_hide_on_close());
        state.begin_quit();
        assert!(!state.should_hide_on_close());
        state.set_tray_available(false);
        assert!(!state.should_hide_on_close());
    }

    #[test]
    fn fresh_autostart_boundary_is_disabled_until_a_future_settings_flow_enables_it() {
        let mut autostart = MemoryAutostartService::default();
        assert!(!autostart.enabled().unwrap());
        autostart.set_enabled(true).unwrap();
        assert!(autostart.enabled().unwrap());
    }
}
