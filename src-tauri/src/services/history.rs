//! Native history boundary: metadata uses JSON, preview pixels use binary IPC.
use crate::{
    CommandResult,
    image_transport::ImageTransportService,
    storage::{self, RepositoryError, StorageHandle},
};
use std::sync::Arc;
use storage::history::{HistoryRequest, HistoryResponse};
use tauri::{Manager, State};

#[tauri::command]
pub async fn history_command(
    request: HistoryRequest,
    repository: State<'_, StorageHandle>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<HistoryResponse> {
    let activates = matches!(
        request,
        HistoryRequest::Activate { .. } | HistoryRequest::Deactivate
    );
    let mut response = repository
        .history(request, transport.authoritative_hashes()?)
        .await?;
    if activates {
        transport.release_authoritative()?;
    }
    if let HistoryResponse::Opened { document, .. } = &mut response {
        let source = match repository
            .resolve_capture_source(document.capture_id.clone(), document.source_hash.clone())
            .await
        {
            Ok(source) => source,
            Err(error) => {
                repository
                    .history(
                        HistoryRequest::Release {
                            capture_id: document.capture_id.clone(),
                        },
                        transport.authoritative_hashes()?,
                    )
                    .await?;
                return Err(error.into());
            }
        };
        let token = uuid::Uuid::now_v7().simple().to_string();
        transport.register_authoritative(token.clone(), source)?;
        document.image_token = Some(token);
    }
    Ok(response)
}

#[tauri::command]
pub async fn history_thumbnail(
    capture_id: String,
    revision: i64,
    repository: State<'_, StorageHandle>,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<Option<String>> {
    let Some(source) = repository.history_thumbnail(capture_id, revision).await? else {
        return Ok(None);
    };
    let token = uuid::Uuid::now_v7().simple().to_string();
    transport.register_authoritative_blob(token.clone(), source)?;
    Ok(Some(token))
}

#[tauri::command]
pub async fn history_write_thumbnail(
    request: tauri::ipc::Request<'_>,
    repository: State<'_, StorageHandle>,
) -> CommandResult<()> {
    let id = request
        .headers()
        .get("x-document-id")
        .and_then(|v| v.to_str().ok())
        .ok_or(RepositoryError::PermissionDenied)?
        .to_owned();
    let revision = request
        .headers()
        .get("x-document-revision")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok())
        .ok_or(RepositoryError::RevisionConflict)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RepositoryError::InvalidImage.into());
    };
    repository
        .write_history_thumbnail(id, revision, bytes.clone())
        .await?;
    Ok(())
}

#[tauri::command]
pub fn image_release(
    token: String,
    transport: State<'_, Arc<ImageTransportService>>,
) -> CommandResult<()> {
    transport.release_registration(&token)?;
    Ok(())
}

#[tauri::command]
pub fn settings_open_history(app: tauri::AppHandle) -> CommandResult<()> {
    crate::settings_window::open_history(&app)?;
    if let Some(window) = app.get_webview_window("settings") {
        use tauri::Emitter;
        window
            .emit("settings:history", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
