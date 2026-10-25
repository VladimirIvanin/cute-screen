use super::*;
use cute_screen_mcp::{read_packet_limited, write_packet};
use std::{
    io,
    net::{TcpListener, TcpStream},
    sync::atomic::Ordering,
    time::Duration,
};

pub(super) fn start(app: tauri::AppHandle, service: Arc<McpService>) -> Result<(), String> {
    let listener =
        TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    // Discovery has no key. The key is granted only through the Settings window.
    let json = serde_json::to_vec(&serde_json::json!({"version":1,"address":address.to_string()}))
        .map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(&service.library).map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(&json).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(&service.endpoint).map_err(|e| e.to_string())?;
    std::thread::Builder::new()
        .name("cute-screen-mcp".into())
        .spawn(move || {
            while !service.stopped.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if service.stopped.load(Ordering::Acquire) {
                            break;
                        }
                        if service.active.fetch_add(1, Ordering::AcqRel) >= 8 {
                            service.active.fetch_sub(1, Ordering::AcqRel);
                            continue;
                        }
                        let service = service.clone();
                        let app = app.clone();
                        std::thread::spawn(move || {
                            handle(stream, &app, &service);
                            service.active.fetch_sub(1, Ordering::AcqRel);
                        });
                    }
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                    Err(_) => break,
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn handle(mut stream: TcpStream, app: &tauri::AppHandle, service: &Arc<McpService>) {
    if stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .is_err()
        || stream
            .set_write_timeout(Some(Duration::from_secs(10)))
            .is_err()
    {
        return;
    }
    // Requests never carry pixels. Reject a claimed binary body before allocation.
    let request = match read_packet_limited(&mut stream, 0) {
        Ok(p) => p.metadata,
        Err(_) => return,
    };
    let response = match service.authenticate(request["token"].as_str().unwrap_or_default()) {
        Ok(owner) if request["version"] == 1 => {
            let method = request["method"].as_str().unwrap_or_default().to_owned();
            let arguments = request
                .get("arguments")
                .cloned()
                .unwrap_or(serde_json::json!({}));
            if let Ok(mut activity) = service.activity.lock() {
                activity.insert(
                    owner.clone(),
                    Activity {
                        method: method.clone(),
                        at: chrono::Utc::now().timestamp_millis(),
                        seen: Instant::now(),
                    },
                );
            }
            tauri::async_runtime::block_on(dispatch::run(app, service, &owner, &method, arguments))
                .unwrap_or_else(fail)
        }
        Ok(_) => fail("unsupported bridge version"),
        Err(error) => fail(error),
    };
    if write_packet(&mut stream, &response).is_err() {
        eprintln!("cute-screen MCP response disconnected; mutation will not be replayed");
    }
}
