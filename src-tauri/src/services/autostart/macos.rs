use super::{APP_ID, AutostartStateV1, executable_text};
use std::{fs, path::PathBuf};

unsafe extern "C" {
    fn cs_autostart_state() -> i32;
    fn cs_autostart_set(enabled: bool) -> i32;
    fn cs_autostart_open_settings();
    fn cs_autostart_login_launch() -> bool;
}

fn legacy_path() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(|home| {
            PathBuf::from(home)
                .join("Library/LaunchAgents")
                .join(format!("{APP_ID}.plist"))
        })
        .ok_or_else(|| "Cannot locate home directory".to_owned())
}

pub fn state() -> Result<AutostartStateV1, String> {
    // SAFETY: bridge owns all Cocoa objects and returns a scalar status.
    let status = unsafe { cs_autostart_state() };
    if status != -2 {
        return Ok(match status {
            1 => AutostartStateV1::Enabled,
            0 => AutostartStateV1::Disabled,
            2 => AutostartStateV1::RequiresApproval,
            3 => AutostartStateV1::Unavailable,
            _ => AutostartStateV1::Unknown,
        });
    }
    if !legacy_path()?.exists() {
        return Ok(AutostartStateV1::Disabled);
    }
    let value = plist::Value::from_file(legacy_path()?).map_err(|error| error.to_string())?;
    let expected = plist::Value::Array(vec![
        plist::Value::String(executable_text()?),
        plist::Value::String("--background".to_owned()),
    ]);
    Ok(
        if value
            .as_dictionary()
            .and_then(|dict| dict.get("ProgramArguments"))
            == Some(&expected)
        {
            AutostartStateV1::Enabled
        } else {
            AutostartStateV1::NeedsRepair
        },
    )
}

pub fn set_enabled(enabled: bool) -> Result<(), String> {
    let executable = executable_text()?;
    if enabled
        && (executable.starts_with("/Volumes/") || !executable.contains(".app/Contents/MacOS/"))
    {
        return Err(
            "Move Cute Screen.app to Applications before enabling launch at login".to_owned(),
        );
    }
    // SAFETY: bridge catches Objective-C errors and availability-checks SMAppService.
    let result = unsafe { cs_autostart_set(enabled) };
    if result != -2 {
        if result < 0 {
            return Err(
                "Could not change the login item; review Login Items in System Settings".to_owned(),
            );
        }
        let legacy = legacy_path()?;
        if legacy.exists() {
            fs::remove_file(legacy).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let path = legacy_path()?;
    if !enabled {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    let parent = path.parent().ok_or("Invalid LaunchAgent path")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut values = plist::Dictionary::new();
    values.insert("Label".to_owned(), APP_ID.into());
    values.insert(
        "ProgramArguments".to_owned(),
        plist::Value::Array(vec![executable.into(), "--background".into()]),
    );
    values.insert("RunAtLoad".to_owned(), true.into());
    let file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    plist::Value::Dictionary(values)
        .to_file_xml(file.path())
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn login_launch() -> bool {
    unsafe { cs_autostart_login_launch() }
}
pub fn open_settings() -> Result<(), String> {
    unsafe { cs_autostart_open_settings() };
    Ok(())
}
