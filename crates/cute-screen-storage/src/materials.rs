//! Durable user assets and style snapshots, independently owned from captures.
use super::*;

#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct MaterialRecord {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub value_json: String,
    #[ts(type = "number")]
    pub byte_size: u64,
}

impl LibraryRepository {
    pub fn put_material(
        &self,
        id: String,
        title: String,
        kind: String,
        value: String,
    ) -> Result<(), RepositoryError> {
        self.call(move |state| state.put_material(&id, &title, &kind, &value))
    }
    pub fn list_materials(&self) -> Result<Vec<MaterialRecord>, RepositoryError> {
        self.call(StorageState::list_materials)
    }
    pub fn remove_material(&self, id: String) -> Result<(), RepositoryError> {
        self.call(move |state| state.remove_material(&id))
    }
}
impl StorageHandle {
    pub async fn put_material(
        &self,
        id: String,
        title: String,
        kind: String,
        value: String,
    ) -> Result<(), RepositoryError> {
        self.call(move |state| state.put_material(&id, &title, &kind, &value))
            .await
    }
    pub async fn list_materials(&self) -> Result<Vec<MaterialRecord>, RepositoryError> {
        self.call(StorageState::list_materials).await
    }
    pub async fn remove_material(&self, id: String) -> Result<(), RepositoryError> {
        self.call(move |state| state.remove_material(&id)).await
    }
}
impl StorageState {
    fn put_material(
        &mut self,
        id: &str,
        title: &str,
        kind: &str,
        value: &str,
    ) -> Result<(), RepositoryError> {
        if id.is_empty()
            || id.len() > 256
            || title.is_empty()
            || title.len() > 512
            || value.len() > 1024 * 1024
            || !["background", "logo", "gradient", "preset"].contains(&kind)
        {
            return Err(RepositoryError::InvalidDocument(
                "invalid material metadata".into(),
            ));
        }
        let parsed: Value = serde_json::from_str(value)
            .map_err(|e| RepositoryError::InvalidDocument(e.to_string()))?;
        let mut hashes = BTreeSet::new();
        collect_blob_hashes(&parsed, &mut hashes);
        for hash in &hashes {
            self.blob_path_checked(hash)?;
        }
        let transaction = self.connection.transaction()?;
        transaction.execute("INSERT INTO user_materials(id,title,kind,value_json,updated_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,value_json=excluded.value_json,updated_at=excluded.updated_at", params![id,title,kind,value,now_millis()?])?;
        transaction.execute(
            "DELETE FROM blob_references WHERE owner_kind='material' AND owner_id=?1",
            [id],
        )?;
        for hash in hashes {
            transaction.execute("INSERT INTO blob_references(owner_kind,owner_id,role,blob_hash) VALUES('material',?1,'asset',?2)", params![id,hash])?;
        }
        transaction.commit()?;
        Ok(())
    }
    fn list_materials(&mut self) -> Result<Vec<MaterialRecord>, RepositoryError> {
        let mut statement = self.connection.prepare("SELECT m.id,m.title,m.kind,m.value_json,COALESCE((SELECT SUM(b.byte_size) FROM blobs b JOIN blob_references r ON b.hash=r.blob_hash WHERE r.owner_kind='material' AND r.owner_id=m.id),0) FROM user_materials m ORDER BY m.updated_at DESC,m.id")?;
        Ok(statement
            .query_map([], |row| {
                Ok(MaterialRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    kind: row.get(2)?,
                    value_json: row.get(3)?,
                    byte_size: row.get::<_, i64>(4)?.max(0).cast_unsigned(),
                })
            })?
            .collect::<Result<_, _>>()?)
    }
    fn remove_material(&mut self, id: &str) -> Result<(), RepositoryError> {
        let blobs = self.connection.prepare("SELECT b.hash,b.format FROM blobs b JOIN blob_references r ON b.hash=r.blob_hash WHERE r.owner_kind='material' AND r.owner_id=?1")?.query_map([id], |row| Ok((row.get(0)?,row.get(1)?)))?.collect::<Result<Vec<(String,String)>,_>>()?;
        let files = crate::history::CleanupJournal {
            blobs,
            thumbnails: vec![],
            derivatives: vec![],
        };
        let transaction = self.connection.transaction()?;
        transaction.execute("INSERT INTO recovery_journal(operation_id,kind,state,payload_json,created_at,updated_at) VALUES(?1,'historyCleanup','cleanupCommitted',?2,?3,?3)", params![Uuid::now_v7().to_string(),serde_json::to_string(&files).map_err(|e| RepositoryError::InvalidDocument(e.to_string()))?,now_millis()?])?;
        transaction.execute("DELETE FROM user_materials WHERE id=?1", [id])?;
        transaction.execute(
            "DELETE FROM blob_references WHERE owner_kind='material' AND owner_id=?1",
            [id],
        )?;
        transaction.commit()?;
        // Physical deletion is deferred to the journaled unreferenced-blob maintenance.
        Ok(())
    }
}
