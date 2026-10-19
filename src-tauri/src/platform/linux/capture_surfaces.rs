use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use gtk::prelude::*;
use tauri::Manager;

use crate::platform::{PlatformError, PlatformErrorCode};

const FADE_SETTLE: Duration = Duration::from_millis(200);
static LAST_HIDDEN: Mutex<Option<Instant>> = Mutex::new(None);

pub fn note_hidden() {
    *LAST_HIDDEN
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(Instant::now());
}

fn remaining(age: Option<Duration>) -> Duration {
    age.and_then(|age| FADE_SETTLE.checked_sub(age))
        .unwrap_or_default()
}

/// Order GTK unmap and the compositor roundtrip on the same UI thread.
pub async fn hide<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    correlation_id: &str,
) -> Result<bool, PlatformError> {
    let windows: Vec<_> = ["settings", "main", "quick-capture"]
        .into_iter()
        .filter_map(|label| app.get_webview_window(label))
        .collect();
    let has_editor = windows.iter().any(|window| window.label() == "main");
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let dispatched = app.run_on_main_thread(move || {
        let result = (|| {
            for window in windows {
                let native = window.gtk_window().map_err(|error| error.to_string())?;
                let mapped = native.is_mapped();
                native.hide();
                if mapped {
                    note_hidden();
                }
            }
            let display = gtk::gdk::Display::default()
                .ok_or_else(|| "Wayland GDK display is unavailable".to_owned())?;
            display.sync();
            Ok::<_, String>(has_editor)
        })();
        let _ = sender.send(result);
    });
    if let Err(error) = dispatched {
        eprintln!("cute-screen Wayland hide dispatch: {error}");
        return Err(PlatformError::new(
            PlatformErrorCode::CaptureFailed,
            correlation_id,
        ));
    }
    match tokio::time::timeout(Duration::from_secs(2), receiver).await {
        Ok(Ok(Ok(hidden))) => {
            // Mutter keeps the withdrawn actor for its 150ms fade. A Wayland
            // roundtrip confirms unmap delivery, not completion of that effect.
            // Repeated background captures must not pay an unconditional delay.
            let age = LAST_HIDDEN
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .map(|at| at.elapsed());
            let delay = remaining(age);
            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }
            Ok(hidden)
        }
        result => {
            eprintln!("cute-screen Wayland hide/roundtrip: {result:?}");
            Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_background_is_immediate_and_recent_unmap_waits_only_the_remainder() {
        assert_eq!(remaining(None), Duration::ZERO);
        assert_eq!(
            remaining(Some(Duration::from_millis(50))),
            Duration::from_millis(150)
        );
        assert_eq!(remaining(Some(Duration::from_millis(200))), Duration::ZERO);
        assert_eq!(remaining(Some(Duration::from_secs(1))), Duration::ZERO);
    }
}
