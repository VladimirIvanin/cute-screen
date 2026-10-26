use gtk::prelude::*;

pub(crate) fn activate(native: &impl IsA<gtk::Window>, token: &str) {
    let native = native.as_ref();
    if let Some(display) = native
        .display()
        .downcast_ref::<gdkwayland::WaylandDisplay>()
    {
        display.set_startup_notification_id(token);
    } else {
        native.set_startup_id(token);
    }
}

/// Reveal on the GTK thread with a current X11 activation timestamp. Tao's
/// asynchronous `set_focus` uses CURRENT_TIME, which can resolve to an old
/// user time in a prewarmed tray window and be refused by Mutter.
pub(crate) fn reveal<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    token: Option<&str>,
) -> Result<(), String> {
    let native = window.gtk_window().map_err(|error| error.to_string())?;
    native.set_accept_focus(true);
    native.set_opacity(1.0);
    let surface = native
        .window()
        .ok_or_else(|| "quick capture GTK window is not mapped".to_owned())?;
    if let Some(x11) = surface.downcast_ref::<gdkx11::X11Window>() {
        let timestamp = gdkx11::functions::x11_get_server_time(x11);
        x11.set_user_time(timestamp);
        native.present_with_time(timestamp);
    } else {
        // GDK keeps this token on the display. Set it only after all fallible
        // preparation, immediately before presenting the intended surface.
        if let Some(token) = token {
            activate(&native, token);
        }
        native.present();
    }
    Ok(())
}
