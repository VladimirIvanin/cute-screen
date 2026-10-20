//! Bounded recent-history metadata and explicitly journalled maintenance.
use super::*;
use std::collections::BTreeMap;

const MIB: u64 = 1024 * 1024;
const THUMBNAIL_BUDGET: u64 = 32 * MIB;
const DAY: i64 = 86_400_000;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPolicy {
    pub days: u32,
    pub max_mib: u32,
    pub max_captures: u32,
}
impl Default for HistoryPolicy {
    fn default() -> Self {
        Self {
            days: 7,
            max_mib: 512,
            max_captures: 200,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryViewport {
    pub zoom: f64,
    pub mode: String,
    pub scroll_left: f64,
    pub scroll_top: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCursor {
    #[ts(type = "number")]
    pub captured_at: i64,
    pub capture_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RecentCapture {
    pub capture_id: String,
    pub document_id: String,
    #[ts(type = "number")]
    pub captured_at: i64,
    #[ts(type = "number")]
    pub revision: i64,
    pub width: u32,
    pub height: u32,
    pub protected: bool,
    pub legacy_pending: bool,
    pub has_thumbnail: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<RecentCapture>,
    pub next_cursor: Option<HistoryCursor>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StorageReport {
    #[ts(type = "number")]
    pub originals_bytes: u64,
    #[ts(type = "number")]
    pub documents_bytes: u64,
    #[ts(type = "number")]
    pub cache_bytes: u64,
    #[ts(type = "number")]
    pub materials_bytes: u64,
    #[ts(type = "number")]
    pub database_bytes: u64,
    #[ts(type = "number")]
    pub database_reusable_bytes: u64,
    #[ts(type = "number")]
    pub total_bytes: u64,
    pub capture_count: u32,
    pub protected_count: u32,
    pub legacy_pending_count: u32,
    pub over_limit: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPlan {
    pub token: String,
    pub capture_ids: Vec<String>,
    #[ts(type = "number")]
    pub reclaimable_bytes: u64,
    pub clear_cache: bool,
    pub include_legacy: bool,
    pub legacy_count: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HistoryRequest {
    List {
        cursor: Option<HistoryCursor>,
    },
    Open {
        capture_id: String,
    },
    Activate {
        capture_id: String,
    },
    Release {
        capture_id: String,
    },
    SaveViewport {
        capture_id: String,
        viewport: HistoryViewport,
    },
    Protect {
        capture_id: String,
        protected: bool,
    },
    Report,
    Policy,
    SetPolicy {
        policy: HistoryPolicy,
    },
    Preview {
        capture_ids: Option<Vec<String>>,
        include_legacy: bool,
        clear_cache: bool,
    },
    Commit {
        token: String,
    },
    Maintain,
    Deactivate,
}
#[derive(Debug, Clone, Serialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HistoryResponse {
    Page {
        page: HistoryPage,
    },
    Opened {
        document: OpenDocument,
        viewport: Option<HistoryViewport>,
    },
    Report {
        report: StorageReport,
    },
    Policy {
        policy: HistoryPolicy,
    },
    Plan {
        plan: CleanupPlan,
    },
    Cleaned {
        #[ts(type = "number")]
        freed_bytes: u64,
        removed_count: u32,
        report: StorageReport,
    },
    Done,
}

pub(crate) struct PendingPlan {
    plan: CleanupPlan,
    fingerprint: String,
    created_at: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct CleanupJournal {
    pub(super) blobs: Vec<(String, String)>,
    pub(super) thumbnails: Vec<String>,
    pub(super) derivatives: Vec<(String, String)>,
}

impl LibraryRepository {
    pub fn history(&self, request: HistoryRequest) -> Result<HistoryResponse, RepositoryError> {
        self.call(move |state| state.history(request))
    }
}
impl StorageHandle {
    pub async fn history(
        &self,
        request: HistoryRequest,
        leased_blobs: BTreeSet<String>,
    ) -> Result<HistoryResponse, RepositoryError> {
        self.call(move |state| {
            state.history_leased_blobs = leased_blobs;
            state.history(request)
        })
        .await
    }
    pub async fn write_history_thumbnail(
        &self,
        document_id: String,
        revision: i64,
        bytes: Vec<u8>,
    ) -> Result<(), RepositoryError> {
        self.call(move |state| state.write_history_thumbnail(&document_id, revision, &bytes))
            .await
    }
    pub async fn history_thumbnail(
        &self,
        capture_id: String,
        revision: i64,
    ) -> Result<Option<AuthorizedBlobSource>, RepositoryError> {
        self.call(move |state| state.history_thumbnail(&capture_id, revision))
            .await
    }
}
impl StorageState {
    pub(crate) fn history(
        &mut self,
        request: HistoryRequest,
    ) -> Result<HistoryResponse, RepositoryError> {
        match request {
            HistoryRequest::Deactivate => {
                self.history_leases.clear();
                self.connection.execute(
                    "DELETE FROM settings WHERE key='session.activeCaptureId'",
                    [],
                )?;
                Ok(HistoryResponse::Done)
            }
            HistoryRequest::List { cursor } => Ok(HistoryResponse::Page {
                page: self.recent_page(cursor)?,
            }),
            HistoryRequest::Open { capture_id } => {
                let document = self.open_capture(&capture_id)?;
                let viewport = self
                    .connection
                    .query_row(
                        "SELECT viewport_json FROM captures WHERE id = ?1",
                        [&capture_id],
                        |row| row.get::<_, Option<String>>(0),
                    )?
                    .map(|value| from_json(&value))
                    .transpose()?;
                self.history_leases.insert(capture_id);
                Ok(HistoryResponse::Opened { document, viewport })
            }
            HistoryRequest::Activate { capture_id } => {
                let exists = self
                    .connection
                    .query_row(
                        "SELECT 1 FROM captures WHERE id = ?1 AND deleted_at IS NULL",
                        [&capture_id],
                        |_| Ok(()),
                    )
                    .optional()?
                    .is_some();
                if !exists {
                    return Err(conflict("capture is no longer available"));
                }
                self.put_setting("session.activeCaptureId", 1, &json(&capture_id)?)?;
                self.history_leases.clear();
                self.history_leases.insert(capture_id);
                Ok(HistoryResponse::Done)
            }
            HistoryRequest::Release { capture_id } => {
                if self.active_capture()?.as_deref() != Some(&capture_id) {
                    self.history_leases.remove(&capture_id);
                }
                Ok(HistoryResponse::Done)
            }
            HistoryRequest::SaveViewport {
                capture_id,
                viewport,
            } => {
                if !viewport.zoom.is_finite()
                    || !(10.0..=1600.0).contains(&viewport.zoom)
                    || ![viewport.scroll_left, viewport.scroll_top]
                        .iter()
                        .all(|v| v.is_finite() && *v >= 0.0)
                    || !matches!(viewport.mode.as_str(), "fit" | "custom")
                {
                    return Err(invalid("invalid viewport"));
                }
                self.connection.execute(
                    "UPDATE captures SET viewport_json = ?2 WHERE id = ?1 AND deleted_at IS NULL",
                    params![capture_id, json(&viewport)?],
                )?;
                Ok(HistoryResponse::Done)
            }
            HistoryRequest::Protect {
                capture_id,
                protected,
            } => {
                self.connection.execute("UPDATE captures SET history_protected = ?2 WHERE id = ?1 AND deleted_at IS NULL", params![capture_id, protected])?;
                Ok(HistoryResponse::Done)
            }
            HistoryRequest::Policy => Ok(HistoryResponse::Policy {
                policy: self.history_policy()?,
            }),
            HistoryRequest::SetPolicy { policy } => {
                if ![1, 7, 30].contains(&policy.days)
                    || ![256, 512, 1024].contains(&policy.max_mib)
                    || ![100, 200, 1000].contains(&policy.max_captures)
                {
                    return Err(invalid("invalid history policy"));
                }
                self.put_setting("history.policy", 1, &json(&policy)?)?;
                Ok(HistoryResponse::Policy { policy })
            }
            HistoryRequest::Report => Ok(HistoryResponse::Report {
                report: self.storage_report()?,
            }),
            HistoryRequest::Preview {
                capture_ids,
                include_legacy,
                clear_cache,
            } => {
                self.history_plans.retain(|_, value| {
                    now_millis().is_ok_and(|now| now - value.created_at < 600_000)
                });
                if self.history_plans.len() >= 8 {
                    self.history_plans.clear();
                }
                let ids = if clear_cache {
                    Vec::new()
                } else if let Some(ids) = capture_ids {
                    ids
                } else {
                    self.automatic_candidates(include_legacy)?
                };
                let plan = self.cleanup_plan(ids, include_legacy, clear_cache)?;
                let fingerprint = self.history_fingerprint()?;
                self.history_plans.insert(
                    plan.token.clone(),
                    PendingPlan {
                        plan: plan.clone(),
                        fingerprint,
                        created_at: now_millis()?,
                    },
                );
                Ok(HistoryResponse::Plan { plan })
            }
            HistoryRequest::Commit { token } => {
                let pending = self
                    .history_plans
                    .remove(&token)
                    .ok_or_else(|| conflict("cleanup preview expired; review again"))?;
                if now_millis()? - pending.created_at > 600_000
                    || pending.fingerprint != self.history_fingerprint()?
                {
                    return Err(conflict("history changed; review cleanup again"));
                }
                let plan = self.cleanup_plan(
                    pending.plan.capture_ids.clone(),
                    pending.plan.include_legacy,
                    pending.plan.clear_cache,
                )?;
                if plan.reclaimable_bytes != pending.plan.reclaimable_bytes {
                    return Err(conflict("storage changed; review cleanup again"));
                }
                self.perform_cleanup(plan)
            }
            HistoryRequest::Maintain => {
                self.recover_history_cleanup()?;
                let ids = self.automatic_candidates(false)?;
                let plan = self.cleanup_plan(ids, false, false)?;
                self.perform_cleanup(plan)
            }
        }
    }

    fn active_capture(&mut self) -> Result<Option<String>, RepositoryError> {
        self.get_setting("session.activeCaptureId")?
            .map(|value| from_json(&value))
            .transpose()
    }
    fn history_policy(&mut self) -> Result<HistoryPolicy, RepositoryError> {
        Ok(self
            .get_setting("history.policy")?
            .map(|value| from_json(&value))
            .transpose()?
            .unwrap_or_default())
    }
    pub(crate) fn open_capture(&mut self, id: &str) -> Result<OpenDocument, RepositoryError> {
        let document = self.connection.query_row("SELECT d.id, d.capture_id, d.revision, d.content_json, c.original_blob_hash FROM documents d JOIN captures c ON c.id = d.capture_id WHERE c.id = ?1 AND c.deleted_at IS NULL", [id], |row| Ok(OpenDocument { document_id: row.get(0)?, capture_id: row.get(1)?, revision: row.get(2)?, document_json: row.get(3)?, source_hash: row.get(4)?, image_token: None })).optional()?.ok_or_else(|| conflict("capture is no longer available"))?;
        validate_document(&document.document_json)?;
        Ok(document)
    }
    fn recent_page(
        &mut self,
        cursor: Option<HistoryCursor>,
    ) -> Result<HistoryPage, RepositoryError> {
        let mut statement = self.connection.prepare("SELECT c.id, d.id, c.captured_at, d.revision, b.width, b.height, c.history_protected, c.history_legacy_pending, EXISTS(SELECT 1 FROM history_thumbnails t WHERE t.document_id = d.id AND t.revision = d.revision) FROM captures c JOIN documents d ON d.capture_id = c.id JOIN blobs b ON b.hash = c.original_blob_hash WHERE c.deleted_at IS NULL AND (?1 IS NULL OR c.captured_at < ?1 OR (c.captured_at = ?1 AND c.id < ?2)) ORDER BY c.captured_at DESC, c.id DESC LIMIT 51")?;
        let mut items = statement
            .query_map(
                params![
                    cursor.as_ref().map(|v| v.captured_at),
                    cursor.as_ref().map(|v| v.capture_id.as_str())
                ],
                |row| {
                    Ok(RecentCapture {
                        capture_id: row.get(0)?,
                        document_id: row.get(1)?,
                        captured_at: row.get(2)?,
                        revision: row.get(3)?,
                        width: row.get(4)?,
                        height: row.get(5)?,
                        protected: row.get(6)?,
                        legacy_pending: row.get(7)?,
                        has_thumbnail: row.get(8)?,
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if items.len() > 50 {
            items.truncate(50);
            items.last().map(|v| HistoryCursor {
                captured_at: v.captured_at,
                capture_id: v.capture_id.clone(),
            })
        } else {
            None
        };
        Ok(HistoryPage { items, next_cursor })
    }
    fn storage_report(&mut self) -> Result<StorageReport, RepositoryError> {
        let sum = |sql: &str| -> Result<u64, RepositoryError> {
            Ok(self
                .connection
                .query_row(sql, [], |r| r.get::<_, i64>(0))?
                .max(0)
                .cast_unsigned())
        };
        let materials_bytes = sum(
            "SELECT coalesce(sum(b.byte_size),0) FROM blobs b WHERE EXISTS(SELECT 1 FROM blob_references r WHERE r.blob_hash=b.hash AND r.owner_kind='material')",
        )?;
        let originals_bytes =
            sum("SELECT coalesce(sum(byte_size),0) FROM blobs")?.saturating_sub(materials_bytes);
        let documents_bytes =
            sum("SELECT coalesce(sum(length(CAST(content_json AS BLOB))),0) FROM documents")?;
        let cache_bytes = sum("SELECT coalesce(sum(byte_size),0) FROM history_thumbnails")?
            + sum("SELECT coalesce(sum(byte_size),0) FROM blob_derivatives")?;
        let database_reusable_bytes = sum("PRAGMA freelist_count")? * sum("PRAGMA page_size")?;
        let database_bytes = [
            "library.sqlite3",
            "library.sqlite3-wal",
            "library.sqlite3-shm",
        ]
        .iter()
        .try_fold(0_u64, |total, name| -> Result<u64, RepositoryError> {
            Ok(total + file_size(&self.library_root.join(name))?)
        })?;
        let (capture_count, protected_count, legacy_pending_count) = self.connection.query_row("SELECT count(*), coalesce(sum(history_protected),0), coalesce(sum(history_legacy_pending),0) FROM captures WHERE deleted_at IS NULL", [], |r| Ok((r.get::<_,u32>(0)?, r.get::<_,u32>(1)?, r.get::<_,u32>(2)?)))?;
        let total_bytes = originals_bytes + materials_bytes + cache_bytes + database_bytes;
        let policy = self.history_policy()?;
        Ok(StorageReport {
            originals_bytes,
            materials_bytes,
            documents_bytes,
            cache_bytes,
            database_bytes,
            database_reusable_bytes,
            total_bytes,
            capture_count,
            protected_count,
            legacy_pending_count,
            over_limit: total_bytes.saturating_sub(materials_bytes)
                > u64::from(policy.max_mib) * MIB
                || capture_count > policy.max_captures,
        })
    }
    fn history_fingerprint(&mut self) -> Result<String, RepositoryError> {
        let rows = self.connection.prepare("SELECT c.id, c.history_protected, c.history_legacy_pending, c.deleted_at, d.revision FROM captures c JOIN documents d ON d.capture_id = c.id ORDER BY c.id")?.query_map([], |r| Ok((r.get::<_,String>(0)?, r.get::<_,bool>(1)?, r.get::<_,bool>(2)?, r.get::<_,Option<i64>>(3)?, r.get::<_,i64>(4)?)))?.collect::<Result<Vec<_>,_>>()?;
        let cache = self
            .connection
            .prepare(
                "SELECT cache_name,revision,byte_size FROM history_thumbnails ORDER BY cache_name",
            )?
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let active = self.active_capture()?;
        let policy = self.history_policy()?;
        Ok(sha256_hex(
            json(&(
                rows,
                cache,
                active,
                &self.history_leases,
                &self.history_leased_blobs,
                policy,
            ))?
            .as_bytes(),
        ))
    }
    fn automatic_candidates(
        &mut self,
        include_legacy: bool,
    ) -> Result<Vec<String>, RepositoryError> {
        let policy = self.history_policy()?;
        let report = self.storage_report()?;
        let active = self.active_capture()?;
        let rows = self.connection.prepare("SELECT id,captured_at,history_protected,history_legacy_pending FROM captures WHERE deleted_at IS NULL ORDER BY captured_at,id")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,bool>(2)?,r.get::<_,bool>(3)?)))?.collect::<Result<Vec<_>,_>>()?;
        // Count distinct capture owners once, rather than rescanning all files for each candidate.
        let references = self.connection.prepare("SELECT r.blob_hash, CASE WHEN r.owner_kind='capture' THEN r.owner_id ELSE d.capture_id END, b.byte_size FROM blob_references r JOIN blobs b ON b.hash=r.blob_hash LEFT JOIN documents d ON r.owner_kind='document' AND d.id=r.owner_id UNION ALL SELECT c.original_blob_hash,c.id,b.byte_size FROM captures c JOIN blobs b ON b.hash=c.original_blob_hash")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,Option<String>>(1)?,r.get::<_,i64>(2)?.max(0).cast_unsigned())))?.collect::<Result<Vec<_>,_>>()?;
        let mut owners = BTreeMap::<String, BTreeSet<String>>::new();
        let mut hashes = BTreeMap::<String, BTreeSet<String>>::new();
        let mut sizes = BTreeMap::new();
        for (hash, owner, size) in references {
            let owner = owner.unwrap_or_else(|| "!external-reference".into());
            owners
                .entry(hash.clone())
                .or_default()
                .insert(owner.clone());
            hashes.entry(owner).or_default().insert(hash.clone());
            sizes.insert(hash, size);
        }
        for hash in &self.history_leased_blobs {
            owners
                .entry(hash.clone())
                .or_default()
                .insert("!live-resource".into());
        }
        let thumb_sizes = self.connection.prepare("SELECT d.capture_id,t.byte_size FROM history_thumbnails t JOIN documents d ON d.id=t.document_id")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?.max(0).cast_unsigned())))?.collect::<Result<BTreeMap<_,_>,_>>()?;
        let cutoff = now_millis()? - i64::from(policy.days) * DAY;
        let mut remaining = report.capture_count;
        let mut selected = Vec::new();
        let mut reclaimed: u64 = 0;
        for (id, at, protected, legacy) in rows {
            if protected
                || (legacy && !include_legacy)
                || active.as_deref() == Some(&id)
                || self.history_leases.contains(&id)
            {
                continue;
            }
            if at < cutoff
                || remaining > policy.max_captures
                || report
                    .total_bytes
                    .saturating_sub(report.materials_bytes)
                    .saturating_sub(reclaimed)
                    > u64::from(policy.max_mib) * MIB
            {
                for hash in hashes.get(&id).into_iter().flatten() {
                    if let Some(references) = owners.get_mut(hash) {
                        references.remove(&id);
                        if references.is_empty() {
                            reclaimed += sizes.get(hash).copied().unwrap_or_default();
                        }
                    }
                }
                reclaimed += thumb_sizes.get(&id).copied().unwrap_or_default();
                selected.push(id);
                remaining = remaining.saturating_sub(1);
            }
        }
        Ok(selected)
    }
    fn cleanup_plan(
        &mut self,
        ids: Vec<String>,
        include_legacy: bool,
        clear_cache: bool,
    ) -> Result<CleanupPlan, RepositoryError> {
        let active = self.active_capture()?;
        let mut unique = BTreeSet::new();
        for id in ids {
            if active.as_deref() == Some(&id) || self.history_leases.contains(&id) {
                return Err(conflict("active or loading capture cannot be deleted"));
            }
            let exists = self
                .connection
                .query_row(
                    "SELECT 1 FROM captures WHERE id = ?1 AND deleted_at IS NULL",
                    [&id],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if !exists {
                return Err(conflict("capture is no longer available"));
            }
            unique.insert(id);
        }
        let capture_ids: Vec<_> = unique.into_iter().collect();
        let reclaimable_bytes = self.cleanup_files(&capture_ids, clear_cache)?.1;
        let legacy_count = self.storage_report()?.legacy_pending_count;
        Ok(CleanupPlan {
            token: Uuid::now_v7().to_string(),
            capture_ids,
            reclaimable_bytes,
            clear_cache,
            include_legacy,
            legacy_count,
        })
    }
    fn cleanup_files(
        &self,
        ids: &[String],
        clear_cache: bool,
    ) -> Result<(CleanupJournal, u64), RepositoryError> {
        let selected: BTreeSet<_> = ids.iter().cloned().collect();
        let refs = self.connection.prepare("SELECT r.blob_hash, r.owner_kind, r.owner_id, d.capture_id FROM blob_references r LEFT JOIN documents d ON r.owner_kind = 'document' AND d.id = r.owner_id")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?)))?.collect::<Result<Vec<_>,_>>()?;
        let mut candidates = BTreeSet::new();
        let mut retained = BTreeSet::new();
        for (hash, kind, owner, capture) in refs {
            if (kind == "document" && capture.is_some_and(|v| selected.contains(&v)))
                || (kind == "capture" && selected.contains(&owner))
            {
                candidates.insert(hash);
            } else {
                retained.insert(hash);
            }
        }
        // Capture foreign keys remain authoritative even if a legacy reference index is incomplete.
        let capture_sources = self
            .connection
            .prepare("SELECT id,original_blob_hash FROM captures")?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        for (capture, hash) in capture_sources {
            if selected.contains(&capture) {
                candidates.insert(hash);
            } else {
                retained.insert(hash);
            }
        }
        let mut blobs = Vec::new();
        let mut bytes = 0;
        for hash in candidates.difference(&retained) {
            let format: String = self.connection.query_row(
                "SELECT format FROM blobs WHERE hash = ?1",
                [hash],
                |r| r.get(0),
            )?;
            if !self.history_leased_blobs.contains(hash) {
                bytes += owned_size(
                    &self.blobs_root,
                    &blob_path(&self.blobs_root, hash, &format)?,
                )?;
            }
            blobs.push((hash.clone(), format));
        }
        let thumb_rows = self.connection.prepare("SELECT t.cache_name, d.capture_id FROM history_thumbnails t JOIN documents d ON d.id = t.document_id")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<Result<Vec<_>,_>>()?;
        let mut thumbnails = Vec::new();
        for (name, capture) in thumb_rows {
            if clear_cache || selected.contains(&capture) {
                bytes += owned_size(&self.resources_root, &self.thumbnail_path(&name)?)?;
                thumbnails.push(name);
            }
        }
        let derivative_rows = self
            .connection
            .prepare("SELECT source_hash,cache_path FROM blob_derivatives")?
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        let mut derivatives = Vec::new();
        for (hash, relative) in derivative_rows {
            if clear_cache || blobs.iter().any(|(candidate, _)| candidate == &hash) {
                bytes += owned_size(
                    &self.resources_root,
                    &self.derivative_cache_path(&hash, &relative)?,
                )?;
                derivatives.push((hash, relative));
            }
        }
        Ok((
            CleanupJournal {
                blobs,
                thumbnails,
                derivatives,
            },
            bytes,
        ))
    }
    fn perform_cleanup(&mut self, plan: CleanupPlan) -> Result<HistoryResponse, RepositoryError> {
        if plan.capture_ids.is_empty() && !plan.clear_cache && !plan.include_legacy {
            self.trim_thumbnails()?;
            return Ok(HistoryResponse::Cleaned {
                freed_bytes: 0,
                removed_count: 0,
                report: self.storage_report()?,
            });
        }
        let (files, _) = self.cleanup_files(&plan.capture_ids, plan.clear_cache)?;
        let operation = Uuid::now_v7().to_string();
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("INSERT INTO recovery_journal(operation_id,kind,state,payload_json,created_at,updated_at) VALUES(?1,'historyCleanup','cleanupCommitted',?2,?3,?3)", params![operation,json(&files)?,now_millis()?])?;
        for id in &plan.capture_ids {
            transaction.execute("DELETE FROM blob_references WHERE (owner_kind='document' AND owner_id IN(SELECT id FROM documents WHERE capture_id=?1)) OR (owner_kind='capture' AND owner_id=?1)", [id])?;
            transaction.execute("DELETE FROM history_thumbnails WHERE document_id IN(SELECT id FROM documents WHERE capture_id=?1)", [id])?;
            transaction.execute("DELETE FROM documents WHERE capture_id=?1", [id])?;
            transaction.execute("DELETE FROM captures WHERE id=?1", [id])?;
        }
        if plan.clear_cache {
            transaction.execute("DELETE FROM history_thumbnails", [])?;
        }
        if plan.include_legacy {
            transaction.execute("UPDATE captures SET history_legacy_pending=0", [])?;
        }
        self.fault_injector
            .checkpoint(StorageFaultPoint::BeforeCleanupCommit)?;
        transaction.commit()?;
        self.fault_injector
            .checkpoint(StorageFaultPoint::AfterCleanupCommit)?;
        let freed_bytes = self.finish_cleanup(&operation, &files)?;
        Ok(HistoryResponse::Cleaned {
            freed_bytes,
            removed_count: u32::try_from(plan.capture_ids.len())
                .map_err(|_| invalid("too many captures"))?,
            report: self.storage_report()?,
        })
    }
    fn finish_cleanup(
        &mut self,
        operation: &str,
        files: &CleanupJournal,
    ) -> Result<u64, RepositoryError> {
        let mut freed = 0;
        let mut deferred = false;
        for (hash, format) in &files.blobs {
            let referenced = self.connection.query_row(
                "SELECT (SELECT count(*) FROM blob_references WHERE blob_hash=?1) + (SELECT count(*) FROM captures WHERE original_blob_hash=?1)",
                [hash],
                |r| r.get::<_, i64>(0),
            )?;
            if referenced != 0 {
                continue;
            }
            if self.history_leased_blobs.contains(hash) {
                deferred = true;
                continue;
            }
            freed += remove_owned(
                &self.blobs_root,
                &blob_path(&self.blobs_root, hash, format)?,
            )?;
            let derivatives = self
                .connection
                .prepare("SELECT cache_path FROM blob_derivatives WHERE source_hash=?1")?
                .query_map([hash], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            for relative in derivatives {
                freed += remove_owned(
                    &self.resources_root,
                    &self.derivative_cache_path(hash, &relative)?,
                )?;
            }
            self.connection
                .execute("DELETE FROM blob_derivatives WHERE source_hash=?1", [hash])?;
            self.connection.execute("DELETE FROM blobs WHERE hash=?1 AND NOT EXISTS(SELECT 1 FROM captures WHERE original_blob_hash=?1)", [hash])?;
            self.fault_injector
                .checkpoint(StorageFaultPoint::CleanupFileRemoved)?;
        }
        for (hash, relative) in &files.derivatives {
            freed += remove_owned(
                &self.resources_root,
                &self.derivative_cache_path(hash, relative)?,
            )?;
            self.connection.execute(
                "DELETE FROM blob_derivatives WHERE source_hash=?1 AND cache_path=?2",
                params![hash, relative],
            )?;
        }
        for name in &files.thumbnails {
            freed += remove_owned(&self.resources_root, &self.thumbnail_path(name)?)?;
        }
        if !deferred {
            self.connection.execute(
                "DELETE FROM recovery_journal WHERE operation_id=?1",
                [operation],
            )?;
        }
        self.trim_thumbnails()?;
        Ok(freed)
    }
    pub(crate) fn recover_history_cleanup(&mut self) -> Result<(), RepositoryError> {
        let pending = self.connection.prepare("SELECT operation_id,payload_json FROM recovery_journal WHERE kind='historyCleanup'")?.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))?.collect::<Result<Vec<_>,_>>()?;
        for (id, payload) in pending {
            self.finish_cleanup(&id, &from_json(&payload)?)?;
        }
        Ok(())
    }
    fn thumbnail_path(&self, name: &str) -> Result<PathBuf, RepositoryError> {
        if !name.ends_with(".png") || !is_sha256(name.trim_end_matches(".png")) {
            return Err(RepositoryError::PermissionDenied);
        }
        Ok(self.resources_root.join("history").join(name))
    }
    pub(crate) fn write_history_thumbnail(
        &mut self,
        document_id: &str,
        revision: i64,
        bytes: &[u8],
    ) -> Result<(), RepositoryError> {
        if bytes.len() > 512 * 1024 {
            return Err(RepositoryError::ImageTooLarge);
        }
        let metadata = inspect_source_bytes(bytes)?;
        if metadata.format != "png" || metadata.width > 256 || metadata.height > 256 {
            return Err(RepositoryError::InvalidImage);
        }
        let current: i64 = self.connection.query_row(
            "SELECT revision FROM documents WHERE id=?1",
            [document_id],
            |r| r.get(0),
        )?;
        if current != revision {
            return Err(RepositoryError::RevisionConflict);
        }
        let name = format!(
            "{}.png",
            sha256_hex(format!("{document_id}:{revision}:renderer-v1").as_bytes())
        );
        let previous = self
            .connection
            .query_row(
                "SELECT cache_name FROM history_thumbnails WHERE document_id=?1",
                [document_id],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        let path = self.thumbnail_path(&name)?;
        let parent = path.parent().ok_or(RepositoryError::PermissionDenied)?;
        fs::create_dir_all(parent)?;
        verify_parent(&self.resources_root, &path)?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(parent).map_err(RepositoryError::from)?;
        temporary.write_all(bytes)?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(&path)
            .map_err(|e| RepositoryError::from(e.error))?;
        sync_directory(parent)?;
        self.connection.execute("INSERT INTO history_thumbnails(document_id,revision,cache_name,byte_size,width,height,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(document_id) DO UPDATE SET revision=excluded.revision,cache_name=excluded.cache_name,byte_size=excluded.byte_size,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at", params![document_id,revision,name,i64::try_from(bytes.len()).map_err(|_| RepositoryError::InvalidImage)?,metadata.width,metadata.height,now_millis()?])?;
        if let Some(previous) = previous.filter(|old| old != &name) {
            remove_owned(&self.resources_root, &self.thumbnail_path(&previous)?)?;
        }
        self.trim_thumbnails()
    }
    fn trim_thumbnails(&mut self) -> Result<(), RepositoryError> {
        let rows = self
            .connection
            .prepare(
                "SELECT cache_name,byte_size FROM history_thumbnails ORDER BY updated_at DESC",
            )?
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?.max(0).cast_unsigned(),
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut total = 0;
        for (name, size) in rows {
            total += size;
            if total > THUMBNAIL_BUDGET {
                remove_owned(&self.resources_root, &self.thumbnail_path(&name)?)?;
                self.connection.execute(
                    "DELETE FROM history_thumbnails WHERE cache_name=?1",
                    [&name],
                )?;
            }
        }
        let folder = self.resources_root.join("history");
        if folder.is_dir() {
            verify_parent(&self.resources_root, &folder.join("probe"))?;
            let indexed: BTreeSet<String> = self
                .connection
                .prepare("SELECT cache_name FROM history_thumbnails")?
                .query_map([], |r| r.get(0))?
                .collect::<Result<_, _>>()?;
            for entry in fs::read_dir(folder)? {
                let entry = entry?;
                let name = entry.file_name().to_string_lossy().into_owned();
                if self.thumbnail_path(&name).is_ok() && !indexed.contains(&name) {
                    remove_owned(&self.resources_root, &entry.path())?;
                }
            }
        }
        Ok(())
    }
    pub(crate) fn history_thumbnail(
        &mut self,
        capture_id: &str,
        revision: i64,
    ) -> Result<Option<AuthorizedBlobSource>, RepositoryError> {
        let row = self.connection.query_row("SELECT t.cache_name,t.width,t.height FROM history_thumbnails t JOIN documents d ON d.id=t.document_id JOIN captures c ON c.id=d.capture_id WHERE c.id=?1 AND c.deleted_at IS NULL AND d.revision=?2 AND t.revision=d.revision", params![capture_id,revision], |r| Ok((r.get::<_,String>(0)?,r.get::<_,u32>(1)?,r.get::<_,u32>(2)?))).optional()?;
        let Some((name, width, height)) = row else {
            return Ok(None);
        };
        let path = self.thumbnail_path(&name)?;
        if !path.is_file() {
            self.connection.execute(
                "DELETE FROM history_thumbnails WHERE cache_name=?1",
                [&name],
            )?;
            return Ok(None);
        }
        let path = path.canonicalize()?;
        if !path.starts_with(&self.resources_root) {
            return Err(RepositoryError::PermissionDenied);
        }
        Ok(Some(AuthorizedBlobSource {
            hash: sha256_hex(&fs::read(&path)?),
            path,
            metadata: BlobMetadata {
                format: "png".into(),
                mime_type: "image/png".into(),
                width,
                height,
                color_metadata: serde_json::json!({"colorSpace":"srgb"}),
            },
        }))
    }
}
fn invalid(message: &str) -> RepositoryError {
    RepositoryError::InvalidDocument(message.into())
}
fn json(value: &impl Serialize) -> Result<String, RepositoryError> {
    serde_json::to_string(value).map_err(|e| invalid(&e.to_string()))
}
fn from_json<T: serde::de::DeserializeOwned>(value: &str) -> Result<T, RepositoryError> {
    serde_json::from_str(value).map_err(|e| invalid(&e.to_string()))
}
fn file_size(path: &Path) -> Result<u64, RepositoryError> {
    match fs::symlink_metadata(path) {
        Ok(v) if v.file_type().is_symlink() => Err(RepositoryError::PermissionDenied),
        Ok(v) => Ok(v.len()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(0),
        Err(e) => Err(e.into()),
    }
}
fn remove_owned(root: &Path, path: &Path) -> Result<u64, RepositoryError> {
    let size = owned_size(root, path)?;
    match fs::remove_file(path) {
        Ok(()) => {
            if let Some(parent) = path.parent() {
                sync_directory(parent)?;
            }
            Ok(size)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(0),
        Err(e) => Err(e.into()),
    }
}

fn verify_parent(root: &Path, path: &Path) -> Result<(), RepositoryError> {
    let parent = path.parent().ok_or(RepositoryError::PermissionDenied)?;
    if parent.exists() && !parent.canonicalize()?.starts_with(root.canonicalize()?) {
        return Err(RepositoryError::PermissionDenied);
    }
    Ok(())
}
fn owned_size(root: &Path, path: &Path) -> Result<u64, RepositoryError> {
    verify_parent(root, path)?;
    file_size(path)
}

fn conflict(message: &str) -> RepositoryError {
    RepositoryError::HistoryConflict(message.into())
}
