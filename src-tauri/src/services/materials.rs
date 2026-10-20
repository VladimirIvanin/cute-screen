use crate::{
    CommandResult,
    storage::{StorageHandle, materials::MaterialRecord},
};
use tauri::State;

#[tauri::command]
pub async fn materials_list(
    repository: State<'_, StorageHandle>,
) -> CommandResult<Vec<MaterialRecord>> {
    Ok(repository.list_materials().await?)
}
#[tauri::command]
pub async fn materials_put(
    repository: State<'_, StorageHandle>,
    id: String,
    title: String,
    kind: String,
    value_json: String,
) -> CommandResult<()> {
    Ok(repository.put_material(id, title, kind, value_json).await?)
}
#[tauri::command]
pub async fn materials_remove(
    repository: State<'_, StorageHandle>,
    id: String,
) -> CommandResult<()> {
    Ok(repository.remove_material(id).await?)
}
