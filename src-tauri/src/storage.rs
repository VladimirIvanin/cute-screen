use std::{
    collections::BTreeSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::mpsc::{self, Sender},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

const MAX_ENCODED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_IMAGE_EDGE: u32 = 32_768;
const MAX_IMAGE_PIXELS: u64 = 134_217_728;
const RECOVERY_BUNDLE_VERSION: u32 = 1;

#[derive(Debug, Error, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RepositoryError {
    #[error("image exceeds the configured safe import limit")]
    ImageTooLarge,
    #[error("image metadata is invalid")]
    InvalidImage,
    #[error("document is invalid: {0}")]
    InvalidDocument(String),
    #[error("document schema {schema_version} is newer than supported")]
    NewerSchema { schema_version: u32 },
    #[error("blob is missing: {hash}")]
    MissingBlob { hash: String },
    #[error("stored document revision changed before save")]
    RevisionConflict,
    #[error("storage permission was denied")]
    PermissionDenied,
    #[error("not enough storage space")]
    NoSpace,
    #[error("recovery bundle is invalid: {0}")]
    InvalidRecoveryBundle(String),
    #[error("storage I/O failed: {0}")]
    Io(String),
    #[error("storage database failed: {0}")]
    Database(String),
    #[error("storage worker stopped")]
    WorkerStopped,
}

impl From<rusqlite::Error> for RepositoryError {
    fn from(error: rusqlite::Error) -> Self {
        RepositoryError::Database(error.to_string())
    }
}

