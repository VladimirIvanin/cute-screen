use super::*;
use crate::history::*;

#[test]
fn history_restores_selected_capture_and_pages_without_opening_sources() {
    let directory = tempfile::tempdir().expect("temporary library");
    let repository =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
    for index in 0..55 {
        let mut request = tests::request(&format!("doc-{index}"), &format!("capture-{index:03}"));
        request.captured_at = index;
        repository.create_capture(request).expect("capture");
    }
    let response = repository
        .history(HistoryRequest::List { cursor: None })
        .expect("page");
    let HistoryResponse::Page { page } = response else {
        panic!("page response")
    };
    assert_eq!(page.items.len(), 50);
    assert_eq!(page.items[0].capture_id, "capture-054");
    assert!(page.next_cursor.is_some());
    repository
        .history(HistoryRequest::Activate {
            capture_id: "capture-000".into(),
        })
        .expect("activate");
    assert_eq!(
        repository
            .open_last()
            .expect("last")
            .expect("document")
            .capture_id,
        "capture-000"
    );
}

#[test]
fn history_preview_rejects_changed_protection_and_preserves_shared_original() {
    let directory = tempfile::tempdir().expect("temporary library");
    let repository =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
    repository
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("first");
    repository
        .create_capture(tests::request("doc-b", "capture-b"))
        .expect("second");
    let HistoryResponse::Plan { plan } = repository
        .history(HistoryRequest::Preview {
            capture_ids: Some(vec!["capture-a".into()]),
            include_legacy: false,
            clear_cache: false,
        })
        .expect("preview")
    else {
        panic!("plan")
    };
    assert_eq!(
        plan.reclaimable_bytes, 0,
        "shared original remains referenced"
    );
    repository
        .history(HistoryRequest::Protect {
            capture_id: "capture-a".into(),
            protected: true,
        })
        .expect("protect");
    assert!(
        repository
            .history(HistoryRequest::Commit { token: plan.token })
            .is_err(),
        "changed plan must be reviewed"
    );
}

#[test]
fn history_retention_excludes_active_and_legacy_until_consent() {
    let directory = tempfile::tempdir().expect("temporary library");
    let repository =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
    repository
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("first");
    repository
        .create_capture(tests::request("doc-b", "capture-b"))
        .expect("second");
    repository
        .history(HistoryRequest::Activate {
            capture_id: "capture-b".into(),
        })
        .expect("mounted second capture");
    repository
        .history(HistoryRequest::Maintain)
        .expect("maintenance");
    let HistoryResponse::Page { page } = repository
        .history(HistoryRequest::List { cursor: None })
        .expect("list")
    else {
        panic!("page")
    };
    assert_eq!(page.items.len(), 1, "expired inactive capture removed");
    assert_eq!(page.items[0].capture_id, "capture-b");
}

struct CleanupFault(StorageFaultPoint);
impl StorageFaultInjector for CleanupFault {
    fn checkpoint(&self, point: StorageFaultPoint) -> Result<(), RepositoryError> {
        if self.0 == point {
            Err(RepositoryError::InjectedFault { point })
        } else {
            Ok(())
        }
    }
}

#[test]
fn history_cleanup_recovers_after_each_persistent_boundary() {
    for point in [
        StorageFaultPoint::BeforeCleanupCommit,
        StorageFaultPoint::AfterCleanupCommit,
        StorageFaultPoint::CleanupFileRemoved,
    ] {
        let directory = tempfile::tempdir().expect("library");
        let mut seed = StorageState::open(
            directory.path(),
            directory.path(),
            Arc::new(NoopStorageFaultInjector),
        )
        .expect("seed");
        seed.create_capture(tests::request("doc-a", "capture-a"))
            .expect("capture");
        seed.history(HistoryRequest::Deactivate)
            .expect("deactivate");
        drop(seed);
        let mut failing = StorageState::open(
            directory.path(),
            directory.path(),
            Arc::new(CleanupFault(point)),
        )
        .expect("fault worker");
        let HistoryResponse::Plan { plan } = failing
            .history(HistoryRequest::Preview {
                capture_ids: Some(vec!["capture-a".into()]),
                include_legacy: false,
                clear_cache: false,
            })
            .expect("preview")
        else {
            panic!("plan")
        };
        assert!(
            failing
                .history(HistoryRequest::Commit { token: plan.token })
                .is_err()
        );
        drop(failing);
        let mut recovered = StorageState::open(
            directory.path(),
            directory.path(),
            Arc::new(NoopStorageFaultInjector),
        )
        .expect("reopen");
        recovered
            .history(HistoryRequest::Maintain)
            .expect("resume maintenance");
        assert_eq!(recovered.storage_count_for_test(), 0);
        let pending: i64 = recovered
            .connection
            .query_row(
                "SELECT count(*) FROM recovery_journal WHERE kind='historyCleanup'",
                [],
                |r| r.get(0),
            )
            .expect("journal");
        assert_eq!(pending, 0);
    }
}

