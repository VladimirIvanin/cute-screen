use serde::Serialize;
use std::path::PathBuf;
use ts_rs::TS;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
pub(crate) mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub const APP_ID: &str = "io.github.vladimirivanin.cute-screen";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum AutostartStateV1 {
    Enabled,
    Disabled,
    RequiresApproval,
    Unavailable,
    Unknown,
    NeedsRepair,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AutostartSnapshotV1 {
    pub state: AutostartStateV1,
    pub message: Option<String>,
}

pub fn executable() -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    if let Some(path) = std::env::var_os("APPIMAGE") {
        return Ok(PathBuf::from(path));
    }
    std::env::current_exe().map_err(|error| error.to_string())
}

pub fn executable_text() -> Result<String, String> {
    executable()?
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Executable path is not valid UTF-8".to_owned())
}

pub fn state() -> Result<AutostartSnapshotV1, String> {
    #[cfg(target_os = "linux")]
    let state = linux::state()?;
    #[cfg(target_os = "windows")]
    let state = windows::state()?;
    #[cfg(target_os = "macos")]
    let state = macos::state()?;
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    let state = AutostartStateV1::Unavailable;
    Ok(AutostartSnapshotV1 {
        state,
        message: None,
    })
}

pub fn set_enabled(enabled: bool) -> Result<AutostartSnapshotV1, String> {
    #[cfg(target_os = "linux")]
    linux::set_enabled(enabled)?;
    #[cfg(target_os = "windows")]
    windows::set_enabled(enabled)?;
    #[cfg(target_os = "macos")]
    macos::set_enabled(enabled)?;
    state()
}

pub fn installer_choice() -> Option<bool> {
    #[cfg(target_os = "windows")]
    {
        windows::installer_choice()
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

pub fn open_settings() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("gnome-session-properties")
        .spawn()
        .map(|_| ());
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", "", "ms-settings:startupapps"])
        .spawn()
        .map(|_| ());
    #[cfg(target_os = "macos")]
    {
        return macos::open_settings();
    }
    #[cfg(not(target_os = "macos"))]
    result.map_err(|error| error.to_string())
}

/// Desktop Entry has its own escaping layers, distinct from shell/GNOME argv.
pub fn desktop_exec(executable: &str, arguments: &[&str]) -> String {
    std::iter::once(executable)
        .chain(arguments.iter().copied())
        .map(|argument| {
            let mut escaped = String::new();
            for character in argument.chars() {
                match character {
                    '\\' => escaped.push_str("\\\\\\\\"),
                    '"' | '`' | '$' => {
                        escaped.push_str("\\\\");
                        escaped.push(character);
                    }
                    '%' => escaped.push_str("%%"),
                    '\n' => escaped.push_str("\\n"),
                    '\r' => escaped.push_str("\\r"),
                    _ => escaped.push(character),
                }
            }
            format!("\"{escaped}\"")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn desktop_entry(executable: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Cute Screen\nExec={}\nTryExec={}\nTerminal=false\nStartupNotify=false\n",
        desktop_exec(executable, &["--background"]),
        executable.replace('\\', "\\\\").replace('\n', "\\n")
    )
}

pub fn desktop_entry_enabled(content: &str, executable: &str) -> bool {
    let value = |key: &str| {
        content
            .lines()
            .filter_map(|line| line.split_once('='))
            .filter(|(name, _)| *name == key)
            .map(|(_, value)| value)
            .next_back()
    };
    value("Hidden") != Some("true")
        && value("X-GNOME-Autostart-enabled") != Some("false")
        && value("Exec") == Some(desktop_exec(executable, &["--background"]).as_str())
}

pub fn windows_command(executable: &str) -> String {
    format!("\"{executable}\" --background")
}

#[cfg(test)]
mod tests;