impl From<std::io::Error> for RepositoryError {
    fn from(error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::PermissionDenied => RepositoryError::PermissionDenied,
            std::io::ErrorKind::StorageFull => RepositoryError::NoSpace,
            _ => RepositoryError::Io(error.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlobMetadata {
    pub format: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub color_metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredBlob {
    pub hash: String,
    pub byte_size: u64,
    pub metadata: BlobMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCaptureRequest {
    pub document_id: String,
    pub capture_id: String,
    pub series_id: Option<String>,
    pub document_json: String,
    pub source_bytes: Vec<u8>,
    pub source_metadata: BlobMetadata,
    pub captured_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenDocument {
    pub document_id: String,
    pub capture_id: String,
    pub revision: i64,
    pub document_json: String,
    pub source_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivativeMetadata {
    pub source_hash: String,
    pub variant: String,
    pub generator_version: u32,
    pub cache_path: String,
    pub content_hash: String,
    pub byte_size: u64,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryBundleManifest {
    bundle_version: u32,
    document_id: String,
    source_hash: String,
    blobs: Vec<RecoveryBundleBlob>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryBundleBlob {
    hash: String,
    extension: String,
    byte_size: u64,
    mime_type: String,
}

struct StorageState {
    blobs_root: PathBuf,
    resources_root: PathBuf,
    connection: Connection,
}

type Job = Box<dyn FnOnce(&mut StorageState) + Send + 'static>;

/// A single, dedicated SQLite owner. Every public method synchronously waits
/// for its bounded job result; Tauri command handlers can run it off the UI
/// thread without sharing a Connection across threads.
#[derive(Clone)]
pub struct LibraryRepository {
    sender: Sender<Job>,
}

impl LibraryRepository {
    pub fn initialize(
        root: impl AsRef<Path>,
        resources_root: impl AsRef<Path>,
    ) -> Result<Self, RepositoryError> {
        let root = root.as_ref().to_path_buf();
        let resources_root = resources_root.as_ref().to_path_buf();
        let (sender, receiver) = mpsc::channel::<Job>();
        let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
        thread::Builder::new()
            .name("cute-screen-storage".to_owned())
            .spawn(move || {
                let initialized = StorageState::open(&root, &resources_root);
                let _ = ready_sender.send(initialized.as_ref().map(|_| ()).map_err(Clone::clone));
                let Ok(mut state) = initialized else { return };
                while let Ok(job) = receiver.recv() {
                    job(&mut state);
                }
            })
            .map_err(RepositoryError::from)?;
        ready_receiver
            .recv()
            .map_err(|_| RepositoryError::WorkerStopped)??;
        Ok(Self { sender })
    }

    pub fn create_capture(
        &self,
        request: CreateCaptureRequest,
    ) -> Result<OpenDocument, RepositoryError> {
        self.call(move |state| state.create_capture(request))
    }

    pub fn import_blob(
        &self,
        bytes: Vec<u8>,
        metadata: BlobMetadata,
    ) -> Result<StoredBlob, RepositoryError> {
        self.call(move |state| state.import_blob(&bytes, &metadata))
    }

    pub fn open_last(&self) -> Result<Option<OpenDocument>, RepositoryError> {
        self.call(StorageState::open_last)
    }

    pub fn save_document(
        &self,
        document_id: String,
        expected_revision: i64,
        document_json: String,
    ) -> Result<i64, RepositoryError> {
        self.call(move |state| state.save_document(&document_id, expected_revision, &document_json))
    }

    pub fn get_setting(&self, key: String) -> Result<Option<String>, RepositoryError> {
        self.call(move |state| state.get_setting(&key))
    }

    pub fn put_setting(
        &self,
        key: String,
        schema_version: u32,
        value_json: String,
    ) -> Result<(), RepositoryError> {
        self.call(move |state| state.put_setting(&key, schema_version, &value_json))
    }

    pub fn register_derivative(&self, metadata: DerivativeMetadata) -> Result<(), RepositoryError> {
        self.call(move |state| state.register_derivative(metadata))
    }

    pub fn derivative_path(
        &self,
        source_hash: String,
        variant: String,
    ) -> Result<Option<PathBuf>, RepositoryError> {
        self.call(move |state| state.derivative_path(&source_hash, &variant))
    }

    pub fn blob_path(&self, hash: String) -> Result<PathBuf, RepositoryError> {
        self.call(move |state| state.blob_path_checked(&hash))
    }

    pub fn export_recovery_bundle(
        &self,
        document_id: String,
        destination: PathBuf,
    ) -> Result<(), RepositoryError> {
        self.call(move |state| state.export_recovery_bundle(&document_id, &destination))
    }

    pub fn import_recovery_bundle(
        &self,
        source: PathBuf,
        captured_at: i64,
    ) -> Result<OpenDocument, RepositoryError> {
        self.call(move |state| state.import_recovery_bundle(&source, captured_at))
    }

    fn call<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut StorageState) -> Result<T, RepositoryError> + Send + 'static,
    ) -> Result<T, RepositoryError> {
        let (sender, receiver) = mpsc::sync_channel(1);
        self.sender
            .send(Box::new(move |state| {
                let _ = sender.send(operation(state));
            }))
            .map_err(|_| RepositoryError::WorkerStopped)?;
        receiver
            .recv()
            .map_err(|_| RepositoryError::WorkerStopped)?
    }
}

impl StorageState {
    fn open(root: &Path, resources_root: &Path) -> Result<Self, RepositoryError> {
        fs::create_dir_all(root)?;
        let blobs_root = root.join("blobs");
        let resources_root = resources_root.join("resources");
        fs::create_dir_all(&blobs_root)?;
        fs::create_dir_all(&resources_root)?;
        let resources_root = resources_root.canonicalize()?;
        let mut connection = Connection::open(root.join("library.sqlite3"))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        migrate(&mut connection)?;
        let mut state = Self {
            blobs_root,
            resources_root,
            connection,
        };
        state.recover()?;
        Ok(state)
    }

    fn create_capture(
        &mut self,
        request: CreateCaptureRequest,
    ) -> Result<OpenDocument, RepositoryError> {
        validate_image(&request.source_bytes, &request.source_metadata)?;
        validate_document(&request.document_json)?;
        let operation_id = Uuid::now_v7().to_string();
        let journal_payload = serde_json::json!({
            "documentId": request.document_id,
            "captureId": request.capture_id,
        })
        .to_string();
        self.connection.execute(
            "INSERT INTO recovery_journal (operation_id, kind, state, payload_json, created_at, updated_at) VALUES (?1, 'createCapture', 'prepared', ?2, ?3, ?3)",
            params![operation_id, journal_payload, now_millis()?],
        )?;
        let blob = self.store_blob(&request.source_bytes, &request.source_metadata)?;
        self.connection.execute(
            "UPDATE recovery_journal SET state = 'blobReady', updated_at = ?2 WHERE operation_id = ?1",
            params![operation_id, now_millis()?],
        )?;

        let transaction = self.connection.transaction()?;
        let series_id = match request.series_id {
            Some(series_id) => series_id,
            None => transaction
                .query_row(
                    "SELECT value_json FROM settings WHERE key = 'session.activeSeriesId'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .map(|value| {
                    serde_json::from_str::<String>(&value)
                        .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))
                })
                .transpose()?
                .unwrap_or_else(|| Uuid::now_v7().to_string()),
        };
        transaction.execute(
            "INSERT OR IGNORE INTO series (id, title, created_at, updated_at, deleted_at) VALUES (?1, NULL, ?2, ?2, NULL)",
            params![series_id, request.captured_at],
        )?;
        transaction.execute(
            "INSERT INTO blobs (hash, format, mime_type, byte_size, width, height, color_metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(hash) DO NOTHING",
            params![blob.hash, blob.metadata.format, blob.metadata.mime_type, sqlite_byte_size(blob.byte_size)?, blob.metadata.width, blob.metadata.height, serde_json::to_string(&blob.metadata.color_metadata).map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?, request.captured_at],
        )?;
        transaction.execute(
            "INSERT INTO captures (id, series_id, original_blob_hash, captured_at, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?4, ?4, NULL)",
            params![request.capture_id, series_id, blob.hash, request.captured_at],
        )?;
        transaction.execute(
            "INSERT INTO documents (id, capture_id, schema_version, revision, content_json, content_sha256, created_at, updated_at) VALUES (?1, ?2, 1, 1, ?3, ?4, ?5, ?5)",
            params![request.document_id, request.capture_id, request.document_json, sha256_hex(request.document_json.as_bytes()), request.captured_at],
        )?;
        replace_document_references(
            &transaction,
            &request.document_id,
            &request.document_json,
            &blob.hash,
        )?;
        transaction.execute(
            "INSERT INTO settings (key, schema_version, value_json, updated_at) VALUES ('session.activeSeriesId', 1, ?1, ?2) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![serde_json::to_string(&series_id).map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?, request.captured_at],
        )?;
        transaction.execute(
            "INSERT INTO settings (key, schema_version, value_json, updated_at) VALUES ('session.activeCaptureId', 1, ?1, ?2) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![serde_json::to_string(&request.capture_id).map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?, request.captured_at],
        )?;
        transaction.execute(
            "DELETE FROM recovery_journal WHERE operation_id = ?1",
            params![operation_id],
        )?;
        transaction.commit()?;
        Ok(OpenDocument {
            document_id: request.document_id,
            capture_id: request.capture_id,
            revision: 1,
            document_json: request.document_json,
            source_hash: blob.hash,
        })
    }

    fn import_blob(
        &mut self,
        bytes: &[u8],
        metadata: &BlobMetadata,
    ) -> Result<StoredBlob, RepositoryError> {
        validate_image(bytes, metadata)?;
        let blob = self.store_blob(bytes, metadata)?;
        self.connection.execute(
            "INSERT INTO blobs (hash, format, mime_type, byte_size, width, height, color_metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(hash) DO NOTHING",
            params![blob.hash, blob.metadata.format, blob.metadata.mime_type, sqlite_byte_size(blob.byte_size)?, blob.metadata.width, blob.metadata.height, serde_json::to_string(&blob.metadata.color_metadata).map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?, now_millis()?],
        )?;
        Ok(blob)
    }

    fn open_last(&mut self) -> Result<Option<OpenDocument>, RepositoryError> {
        self.connection.query_row(
            "SELECT d.id, d.capture_id, d.revision, d.content_json, c.original_blob_hash FROM documents d JOIN captures c ON c.id = d.capture_id WHERE c.deleted_at IS NULL ORDER BY c.captured_at DESC LIMIT 1",
            [],
            |row| Ok(OpenDocument { document_id: row.get(0)?, capture_id: row.get(1)?, revision: row.get(2)?, document_json: row.get(3)?, source_hash: row.get(4)? }),
        ).optional().map_err(RepositoryError::from)
    }

    fn save_document(
        &mut self,
        document_id: &str,
        expected_revision: i64,
        document_json: &str,
    ) -> Result<i64, RepositoryError> {
        validate_document(document_json)?;
        let transaction = self.connection.transaction()?;
        let source_hash: String = transaction.query_row(
            "SELECT c.original_blob_hash FROM documents d JOIN captures c ON c.id = d.capture_id WHERE d.id = ?1",
            params![document_id],
            |row| row.get(0),
        ).optional()?.ok_or_else(|| RepositoryError::InvalidDocument("document does not exist".to_owned()))?;
        let updated = transaction.execute(
            "UPDATE documents SET revision = revision + 1, content_json = ?1, content_sha256 = ?2, updated_at = ?3 WHERE id = ?4 AND revision = ?5",
            params![document_json, sha256_hex(document_json.as_bytes()), now_millis()?, document_id, expected_revision],
        )?;
        if updated != 1 {
            return Err(RepositoryError::RevisionConflict);
        }
        replace_document_references(&transaction, document_id, document_json, &source_hash)?;
        let revision: i64 = transaction.query_row(
            "SELECT revision FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )?;
        transaction.commit()?;
        Ok(revision)
    }

    fn get_setting(&mut self, key: &str) -> Result<Option<String>, RepositoryError> {
        self.connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(RepositoryError::from)
    }

    fn put_setting(
        &mut self,
        key: &str,
        schema_version: u32,
        value_json: &str,
    ) -> Result<(), RepositoryError> {
        serde_json::from_str::<Value>(value_json)
            .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?;
        self.connection.execute(
            "INSERT INTO settings (key, schema_version, value_json, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET schema_version = excluded.schema_version, value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![key, schema_version, value_json, now_millis()?],
        )?;
        Ok(())
    }

    fn register_derivative(&mut self, metadata: DerivativeMetadata) -> Result<(), RepositoryError> {
        validate_derivative_metadata(&metadata)?;
        let cache_path = self.derivative_cache_path(&metadata.source_hash, &metadata.cache_path)?;
        let canonical_cache_path = cache_path
            .canonicalize()
            .map_err(|_| RepositoryError::InvalidImage)?;
        if !canonical_cache_path.is_file()
            || !canonical_cache_path.starts_with(&self.resources_root)
        {
            return Err(RepositoryError::PermissionDenied);
        }
        self.connection.execute(
            "INSERT INTO blob_derivatives (source_hash, variant, generator_version, cache_path, content_hash, byte_size, width, height, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(source_hash, variant, generator_version) DO UPDATE SET cache_path = excluded.cache_path, content_hash = excluded.content_hash, byte_size = excluded.byte_size, width = excluded.width, height = excluded.height, created_at = excluded.created_at",
            params![metadata.source_hash, metadata.variant, metadata.generator_version, metadata.cache_path, metadata.content_hash, sqlite_byte_size(metadata.byte_size)?, metadata.width, metadata.height, now_millis()?],
        )?;
        Ok(())
    }

    fn derivative_path(
        &mut self,
        source_hash: &str,
        variant: &str,
    ) -> Result<Option<PathBuf>, RepositoryError> {
        if !is_sha256(source_hash) {
            return Err(RepositoryError::MissingBlob {
                hash: source_hash.to_owned(),
            });
        }
        if !is_derivative_variant(variant) {
            return Err(RepositoryError::InvalidImage);
        }
        let relative: Option<String> = self.connection.query_row(
            "SELECT cache_path FROM blob_derivatives WHERE source_hash = ?1 AND variant = ?2 ORDER BY generator_version DESC LIMIT 1",
            params![source_hash, variant],
            |row| row.get(0),
        ).optional()?;
        let Some(relative) = relative else {
            return Ok(None);
        };
        let path = self.derivative_cache_path(source_hash, &relative)?;
        if !path.is_file() {
            self.connection.execute(
                "DELETE FROM blob_derivatives WHERE source_hash = ?1 AND variant = ?2",
                params![source_hash, variant],
            )?;
            return Ok(None);
        }
        let canonical_path = path.canonicalize()?;
        if !canonical_path.starts_with(&self.resources_root) {
            return Err(RepositoryError::PermissionDenied);
        }
        Ok(Some(canonical_path))
    }

    fn blob_path_checked(&mut self, hash: &str) -> Result<PathBuf, RepositoryError> {
        if !is_sha256(hash) {
            return Err(RepositoryError::MissingBlob {
                hash: hash.to_owned(),
            });
        }
        let extension: String = self
            .connection
            .query_row(
                "SELECT format FROM blobs WHERE hash = ?1",
                params![hash],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| RepositoryError::MissingBlob {
                hash: hash.to_owned(),
            })?;
        let path = blob_path(&self.blobs_root, hash, &extension)?;
        if path.is_file() {
            Ok(path)
        } else {
            Err(RepositoryError::MissingBlob {
                hash: hash.to_owned(),
            })
        }
    }

    fn store_blob(
        &mut self,
        bytes: &[u8],
        metadata: &BlobMetadata,
    ) -> Result<StoredBlob, RepositoryError> {
        let hash = sha256_hex(bytes);
        let byte_size = encoded_byte_size(bytes.len())?;
        let path = blob_path(&self.blobs_root, &hash, &metadata.format)?;
        if path.is_file() {
            return Ok(StoredBlob {
                hash,
                byte_size,
                metadata: metadata.clone(),
            });
        }
        let parent = path
            .parent()
            .ok_or_else(|| RepositoryError::Io("blob path has no parent".to_owned()))?;
        fs::create_dir_all(parent)?;
        let temporary = parent.join(format!(".{}.{}.tmp", hash, Uuid::now_v7()));
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            file.write_all(bytes)?;
            file.sync_all()?;
        }
        match fs::rename(&temporary, &path) {
            Ok(()) => sync_directory(parent)?,
            Err(error) if path.is_file() => {
                let _ = fs::remove_file(&temporary);
                let _ = error;
            }
            Err(error) => return Err(error.into()),
        }
        Ok(StoredBlob {
            hash,
            byte_size,
            metadata: metadata.clone(),
        })
    }

    fn derivative_cache_path(
        &self,
        source_hash: &str,
        cache_path: &str,
    ) -> Result<PathBuf, RepositoryError> {
        if !is_sha256(source_hash) || !is_safe_relative_path(cache_path) {
            return Err(RepositoryError::PermissionDenied);
        }
        Ok(self.resources_root.join(source_hash).join(cache_path))
    }

    fn recover(&mut self) -> Result<(), RepositoryError> {
        // A journal can only survive before the metadata transaction commits.
        // Its final blob is intentionally retained as a diagnosable orphan;
        // automatic garbage collection is never allowed during startup.
        self.connection.execute(
            "DELETE FROM recovery_journal WHERE state IN ('prepared', 'blobReady')",
            [],
        )?;
        Ok(())
    }

    fn export_recovery_bundle(
        &mut self,
        document_id: &str,
        destination: &Path,
    ) -> Result<(), RepositoryError> {
        let document_json: String = self
            .connection
            .query_row(
                "SELECT content_json FROM documents WHERE id = ?1",
                params![document_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::InvalidDocument("document does not exist".to_owned())
            })?;
        let source_hash: String = self.connection.query_row("SELECT c.original_blob_hash FROM documents d JOIN captures c ON c.id = d.capture_id WHERE d.id = ?1", params![document_id], |row| row.get(0))?;
        let mut blobs = Vec::new();
        let mut rows = self.connection.prepare("SELECT b.hash, b.format, b.byte_size, b.mime_type FROM blobs b JOIN blob_references r ON r.blob_hash = b.hash WHERE r.owner_kind = 'document' AND r.owner_id = ?1 ORDER BY b.hash")?;
        let iterator = rows.query_map(params![document_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        for row in iterator {
            let (hash, extension, byte_size, mime_type) = row?;
            blobs.push(RecoveryBundleBlob {
                hash,
                extension,
                byte_size: byte_size_from_database(byte_size)?,
                mime_type,
            });
        }
        let manifest = RecoveryBundleManifest {
            bundle_version: RECOVERY_BUNDLE_VERSION,
            document_id: document_id.to_owned(),
            source_hash,
            blobs: blobs.clone(),
        };
        let parent = destination
            .parent()
            .ok_or(RepositoryError::PermissionDenied)?;
        fs::create_dir_all(parent)?;
        let temporary = parent.join(format!(".{}.tmp", Uuid::now_v7()));
        {
            let file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            let mut archive = ZipWriter::new(file);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            archive
                .start_file("manifest.json", options)
                .map_err(|error| RepositoryError::Io(error.to_string()))?;
            archive
                .write_all(&serde_json::to_vec(&manifest).map_err(|error| {
                    RepositoryError::InvalidRecoveryBundle(error.to_string())
                })?)?;
            archive
                .start_file("document.json", options)
                .map_err(|error| RepositoryError::Io(error.to_string()))?;
            archive.write_all(document_json.as_bytes())?;
            for blob in blobs {
                archive
                    .start_file(format!("blobs/{}.{}", blob.hash, blob.extension), options)
                    .map_err(|error| RepositoryError::Io(error.to_string()))?;
                let path = blob_path(&self.blobs_root, &blob.hash, &blob.extension)?;
                let mut input = File::open(path).map_err(|_| RepositoryError::MissingBlob {
                    hash: blob.hash.clone(),
                })?;
                std::io::copy(&mut input, &mut archive)?;
            }
            let file = archive
                .finish()
                .map_err(|error| RepositoryError::Io(error.to_string()))?;
            file.sync_all()?;
        }
        fs::rename(&temporary, destination)?;
        sync_directory(parent)?;
        Ok(())
    }

    fn import_recovery_bundle(
        &mut self,
        source: &Path,
        captured_at: i64,
    ) -> Result<OpenDocument, RepositoryError> {
        let file = File::open(source)?;
        let mut archive = ZipArchive::new(file)
            .map_err(|error| RepositoryError::InvalidRecoveryBundle(error.to_string()))?;
        let manifest: RecoveryBundleManifest = read_zip_json(&mut archive, "manifest.json")?;
        if manifest.bundle_version != RECOVERY_BUNDLE_VERSION {
            return Err(RepositoryError::InvalidRecoveryBundle(
                "unsupported bundle version".to_owned(),
            ));
        }
        let document_json = read_zip_string(&mut archive, "document.json")?;
        validate_document(&document_json)?;
        let document_value: Value = serde_json::from_str(&document_json)
            .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?;
        let source = document_value
            .get("source")
            .and_then(Value::as_object)
            .ok_or_else(|| RepositoryError::InvalidDocument("source is missing".to_owned()))?;
        let source_metadata = BlobMetadata {
            format: source
                .get("format")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    RepositoryError::InvalidDocument("source format is missing".to_owned())
                })?
                .to_owned(),
            mime_type: source
                .get("mimeType")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    RepositoryError::InvalidDocument("source mimeType is missing".to_owned())
                })?
                .to_owned(),
            width: json_u32(source.get("width").and_then(Value::as_u64), "source width")?,
            height: json_u32(
                source.get("height").and_then(Value::as_u64),
                "source height",
            )?,
            color_metadata: source.get("color").cloned().unwrap_or(Value::Null),
        };
        let source_entry = manifest
            .blobs
            .iter()
            .find(|entry| entry.hash == manifest.source_hash)
            .ok_or_else(|| {
                RepositoryError::InvalidRecoveryBundle("source blob is absent".to_owned())
            })?;
        let source_bytes = read_bundle_blob(&mut archive, source_entry)?;
        for entry in &manifest.blobs {
            let bytes = read_bundle_blob(&mut archive, entry)?;
            if sha256_hex(&bytes) != entry.hash {
                return Err(RepositoryError::InvalidRecoveryBundle(
                    "blob checksum mismatch".to_owned(),
                ));
            }
            let metadata = if entry.hash == manifest.source_hash {
                source_metadata.clone()
            } else {
                BlobMetadata {
                    format: entry.extension.clone(),
                    mime_type: entry.mime_type.clone(),
                    width: 1,
                    height: 1,
                    color_metadata: Value::Null,
                }
            };
            let _ = self.import_blob(&bytes, &metadata)?;
        }
        let new_document_id = Uuid::now_v7().to_string();
        let new_capture_id = Uuid::now_v7().to_string();
        let mut rewritten = document_value;
        rewritten["id"] = Value::String(new_document_id.clone());
        let request = CreateCaptureRequest {
            document_id: new_document_id,
            capture_id: new_capture_id,
            series_id: None,
            document_json: serde_json::to_string(&rewritten)
                .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?,
            source_bytes,
            source_metadata,
            captured_at,
        };
        self.create_capture(request)
    }
}

fn migrate(connection: &mut Connection) -> Result<(), RepositoryError> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
        CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, format TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, color_metadata_json TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, series_id TEXT NOT NULL REFERENCES series(id), original_blob_hash TEXT NOT NULL REFERENCES blobs(hash), captured_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
        CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, capture_id TEXT NOT NULL UNIQUE REFERENCES captures(id), schema_version INTEGER NOT NULL, revision INTEGER NOT NULL, content_json TEXT NOT NULL, content_sha256 TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS blob_references (owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, role TEXT NOT NULL, blob_hash TEXT NOT NULL REFERENCES blobs(hash), PRIMARY KEY(owner_kind, owner_id, role, blob_hash));
        CREATE TABLE IF NOT EXISTS blob_derivatives (source_hash TEXT NOT NULL REFERENCES blobs(hash), variant TEXT NOT NULL, generator_version INTEGER NOT NULL, cache_path TEXT NOT NULL, content_hash TEXT NOT NULL, byte_size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(source_hash, variant, generator_version));
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS recovery_journal (operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS captures_series_recent ON captures(series_id, captured_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS captures_recent ON captures(captured_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS documents_updated ON documents(updated_at DESC);
        CREATE INDEX IF NOT EXISTS blob_references_hash ON blob_references(blob_hash);
        CREATE INDEX IF NOT EXISTS recovery_journal_state ON recovery_journal(state, updated_at);
        "
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, name, checksum, applied_at) VALUES (1, 'm03-initial', 'm03-initial-v1', ?1)",
        params![now_millis()?],
    )?;
    Ok(())
}

fn replace_document_references(
    transaction: &Transaction<'_>,
    document_id: &str,
    document_json: &str,
    source_hash: &str,
) -> Result<(), RepositoryError> {
    transaction.execute(
        "DELETE FROM blob_references WHERE owner_kind = 'document' AND owner_id = ?1",
        params![document_id],
    )?;
    let mut hashes = BTreeSet::new();
    hashes.insert(source_hash.to_owned());
    let parsed: Value = serde_json::from_str(document_json)
        .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?;
    collect_blob_hashes(&parsed, &mut hashes);
    for hash in hashes {
        transaction.execute(
            "INSERT OR IGNORE INTO blob_references (owner_kind, owner_id, role, blob_hash) VALUES ('document', ?1, 'sourceOrLayer', ?2)",
            params![document_id, hash],
        )?;
    }
    Ok(())
}

fn collect_blob_hashes(value: &Value, hashes: &mut BTreeSet<String>) {
    match value {
        Value::Object(object) => {
            if let Some(Value::String(hash)) = object.get("blobHash")
                && is_sha256(hash)
            {
                hashes.insert(hash.clone());
            }
            for child in object.values() {
                collect_blob_hashes(child, hashes);
            }
        }
        Value::Array(values) => {
            for child in values {
                collect_blob_hashes(child, hashes);
            }
        }
        _ => {}
    }
}

fn validate_document(document_json: &str) -> Result<(), RepositoryError> {
    let value: Value = serde_json::from_str(document_json)
        .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?;
    let schema_version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| RepositoryError::InvalidDocument("schemaVersion is missing".to_owned()))?;
    let schema_version = u32::try_from(schema_version).map_err(|_| {
        RepositoryError::InvalidDocument(
            "schemaVersion exceeds the supported integer range".to_owned(),
        )
    })?;
    if schema_version > 1 {
        return Err(RepositoryError::NewerSchema { schema_version });
    }
    if value.get("id").and_then(Value::as_str).is_none() {
        return Err(RepositoryError::InvalidDocument("id is missing".to_owned()));
    }
    Ok(())
}

fn validate_image(bytes: &[u8], metadata: &BlobMetadata) -> Result<(), RepositoryError> {
    if encoded_byte_size(bytes.len())? > MAX_ENCODED_BYTES {
        return Err(RepositoryError::ImageTooLarge);
    }
    validate_dimensions(metadata.width, metadata.height)?;
    if is_supported_format(&metadata.format) {
        Ok(())
    } else {
        Err(RepositoryError::InvalidImage)
    }
}

fn validate_derivative_metadata(metadata: &DerivativeMetadata) -> Result<(), RepositoryError> {
    if !is_sha256(&metadata.source_hash)
        || !is_sha256(&metadata.content_hash)
        || !is_derivative_variant(&metadata.variant)
        || !is_safe_relative_path(&metadata.cache_path)
    {
        return Err(RepositoryError::InvalidImage);
    }
    if metadata.byte_size > MAX_ENCODED_BYTES {
        return Err(RepositoryError::ImageTooLarge);
    }
    validate_dimensions(metadata.width, metadata.height)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value.bytes().all(|byte| {
            byte.is_ascii_digit() || (byte.is_ascii_lowercase() && byte.is_ascii_hexdigit())
        })
}

fn is_supported_format(format: &str) -> bool {
    matches!(format, "png" | "jpeg" | "webp" | "svg")
}

fn is_derivative_variant(variant: &str) -> bool {
    matches!(variant, "thumbnail" | "interactive-2048")
}

fn is_safe_relative_path(value: &str) -> bool {
    !value.is_empty()
        && Path::new(value)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), RepositoryError> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_EDGE
        || height > MAX_IMAGE_EDGE
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        Err(RepositoryError::ImageTooLarge)
    } else {
        Ok(())
    }
}

