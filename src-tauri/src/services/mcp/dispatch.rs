use super::*;
use serde_json::json;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Emitter;

pub(super) async fn run(
    app: &tauri::AppHandle,
    service: &Arc<McpService>,
    owner: &str,
    method: &str,
    arguments: Value,
) -> Result<Packet, String> {
    if !cute_screen_mcp::catalog::TOOL_NAMES.contains(&method) {
        return Err("unknownTool".into());
    }
    let _operation = service.operation.lock().await;
    {
        let settings = service.settings.lock().map_err(|_| "settings lock")?;
        if !settings.enabled || !settings.connections.iter().any(|c| c.id == owner) {
            return Err("unauthorized".into());
        }
    }
    match method {
        "list_history" => {
            let cursor =
                serde_json::from_value(arguments.get("cursor").cloned().unwrap_or(Value::Null))
                    .map_err(|_| "invalid cursor")?;
            let response = app
                .state::<crate::storage::StorageHandle>()
                .history(
                    crate::storage::history::HistoryRequest::List { cursor },
                    Default::default(),
                )
                .await
                .map_err(|e| e.to_string())?;
            Ok(packet(
                serde_json::to_value(response).map_err(|e| e.to_string())?,
            ))
        }
        "import_image" => import_image(app, service, owner, arguments).await,
        "import_resource" => import_resource(app, service, arguments).await,
        "capture" => start_capture(app, service, owner, arguments).await,
        "get_job" | "cancel_job" => job(app, service, owner, method, &arguments),
        "get_status" => {
            let mut response = forward(app, service, method, arguments, owner).await?;
            response.metadata["version"] = json!(env!("CARGO_PKG_VERSION"));
            let capabilities = crate::compute_platform_capabilities(
                "mcp-status".into(),
                &app.state::<crate::capture::CaptureController>(),
            )
            .await;
            response.metadata["capabilities"] =
                serde_json::to_value(capabilities).map_err(|e| e.to_string())?;
            Ok(response)
        }
        "export_image" => {
            let destination = absolute_path(&arguments)?;
            let response = forward(app, service, method, arguments, owner).await?;
            if response.metadata.get("error").is_some() {
                return Ok(response);
            }
            export_new_png(&destination, &service.library, &response.bytes)?;
            let mut result = response.metadata;
            result["path"] = json!(destination);
            Ok(packet(result))
        }
        _ => {
            if method == "open_document" {
                crate::show_editor(app);
            }
            forward(app, service, method, arguments, owner).await
        }
    }
}

pub(super) async fn forward(
    app: &tauri::AppHandle,
    service: &Arc<McpService>,
    method: &str,
    arguments: Value,
    owner: &str,
) -> Result<Packet, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    while !service.ready.load(Ordering::Acquire) {
        if Instant::now() >= deadline {
            return Err("editorNotReady: retry after application startup".into());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    if method != "get_status"
        && app
            .state::<crate::capture::CaptureController>()
            .active_quick_draft()
            .is_some()
    {
        return Err("busy: Quick Capture is active".into());
    }
    service.authorized(owner)?;
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = std::sync::mpsc::channel();
    service.pending.lock().map_err(|_| "reply lock")?.insert(
        id.clone(),
        PendingReply {
            owner: owner.into(),
            sender,
            metadata: None,
        },
    );
    let result = async {
        app.emit_to(
            "main",
            "cute-screen:mcp-request",
            json!({"id":id,"method":method,"arguments":arguments,"clientId":owner}),
        )
        .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(20)))
            .await
            .map_err(|_| "reply worker failed".to_owned())?
            .map_err(|_| "editorTimeout: read document before retrying mutations".to_owned())
    }
    .await;
    service
        .pending
        .lock()
        .map_err(|_| "reply lock")?
        .remove(&id);
    result
}

fn absolute_path(arguments: &Value) -> Result<PathBuf, String> {
    let path = PathBuf::from(arguments["path"].as_str().ok_or("path required")?);
    if !path.is_absolute() {
        return Err("absolute path required".into());
    }
    Ok(path)
}

async fn import_image(
    app: &tauri::AppHandle,
    service: &Arc<McpService>,
    owner: &str,
    arguments: Value,
) -> Result<Packet, String> {
    let ready = forward(app, service, "check_ready", json!({}), owner).await?;
    if ready.metadata.get("error").is_some() {
        return Ok(ready);
    }
    let path = absolute_path(&arguments)?;
    let handle = app.clone();
    let capture_id = tauri::async_runtime::spawn_blocking(move || {
        let document = crate::create_document_from_image(
            &handle.state::<crate::storage::LibraryRepository>(),
            crate::CreateDocumentFromImageRequest {
                source_bytes: crate::read_image_file(&path).map_err(|e| e.to_string())?,
                provenance: crate::ImageProvenance::FileOpen,
                series_id: None,
                frame_metadata: crate::CaptureMetadataV1::unknown(),
                captured_at: chrono::Utc::now(),
            },
        )
        .map_err(|e| e.to_string())?;
        Ok::<_, String>(document.capture_id)
    })
    .await
    .map_err(|e| e.to_string())??;
    crate::show_editor(app);
    let mut result = forward(
        app,
        service,
        "open_document",
        json!({"captureId":capture_id}),
        owner,
    )
    .await?;
    result.metadata["captureId"] = json!(capture_id);
    Ok(result)
}

