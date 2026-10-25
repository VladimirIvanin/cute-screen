use crate::{
    CommandResult,
    storage::{self, RepositoryError},
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use uuid::Uuid;

pub struct ResultExportService {
    library_root: PathBuf,
    targets: Mutex<HashMap<String, PathBuf>>,
}

impl ResultExportService {
    pub fn new(library_root: PathBuf) -> Self {
        Self {
            library_root,
            targets: Mutex::new(HashMap::new()),
        }
    }
}

#[cfg(feature = "test-harness")]
static TEST_SAVE_PICKER: Mutex<Option<Option<PathBuf>>> = Mutex::new(None);

#[tauri::command]
pub async fn result_choose_png(
    app: tauri::AppHandle,
    repository: State<'_, crate::storage::StorageHandle>,
    service: State<'_, ResultExportService>,
) -> CommandResult<Option<String>> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| RepositoryError::Io("editor window is unavailable".into()))?;
    let dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export PNG")
        .set_file_name(crate::export_filename::suggested_png_name(&repository).await?)
        .add_filter("PNG image", &["png"]);
    #[cfg(feature = "test-harness")]
    let selected = TEST_SAVE_PICKER
        .lock()
        .map_err(|e| RepositoryError::Io(e.to_string()))?
        .take();
    #[cfg(not(feature = "test-harness"))]
    let selected: Option<Option<PathBuf>> = None;
    let destination = match selected {
        Some(path) => path.map(FilePath::Path),
        None => crate::save_file(dialog).await?,
    };
    let Some(destination) = destination else {
        return Ok(None);
    };
    let mut destination = destination
        .into_path()
        .map_err(|e| RepositoryError::Io(e.to_string()))?;
    if destination.extension().is_none() {
        destination.set_extension("png");
    }
    validate_destination(&destination, &service.library_root)?;
    let ticket = Uuid::now_v7().to_string();
    let mut targets = service
        .targets
        .lock()
        .map_err(|e| RepositoryError::Io(e.to_string()))?;
    // The shell has one active action; discard any abandoned picker result.
    targets.clear();
    targets.insert(ticket.clone(), destination);
    Ok(Some(ticket))
}

#[tauri::command]
pub fn result_cancel_png(
    ticket: String,
    service: State<'_, ResultExportService>,
) -> CommandResult<()> {
    service
        .targets
        .lock()
        .map_err(|e| RepositoryError::Io(e.to_string()))?
        .remove(&ticket);
    Ok(())
}

#[tauri::command]
pub async fn result_write_png(
    request: tauri::ipc::Request<'_>,
    service: State<'_, ResultExportService>,
) -> CommandResult<()> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(RepositoryError::InvalidImage.into());
    };
    let ticket = request
        .headers()
        .get("x-cute-screen-export")
        .and_then(|v| v.to_str().ok())
        .ok_or(RepositoryError::PermissionDenied)?;
    let destination = service
        .targets
        .lock()
        .map_err(|e| RepositoryError::Io(e.to_string()))?
        .remove(ticket)
        .ok_or(RepositoryError::PermissionDenied)?;
    let library_root = service.library_root.clone();
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        write_result_png(&destination, &library_root, &bytes)
    })
    .await
    .map_err(|e| RepositoryError::Io(e.to_string()))??;
    Ok(())
}

pub(crate) fn validate_destination(
    destination: &Path,
    library_root: &Path,
) -> Result<(), RepositoryError> {
    let canonical = if destination.exists() {
        destination.canonicalize()?
    } else {
        let parent = destination
            .parent()
            .ok_or(RepositoryError::PermissionDenied)?
            .canonicalize()?;
        parent.join(
            destination
                .file_name()
                .ok_or(RepositoryError::PermissionDenied)?,
        )
    };
    if canonical.starts_with(library_root.canonicalize()?) {
        return Err(RepositoryError::PermissionDenied);
    }
    Ok(())
}

