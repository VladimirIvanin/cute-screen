use crate::storage::RepositoryError;
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum TextureImportOutcome {
    Cancelled,
    Imported {
        #[ts(type = "string")]
        blob_hash: String,
        #[ts(type = "'png' | 'jpeg' | 'webp' | 'svg'")]
        format: String,
        #[ts(type = "'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'")]
        mime_type: String,
        width: u32,
        height: u32,
        resource_token: String,
    },
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NativeImageDrop {
    #[ts(type = "'enter' | 'over' | 'leave' | 'drop'")]
    pub phase: String,
    pub x: f64,
    pub y: f64,
    pub file_count: usize,
    pub supported: bool,
    pub token: Option<String>,
}

struct DroppedFile {
    token: String,
    path: PathBuf,
    created: Instant,
}

/// Only OS drop events can grant a file. One pending grant per WebView.
#[derive(Default)]
pub struct DroppedImages(Mutex<HashMap<String, DroppedFile>>);

impl DroppedImages {
    pub fn discard(&self, window: &str, token: Option<&str>) -> Result<(), RepositoryError> {
        let mut files = self
            .0
            .lock()
            .map_err(|e| RepositoryError::Io(e.to_string()))?;
        if token.is_none()
            || files
                .get(window)
                .is_some_and(|file| Some(file.token.as_str()) == token)
        {
            files.remove(window);
        }
        Ok(())
    }
    pub fn register(
        &self,
        window: &str,
        paths: &[PathBuf],
    ) -> Result<Option<String>, RepositoryError> {
        let mut files = self
            .0
            .lock()
            .map_err(|e| RepositoryError::Io(e.to_string()))?;
        files.remove(window);
        if paths.len() != 1 || !supported_path(&paths[0]) {
            return Ok(None);
        }
        let path = paths[0].canonicalize()?;
        if !path.is_file() {
            return Err(RepositoryError::InvalidImage);
        }
        let token = uuid::Uuid::now_v7().simple().to_string();
        files.insert(
            window.into(),
            DroppedFile {
                token: token.clone(),
                path,
                created: Instant::now(),
            },
        );
        Ok(Some(token))
    }

    pub fn take(&self, window: &str, token: &str) -> Result<PathBuf, RepositoryError> {
        let mut files = self
            .0
            .lock()
            .map_err(|e| RepositoryError::Io(e.to_string()))?;
        if !files.get(window).is_some_and(|f| f.token == token) {
            return Err(RepositoryError::PermissionDenied);
        }
        let file = files
            .remove(window)
            .ok_or(RepositoryError::PermissionDenied)?;
        if file.created.elapsed() > Duration::from_secs(60) {
            return Err(RepositoryError::PermissionDenied);
        }
        Ok(file.path)
    }
}

pub fn supported_path(path: &Path) -> bool {
    path.extension().and_then(|s| s.to_str()).is_some_and(|s| {
        matches!(
            s.to_ascii_lowercase().as_str(),
            "png" | "jpg" | "jpeg" | "webp" | "svg"
        )
    })
}

/// Bound allocation before reading; still detect files growing after metadata.
pub fn read_image_file(path: &Path) -> Result<Vec<u8>, RepositoryError> {
    let file = File::open(path)?;
    let limit = if path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("svg"))
    {
        10 * 1024 * 1024
    } else {
        512 * 1024 * 1024
    };
    if !file.metadata()?.is_file() {
        return Err(RepositoryError::InvalidImage);
    }
    if file.metadata()?.len() > limit {
        return Err(RepositoryError::ImageTooLarge);
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(RepositoryError::ImageTooLarge);
    }
    Ok(bytes)
}

#[cfg(feature = "test-harness")]
pub static TEST_PICKER: Mutex<Option<Option<PathBuf>>> = Mutex::new(None);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dropped_file_grant_is_single_use_and_bound_to_the_window() {
        let directory = tempfile::tempdir().expect("directory");
        let path = directory.path().join("image.png");
        std::fs::write(&path, b"source").expect("source");
        let grants = DroppedImages::default();
        let token = grants
            .register("main", std::slice::from_ref(&path))
            .expect("grant")
            .expect("token");
        assert!(grants.take("quick-capture", &token).is_err());
        assert_eq!(
            grants.take("main", &token).expect("allowed"),
            path.canonicalize().expect("path")
        );
        assert!(grants.take("main", &token).is_err());
        assert!(
            grants
                .register("main", &[path.clone(), path])
                .expect("multiple")
                .is_none()
        );
    }
    #[test]
    fn bounded_reader_rejects_a_large_file_before_allocating_it() {
        let directory = tempfile::tempdir().expect("directory");
        let path = directory.path().join("image.svg");
        File::create(&path)
            .expect("file")
            .set_len(10 * 1024 * 1024 + 1)
            .expect("length");
        assert!(matches!(
            read_image_file(&path),
            Err(RepositoryError::ImageTooLarge)
        ));
    }
}