async fn import_resource(
    app: &tauri::AppHandle,
    service: &Arc<McpService>,
    arguments: Value,
) -> Result<Packet, String> {
    let path = absolute_path(&arguments)?;
    let result = crate::import_content_path(
        &path,
        "mcp-resource",
        &app.state::<crate::storage::StorageHandle>(),
        &app.state::<Arc<crate::image_transport::ImageTransportService>>(),
    )
    .await
    .map_err(|e| e.message)?;
    // The frontend resolves resources by hash; release this unused staging token.
    if let crate::TextureImportOutcome::Imported { resource_token, .. } = &result {
        app.state::<Arc<crate::image_transport::ImageTransportService>>()
            .release_registration(resource_token)
            .map_err(|e| e.to_string())?;
    }
    let _ = service;
    Ok(packet(
        serde_json::to_value(result).map_err(|e| e.to_string())?,
    ))
}

async fn start_capture(
    app: &tauri::AppHandle,
    service: &Arc<McpService>,
    owner: &str,
    arguments: Value,
) -> Result<Packet, String> {
    let ready = forward(app, service, "check_ready", json!({}), owner).await?;
    if ready.metadata.get("error").is_some() {
        return Ok(ready);
    }
    let action =
        serde_json::from_value(arguments["mode"].clone()).map_err(|_| "invalid capture mode")?;
    let delay = arguments
        .get("delayMs")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if delay > 60_000 {
        return Err("invalid capture delay".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = service.jobs.lock().map_err(|_| "jobs lock")?;
        if jobs.values().any(|job| !job.finished) {
            return Err("busy: capture job is running".into());
        }
        if jobs.len() >= 64 {
            jobs.retain(|_, job| !job.finished);
        }
        jobs.insert(
            id.clone(),
            Job {
                owner: owner.into(),
                value: json!({"jobId":id,"status":"running"}),
                finished: false,
                cancelled: cancelled.clone(),
            },
        );
    }
    let request = crate::CaptureRequestV1 {
        correlation_id: id.clone(),
        action,
        delay_ms: u32::try_from(delay).map_err(|_| "invalid delay")?,
        cursor: arguments["cursor"].as_bool().unwrap_or(false),
        series_id: None,
        invocation_source: crate::CaptureInvocationSource::Ui,
    };
    let handle = app.clone();
    let service = service.clone();
    let job_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let controller = handle.state::<crate::capture::CaptureController>();
        let capture = crate::capture_with_preflight(&handle, &controller, request);
        tokio::pin!(capture);
        // Keep the future alive through preflight. A cancellation arriving before
        // controller.begin remains pending until the matching operation exists.
        let mut timer = tokio::time::interval(Duration::from_millis(25));
        let outcome = loop {
            tokio::select! {
                outcome = &mut capture => break outcome,
                _ = timer.tick() => {
                    if cancelled.load(Ordering::Acquire) { controller.cancel_request(&job_id); }
                }
            }
        };
        let value = serde_json::to_value(outcome)
            .unwrap_or_else(|_| json!({"error":"capture outcome serialization failed"}));
        if let Ok(mut jobs) = service.jobs.lock()
            && let Some(job) = jobs.get_mut(&job_id)
        {
            job.finished = true;
            job.value = json!({"jobId":job_id,"status":"finished","result":value});
        }
    });
    Ok(packet(json!({"jobId":id,"status":"running"})))
}

fn job(
    app: &tauri::AppHandle,
    service: &McpService,
    owner: &str,
    method: &str,
    arguments: &Value,
) -> Result<Packet, String> {
    let jobs = service.jobs.lock().map_err(|_| "jobs lock")?;
    let job = jobs
        .get(arguments["jobId"].as_str().ok_or("jobId required")?)
        .filter(|j| j.owner == owner)
        .ok_or("job not found")?;
    if method == "cancel_job" && !job.finished {
        job.cancelled.store(true, Ordering::Release);
        app.state::<crate::capture::CaptureController>()
            .cancel_request(arguments["jobId"].as_str().ok_or("jobId required")?);
    }
    Ok(packet(job.value.clone()))
}

pub(super) fn export_new_png(
    destination: &std::path::Path,
    library: &std::path::Path,
    bytes: &[u8],
) -> Result<(), String> {
    use std::io::Write;
    if destination
        .extension()
        .and_then(|v| v.to_str())
        .is_none_or(|s| !s.eq_ignore_ascii_case("png"))
    {
        return Err("PNG extension required".into());
    }
    crate::result_export::validate_destination(destination, library).map_err(|e| e.to_string())?;
    if destination.try_exists().map_err(|e| e.to_string())? {
        return Err("destinationExists".into());
    }
    crate::result_export::decode_png(bytes).map_err(|e| e.to_string())?;
    let parent = destination.parent().ok_or("invalid destination")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary
        .persist_noclobber(destination)
        .map_err(|e| e.to_string())?;
    crate::result_export::decode_png(&std::fs::read(destination).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
