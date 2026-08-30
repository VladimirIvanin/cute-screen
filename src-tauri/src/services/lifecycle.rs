use std::path::Path;

use clap::{Parser, Subcommand, ValueEnum};
use serde::Serialize;

use crate::capture::{CaptureAction, CaptureInvocationSource, CaptureRequestV1};

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchIntentV1 {
    ShowEditor,
    Background,
    Capture(CaptureLaunchV1),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureLaunchV1 {
    pub request: CaptureRequestV1,
    pub json: bool,
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
    Capture(CaptureArgs),
}

#[derive(Debug, clap::Args)]
struct CaptureArgs {
    #[arg(long, value_enum)]
    mode: CaptureMode,
    #[arg(long, default_value_t = 0, value_parser = clap::value_parser!(u32).range(0..=60_000))]
    delay: u32,
    #[arg(long)]
    cursor: bool,
    #[arg(long)]
    series: Option<String>,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum CaptureMode {
    Area,
    Screen,
    Window,
    #[value(name = "active-window")]
    ActiveWindow,
    Repeat,
}

impl From<CaptureMode> for CaptureAction {
    fn from(value: CaptureMode) -> Self {
        match value {
            CaptureMode::Area => Self::Area,
            CaptureMode::Screen => Self::Screen,
            CaptureMode::Window => Self::Window,
            CaptureMode::ActiveWindow => Self::ActiveWindow,
            CaptureMode::Repeat => Self::Repeat,
        }
    }
}

pub fn parse_launch<I, T>(args: I) -> Result<LaunchIntentV1, clap::Error>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let cli = Cli::try_parse_from(args)?;
    match cli.command {
        Some(Command::Capture(capture)) => Ok(LaunchIntentV1::Capture(CaptureLaunchV1 {
            request: CaptureRequestV1 {
                correlation_id: uuid::Uuid::now_v7().to_string(),
                action: capture.mode.into(),
                delay_ms: capture.delay,
                cursor: capture.cursor,
                series_id: capture.series,
                invocation_source: CaptureInvocationSource::Cli,
            },
            json: capture.json,
        })),
        Some(Command::Show) | None if cli.background => Ok(LaunchIntentV1::Background),
        Some(Command::Show) | None => Ok(LaunchIntentV1::ShowEditor),
    }
}

/// Returns the command a desktop's shortcut settings can execute when its
/// GlobalShortcuts portal is unavailable. AppImages must use their current
/// absolute path because they are portable and can be moved after setup.
pub fn cli_fallback_command(current_exe: &Path, appimage: bool) -> String {
    if appimage {
        format!(
            "{} capture --mode area",
            shell_quote(&current_exe.to_string_lossy())
        )
    } else {
        "cute-screen capture --mode area".to_owned()
    }
}

pub fn current_cli_fallback_command() -> Option<String> {
    let current_exe = std::env::current_exe().ok()?;
    Some(cli_fallback_command(
        &current_exe,
        std::env::var_os("APPIMAGE").is_some(),
    ))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
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
        AutostartService, CaptureLaunchV1, LaunchIntentV1, LifecycleState, MemoryAutostartService,
        cli_fallback_command, parse_launch,
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
    fn parses_versioned_m04_capture_contract() {
        let LaunchIntentV1::Capture(CaptureLaunchV1 { request, json }) = parse_launch([
            "cute-screen",
            "capture",
            "--mode",
            "active-window",
            "--delay",
            "120",
            "--cursor",
            "--series",
            "series-1",
            "--json",
        ])
        .expect("capture CLI") else {
            panic!("capture must parse as a capture intent");
        };
        assert_eq!(request.action, crate::capture::CaptureAction::ActiveWindow);
        assert_eq!(request.delay_ms, 120);
        assert!(request.cursor);
        assert_eq!(request.series_id.as_deref(), Some("series-1"));
        assert!(json);
    }

    #[test]
    fn appimage_fallback_is_an_absolute_shell_quoted_capture_command() {
        assert_eq!(
            cli_fallback_command(std::path::Path::new("/opt/Cute Screen.AppImage"), true),
            "'/opt/Cute Screen.AppImage' capture --mode area"
        );
        assert_eq!(
            cli_fallback_command(
                std::path::Path::new("/mnt/external/Cute Screen.AppImage"),
                true,
            ),
            "'/mnt/external/Cute Screen.AppImage' capture --mode area"
        );
        assert_eq!(
            cli_fallback_command(std::path::Path::new("/usr/bin/cute-screen"), false),
            "cute-screen capture --mode area"
        );
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
