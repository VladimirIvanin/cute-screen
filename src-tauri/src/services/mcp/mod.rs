//! Opt-in local agent boundary. No command can evaluate JS or invoke arbitrary IPC.
mod dispatch;
pub mod settings;
#[cfg(test)]
mod tests;
mod transport;

use cute_screen_mcp::Packet;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize},
    },
    time::Instant,
};
use tauri::{Manager, State};

const SETTING_KEY: &str = "agents.mcp.v1";

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedSettings {
    enabled: bool,
    connections: Vec<Connection>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    id: String,
    client: String,
    key_hash: String,
}
struct PendingReply {
    owner: String,
    sender: std::sync::mpsc::Sender<Packet>,
    metadata: Option<Value>,
}
struct Job {
    owner: String,
    value: Value,
    finished: bool,
    cancelled: Arc<AtomicBool>,
}
struct Activity {
    method: String,
    at: i64,
    seen: Instant,
}

pub struct McpService {
    settings: Mutex<SavedSettings>,
    activity: Mutex<HashMap<String, Activity>>,
    jobs: Mutex<HashMap<String, Job>>,
    pending: Mutex<HashMap<String, PendingReply>>,
    operation: tokio::sync::Mutex<()>,
    ready: AtomicBool,
    active: AtomicUsize,
    stopped: AtomicBool,
    endpoint: PathBuf,
    library: PathBuf,
}

impl McpService {
    pub fn start(app: &tauri::AppHandle, library: PathBuf) -> Result<Arc<Self>, String> {
        let saved = app
            .state::<crate::storage::LibraryRepository>()
            .get_setting(SETTING_KEY.into())
            .map_err(|e| e.to_string())?;
        let settings = match saved {
            Some(json) => serde_json::from_str(&json).map_err(|_| "Invalid MCP settings")?,
            None => SavedSettings::default(),
        };
        let service = Arc::new(Self {
            settings: Mutex::new(settings),
            activity: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            operation: tokio::sync::Mutex::new(()),
            ready: AtomicBool::new(false),
            active: AtomicUsize::new(0),
            stopped: AtomicBool::new(false),
            endpoint: library.join("mcp-endpoint.json"),
            library,
        });
        transport::start(app.clone(), service.clone())?;
        Ok(service)
    }

    fn authenticate(&self, token: &str) -> Result<String, String> {
        use sha2::{Digest, Sha256};
        if token.len() != 64 {
            return Err("unauthorized".into());
        }
        let hash = format!("{:x}", Sha256::digest(token.as_bytes()));
        let settings = self.settings.lock().map_err(|_| "settings lock")?;
        if !settings.enabled {
            return Err("disabled: enable MCP in Settings".into());
        }
        settings
            .connections
            .iter()
            .find(|c| constant_time_equal(c.key_hash.as_bytes(), hash.as_bytes()))
            .map(|c| c.id.clone())
            .ok_or_else(|| "unauthorized: connection revoked or key invalid".into())
    }
}

impl McpService {
    fn authorized(&self, owner: &str) -> Result<(), String> {
        let saved = self.settings.lock().map_err(|_| "settings lock")?;
        if saved.enabled && saved.connections.iter().any(|c| c.id == owner) {
            Ok(())
        } else {
            Err("unauthorized: connection revoked".into())
        }
    }
    pub fn stop(&self) {
        self.stopped
            .store(true, std::sync::atomic::Ordering::Release);
        self.ready
            .store(false, std::sync::atomic::Ordering::Release);
        if let Ok(mut pending) = self.pending.lock() {
            pending.clear();
        }
        // Wake a blocking accept without a permanent polling loop while idle.
        if let Ok(bytes) = std::fs::read(&self.endpoint)
            && let Ok(value) = serde_json::from_slice::<Value>(&bytes)
            && let Some(address) = value["address"]
                .as_str()
                .and_then(|s| s.parse::<std::net::SocketAddr>().ok())
            && address.ip().is_loopback()
        {
            let _ = std::net::TcpStream::connect_timeout(
                &address,
                std::time::Duration::from_millis(100),
            );
        }
        if let Err(error) = std::fs::remove_file(&self.endpoint) {
            eprintln!("MCP discovery cleanup: {error}");
        }
    }
    pub fn progress(&self, id: &str, state: crate::CaptureProgressState) {
        if let Ok(mut jobs) = self.jobs.lock()
            && let Some(job) = jobs.get_mut(id)
        {
            job.value["progress"] = serde_json::to_value(state).unwrap_or(Value::Null);
        }
    }
}

#[tauri::command]
pub fn mcp_claim(
    window: tauri::WebviewWindow,
    id: String,
    service: State<'_, Arc<McpService>>,
) -> Result<(), String> {
    window_is(&window, "main")?;
    let pending = service.pending.lock().map_err(|_| "reply lock")?;
    let entry = pending.get(&id).ok_or("request expired before execution")?;
    service.authorized(&entry.owner)
}

fn constant_time_equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0_u8, |acc, (a, b)| acc | (a ^ b)) == 0
}
fn fail(message: impl Into<String>) -> Packet {
    Packet {
        metadata: serde_json::json!({"error":message.into()}),
        bytes: vec![],
    }
}
fn packet(metadata: Value) -> Packet {
    Packet {
        metadata,
        bytes: vec![],
    }
}
fn window_is(window: &tauri::WebviewWindow, label: &str) -> Result<(), String> {
    if window.label() == label {
        Ok(())
    } else {
        Err("permissionDenied".into())
    }
}

#[tauri::command]
pub fn mcp_editor_ready(
    window: tauri::WebviewWindow,
    ready: bool,
    service: State<'_, Arc<McpService>>,
) -> Result<(), String> {
    window_is(&window, "main")?;
    service
        .ready
        .store(ready, std::sync::atomic::Ordering::Release);
    if !ready {
        service.pending.lock().map_err(|_| "reply lock")?.clear();
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_reply(
    window: tauri::WebviewWindow,
    id: String,
    metadata: Value,
    binary: bool,
    service: State<'_, Arc<McpService>>,
) -> Result<(), String> {
    window_is(&window, "main")?;
    let mut pending = service.pending.lock().map_err(|_| "reply lock")?;
    if binary {
        let entry = pending.get_mut(&id).ok_or("reply expired")?;
        entry.metadata = Some(metadata);
    } else if let Some(entry) = pending.remove(&id) {
        let _ = entry.sender.send(packet(metadata));
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_reply_bytes(
    window: tauri::WebviewWindow,
    request: tauri::ipc::Request<'_>,
    service: State<'_, Arc<McpService>>,
) -> Result<(), String> {
    window_is(&window, "main")?;
    let id = request
        .headers()
        .get("x-mcp-reply")
        .and_then(|v| v.to_str().ok())
        .ok_or("missing reply ID")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("binary body required".into());
    };
    if bytes.len() > cute_screen_mcp::MAX_BINARY as usize {
        return Err("binary limit exceeded".into());
    }
    if let Some(entry) = service.pending.lock().map_err(|_| "reply lock")?.remove(id) {
        let metadata = entry.metadata.ok_or("missing metadata")?;
        let _ = entry.sender.send(Packet {
            metadata,
            bytes: bytes.clone(),
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn settings_open_agents(app: tauri::AppHandle) -> Result<(), String> {
    crate::settings_window::open_agents(&app)
}
