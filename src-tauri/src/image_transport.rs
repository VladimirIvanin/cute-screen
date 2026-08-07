use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::RwLock,
};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::platform::{PlatformError, PlatformErrorCode};

#[derive(Debug, Clone)]
pub struct RegisteredImage {
    source: PathBuf,
    mime_type: String,
    width: u32,
    height: u32,
}

impl RegisteredImage {
    pub fn new(
        source: impl Into<PathBuf>,
        mime_type: impl Into<String>,
        width: u32,
        height: u32,
    ) -> Self {
        Self {
            source: source.into(),
            mime_type: mime_type.into(),
            width,
            height,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedImageMetadata {
    pub token: String,
    pub path: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub sha256: String,
    pub correlation_id: String,
}

#[derive(Debug)]
pub struct ImageTransportService {
    source_root: PathBuf,
    stage_root: PathBuf,
    images: RwLock<BTreeMap<String, RegisteredImage>>,
}

impl ImageTransportService {
    pub fn new(
        source_root: impl AsRef<Path>,
        stage_root: impl AsRef<Path>,
    ) -> Result<Self, PlatformError> {
        fs::create_dir_all(source_root.as_ref())
            .map_err(|_| transport_error(PlatformErrorCode::PermissionDenied, "initialization"))?;
        fs::create_dir_all(stage_root.as_ref())
            .map_err(|_| transport_error(PlatformErrorCode::PermissionDenied, "initialization"))?;
        let source_root = source_root
            .as_ref()
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, "initialization"))?;
        let stage_root = stage_root
            .as_ref()
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, "initialization"))?;

        Ok(Self {
            source_root,
            stage_root,
            images: RwLock::new(BTreeMap::new()),
        })
    }

    /// Registers a path resolved by native library/capture code. This method is
    /// intentionally not exposed as a Tauri command.
    pub fn register(
        &self,
        token: impl Into<String>,
        mut image: RegisteredImage,
    ) -> Result<(), PlatformError> {
        let token = token.into();
        validate_token(&token, "registration")?;
        image.source = image
            .source
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, "registration"))?;
        if !image.source.starts_with(&self.source_root) {
            return Err(transport_error(
                PlatformErrorCode::PermissionDenied,
                "registration",
            ));
        }
        self.images
            .write()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, "registration"))?
            .insert(token, image);
        Ok(())
    }

    /// Copies a path returned by trusted native code into the service-owned
    /// library before exposing an opaque token to the frontend.
    pub fn import_owned_image(
        &self,
        token: &str,
        source: impl AsRef<Path>,
        mime_type: impl Into<String>,
        width: u32,
        height: u32,
        correlation_id: &str,
    ) -> Result<(), PlatformError> {
        validate_token(token, correlation_id)?;
        let canonical_source = source
            .as_ref()
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        if !canonical_source.is_file() {
            return Err(transport_error(
                PlatformErrorCode::InvalidUri,
                correlation_id,
            ));
        }
        let mime_type = mime_type.into();
        let extension = if mime_type == "image/png" {
            "png"
        } else {
            "image"
        };
        let owned_source = self.source_root.join(format!("{token}.{extension}"));
        fs::copy(canonical_source, &owned_source)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        self.register(
            token,
            RegisteredImage::new(owned_source, mime_type, width, height),
        )
    }

    pub fn stage_image(
        &self,
        token: &str,
        correlation_id: &str,
    ) -> Result<StagedImageMetadata, PlatformError> {
        validate_token(token, correlation_id)?;
        let image = self
            .images
            .read()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?
            .get(token)
            .cloned()
            .ok_or_else(|| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        let canonical_source = image
            .source
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        if !canonical_source.starts_with(&self.source_root) {
            return Err(transport_error(
                PlatformErrorCode::PermissionDenied,
                correlation_id,
            ));
        }

        let extension = match image.mime_type.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            _ => "image",
        };
        let destination = self.stage_root.join(format!("{token}.{extension}"));
        fs::copy(&canonical_source, &destination)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        let canonical_destination = destination
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        if !canonical_destination.starts_with(&self.stage_root) {
            return Err(transport_error(
                PlatformErrorCode::PermissionDenied,
                correlation_id,
            ));
        }
        let bytes = fs::read(&canonical_destination)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        let sha256 = format!("{:x}", Sha256::digest(&bytes));

        Ok(StagedImageMetadata {
            token: token.to_owned(),
            path: canonical_destination.to_string_lossy().into_owned(),
            mime_type: image.mime_type,
            width: image.width,
            height: image.height,
            sha256,
            correlation_id: correlation_id.to_owned(),
        })
    }

    pub fn read_image_bytes(
        &self,
        token: &str,
        correlation_id: &str,
    ) -> Result<Vec<u8>, PlatformError> {
        let metadata = self.stage_image(token, correlation_id)?;
        fs::read(metadata.path)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))
    }
}