impl StorageState {
    fn storage_count_for_test(&self) -> i64 {
        self.connection
            .query_row("SELECT count(*) FROM captures", [], |r| r.get(0))
            .expect("count")
    }
}

#[test]
fn history_existing_library_requires_consent_and_viewport_survives_restart() {
    let directory = tempfile::tempdir().expect("library");
    let mut state = StorageState::open(
        directory.path(),
        directory.path(),
        Arc::new(NoopStorageFaultInjector),
    )
    .expect("worker");
    state
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("first");
    state
        .create_capture(tests::request("doc-b", "capture-b"))
        .expect("second");
    state
        .history(HistoryRequest::Activate {
            capture_id: "capture-b".into(),
        })
        .expect("mounted second capture");
    state
        .connection
        .execute("UPDATE captures SET history_legacy_pending=1", [])
        .expect("legacy cohort");
    let viewport = HistoryViewport {
        zoom: 175.0,
        mode: "custom".into(),
        scroll_left: 35.0,
        scroll_top: 70.0,
    };
    state
        .history(HistoryRequest::SaveViewport {
            capture_id: "capture-b".into(),
            viewport: viewport.clone(),
        })
        .expect("viewport");
    state
        .history(HistoryRequest::Maintain)
        .expect("protected cohort");
    assert_eq!(state.storage_count_for_test(), 2);
    let HistoryResponse::Plan { plan } = state
        .history(HistoryRequest::Preview {
            capture_ids: None,
            include_legacy: true,
            clear_cache: false,
        })
        .expect("preview")
    else {
        panic!("plan")
    };
    assert_eq!(plan.capture_ids, vec!["capture-a"]);
    state
        .history(HistoryRequest::Commit { token: plan.token })
        .expect("consent");
    drop(state);
    let mut reopened = StorageState::open(
        directory.path(),
        directory.path(),
        Arc::new(NoopStorageFaultInjector),
    )
    .expect("restart");
    let HistoryResponse::Opened {
        viewport: actual, ..
    } = reopened
        .history(HistoryRequest::Open {
            capture_id: "capture-b".into(),
        })
        .expect("open")
    else {
        panic!("opened")
    };
    assert_eq!(actual, Some(viewport));
    assert_eq!(reopened.storage_count_for_test(), 1);
}

#[test]
fn history_count_limit_keeps_protected_and_active_captures_without_image_probes() {
    let directory = tempfile::tempdir().expect("library");
    let mut state = StorageState::open(
        directory.path(),
        directory.path(),
        Arc::new(NoopStorageFaultInjector),
    )
    .expect("worker");
    let mut request = tests::request("doc-0", "capture-0");
    request.captured_at = now_millis().expect("now");
    let original = state
        .create_capture(request)
        .expect("production-sized seed");
    // A large catalog fixture reuses a real immutable 4K blob, including explicit references.
    for index in 1..1000 {
        let id = format!("capture-{index}");
        let document = format!("doc-{index}");
        state.connection.execute("INSERT INTO captures(id,series_id,original_blob_hash,captured_at,created_at,updated_at,capture_metadata_json) SELECT ?1,series_id,original_blob_hash,captured_at+?2,created_at,updated_at,capture_metadata_json FROM captures WHERE id='capture-0'",params![id,index]).expect("capture fixture");
        state.connection.execute("INSERT INTO documents(id,capture_id,schema_version,revision,content_json,content_sha256,created_at,updated_at) SELECT ?1,?2,schema_version,revision,content_json,content_sha256,created_at,updated_at FROM documents WHERE id='doc-0'",params![document,id]).expect("document fixture");
        state.connection.execute("INSERT INTO blob_references(owner_kind,owner_id,role,blob_hash) VALUES('document',?1,'source',?2)",params![document,original.source_hash]).expect("reference fixture");
    }
    for index in 0..3 {
        state
            .history(HistoryRequest::Protect {
                capture_id: format!("capture-{index}"),
                protected: true,
            })
            .expect("protect");
    }
    state
        .history(HistoryRequest::Activate {
            capture_id: "capture-999".into(),
        })
        .expect("activate");
    state
        .history(HistoryRequest::Maintain)
        .expect("count cleanup");
    assert_eq!(state.storage_count_for_test(), 200);
    let count: i64 = state
        .connection
        .query_row(
            "SELECT count(*) FROM captures WHERE history_protected=1 OR id='capture-999'",
            [],
            |r| r.get(0),
        )
        .expect("protected");
    assert_eq!(count, 4);
    fs::remove_dir_all(directory.path().join("blobs"))
        .expect("remove source to prove list independence");
    let HistoryResponse::Page { page } = state
        .history(HistoryRequest::List { cursor: None })
        .expect("metadata only")
    else {
        panic!("page")
    };
    assert_eq!(page.items.len(), 50);
    assert!(page.next_cursor.is_some());
}

