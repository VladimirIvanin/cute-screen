use crate::{
    CommandResult,
    storage::{self, RepositoryError},
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State, WebviewWindow};
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
    caller: WebviewWindow,
    app: tauri::AppHandle,
    repository: State<'_, crate::storage::StorageHandle>,
    service: State<'_, ResultExportService>,
) -> CommandResult<Option<String>> {
    require_editor(caller.label())?;
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
    caller: WebviewWindow,
    ticket: String,
    service: State<'_, ResultExportService>,
) -> CommandResult<()> {
    require_editor(caller.label())?;
    service
        .targets
        .lock()
        .map_err(|e| RepositoryError::Io(e.to_string()))?
        .remove(&ticket);
    Ok(())
}

#[tauri::command]
pub async fn result_write_png(
    caller: WebviewWindow,
    request: tauri::ipc::Request<'_>,
    service: State<'_, ResultExportService>,
) -> CommandResult<()> {
    require_editor(caller.label())?;
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

fn require_editor(window: &str) -> Result<(), RepositoryError> {
    if window != "main" {
        return Err(RepositoryError::PermissionDenied);
    }
    Ok(())
}

pub(crate) fn validate_destination(
    destination: &Path,
    library_root: &Path,
) -> Result<(), RepositoryError> {
    if !destination.is_absolute() || destination.file_name().is_none() {
        return Err(RepositoryError::PermissionDenied);
    }
    // Validate the containing directory independently of the existing target:
    // a symlink inside the library can resolve to an otherwise allowed location.
    let parent = destination
        .parent()
        .ok_or(RepositoryError::PermissionDenied)?
        .canonicalize()?;
    let library = library_root.canonicalize()?;
    if parent.starts_with(&library) {
        return Err(RepositoryError::PermissionDenied);
    }
    match destination.symlink_metadata() {
        Ok(metadata) => {
            if !metadata.is_file() || destination.canonicalize()?.starts_with(&library) {
                return Err(RepositoryError::PermissionDenied);
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
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
    fn only_main_editor_can_choose_cancel_or_write_exports() {
        assert!(require_editor("main").is_ok());
        for caller in ["settings", "quick-capture", "", "main-other"] {
            assert!(matches!(
                require_editor(caller),
                Err(RepositoryError::PermissionDenied)
            ));
        }
    }

    #[test]
    fn export_rejects_relative_destinations_and_directories() {
        let root = tempfile::tempdir().expect("root");
        let library = root.path().join("library");
        std::fs::create_dir(&library).expect("library");
        assert!(matches!(
            validate_destination(Path::new("export.png"), &library),
            Err(RepositoryError::PermissionDenied)
        ));
        assert!(matches!(
            validate_destination(root.path(), &library),
            Err(RepositoryError::PermissionDenied)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn export_rejects_symlinks_without_replacing_link_or_target() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("root");
        let library = root.path().join("library");
        std::fs::create_dir(&library).expect("library");
        let target = root.path().join("target.png");
        std::fs::write(&target, b"untouched").expect("target");
        // An existing link inside the library previously canonicalized outside it.
        for link in [library.join("link.png"), root.path().join("link.png")] {
            symlink(&target, &link).expect("link");
            assert!(matches!(
                write_result_png(&link, &library, &png()),
                Err(RepositoryError::PermissionDenied)
            ));
            assert!(link.symlink_metadata().expect("link metadata").is_symlink());
            assert_eq!(std::fs::read(&target).expect("target"), b"untouched");
        }
        let dangling = root.path().join("dangling.png");
        symlink(root.path().join("absent.png"), &dangling).expect("dangling link");
        assert!(matches!(
            validate_destination(&dangling, &library),
            Err(RepositoryError::PermissionDenied)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn export_rejects_a_directory_alias_into_the_library() {
        let root = tempfile::tempdir().expect("root");
        let library = root.path().join("library");
        std::fs::create_dir(&library).expect("library");
        let alias = root.path().join("alias");
        std::os::unix::fs::symlink(&library, &alias).expect("alias");
        assert!(matches!(
            validate_destination(&alias.join("export.png"), &library),
            Err(RepositoryError::PermissionDenied)
        ));
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