fn blob_path(blobs_root: &Path, hash: &str, extension: &str) -> Result<PathBuf, RepositoryError> {
    if !is_sha256(hash) {
        return Err(RepositoryError::MissingBlob {
            hash: hash.to_owned(),
        });
    }
    if !is_supported_format(extension) {
        return Err(RepositoryError::InvalidImage);
    }
    Ok(blobs_root
        .join(&hash[..2])
        .join(&hash[2..4])
        .join(format!("{hash}.{extension}")))
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn encoded_byte_size(value: usize) -> Result<u64, RepositoryError> {
    u64::try_from(value).map_err(|_| RepositoryError::ImageTooLarge)
}

fn sqlite_byte_size(value: u64) -> Result<i64, RepositoryError> {
    i64::try_from(value).map_err(|_| RepositoryError::InvalidImage)
}

fn byte_size_from_database(value: i64) -> Result<u64, RepositoryError> {
    u64::try_from(value)
        .map_err(|_| RepositoryError::Database("blob byte_size cannot be negative".to_owned()))
}

fn json_u32(value: Option<u64>, field: &str) -> Result<u32, RepositoryError> {
    let value =
        value.ok_or_else(|| RepositoryError::InvalidDocument(format!("{field} is missing")))?;
    u32::try_from(value).map_err(|_| {
        RepositoryError::InvalidDocument(format!("{field} exceeds the supported range"))
    })
}

fn now_millis() -> Result<i64, RepositoryError> {
    let milliseconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| RepositoryError::Io(error.to_string()))?
        .as_millis();
    i64::try_from(milliseconds).map_err(|_| {
        RepositoryError::Io("system clock exceeds the supported timestamp range".to_owned())
    })
}

