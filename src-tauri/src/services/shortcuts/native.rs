use crate::platform::ShortcutSpec;
use std::{collections::BTreeMap, str::FromStr, sync::Mutex};
use tauri::{Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Default)]
pub struct NativeRegistry {
    active: Mutex<BTreeMap<String, String>>,
    operation: Mutex<()>,
}

fn shortcut(trigger: &str) -> Result<Shortcut, String> {
    let parts: Vec<_> = trigger
        .split('+')
        .map(|part| match part {
            "CTRL" => "Control",
            "ALT" => "Alt",
            "SHIFT" => "Shift",
            "SUPER" => "Super",
            "PRINT" => "PrintScreen",
            "SPACE" => "Space",
            value => value,
        })
        .collect();
    Shortcut::from_str(&parts.join("+")).map_err(|error| error.to_string())
}

impl NativeRegistry {
    pub fn apply<R: Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        specs: &[ShortcutSpec],
    ) -> Result<(), String> {
        let _operation = self.operation.lock().map_err(|error| error.to_string())?;
        let active = self
            .active
            .lock()
            .map_err(|error| error.to_string())?
            .clone();
        let candidate: BTreeMap<_, _> = specs
            .iter()
            .filter_map(|spec| {
                spec.preferred_trigger
                    .as_ref()
                    .map(|trigger| (trigger.clone(), spec.id.clone()))
            })
            .collect();
        let mut added = Vec::new();
        for trigger in candidate
            .keys()
            .filter(|trigger| !active.contains_key(*trigger))
        {
            let key = shortcut(trigger)?;
            if let Err(error) = app.global_shortcut().register(key) {
                for registered in added {
                    if let Err(rollback) = app.global_shortcut().unregister(registered) {
                        eprintln!("cute-screen hotkey rollback: {rollback}");
                    }
                }
                return Err(error.to_string());
            }
            added.push(key);
        }
        for trigger in active
            .keys()
            .filter(|trigger| !candidate.contains_key(*trigger))
        {
            app.global_shortcut()
                .unregister(shortcut(trigger)?)
                .map_err(|error| error.to_string())?;
        }
        *self.active.lock().map_err(|error| error.to_string())? = candidate;
        Ok(())
    }

    fn action(&self, key: &Shortcut) -> Option<String> {
        self.active
            .lock()
            .ok()?
            .iter()
            .find(|(trigger, _)| shortcut(trigger).ok().as_ref() == Some(key))
            .map(|(_, action)| action.clone())
    }
}

pub fn install<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, key, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if let Some(registry) = app.try_state::<NativeRegistry>()
                    && let Some(action) = registry.action(key)
                {
                    super::host::dispatch(app, &action);
                }
            })
            .build(),
    )
}
