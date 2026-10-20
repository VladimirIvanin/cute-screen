use super::*;
use crate::history::*;

#[test]
fn durable_material_survives_expired_capture_and_cache_cleanup() {
    let directory = tempfile::tempdir().expect("library");
    let repository =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
    let first = repository
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("capture");
    repository
        .put_material(
            "brand-bg".into(),
            "Brand background".into(),
            "background".into(),
            serde_json::json!({ "blobHash": first.source_hash }).to_string(),
        )
        .expect("material");
    let mut second = tests::request("doc-b", "capture-b");
    let old_hash = sha256_hex(&second.source_bytes);
    second.source_bytes.push(0);
    let new_hash = sha256_hex(&second.source_bytes);
    second.document_json = second.document_json.replace(&old_hash, &new_hash);
    assert_ne!(first.source_hash, new_hash);
    repository.create_capture(second).expect("second");
    repository
        .history(HistoryRequest::Activate {
            capture_id: "capture-b".into(),
        })
        .expect("activate");
    repository
        .history(HistoryRequest::Maintain)
        .expect("maintenance");
    let HistoryResponse::Page { page } = repository
        .history(HistoryRequest::List { cursor: None })
        .expect("remaining")
    else {
        panic!("page")
    };
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].capture_id, "capture-b");
    let HistoryResponse::Plan { plan } = repository
        .history(HistoryRequest::Preview {
            capture_ids: Some(vec![]),
            include_legacy: false,
            clear_cache: true,
        })
        .expect("cache plan")
    else {
        panic!("plan")
    };
    repository
        .history(HistoryRequest::Commit { token: plan.token })
        .expect("clear cache");
    assert!(
        repository
            .blob_path(first.source_hash)
            .expect("material blob")
            .exists()
    );
    assert_eq!(repository.list_materials().expect("materials").len(), 1);
    drop(repository);
    let reopened =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("reopen");
    assert_eq!(
        reopened.list_materials().expect("reopened materials")[0].id,
        "brand-bg"
    );
}

#[test]
fn removing_catalog_entry_preserves_a_preset_owner() {
    let directory = tempfile::tempdir().expect("library");
    let repository =
        LibraryRepository::initialize(directory.path(), directory.path()).expect("repository");
    let capture = repository
        .create_capture(tests::request("doc-a", "capture-a"))
        .expect("capture");
    let value = serde_json::json!({ "image": { "blobHash": capture.source_hash } }).to_string();
    repository
        .put_material(
            "bg".into(),
            "Background".into(),
            "background".into(),
            value.clone(),
        )
        .expect("background");
    repository
        .put_material("style".into(), "Style".into(), "preset".into(), value)
        .expect("preset");
    repository
        .remove_material("bg".into())
        .expect("remove from catalog");
    assert!(
        repository
            .blob_path(capture.source_hash.clone())
            .expect("still owned")
            .exists()
    );
    assert_eq!(repository.list_materials().expect("list").len(), 1);
    let path = repository
        .blob_path(capture.source_hash.clone())
        .expect("owned path");
    let HistoryResponse::Plan { plan } = repository
        .history(HistoryRequest::Preview {
            capture_ids: Some(vec!["capture-a".into()]),
            include_legacy: false,
            clear_cache: true,
        })
        .expect("manual history cleanup")
    else {
        panic!("plan")
    };
    repository
        .history(HistoryRequest::Commit { token: plan.token })
        .expect("remove capture");
    assert!(path.exists(), "preset independently owns the bytes");
    repository
        .remove_material("style".into())
        .expect("remove final owner");
    repository
        .history(HistoryRequest::Maintain)
        .expect("journal cleanup");
    assert!(
        !path.exists(),
        "unreferenced material is physically reclaimed"
    );
}
