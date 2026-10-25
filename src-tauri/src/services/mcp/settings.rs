use super::*;
use serde_json::json;
use sha2::{Digest, Sha256};

pub(super) const CLIENTS: &[&str] = &[
    "codex",
    "claude",
    "claude-desktop",
    "cursor",
    "vscode",
    "gemini",
    "windsurf",
    "cline",
    "roo",
    "zed",
    "continue",
    "zcode",
    "gigacode",
    "opencode",
    "generic",
];

fn snapshot(service: &McpService) -> Result<Value, String> {
    let saved = service.settings.lock().map_err(|_| "settings lock")?;
    let activity = service.activity.lock().map_err(|_| "activity lock")?;
    Ok(
        json!({"enabled":saved.enabled,"connections":saved.connections.iter().map(|c| {
        let active = activity.get(&c.id);
        json!({"id":c.id,"client":c.client,"connected":active.is_some_and(|a| a.seen.elapsed().as_secs() < 60),
            "lastAction":active.map(|a| &a.method),"lastSeen":active.map(|a| a.at)})
    }).collect::<Vec<_>>() }),
    )
}

fn persist(
    app: &tauri::AppHandle,
    service: &McpService,
    update: impl FnOnce(&mut SavedSettings) -> Result<(), String>,
) -> Result<(), String> {
    let mut current = service.settings.lock().map_err(|_| "settings lock")?;
    let mut next = current.clone();
    update(&mut next)?;
    app.state::<crate::storage::LibraryRepository>()
        .put_setting(
            SETTING_KEY.into(),
            1,
            serde_json::to_string(&next).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    *current = next;
    Ok(())
}

#[tauri::command]
pub fn mcp_settings(
    window: tauri::WebviewWindow,
    service: State<'_, Arc<McpService>>,
) -> Result<Value, String> {
    window_is(&window, "settings")?;
    snapshot(&service)
}
#[tauri::command]
pub fn mcp_configure(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
    service: State<'_, Arc<McpService>>,
) -> Result<Value, String> {
    window_is(&window, "settings")?;
    persist(&app, &service, |saved| {
        saved.enabled = enabled;
        Ok(())
    })?;
    snapshot(&service)
}
#[tauri::command]
pub fn mcp_revoke(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    id: String,
    service: State<'_, Arc<McpService>>,
) -> Result<Value, String> {
    window_is(&window, "settings")?;
    persist(&app, &service, |saved| {
        saved.connections.retain(|c| c.id != id);
        Ok(())
    })?;
    service
        .activity
        .lock()
        .map_err(|_| "activity lock")?
        .remove(&id);
    credentials::remove(&service.library, &id)?;
    snapshot(&service)
}

#[tauri::command]
pub fn mcp_create_connection(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    client: String,
    service: State<'_, Arc<McpService>>,
) -> Result<Value, String> {
    window_is(&window, "settings")?;
    if !CLIENTS.contains(&client.as_str()) {
        return Err("unknown client".into());
    }
    let token = new_token();
    let connection = new_connection(&client, &token);
    let config = configuration_for(&service, &connection, &token)?;
    credentials::write(&service.library, &connection.id, &token)?;
    if let Err(error) = persist(&app, &service, |saved| {
        saved.connections.push(connection.clone());
        Ok(())
    }) {
        credentials::remove(&service.library, &connection.id)?;
        return Err(error);
    }
    Ok(json!({"id":connection.id,"config":config,"snapshot":snapshot(&service)?}))
}

fn new_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

pub(super) fn new_connection(client: &str, token: &str) -> Connection {
    Connection {
        id: uuid::Uuid::new_v4().to_string(),
        client: client.to_owned(),
        key_hash: format!("{:x}", Sha256::digest(token.as_bytes())),
        configuration_key_hash: None,
    }
}

pub(super) fn configuration_credential(
    root: &std::path::Path,
    connection: &Connection,
) -> Result<(String, bool), String> {
    if let Some(token) = credentials::read(root, &connection.id)? {
        let hash = format!("{:x}", Sha256::digest(token.as_bytes()));
        if !connection.matches_key_hash(&hash) {
            return Err("Saved MCP credential does not match this connection".into());
        }
        return Ok((token, false));
    }
    Ok((new_token(), true))
}

#[tauri::command]
pub fn mcp_connection_configuration(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    id: String,
    service: State<'_, Arc<McpService>>,
) -> Result<String, String> {
    window_is(&window, "settings")?;
    let connection = service
        .settings
        .lock()
        .map_err(|_| "settings lock")?
        .connections
        .iter()
        .find(|c| c.id == id)
        .cloned()
        .ok_or("Connection was revoked")?;
    let (token, created) = configuration_credential(&service.library, &connection)?;
    let config = configuration_for(&service, &connection, &token)?;
    if !created {
        return Ok(config);
    }
    // Legacy versions retained only a one-way hash. Add a recoverable key for
    // this same grant, preserving the key already installed in the agent.
    credentials::write(&service.library, &id, &token)?;
    if let Err(error) = persist(&app, &service, |saved| {
        let current = saved
            .connections
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or("Connection was revoked")?;
        current.configuration_key_hash = Some(format!("{:x}", Sha256::digest(token.as_bytes())));
        Ok(())
    }) {
        credentials::remove(&service.library, &id)?;
        return Err(error);
    }
    Ok(config)
}

fn configuration_for(
    service: &McpService,
    connection: &Connection,
    token: &str,
) -> Result<String, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let companion = executable.with_file_name(if cfg!(windows) {
        "cute-screen-mcp.exe"
    } else {
        "cute-screen-mcp"
    });
    let appimage = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute());
    let application = appimage.as_ref().unwrap_or(&executable);
    let command = appimage.as_ref().unwrap_or(&companion);
    let mut args: Vec<String> = if appimage.is_some() {
        vec!["--mcp-stdio".into()]
    } else {
        vec![]
    };
    args.extend([
        "--endpoint".into(),
        service.endpoint.to_string_lossy().into_owned(),
        "--application".into(),
        application.to_string_lossy().into_owned(),
    ]);
    connection_configuration(&connection.client, command, &args, token)
}