#[test]
fn history_preview_revision_invalidates_without_losing_document_or_original() {
    let directory = tempfile::tempdir().expect("library");
    let mut state = StorageState::open(
        directory.path(),
        directory.path(),
        Arc::new(NoopStorageFaultInjector),
    )
    .expect("worker");
    let record = state
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("capture");
    let mut png = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png, 2, 2);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("header");
        writer
            .write_image_data(&[0, 0, 0, 255].repeat(4))
            .expect("pixels");
    }
    state
        .write_history_thumbnail("doc-a", 1, &png)
        .expect("preview");
    assert!(
        state
            .history_thumbnail("capture-a", 1)
            .expect("resolve")
            .is_some()
    );
    state
        .save_document("doc-a", 1, &record.document_json)
        .expect("new revision");
    assert!(
        state
            .history_thumbnail("capture-a", 1)
            .expect("stale")
            .is_none()
    );
    assert!(state.write_history_thumbnail("doc-a", 1, &png).is_err());
    state
        .write_history_thumbnail("doc-a", 2, &png)
        .expect("current preview");
    let HistoryResponse::Plan { plan } = state
        .history(HistoryRequest::Preview {
            capture_ids: None,
            include_legacy: false,
            clear_cache: true,
        })
        .expect("preview cache cleanup")
    else {
        panic!("plan")
    };
    let HistoryResponse::Cleaned { freed_bytes, .. } = state
        .history(HistoryRequest::Commit { token: plan.token })
        .expect("clear cache")
    else {
        panic!("cleaned")
    };
    assert_eq!(freed_bytes, png.len() as u64);
    assert!(
        state
            .history_thumbnail("capture-a", 2)
            .expect("removed preview")
            .is_none()
    );
    assert_eq!(
        state
            .open_capture("capture-a")
            .expect("document survives")
            .revision,
        2
    );
    assert!(
        blob_path(&state.blobs_root, &record.source_hash, "png")
            .expect("path")
            .is_file()
    );
}

#[test]
fn history_cleanup_also_respects_capture_foreign_keys_when_reference_index_is_incomplete() {
    let directory = tempfile::tempdir().expect("library");
    let mut state = StorageState::open(
        directory.path(),
        directory.path(),
        Arc::new(NoopStorageFaultInjector),
    )
    .expect("worker");
    let first = state
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("first");
    state
        .create_capture(tests::request("doc-b", "capture-b"))
        .expect("second");
    state
        .history(HistoryRequest::Activate {
            capture_id: "capture-a".into(),
        })
        .expect("activate survivor");
    state
        .connection
        .execute("DELETE FROM blob_references WHERE owner_id='doc-a'", [])
        .expect("simulate incomplete legacy reference index");
    let HistoryResponse::Plan { plan } = state
        .history(HistoryRequest::Preview {
            capture_ids: Some(vec!["capture-b".into()]),
            include_legacy: false,
            clear_cache: false,
        })
        .expect("preview")
    else {
        panic!("plan")
    };
    assert_eq!(
        plan.reclaimable_bytes, 0,
        "surviving capture owns the same immutable original"
    );
    state
        .history(HistoryRequest::Commit { token: plan.token })
        .expect("delete second");
    assert!(
        blob_path(&state.blobs_root, &first.source_hash, "png")
            .expect("path")
            .is_file()
    );
}

