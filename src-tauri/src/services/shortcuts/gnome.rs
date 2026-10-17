use super::{ShortcutAction, normalize_trigger};
use gtk::gio::{self, prelude::*};

const MAIN: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CUSTOM: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
const BASE: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/";

#[cfg(test)]
#[path = "gnome_tests.rs"]
mod integration_tests;

pub struct GnomeSettings {
    main: gio::Settings,
    custom: gio::SettingsSchema,
    backend: Option<gio::SettingsBackend>,
}

pub fn merge_paths(current: &[String], remove: Option<&str>, add: Option<&str>) -> Vec<String> {
    let mut paths: Vec<_> = current
        .iter()
        .filter(|path| Some(path.as_str()) != remove)
        .cloned()
        .collect();
    if let Some(add) = add
        && !paths.iter().any(|path| path == add)
    {
        paths.push(add.to_owned());
    }
    paths
}

fn schema(name: &str) -> Result<gio::SettingsSchema, String> {
    gio::SettingsSchemaSource::default()
        .and_then(|source| source.lookup(name, true))
        .ok_or_else(|| format!("GSettings schema {name} is unavailable"))
}

pub fn accelerator(trigger: &str) -> String {
    trigger
        .split('+')
        .map(|part| match part {
            "CTRL" => "<Control>".to_owned(),
            "ALT" => "<Alt>".to_owned(),
            "SHIFT" => "<Shift>".to_owned(),
            "SUPER" => "<Super>".to_owned(),
            "PRINT" => "Print".to_owned(),
            "SPACE" => "space".to_owned(),
            value if value.starts_with('F') && value.len() > 1 => value.to_owned(),
            value => value.to_ascii_lowercase(),
        })
        .collect()
}

fn normalized_accelerator(value: &str) -> Option<String> {
    let text = value
        .replace("<Primary>", "CTRL+")
        .replace("<Control>", "CTRL+")
        .replace("<Ctrl>", "CTRL+")
        .replace("<Shift>", "SHIFT+")
        .replace("<Alt>", "ALT+")
        .replace("<Super>", "SUPER+");
    normalize_trigger(&text, true).ok()
}

impl GnomeSettings {
    pub fn open() -> Result<Self, String> {
        let main = gio::Settings::new_full(&schema(MAIN)?, None::<&gio::SettingsBackend>, None);
        if !main.is_writable("custom-keybindings") {
            return Err("Custom shortcuts are locked by system policy".to_owned());
        }
        let settings = Self {
            main,
            custom: schema(CUSTOM)?,
            backend: None,
        };
        for action in ShortcutAction::ALL {
            let entry = settings.entry(&Self::owned_path(action));
            for key in ["name", "binding", "command"] {
                if !entry.is_writable(key) {
                    return Err(format!("GSettings key {key} is locked by system policy"));
                }
            }
        }
        Ok(settings)
    }

    pub fn available() -> bool {
        std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .to_ascii_lowercase()
            .contains("gnome")
            && Self::open().is_ok()
    }

    fn entry(&self, path: &str) -> gio::Settings {
        gio::Settings::new_full(&self.custom, self.backend.as_ref(), Some(path))
    }

    fn paths(&self) -> Vec<String> {
        self.main
            .strv("custom-keybindings")
            .iter()
            .map(ToString::to_string)
            .collect()
    }

    pub fn owned_path(action: ShortcutAction) -> String {
        format!("{BASE}cute-screen-{}/", action.id())
    }

    pub fn read(&self, action: ShortcutAction) -> Option<(String, String)> {
        let path = Self::owned_path(action);
        self.paths().iter().any(|value| value == &path).then(|| {
            let entry = self.entry(&path);
            (
                normalized_accelerator(&entry.string("binding"))
                    .unwrap_or_else(|| entry.string("binding").to_string()),
                entry.string("command").to_string(),
            )
        })
    }

