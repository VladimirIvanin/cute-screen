use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub type Bindings = BTreeMap<ShortcutAction, String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum ShortcutAction {
    CaptureArea,
    CaptureScreen,
    CaptureWindow,
    CaptureActiveWindow,
    CaptureRepeat,
    ShowEditor,
}

impl ShortcutAction {
    pub const ALL: [Self; 6] = [
        Self::CaptureArea,
        Self::CaptureScreen,
        Self::CaptureWindow,
        Self::CaptureActiveWindow,
        Self::CaptureRepeat,
        Self::ShowEditor,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::CaptureArea => "capture-area",
            Self::CaptureScreen => "capture-screen",
            Self::CaptureWindow => "capture-window",
            Self::CaptureActiveWindow => "capture-active-window",
            Self::CaptureRepeat => "capture-repeat",
            Self::ShowEditor => "show-editor",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::CaptureArea => "Capture Area",
            Self::CaptureScreen => "Capture Screen",
            Self::CaptureWindow => "Capture Window",
            Self::CaptureActiveWindow => "Capture Active Window",
            Self::CaptureRepeat => "Repeat Area",
            Self::ShowEditor => "Open Editor",
        }
    }

    pub fn command(self) -> &'static [&'static str] {
        match self {
            Self::CaptureArea => &["capture", "--mode", "area"],
            Self::CaptureScreen => &["capture", "--mode", "screen"],
            Self::CaptureWindow => &["capture", "--mode", "window"],
            Self::CaptureActiveWindow => &["capture", "--mode", "active-window"],
            Self::CaptureRepeat => &["capture", "--mode", "repeat"],
            Self::ShowEditor => &["show"],
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShortcutPreferences {
    #[serde(default)]
    pub bindings: Bindings,
    pub autostart_choice: Option<bool>,
    #[serde(default)]
    pub setup_completed: bool,
    #[serde(default)]
    pub portal_enabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ShortcutBackendV1 {
    Native,
    Portal,
    Gnome,
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ShortcutStatusV1 {
    Unassigned,
    Active,
    Conflict,
    AwaitingVerification,
    RequiresApproval,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ShortcutEntryV1 {
    pub action: ShortcutAction,
    pub trigger: Option<String>,
    pub display: Option<String>,
    pub status: ShortcutStatusV1,
    pub supported: bool,
    pub message: Option<String>,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ShortcutSnapshotV1 {
    pub backend: ShortcutBackendV1,
    pub platform: String,
    pub can_preflight: bool,
    pub can_configure: bool,
    pub entries: Vec<ShortcutEntryV1>,
    pub setup_completed: bool,
    pub autostart_choice: Option<bool>,
    pub suggested: Vec<String>,
    pub pending_action: Option<ShortcutAction>,
    pub error: Option<String>,
}

pub fn normalize_trigger(value: &str, macos: bool) -> Result<String, String> {
    let mut modifiers = [false; 4];
    let mut key = None;
    for part in value.split('+') {
        let part = part.trim().to_ascii_uppercase();
        let modifier = match part.as_str() {
            "CTRL" | "CONTROL" => Some(0),
            "ALT" | "OPTION" => Some(1),
            "SHIFT" => Some(2),
            "SUPER" | "META" | "CMD" | "COMMAND" => Some(3),
            _ => None,
        };
        if let Some(index) = modifier {
            modifiers[index] = true;
        } else if key.replace(part).is_some() {
            return Err("Use one key with modifiers".to_owned());
        }
    }
    let key = key.ok_or("Press a key with modifiers")?;
    let key = key
        .strip_prefix("DIGIT")
        .or_else(|| key.strip_prefix("KEY"))
        .unwrap_or(&key);
    let function = key
        .strip_prefix('F')
        .and_then(|n| n.parse::<u8>().ok())
        .is_some_and(|n| (1..=11).contains(&n));
    let print = matches!(key, "PRINT" | "PRINTSCREEN");
    if !(key.len() == 1 && key.bytes().all(|b| b.is_ascii_alphanumeric())
        || function
        || print
        || key == "SPACE")
    {
        return Err(
            "Unsupported or reserved key (F12, Fn and media keys cannot be assigned)".to_owned(),
        );
    }
    if !modifiers[0] && !modifiers[1] && !modifiers[3] && !print {
        return Err("Include Ctrl, Alt or Command".to_owned());
    }
    if !macos && modifiers[3] {
        return Err("Windows/Super combinations are reserved for the system".to_owned());
    }
    let mut parts: Vec<&str> = ["CTRL", "ALT", "SHIFT", "SUPER"]
        .into_iter()
        .enumerate()
        .filter_map(|(i, name)| modifiers[i].then_some(name))
        .collect();
    parts.push(if print { "PRINT" } else { key });
    Ok(parts.join("+"))
}
