use super::{APP_ID, AutostartStateV1, desktop_entry, desktop_entry_enabled, executable_text};
use std::{fs, io::Write, path::PathBuf};

fn path() -> Result<PathBuf, String> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .ok_or("Cannot locate the user's configuration directory")?;
    Ok(config.join("autostart").join(format!("{APP_ID}.desktop")))
}

pub fn state() -> Result<AutostartStateV1, String> {
    let content = match fs::read_to_string(path()?) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(AutostartStateV1::Disabled);
        }
        Err(error) => return Err(error.to_string()),
    };
    if content
        .lines()
        .any(|line| matches!(line, "Hidden=true" | "X-GNOME-Autostart-enabled=false"))
    {
        return Ok(AutostartStateV1::Disabled);
    }
    Ok(if desktop_entry_enabled(&content, &executable_text()?) {
        AutostartStateV1::Enabled
    } else {
        AutostartStateV1::NeedsRepair
    })
}

pub fn set_enabled(enabled: bool) -> Result<(), String> {
    let path = path()?;
    if enabled {
        let parent = path.parent().ok_or("Invalid autostart path")?;
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        let mut file =
            tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
        file.write_all(desktop_entry(&executable_text()?).as_bytes())
            .map_err(|error| error.to_string())?;
        file.as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        file.persist(&path).map_err(|error| error.to_string())?;
    } else {
        match fs::remove_file(&path) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