fn sync_directory(path: &Path) -> Result<(), RepositoryError> {
    #[cfg(unix)]
    {
        File::open(path)?.sync_all()?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn read_zip_string(archive: &mut ZipArchive<File>, name: &str) -> Result<String, RepositoryError> {
    let mut file = archive
        .by_name(name)
        .map_err(|error| RepositoryError::InvalidRecoveryBundle(error.to_string()))?;
    if file.size() > MAX_ENCODED_BYTES {
        return Err(RepositoryError::InvalidRecoveryBundle(
            "entry exceeds size limit".to_owned(),
        ));
    }
    let mut text = String::new();
    file.read_to_string(&mut text)?;
    Ok(text)
}

fn read_zip_json<T: for<'de> Deserialize<'de>>(
    archive: &mut ZipArchive<File>,
    name: &str,
) -> Result<T, RepositoryError> {
    serde_json::from_str(&read_zip_string(archive, name)?)
        .map_err(|error| RepositoryError::InvalidRecoveryBundle(error.to_string()))
}

fn read_bundle_blob(
    archive: &mut ZipArchive<File>,
    entry: &RecoveryBundleBlob,
) -> Result<Vec<u8>, RepositoryError> {
    if !is_sha256(&entry.hash) || !is_supported_format(&entry.extension) {
        return Err(RepositoryError::InvalidRecoveryBundle(
            "invalid blob entry".to_owned(),
        ));
    }
    let name = format!("blobs/{}.{}", entry.hash, entry.extension);
    let mut file = archive
        .by_name(&name)
        .map_err(|error| RepositoryError::InvalidRecoveryBundle(error.to_string()))?;
    if file.size() != entry.byte_size || file.size() > MAX_ENCODED_BYTES {
        return Err(RepositoryError::InvalidRecoveryBundle(
            "blob size mismatch".to_owned(),
        ));
    }
    let capacity = usize::try_from(file.size()).map_err(|_| {
        RepositoryError::InvalidRecoveryBundle("blob entry exceeds addressable memory".to_owned())
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    use tempfile::tempdir;

    use super::{
        BlobMetadata, CreateCaptureRequest, DerivativeMetadata, LibraryRepository, RepositoryError,
    };

    fn metadata() -> BlobMetadata {
        BlobMetadata {
            format: "png".to_owned(),
            mime_type: "image/png".to_owned(),
            width: 2,
            height: 2,
            color_metadata: serde_json::json!({ "colorSpace": "srgb" }),
        }
    }

    fn document(id: &str, hash: &str) -> String {
        serde_json::json!({
            "schemaVersion": 1,
            "id": id,
            "source": { "blobHash": hash, "format": "png", "mimeType": "image/png", "width": 2, "height": 2, "orientationApplied": true, "color": { "colorSpace": "srgb", "hasIccProfile": false } },
            "canvas": { "width": 2, "height": 2 }, "crop": null, "layers": [],
            "presentation": { "beautify": { "enabled": false }, "watermark": { "enabled": false } },
            "createdAt": "2026-08-09T00:00:00.000Z", "updatedAt": "2026-08-09T00:00:00.000Z"
        }).to_string()
    }

    fn derivative_metadata(source_hash: String, cache_path: &str) -> DerivativeMetadata {
        DerivativeMetadata {
            source_hash,
            variant: "thumbnail".to_owned(),
            generator_version: 1,
            cache_path: cache_path.to_owned(),
            content_hash: super::sha256_hex(b"derivative"),
            byte_size: 10,
            width: 1,
            height: 1,
        }
    }

    #[test]
    fn creates_deduplicated_capture_and_persists_the_document() {
        let directory = tempdir().expect("temp directory");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let bytes = b"fake-png-image".to_vec();
        let hash = super::sha256_hex(&bytes);
        let first = repository
            .create_capture(CreateCaptureRequest {
                document_id: "doc-1".to_owned(),
                capture_id: "capture-1".to_owned(),
                series_id: None,
                document_json: document("doc-1", &hash),
                source_bytes: bytes.clone(),
                source_metadata: metadata(),
                captured_at: 1,
            })
            .expect("first capture");
        let second = repository
            .create_capture(CreateCaptureRequest {
                document_id: "doc-2".to_owned(),
                capture_id: "capture-2".to_owned(),
                series_id: None,
                document_json: document("doc-2", &hash),
                source_bytes: bytes,
                source_metadata: metadata(),
                captured_at: 2,
            })
            .expect("second capture");
        assert_eq!(first.source_hash, second.source_hash);
        assert!(repository.blob_path(hash).expect("blob path").is_file());
        assert_eq!(
            repository
                .open_last()
                .expect("last")
                .expect("document")
                .document_id,
            "doc-2"
        );
    }

    #[test]
    fn rejects_revision_conflicts_and_oversized_metadata() {
        let directory = tempdir().expect("temp directory");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let bytes = b"fake-png-image".to_vec();
        let hash = super::sha256_hex(&bytes);
        repository
            .create_capture(CreateCaptureRequest {
                document_id: "doc-1".to_owned(),
                capture_id: "capture-1".to_owned(),
                series_id: None,
                document_json: document("doc-1", &hash),
                source_bytes: bytes,
                source_metadata: metadata(),
                captured_at: 1,
            })
            .expect("capture");
        assert_eq!(
            repository
                .save_document("doc-1".to_owned(), 1, document("doc-1", &hash))
                .expect("save"),
            2
        );
        assert!(matches!(
            repository.save_document("doc-1".to_owned(), 1, document("doc-1", &hash)),
            Err(RepositoryError::RevisionConflict)
        ));
        let mut too_large = metadata();
        too_large.width = 32_769;
        assert!(matches!(
            repository.create_capture(CreateCaptureRequest {
                document_id: "doc-2".to_owned(),
                capture_id: "capture-2".to_owned(),
                series_id: None,
                document_json: document("doc-2", &hash),
                source_bytes: vec![1],
                source_metadata: too_large,
                captured_at: 2
            }),
            Err(RepositoryError::ImageTooLarge)
        ));
    }

    #[test]
    fn exports_and_imports_a_self_contained_recovery_bundle() {
        let source_directory = tempdir().expect("source temp directory");
        let source_repository =
            LibraryRepository::initialize(source_directory.path(), source_directory.path())
                .expect("source repository");
        let bytes = b"fake-png-image".to_vec();
        let hash = super::sha256_hex(&bytes);
        source_repository
            .create_capture(CreateCaptureRequest {
                document_id: "doc-1".to_owned(),
                capture_id: "capture-1".to_owned(),
                series_id: None,
                document_json: document("doc-1", &hash),
                source_bytes: bytes,
                source_metadata: metadata(),
                captured_at: 1,
            })
            .expect("capture");
        let bundle = source_directory.path().join("recovery.cutescreen-recovery");
        source_repository
            .export_recovery_bundle("doc-1".to_owned(), bundle.clone())
            .expect("export bundle");

        let restored_directory = tempdir().expect("restored temp directory");
        let restored_repository =
            LibraryRepository::initialize(restored_directory.path(), restored_directory.path())
                .expect("restored repository");
        let restored = restored_repository
            .import_recovery_bundle(bundle, 2)
            .expect("import bundle");
        assert_ne!(restored.document_id, "doc-1");
        assert_eq!(restored.source_hash, hash);
        assert!(
            restored_repository
                .blob_path(hash)
                .expect("restored blob")
                .is_file()
        );
    }

    #[test]
    fn rejects_schema_versions_that_do_not_fit_u32() {
        let document = serde_json::json!({
            "schemaVersion": u64::MAX,
            "id": "doc-1",
        })
        .to_string();

        assert!(matches!(
            super::validate_document(&document),
            Err(RepositoryError::InvalidDocument(_))
        ));
    }

    #[test]
    fn rejects_derivative_cache_paths_with_non_normal_components() {
        let hash = super::sha256_hex(b"source");
        for path in [
            "../outside.png",
            "./thumbnail.png",
            "/tmp/thumbnail.png",
            "",
        ] {
            assert!(matches!(
                super::validate_derivative_metadata(&derivative_metadata(hash.clone(), path)),
                Err(RepositoryError::InvalidImage)
            ));
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_derivative_symlinks_outside_the_resources_root() {
        let directory = tempdir().expect("temp directory");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let stored = repository
            .import_blob(b"source".to_vec(), metadata())
            .expect("source blob should import");
        let outside = directory.path().join("outside.png");
        fs::write(&outside, b"derivative").expect("outside fixture should be written");
        let source_root = directory.path().join("resources").join(&stored.hash);
        fs::create_dir_all(&source_root).expect("resource directory should exist");
        symlink(&outside, source_root.join("thumbnail.png")).expect("symlink should be created");

        let error = repository
            .register_derivative(derivative_metadata(stored.hash, "thumbnail.png"))
            .expect_err("symlink outside the owned root must be rejected");
        assert!(matches!(error, RepositoryError::PermissionDenied));
    }

    #[test]
    fn reports_malformed_active_series_settings_instead_of_creating_a_new_series() {
        let directory = tempdir().expect("temp directory");
        let repository =
            LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
        let bytes = b"fake-png-image".to_vec();
        let hash = super::sha256_hex(&bytes);
        repository
            .put_setting("session.activeSeriesId".to_owned(), 1, "{}".to_owned())
            .expect("setting should save");

        let error = repository
            .create_capture(CreateCaptureRequest {
                document_id: "doc-1".to_owned(),
                capture_id: "capture-1".to_owned(),
                series_id: None,
                document_json: document("doc-1", &hash),
                source_bytes: bytes,
                source_metadata: metadata(),
                captured_at: 1,
            })
            .expect_err("malformed active series setting must be reported");
        assert!(matches!(error, RepositoryError::InvalidDocument(_)));
    }

    #[test]
    fn rejects_invalid_hashes_and_persisted_numeric_values_without_panicking() {
        assert!(matches!(
            super::blob_path(Path::new("/blobs"), "short", "png"),
            Err(RepositoryError::MissingBlob { .. })
        ));
        assert!(matches!(
            super::sqlite_byte_size(u64::MAX),
            Err(RepositoryError::InvalidImage)
        ));
        assert!(matches!(
            super::byte_size_from_database(-1),
            Err(RepositoryError::Database(_))
        ));
        assert!(matches!(
            super::json_u32(Some(u64::MAX), "source width"),
            Err(RepositoryError::InvalidDocument(_))
        ));
    }
}
