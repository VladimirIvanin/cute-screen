use crate::{
    CommandResult,
    app::commands::error::CommandErrorV1,
    storage::{RepositoryError, StorageHandle},
};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

pub const DEFAULT_PATTERN: &str = "{date}_{time}_Скриншот";
const SETTING_KEY: &str = "export.filename.v1";

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ExportFilenameSettings {
    pub pattern: String,
    pub default_pattern: String,
    pub preview: String,
}

#[derive(Serialize, Deserialize)]
struct SavedPattern {
    pattern: String,
}

fn validate_pattern(pattern: &str) -> Result<(), &'static str> {
    if pattern.is_empty() || pattern.len() > 160 {
        return Err("filenameLength");
    }
    if pattern.chars().any(char::is_whitespace) {
        return Err("filenameWhitespace");
    }
    if pattern
        .chars()
        .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
    {
        return Err("filenameCharacters");
    }
    if !pattern.contains("{date}") || !pattern.contains("{time}") {
        return Err("filenameTokens");
    }
    let expanded = pattern
        .replace("{date}", "2000-01-01")
        .replace("{time}", "00-00-00");
    if expanded.contains(['{', '}']) {
        return Err("filenameUnknownToken");
    }
    if expanded.len() > 240 {
        return Err("filenameLength");
    }
    if pattern.to_ascii_lowercase().ends_with(".png") {
        return Err("filenameExtension");
    }
    Ok(())
}

fn format_pattern(pattern: &str, local: chrono::NaiveDateTime) -> Result<String, &'static str> {
    validate_pattern(pattern)?;
    Ok(format!(
        "{}.png",
        pattern
            .replace("{date}", &local.format("%Y-%m-%d").to_string())
            .replace("{time}", &local.format("%H-%M-%S").to_string())
    ))
}

async fn load_pattern(repository: &StorageHandle) -> Result<String, RepositoryError> {
    let saved = repository.get_setting(SETTING_KEY.into()).await?;
    Ok(saved
        .and_then(|json| serde_json::from_str::<SavedPattern>(&json).ok())
        .filter(|saved| validate_pattern(&saved.pattern).is_ok())
        .map_or_else(|| DEFAULT_PATTERN.to_owned(), |saved| saved.pattern))
}

async fn save_pattern(repository: &StorageHandle, pattern: &str) -> Result<(), RepositoryError> {
    validate_pattern(pattern)
        .map_err(|message| RepositoryError::InvalidDocument(message.into()))?;
    let json = serde_json::to_string(&SavedPattern {
        pattern: pattern.into(),
    })
    .map_err(|error| RepositoryError::InvalidDocument(error.to_string()))?;
    repository.put_setting(SETTING_KEY.into(), 1, json).await
}

pub async fn suggested_png_name(repository: &StorageHandle) -> Result<String, RepositoryError> {
    format_pattern(
        &load_pattern(repository).await?,
        chrono::Local::now().naive_local(),
    )
    .map_err(|message| RepositoryError::InvalidDocument(message.into()))
}

fn invalid_pattern(message: &str) -> CommandErrorV1 {
    CommandErrorV1 {
        code: "invalidFilenamePattern".into(),
        message: message.into(),
        recoverable: true,
        correlation_id: "export-filename".into(),
    }
}

fn snapshot(pattern: String) -> CommandResult<ExportFilenameSettings> {
    let preview =
        format_pattern(&pattern, chrono::Local::now().naive_local()).map_err(invalid_pattern)?;
    Ok(ExportFilenameSettings {
        pattern,
        preview,
        default_pattern: DEFAULT_PATTERN.into(),
    })
}

#[tauri::command]
pub async fn export_filename_get(
    repository: State<'_, StorageHandle>,
) -> CommandResult<ExportFilenameSettings> {
    snapshot(load_pattern(&repository).await?)
}

#[tauri::command]
pub fn export_filename_preview(pattern: String) -> CommandResult<String> {
    format_pattern(&pattern, chrono::Local::now().naive_local()).map_err(invalid_pattern)
}

#[tauri::command]
pub async fn export_filename_save(
    pattern: String,
    repository: State<'_, StorageHandle>,
) -> CommandResult<ExportFilenameSettings> {
    validate_pattern(&pattern).map_err(invalid_pattern)?;
    save_pattern(&repository, &pattern).await?;
    snapshot(pattern)
}

#[cfg(test)]
mod tests {
    #[test]
    fn screenshot_name_uses_local_calendar_fields_and_windows_safe_time() {
        let local = chrono::NaiveDate::from_ymd_opt(2026, 1, 2)
            .expect("date")
            .and_hms_opt(3, 4, 5)
            .expect("time");
        assert_eq!(
            super::format_pattern(super::DEFAULT_PATTERN, local).expect("default"),
            "2026-01-02_03-04-05_Скриншот.png"
        );
        assert_eq!(
            super::format_pattern("Работа_{date}_{time}", local).expect("custom"),
            "Работа_2026-01-02_03-04-05.png"
        );
    }

    #[test]
    fn invalid_patterns_cannot_be_saved_as_paths_or_ambiguous_names() {
        for pattern in [
            "",
            "hello",
            "{date}",
            "{time}",
            "{date} {time}",
            "../{date}_{time}",
            "{date}:{time}",
            "{date}_{time}_{unknown}",
            "{date}_{time}.png",
            "{date}_{time}\n",
        ] {
            assert!(
                super::validate_pattern(pattern).is_err(),
                "accepted {pattern:?}"
            );
        }
    }

    #[test]
    fn saved_pattern_survives_repository_reopen_and_invalid_save_preserves_it() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async {
                let root = tempfile::tempdir().expect("root");
                let cache = tempfile::tempdir().expect("cache");
                let repository =
                    crate::storage::LibraryRepository::initialize(root.path(), cache.path())
                        .expect("repository");
                let handle = repository.handle();
                super::save_pattern(&handle, "Работа_{date}_{time}")
                    .await
                    .expect("saved");
                assert!(super::save_pattern(&handle, "bad name").await.is_err());
                drop(handle);
                drop(repository);
                let reopened =
                    crate::storage::LibraryRepository::initialize(root.path(), cache.path())
                        .expect("reopened");
                assert_eq!(
                    super::load_pattern(&reopened.handle())
                        .await
                        .expect("loaded"),
                    "Работа_{date}_{time}"
                );
            });
    }
}
