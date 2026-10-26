use super::{Bindings, ShortcutAction};
pub use cute_screen_portal::shortcuts::PortalSession;
use cute_screen_portal::shortcuts::Shortcut;
use std::sync::Arc;

pub async fn create(bindings: &Bindings, interactive: bool) -> Result<Arc<PortalSession>, String> {
    let proxy = ashpd::desktop::global_shortcuts::GlobalShortcuts::new()
        .await
        .map_err(|error| error.to_string())?;
    let connection = proxy.connection().clone();
    let app_id = crate::autostart::APP_ID
        .parse()
        .map_err(|error| format!("Invalid portal app ID: {error}"))?;
    if let Err(error) = ashpd::register_host_app_with_connection(connection.clone(), app_id).await {
        eprintln!("cute-screen portal identity: {error}");
    }
    let shortcuts: Vec<_> = ShortcutAction::ALL
        .iter()
        .map(|action| Shortcut {
            id: action.id().into(),
            description: action.label().into(),
            preferred_trigger: bindings.get(action).cloned(),
        })
        .collect();
    PortalSession::create(connection, &shortcuts, interactive).await
}
