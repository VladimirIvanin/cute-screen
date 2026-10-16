use super::{APP_ID, AutostartStateV1, executable_text, windows_command};
use winreg::{
    RegKey,
    enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE},
};

const RUN: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const APPROVED: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
pub const CHOICE: &str = "Software\\io.github.vladimirivanin.cute-screen";

pub fn installer_choice() -> Option<bool> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(CHOICE)
        .ok()?
        .get_value::<u32, _>("AutostartChoice")
        .ok()
        .map(|choice| choice != 0)
}

pub fn state() -> Result<AutostartStateV1, String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let value = match user
        .open_subkey(RUN)
        .and_then(|key| key.get_value::<String, _>(APP_ID))
    {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(AutostartStateV1::Disabled);
        }
        Err(error) => return Err(error.to_string()),
    };
    if value != windows_command(&executable_text()?) {
        return Ok(AutostartStateV1::NeedsRepair);
    }
    // StartupApproved is an OS-owned implementation detail: read known forms,
    // never write it or claim enabled when Windows returns an unknown format.
    let approval = user
        .open_subkey_with_flags(APPROVED, KEY_READ)
        .and_then(|key| key.get_raw_value(APP_ID));
    Ok(match approval {
        Ok(value) if value.bytes.len() == 12 && value.bytes[0] == 3 => {
            AutostartStateV1::RequiresApproval
        }
        Ok(value) if value.bytes.len() == 12 && value.bytes[0] == 2 => AutostartStateV1::Enabled,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => AutostartStateV1::Enabled,
        _ => AutostartStateV1::Unknown,
    })
}

pub fn set_enabled(enabled: bool) -> Result<(), String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = user.create_subkey(RUN).map_err(|error| error.to_string())?;
    if enabled {
        key.set_value(APP_ID, &windows_command(&executable_text()?))
            .map_err(|error| error.to_string())?;
    } else {
        match key.delete_value(APP_ID) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.to_string()),
        }
    }
    user.create_subkey_with_flags(CHOICE, KEY_SET_VALUE)
        .and_then(|(key, _)| key.set_value("AutostartChoice", &u32::from(enabled)))
        .map_err(|error| error.to_string())
}