fn write_result_png(
    destination: &Path,
    library_root: &Path,
    bytes: &[u8],
) -> Result<(), RepositoryError> {
    validate_destination(destination, library_root)?;
    let metadata = storage::inspect_content_image_bytes(bytes)?;
    if metadata.format != "png" {
        return Err(RepositoryError::InvalidImage);
    }
    decode_png(bytes)?;
    crate::write_verified_png(destination, bytes, &metadata)?;
    decode_png(&std::fs::read(destination)?)
}

pub(crate) fn decode_png(bytes: &[u8]) -> Result<(), RepositoryError> {
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
        .read_info()
        .map_err(|_| RepositoryError::InvalidImage)?;
    while reader
        .next_row()
        .map_err(|_| RepositoryError::InvalidImage)?
        .is_some()
    {}
    reader.finish().map_err(|_| RepositoryError::InvalidImage)
}

/// Overrides only the OS picker boundary; rendering, IPC and file writing stay real.
#[cfg(feature = "test-harness")]
#[tauri::command]
pub fn test_result_export(cancel: bool) -> CommandResult<String> {
    test_select_output(cancel, "export-result.png".into())
}

#[cfg(feature = "test-harness")]
#[tauri::command]
pub async fn test_result_export_named(
    repository: State<'_, crate::storage::StorageHandle>,
) -> CommandResult<String> {
    test_select_output(
        false,
        crate::export_filename::suggested_png_name(&repository).await?,
    )
}

#[cfg(feature = "test-harness")]
fn test_select_output(cancel: bool, name: String) -> CommandResult<String> {
    let root =
        std::env::var_os("CUTE_SCREEN_E2E_APP_DATA").ok_or(RepositoryError::PermissionDenied)?;
    let output = PathBuf::from(root).join(name);
    *TEST_SAVE_PICKER
        .lock()
        .map_err(|e| RepositoryError::Io(e.to_string()))? =
        Some(if cancel { None } else { Some(output.clone()) });
    Ok(output.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 2, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .expect("header")
                .write_image_data(&[255, 0, 0, 255, 0, 255, 0, 128])
                .expect("pixels");
        }
        bytes
    }

    #[test]
    fn export_roundtrips_pixels_and_replaces_existing_destination() {
        let root = tempfile::tempdir().expect("root");
        let library = root.path().join("library");
        std::fs::create_dir(&library).expect("library");
        let output = root.path().join("export.png");
        std::fs::write(&output, b"old export").expect("previous export");
        let bytes = png();
        write_result_png(&output, &library, &bytes).expect("export");
        let mut reader =
            png::Decoder::new(std::io::Cursor::new(std::fs::read(output).expect("file")))
                .read_info()
                .expect("decode");
        let mut pixels = vec![0; reader.output_buffer_size().expect("size")];
        reader.next_frame(&mut pixels).expect("frame");
        assert_eq!(pixels, [255, 0, 0, 255, 0, 255, 0, 128]);
    }

    #[test]
    fn export_cannot_overwrite_library_originals_or_replace_files_with_invalid_data() {
        let root = tempfile::tempdir().expect("root");
        let original = root.path().join("original.png");
        std::fs::write(&original, b"immutable").expect("original");
        assert!(write_result_png(&original, root.path(), &png()).is_err());
        assert_eq!(std::fs::read(&original).expect("original"), b"immutable");
        let library = root.path().join("library");
        std::fs::create_dir(&library).expect("library");
        assert!(write_result_png(&original, &library, b"invalid png").is_err());
        assert_eq!(std::fs::read(&original).expect("original"), b"immutable");
    }

    #[test]
    fn export_rejects_truncated_pixel_data_before_replacing_destination() {
        let root = tempfile::tempdir().expect("root");
        let library = root.path().join("library");
        std::fs::create_dir(&library).expect("library");
        let output = root.path().join("export.png");
        std::fs::write(&output, b"previous result").expect("existing");
        let mut bytes = png();
        bytes.truncate(bytes.len() - 15);
        assert!(write_result_png(&output, &library, &bytes).is_err());
        assert_eq!(std::fs::read(output).expect("previous"), b"previous result");
    }
}