#[test]
fn history_new_capture_does_not_replace_last_successfully_opened_capture() {
    let directory = tempfile::tempdir().expect("library");
    let repository =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
    repository
        .create_capture(tests::request("doc-old", "capture-old"))
        .expect("old");
    repository
        .history(HistoryRequest::Activate {
            capture_id: "capture-old".into(),
        })
        .expect("activate");
    repository
        .create_capture(tests::request("doc-unopened", "capture-unopened"))
        .expect("saved new frame");
    assert_eq!(
        repository
            .open_last()
            .expect("last")
            .expect("document")
            .capture_id,
        "capture-old"
    );
}

#[test]
fn history_byte_limit_counts_shared_blobs_once_and_stops_at_boundary() {
    let directory = tempfile::tempdir().expect("library");
    let mut state = StorageState::open(
        directory.path(),
        directory.path(),
        Arc::new(NoopStorageFaultInjector),
    )
    .expect("worker");
    let mut request = tests::request("doc-a", "capture-a");
    request.captured_at = now_millis().expect("now");
    let record = state.create_capture(request).expect("seed");
    // Metadata boundary fixture: physical deletion is covered separately by fault/restart tests.
    let hash_b = "b".repeat(64);
    state.connection.execute("INSERT INTO blobs(hash,format,mime_type,byte_size,width,height,color_metadata_json,created_at) SELECT ?1,format,mime_type,byte_size,width,height,color_metadata_json,created_at FROM blobs WHERE hash=?2",params![hash_b,record.source_hash]).expect("second unique blob");
    for (id, document, hash, offset) in [
        ("capture-b", "doc-b", &hash_b, 1),
        ("capture-c", "doc-c", &record.source_hash, 2),
    ] {
        state.connection.execute("INSERT INTO captures(id,series_id,original_blob_hash,captured_at,created_at,updated_at,capture_metadata_json) SELECT ?1,series_id,?2,captured_at+?3,created_at,updated_at,capture_metadata_json FROM captures WHERE id='capture-a'", params![id,hash,offset]).expect("capture");
        state.connection.execute("INSERT INTO documents(id,capture_id,schema_version,revision,content_json,content_sha256,created_at,updated_at) SELECT ?1,?2,schema_version,revision,content_json,content_sha256,created_at,updated_at FROM documents WHERE id='doc-a'", params![document,id]).expect("document");
        state.connection.execute("INSERT INTO blob_references(owner_kind,owner_id,role,blob_hash) VALUES('document',?1,'source',?2)",params![document,hash]).expect("reference");
    }
    state
        .history(HistoryRequest::SetPolicy {
            policy: HistoryPolicy {
                days: 7,
                max_mib: 256,
                max_captures: 200,
            },
        })
        .expect("policy");
    state
        .history(HistoryRequest::Activate {
            capture_id: "capture-c".into(),
        })
        .expect("active");
    state
        .connection
        .execute("UPDATE blobs SET byte_size=?1", [128 * 1024 * 1024_i64])
        .expect("boundary sizes");
    assert!(
        matches!(state.history(HistoryRequest::Report).expect("report"), HistoryResponse::Report { report } if report.over_limit),
        "database overhead is included"
    );
    assert_eq!(
        candidate_ids(&mut state),
        vec!["capture-a", "capture-b"],
        "shared first blob is not reclaimed while active capture-c retains it"
    );
    state
        .history(HistoryRequest::Protect {
            capture_id: "capture-b".into(),
            protected: true,
        })
        .expect("protection");
    assert_eq!(candidate_ids(&mut state), vec!["capture-a"]);
    state
        .connection
        .execute("UPDATE blobs SET byte_size=?1", [127 * 1024 * 1024_i64])
        .expect("under limit");
    assert!(candidate_ids(&mut state).is_empty());
}

fn candidate_ids(state: &mut StorageState) -> Vec<String> {
    let HistoryResponse::Plan { plan } = state
        .history(HistoryRequest::Preview {
            capture_ids: None,
            include_legacy: false,
            clear_cache: false,
        })
        .expect("preview")
    else {
        panic!("plan")
    };
    plan.capture_ids
}
