use std::path::Path;

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
use clap::ValueEnum;
use clap::{Parser, Subcommand};
use serde::Serialize;

use crate::capture::CaptureRequestV1;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
use crate::capture::{CaptureAction, CaptureInvocationSource};

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
    StartupCheck,
    ShowEditor,
    Background,
    Settings,
    VerifyShortcut { token: String },
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
    about = "Local screenshot capture and annotation",
    disable_help_flag = cfg!(any(target_os = "windows", target_os = "macos")),
    disable_version_flag = cfg!(any(target_os = "windows", target_os = "macos")),
    disable_help_subcommand = cfg!(any(target_os = "windows", target_os = "macos"))
)]
struct Cli {
    // Internal packaging/link smoke: exit before opening any application surface.
    #[arg(long, hide = true)]
    startup_check: bool,
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
    Settings {
        #[arg(long, default_value = "shortcuts", value_parser = ["shortcuts"])]
        section: String,
    },
    Shortcuts {
        #[command(subcommand)]
        command: ShortcutCommand,
    },
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    Capture(CaptureArgs),
}

#[derive(Debug, Subcommand)]
enum ShortcutCommand {
    Test {
        #[arg(long, value_parser = validate_verification_token)]
        token: String,
    },
}

fn validate_verification_token(value: &str) -> Result<String, String> {
    if value.len() == 32 && value.bytes().all(|character| character.is_ascii_hexdigit()) {
        Ok(value.to_owned())
    } else {
        Err("Expected a 32-character verification token".to_owned())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
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

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
#[derive(Debug, Clone, Copy, ValueEnum)]
enum CaptureMode {
    Area,
    Screen,
    Window,
    #[value(name = "active-window")]
    ActiveWindow,
    Repeat,
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
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
    if cli.startup_check {
        return Ok(LaunchIntentV1::StartupCheck);
    }
    match cli.command {
        Some(Command::Settings { .. }) => Ok(LaunchIntentV1::Settings),
        Some(Command::Shortcuts {
            command: ShortcutCommand::Test { token },
        }) => Ok(LaunchIntentV1::VerifyShortcut { token }),
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
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

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn current_cli_fallback_command() -> Option<String> {
    None
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn current_cli_fallback_command() -> Option<String> {
    let current_exe = crate::autostart::executable().ok()?;
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
    #[test]
    fn settings_and_verification_cli_have_distinct_validated_intents() {
        assert_eq!(
            super::parse_launch(["cute-screen", "settings", "--section", "shortcuts"]).unwrap(),
            super::LaunchIntentV1::Settings
        );
        assert!(super::parse_launch(["cute-screen", "settings", "--section", "unknown"]).is_err());
        assert!(
            super::parse_launch(["cute-screen", "shortcuts", "test", "--token", "bad"]).is_err()
        );
        assert!(matches!(
            super::parse_launch([
                "cute-screen",
                "shortcuts",
                "test",
                "--token",
                "0123456789abcdef0123456789abcdef"
            ])
            .unwrap(),
            super::LaunchIntentV1::VerifyShortcut { .. }
        ));
    }

    use super::{
        AutostartService, LaunchIntentV1, LifecycleState, MemoryAutostartService,
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

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[test]
    fn gui_platforms_reject_public_cli_but_keep_internal_startup_check() {
        for args in [
            vec!["cute-screen", "--help"],
            vec!["cute-screen", "--version"],
            vec!["cute-screen", "capture", "--mode", "screen", "--json"],
        ] {
            assert!(parse_launch(args).is_err());
        }
        assert_eq!(
            parse_launch(["cute-screen", "--startup-check"]).unwrap(),
            LaunchIntentV1::StartupCheck
        );
        assert!(super::current_cli_fallback_command().is_none());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    #[test]
    fn parses_versioned_m04_capture_contract() {
        let LaunchIntentV1::Capture(super::CaptureLaunchV1 { request, json }) = parse_launch([
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
