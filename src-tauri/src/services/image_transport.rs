use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;

use crate::platform::{PlatformError, PlatformErrorCode};

#[derive(Debug, Clone)]
pub struct RegisteredImage {
    source: PathBuf,
    mime_type: String,
    width: u32,
    height: u32,
    authoritative: bool,
    sha256: Option<String>,
    memory_bytes: Option<Arc<Vec<u8>>>,
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
            authoritative: false,
            sha256: None,
            memory_bytes: None,
        }
    }

    fn with_sha256(mut self, sha256: String) -> Self {
        self.sha256 = Some(sha256);
        self
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedImageMetadata {
    pub token: String,
    pub asset_url: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub sha256: String,
    pub correlation_id: String,
}

/// Native-only owned image material. It never crosses the Tauri IPC boundary.
#[derive(Debug, Clone)]
pub struct OwnedImage {
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug)]
pub struct ImageTransportService {
    source_root: PathBuf,
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
        stage_root
            .as_ref()
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, "initialization"))?;

        Ok(Self {
            source_root,
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

    /// Registers a blob only after `LibraryRepository` has checked its capture
    /// reference and canonical content-addressed location.
    pub fn register_authoritative(
        &self,
        token: impl Into<String>,
        source: crate::storage::AuthorizedCaptureSource,
    ) -> Result<(), PlatformError> {
        let token = token.into();
        validate_token(&token, "registration")?;
        let canonical = source
            .path
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, "registration"))?;
        let image = RegisteredImage {
            source: canonical,
            mime_type: source.metadata.mime_type,
            width: source.metadata.width,
            height: source.metadata.height,
            authoritative: true,
            sha256: Some(source.hash),
            memory_bytes: None,
        };
        self.images
            .write()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, "registration"))?
            .insert(token, image);
        Ok(())
    }

    /// Registers a repository-authorized immutable resource such as a texture
    /// fill. The caller has already resolved the content-addressed blob; the
    /// webview still receives only the opaque token.
    pub fn register_authoritative_blob(
        &self,
        token: impl Into<String>,
        source: crate::storage::AuthorizedBlobSource,
    ) -> Result<(), PlatformError> {
        let token = token.into();
        validate_token(&token, "registration")?;
        let canonical = source
            .path
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, "registration"))?;
        let image = RegisteredImage {
            source: canonical,
            mime_type: source.metadata.mime_type,
            width: source.metadata.width,
            height: source.metadata.height,
            authoritative: true,
            sha256: Some(source.hash),
            memory_bytes: None,
        };
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
        let extension = match mime_type.as_str() {
            "image/png" => "png",
            "image/bmp" => "bmp",
            _ => "image",
        };
        let owned_source = self.source_root.join(format!("{token}.{extension}"));
        let mut temporary = NamedTempFile::new_in(&self.source_root)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        let sha256 = copy_and_hash(&canonical_source, temporary.as_file_mut())
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        temporary
            .persist_noclobber(&owned_source)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        self.register(
            token,
            RegisteredImage::new(owned_source, mime_type, width, height).with_sha256(sha256),
        )
    }

    /// Stores native capture bytes directly in the operation-owned transport.
    /// It is intentionally native-only: callers never choose a destination
    /// path, and the frontend still receives only the opaque token.
    pub fn import_owned_bytes(
        &self,
        token: &str,
        bytes: &[u8],
        mime_type: impl Into<String>,
        width: u32,
        height: u32,
        correlation_id: &str,
    ) -> Result<(), PlatformError> {
        validate_token(token, correlation_id)?;
        let mime_type = mime_type.into();
        let extension = match mime_type.as_str() {
            "image/png" => "png",
            "image/bmp" => "bmp",
            _ => "image",
        };
        let owned_source = self.source_root.join(format!("{token}.{extension}"));
        let mut temporary = NamedTempFile::new_in(&self.source_root)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        let sha256 = format!("{:x}", Sha256::digest(bytes));
        temporary
            .write_all(bytes)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        temporary
            .persist_noclobber(&owned_source)
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        self.register(
            token,
            RegisteredImage::new(owned_source, mime_type, width, height).with_sha256(sha256),
        )
    }

    /// Keeps an ephemeral native preview off disk while preserving the opaque
    /// token and binary IPC boundary used by the WebView.
    pub fn import_owned_memory(
        &self,
        token: &str,
        bytes: Vec<u8>,
        mime_type: impl Into<String>,
        width: u32,
        height: u32,
        correlation_id: &str,
    ) -> Result<(), PlatformError> {
        validate_token(token, correlation_id)?;
        let image = RegisteredImage {
            source: self.source_root.clone(),
            mime_type: mime_type.into(),
            width,
            height,
            authoritative: false,
            sha256: Some(format!("{:x}", Sha256::digest(&bytes))),
            memory_bytes: Some(Arc::new(bytes)),
        };
        let mut images = self
            .images
            .write()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
        if images.contains_key(token) {
            return Err(transport_error(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        images.insert(token.to_owned(), image);
        Ok(())
    }

    /// Consumes a capture-owned staging file after native persistence has either
    /// committed it to the repository or failed. Authoritative library blobs
    /// deliberately cannot be consumed by this method.
    pub fn take_owned_image(
        &self,
        token: &str,
        correlation_id: &str,
    ) -> Result<OwnedImage, PlatformError> {
        validate_token(token, correlation_id)?;
        let image = self
            .images
            .write()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?
            .remove(token)
            .ok_or_else(|| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        if image.authoritative
            || (image.memory_bytes.is_none() && !image.source.starts_with(&self.source_root))
        {
            return Err(transport_error(
                PlatformErrorCode::PermissionDenied,
                correlation_id,
            ));
        }
        let bytes = if let Some(bytes) = image.memory_bytes {
            Arc::try_unwrap(bytes).unwrap_or_else(|bytes| (*bytes).clone())
        } else {
            let bytes = fs::read(&image.source)
                .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
            fs::remove_file(&image.source)
                .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?;
            bytes
        };
        Ok(OwnedImage {
            bytes,
            mime_type: image.mime_type,
            width: image.width,
            height: image.height,
        })
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
        if image.memory_bytes.is_some() {
            return Ok(StagedImageMetadata {
                token: token.to_owned(),
                asset_url: String::new(),
                mime_type: image.mime_type,
                width: image.width,
                height: image.height,
                sha256: image.sha256.ok_or_else(|| {
                    transport_error(PlatformErrorCode::CaptureFailed, correlation_id)
                })?,
                correlation_id: correlation_id.to_owned(),
            });
        }
        let canonical_source = image
            .source
            .canonicalize()
            .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        if !image.authoritative && !canonical_source.starts_with(&self.source_root) {
            return Err(transport_error(
                PlatformErrorCode::PermissionDenied,
                correlation_id,
            ));
        }

        let sha256 = match image.sha256 {
            Some(sha256) => sha256,
            None => hash_file(&canonical_source)
                .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?,
        };

        Ok(StagedImageMetadata {
            token: token.to_owned(),
            asset_url: asset_url(&canonical_source)
                .map_err(|_| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?,
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
        validate_token(token, correlation_id)?;
        let image = self
            .images
            .read()
            .map_err(|_| transport_error(PlatformErrorCode::CaptureFailed, correlation_id))?
            .get(token)
            .cloned()
            .ok_or_else(|| transport_error(PlatformErrorCode::InvalidUri, correlation_id))?;
        if let Some(bytes) = image.memory_bytes {
            return Ok((*bytes).clone());
        }
        fs::read(image.source)
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

fn copy_and_hash(source: &Path, destination: &mut File) -> std::io::Result<String> {
    let mut source = File::open(source)?;
    let mut buffer = [0_u8; 64 * 1024];
    let mut hasher = Sha256::new();
    loop {
        let read = source.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        destination.write_all(chunk)?;
        hasher.update(chunk);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn hash_file(source: &Path) -> std::io::Result<String> {
    let mut source = File::open(source)?;
    let mut buffer = [0_u8; 64 * 1024];
    let mut hasher = Sha256::new();
    loop {
        let read = source.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn asset_url(path: &Path) -> Result<String, ()> {
    let mut url = url::Url::parse("asset://localhost/").map_err(|_| ())?;
    url.path_segments_mut()
        .map_err(|_| ())?
        .push(&path.to_string_lossy());
    Ok(url.into())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
    };

    use super::{ImageTransportService, RegisteredImage, asset_url};
    use crate::platform::PlatformErrorCode;
    use tempfile::{TempDir, tempdir};

    struct TempTree(TempDir);

    impl TempTree {
        fn new() -> Self {
            Self(tempdir().expect("temporary tree should be created"))
        }

        fn path(&self) -> &Path {
            self.0.path()
        }
    }

    #[test]
    fn stages_only_registered_tokens_inside_the_owned_root() {
        let tree = TempTree::new();
        let source_root = tree.path().join("library");
        let stage_root = tree.path().join("cache");
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
        assert!(metadata.asset_url.starts_with("asset://localhost/"));
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
        let source_root = tree.path().join("library");
        let stage_root = tree.path().join("cache");
        fs::create_dir_all(&source_root).unwrap();
        let outside = tree.path().join("outside.png");
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

    #[test]
    fn import_owned_image_does_not_replace_an_existing_token() {
        let tree = TempTree::new();
        let source_root = tree.path().join("library");
        let stage_root = tree.path().join("cache");
        let first = tree.path().join("first.png");
        let second = tree.path().join("second.png");
        fs::write(&first, b"first-image").expect("first fixture should be written");
        fs::write(&second, b"second-image").expect("second fixture should be written");

        let service = ImageTransportService::new(&source_root, &stage_root)
            .expect("service should initialize");
        service
            .import_owned_image("owned-token", &first, "image/png", 1, 1, "transport-test")
            .expect("first image should import");

        let error = service
            .import_owned_image("owned-token", &second, "image/png", 1, 1, "transport-test")
            .expect_err("existing token must not overwrite its immutable original");
        assert_eq!(error.code, PlatformErrorCode::CaptureFailed);
    }

    #[test]
    fn native_owned_bytes_cache_their_digest_before_frontend_staging() {
        let tree = TempTree::new();
        let source_root = tree.path().join("library");
        let stage_root = tree.path().join("cache");
        let service = ImageTransportService::new(&source_root, &stage_root)
            .expect("service should initialize");

        service
            .import_owned_bytes(
                "preview-token",
                b"preview-bytes",
                "image/bmp",
                1,
                1,
                "transport-test",
            )
            .expect("preview should import");

        let registered = service.images.read().unwrap();
        assert!(registered["preview-token"].sha256.is_some());
    }

    #[test]
    fn native_memory_preview_stages_without_creating_a_transport_file() {
        let tree = TempTree::new();
        let source_root = tree.path().join("library");
        let stage_root = tree.path().join("cache");
        let service = ImageTransportService::new(&source_root, &stage_root)
            .expect("service should initialize");

        service
            .import_owned_memory(
                "memory-preview",
                b"preview-bytes".to_vec(),
                "image/bmp",
                1,
                1,
                "transport-test",
            )
            .expect("memory preview should import");
        let metadata = service
            .stage_image("memory-preview", "transport-test")
            .expect("memory preview should stage");

        assert!(metadata.asset_url.is_empty());
        assert_eq!(fs::read_dir(&source_root).unwrap().count(), 0);
        assert_eq!(
            service
                .read_image_bytes("memory-preview", "transport-test")
                .unwrap(),
            b"preview-bytes"
        );
    }

    #[test]
    fn temporary_tree_is_removed_when_the_fixture_drops() {
        let path: PathBuf = {
            let tree = TempTree::new();
            tree.path().to_path_buf()
        };

        assert!(!path.exists());
    }

    #[test]
    fn asset_url_keeps_an_absolute_path_as_a_single_encoded_segment() {
        let url = asset_url(Path::new("/tmp/m01 fixture.png"))
            .expect("asset URL should be formed for an absolute path");

        assert_eq!(url, "asset://localhost/%2Ftmp%2Fm01%20fixture.png");
    }
}