fn validate_token(token: &str, correlation_id: &str) -> Result<(), PlatformError> {
    let valid = !token.is_empty()
        && token.len() <= 128
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'));
    if valid {
        Ok(())
    } else {
        Err(transport_error(
            PlatformErrorCode::InvalidUri,
            correlation_id,
        ))
    }
}

fn transport_error(code: PlatformErrorCode, correlation_id: &str) -> PlatformError {
    PlatformError::new(code, correlation_id)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    use super::{ImageTransportService, RegisteredImage};
    use crate::platform::PlatformErrorCode;

    static TEMP_ID: AtomicU64 = AtomicU64::new(0);

    struct TempTree(PathBuf);

    impl TempTree {
        fn new() -> Self {
            let id = TEMP_ID.fetch_add(1, Ordering::Relaxed);
            let path =
                std::env::temp_dir().join(format!("cute-screen-m01-{}-{id}", std::process::id()));
            fs::create_dir_all(&path).expect("temporary tree should be created");
            Self(path)
        }
    }

    impl Drop for TempTree {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn stages_only_registered_tokens_inside_the_owned_root() {
        let tree = TempTree::new();
        let source_root = tree.0.join("library");
        let stage_root = tree.0.join("cache");
        fs::create_dir_all(&source_root).expect("source root should exist");
        let source = source_root.join("alpha.png");
        fs::write(&source, b"png-bytes").expect("fixture should be written");

        let service = ImageTransportService::new(&source_root, &stage_root)
            .expect("service should initialize");
        service
            .register(
                "alpha-token",
                RegisteredImage::new(source, "image/png", 64, 64),
            )
            .expect("Rust-owned token should register");

        let metadata = service
            .stage_image("alpha-token", "transport-test")
            .expect("registered image should stage");
        let staged = PathBuf::from(&metadata.path)
            .canonicalize()
            .expect("staged path should be canonical");
        assert!(staged.starts_with(stage_root.canonicalize().unwrap()));
        assert_eq!(metadata.correlation_id, "transport-test");
        assert_eq!(
            service
                .read_image_bytes("alpha-token", "transport-test")
                .unwrap(),
            b"png-bytes"
        );
    }

    #[test]
    fn rejects_unregistered_tokens_and_sources_outside_the_owned_root() {
        let tree = TempTree::new();
        let source_root = tree.0.join("library");
        let stage_root = tree.0.join("cache");
        fs::create_dir_all(&source_root).unwrap();
        let outside = tree.0.join("outside.png");
        fs::write(&outside, b"outside").unwrap();

        let service = ImageTransportService::new(&source_root, &stage_root).unwrap();
        let error = service
            .register(
                "outside-token",
                RegisteredImage::new(outside, "image/png", 1, 1),
            )
            .expect_err("outside source must be rejected");
        assert_eq!(error.code, PlatformErrorCode::PermissionDenied);

        let error = service
            .stage_image("../frontend-path", "transport-test")
            .expect_err("frontend paths are not tokens");
        assert_eq!(error.code, PlatformErrorCode::InvalidUri);
    }
}
