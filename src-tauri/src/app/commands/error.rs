use serde::Serialize;
use ts_rs::TS;

use crate::platform::{PlatformError, PlatformErrorCode};
use crate::storage::RepositoryError;

/// Stable error envelope for rejected Tauri commands. Expected user
/// cancellation is represented by a command outcome and never by this type.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CommandErrorV1 {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
    pub correlation_id: String,
}

impl CommandErrorV1 {
    pub fn internal(message: impl Into<String>, correlation_id: impl Into<String>) -> Self {
        Self {
            code: "internal".to_owned(),
            message: message.into(),
            recoverable: true,
            correlation_id: correlation_id.into(),
        }
    }
}

impl From<RepositoryError> for CommandErrorV1 {
    fn from(error: RepositoryError) -> Self {
        let recoverable = matches!(
            error,
            RepositoryError::WorkerBusy
                | RepositoryError::WorkerStopped
                | RepositoryError::RevisionConflict
                | RepositoryError::PermissionDenied
                | RepositoryError::NoSpace
                | RepositoryError::Io(_)
                | RepositoryError::Database(_)
        );
        let code = match &error {
            RepositoryError::ImageTooLarge => "imageTooLarge",
            RepositoryError::InvalidImage => "invalidImage",
            RepositoryError::InvalidDocument(_) => "invalidDocument",
            RepositoryError::NewerSchema { .. } => "newerSchema",
            RepositoryError::OlderSchema { .. } => "olderSchema",
            RepositoryError::UnsupportedDatabaseSchema { .. } => "unsupportedDatabaseSchema",
            RepositoryError::MigrationIntegrity(_) => "migrationIntegrity",
            RepositoryError::InjectedFault { .. } => "injectedFault",
            RepositoryError::MissingBlob { .. } => "missingBlob",
            RepositoryError::RevisionConflict => "revisionConflict",
            RepositoryError::PermissionDenied => "permissionDenied",
            RepositoryError::NoSpace => "noSpace",
            RepositoryError::InvalidRecoveryBundle(_) => "invalidRecoveryBundle",
            RepositoryError::Io(_) => "storageIo",
            RepositoryError::Database(_) => "storageDatabase",
            RepositoryError::WorkerStopped => "storageWorkerStopped",
            RepositoryError::WorkerBusy => "storageWorkerBusy",
        };
        Self {
            code: code.to_owned(),
            message: error.to_string(),
            recoverable,
            correlation_id: "storage".to_owned(),
        }
    }
}

impl From<PlatformError> for CommandErrorV1 {
    fn from(error: PlatformError) -> Self {
        let code = match error.code {
            PlatformErrorCode::Cancelled => "cancelled",
            PlatformErrorCode::Busy => "busy",
            PlatformErrorCode::PortalUnavailable => "portalUnavailable",
            PlatformErrorCode::PortalTooOld => "portalTooOld",
            PlatformErrorCode::InvalidUri => "invalidUri",
            PlatformErrorCode::InvalidTarget => "invalidTarget",
            PlatformErrorCode::PermissionDenied => "permissionDenied",
            PlatformErrorCode::CaptureFailed => "captureFailed",
            PlatformErrorCode::StorageFailed => "storageFailed",
            PlatformErrorCode::ShortcutUnavailable => "shortcutUnavailable",
            PlatformErrorCode::ShortcutBindCancelled => "shortcutBindCancelled",
        };
        let recoverable = matches!(
            error.code,
            PlatformErrorCode::Busy
                | PlatformErrorCode::PortalUnavailable
                | PlatformErrorCode::CaptureFailed
                | PlatformErrorCode::StorageFailed
                | PlatformErrorCode::ShortcutUnavailable
        );
        Self {
            code: code.to_owned(),
            message: error.to_string(),
            recoverable,
            correlation_id: error.correlation_id,
        }
    }
}

impl From<String> for CommandErrorV1 {
    fn from(message: String) -> Self {
        Self::internal(message, "desktop-command")
    }
}

impl From<&str> for CommandErrorV1 {
    fn from(message: &str) -> Self {
        Self::internal(message, "desktop-command")
    }
}

impl From<std::io::Error> for CommandErrorV1 {
    fn from(error: std::io::Error) -> Self {
        RepositoryError::from(error).into()
    }
}

#[cfg(test)]
mod tests {
    use super::CommandErrorV1;
    use crate::platform::{PlatformError, PlatformErrorCode};

    #[test]
    fn platform_error_keeps_its_correlation_id() {
        let error = CommandErrorV1::from(PlatformError::new(
            PlatformErrorCode::PermissionDenied,
            "capture-42",
        ));
        assert_eq!(error.correlation_id, "capture-42");
    }
}