pub(super) fn connection_configuration(
    client: &str,
    command: &std::path::Path,
    args: &[String],
    token: &str,
) -> Result<String, String> {
    if !CLIENTS.contains(&client) {
        return Err("unknown client".into());
    }
    let entry = json!({"command":command,"args":args,"env":{"CUTE_SCREEN_MCP_TOKEN":token}});
    if client == "continue" {
        // JSON quoted scalars/flow collections are valid YAML 1.2. This keeps
        // escaping identical to the other profiles without shell interpolation.
        return Ok(format!(
            "name: Cute Screen MCP\nversion: 1.0.0\nschema: v1\nmcpServers:\n  - name: cute-screen\n    type: stdio\n    command: {}\n    args: {}\n    env: {}\n",
            serde_json::to_string(&command).map_err(|e| e.to_string())?,
            serde_json::to_string(&args).map_err(|e| e.to_string())?,
            serde_json::to_string(&entry["env"]).map_err(|e| e.to_string())?,
        ));
    }
    let json_config = if client == "opencode" {
        let mut invocation = vec![command.to_string_lossy().into_owned()];
        invocation.extend_from_slice(args);
        json!({"mcp":{"cute-screen":{"type":"local","command":invocation,
            "environment":{"CUTE_SCREEN_MCP_TOKEN":token},"enabled":true}}})
    } else if client == "zcode" {
        json!({"mcp":{"servers":{"cute-screen":entry}}})
    } else if client == "vscode" {
        let mut entry = entry;
        entry["type"] = json!("stdio");
        json!({"servers":{"cute-screen":entry}})
    } else if client == "zed" {
        json!({"context_servers":{"cute-screen":entry}})
    } else if client == "generic" {
        entry
    } else {
        json!({"mcpServers":{"cute-screen":entry}})
    };
    let config = if client == "codex" {
        format!(
            "[mcp_servers.cute-screen]\ncommand = {}\nargs = {}\n\n[mcp_servers.cute-screen.env]\nCUTE_SCREEN_MCP_TOKEN = {}\n",
            serde_json::to_string(&command).map_err(|e| e.to_string())?,
            serde_json::to_string(&args).map_err(|e| e.to_string())?,
            serde_json::to_string(&token).map_err(|e| e.to_string())?
        )
    } else {
        serde_json::to_string_pretty(&json_config).map_err(|e| e.to_string())?
    };
    Ok(config)
}

#[tauri::command]
pub async fn mcp_check(
    window: tauri::WebviewWindow,
    service: State<'_, Arc<McpService>>,
) -> Result<Value, String> {
    window_is(&window, "settings")?;
    let executable = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name(if cfg!(windows) {
            "cute-screen-mcp.exe"
        } else {
            "cute-screen-mcp"
        });
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut command = std::process::Command::new(executable);
        command.arg("--self-check");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|_| "Companion executable is missing; install/build cute-screen-mcp".to_owned())?;
    if !output.status.success() {
        return Err("Companion check failed".into());
    }
    Ok(
        json!({"companion":true,"editorReady":service.ready.load(std::sync::atomic::Ordering::Acquire),"bridge":service.endpoint.exists()}),
    )
}