    pub fn conflict(&self, trigger: &str, action: ShortcutAction) -> Option<String> {
        for path in self.paths() {
            if path == Self::owned_path(action) {
                continue;
            }
            let entry = self.entry(&path);
            if normalized_accelerator(&entry.string("binding")).as_deref() == Some(trigger) {
                return Some(entry.string("name").to_string());
            }
        }
        for name in [
            MAIN,
            "org.gnome.desktop.wm.keybindings",
            "org.gnome.shell.keybindings",
            "org.gnome.mutter.keybindings",
            "org.gnome.mutter.wayland.keybindings",
        ] {
            let Ok(schema) = schema(name) else {
                continue;
            };
            let settings = gio::Settings::new_full(&schema, None::<&gio::SettingsBackend>, None);
            for key in schema.list_keys() {
                let value = settings.value(&key);
                let values = value
                    .get::<Vec<String>>()
                    .or_else(|| value.get::<String>().map(|value| vec![value]))
                    .unwrap_or_default();
                if values
                    .iter()
                    .any(|value| normalized_accelerator(value).as_deref() == Some(trigger))
                {
                    return Some(format!("{name}: {key}"));
                }
            }
        }
        None
    }

    pub fn write(&self, path: &str, trigger: &str, command: &str) -> Result<(), String> {
        if !path.starts_with(&format!("{BASE}cute-screen-")) {
            return Err("Refusing to edit another application's shortcut".to_owned());
        }
        let entry = self.entry(path);
        for key in ["name", "binding", "command"] {
            if !entry.is_writable(key) {
                return Err(format!("GSettings key {key} is locked"));
            }
        }
        entry.delay();
        entry
            .set_string("name", "Cute Screen")
            .and_then(|()| entry.set_string("command", command))
            .and_then(|()| entry.set_string("binding", &accelerator(trigger)))
            .map_err(|error| error.to_string())?;
        entry.apply();
        self.main
            .set_strv(
                "custom-keybindings",
                merge_paths(&self.paths(), None, Some(path)),
            )
            .map_err(|error| error.to_string())?;
        gio::Settings::sync();
        Ok(())
    }

    pub fn remove(&self, path: &str) -> Result<(), String> {
        if !path.starts_with(&format!("{BASE}cute-screen-")) {
            return Err("Refusing to remove another application's shortcut".to_owned());
        }
        self.main
            .set_strv(
                "custom-keybindings",
                merge_paths(&self.paths(), Some(path), None),
            )
            .map_err(|error| error.to_string())?;
        let entry = self.entry(path);
        for key in ["name", "binding", "command"] {
            entry.reset(key);
        }
        gio::Settings::sync();
        Ok(())
    }

    pub fn stage(&self, token: &str, trigger: &str, command: &str) -> Result<String, String> {
        let path = format!("{BASE}cute-screen-pending-{token}/");
        self.write(&path, trigger, command)?;
        Ok(path)
    }

    pub fn cleanup_pending(&self) -> Result<(), String> {
        for path in self
            .paths()
            .into_iter()
            .filter(|path| path.starts_with(&format!("{BASE}cute-screen-pending-")))
        {
            self.remove(&path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacing_owned_path_keeps_foreign_paths_and_does_not_duplicate() {
        let paths = vec![
            "foreign/".to_owned(),
            "old/".to_owned(),
            "other/".to_owned(),
        ];
        assert_eq!(
            merge_paths(&paths, Some("old/"), Some("new/")),
            ["foreign/", "other/", "new/"]
        );
        assert_eq!(merge_paths(&paths, None, Some("foreign/")), paths);
    }
    #[test]
    fn accelerator_normalization_catches_reordered_aliases() {
        assert_eq!(
            normalized_accelerator("<Shift><Primary>2").as_deref(),
            Some("CTRL+SHIFT+2")
        );
        assert_eq!(accelerator("CTRL+SHIFT+F3"), "<Control><Shift>F3");
    }
}
