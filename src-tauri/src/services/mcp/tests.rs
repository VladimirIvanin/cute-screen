use super::*;
use sha2::{Digest, Sha256};

fn service(root: &std::path::Path) -> McpService {
    let token = "a".repeat(64);
    McpService {
        settings: Mutex::new(SavedSettings {
            enabled: false,
            connections: vec![Connection {
                id: "client".into(),
                client: "codex".into(),
                key_hash: format!("{:x}", Sha256::digest(token.as_bytes())),
                configuration_key_hash: None,
            }],
        }),
        activity: Mutex::new(HashMap::new()),
        jobs: Mutex::new(HashMap::new()),
        pending: Mutex::new(HashMap::new()),
        operation: tokio::sync::Mutex::new(()),
        ready: AtomicBool::new(false),
        active: AtomicUsize::new(0),
        stopped: AtomicBool::new(false),
        endpoint: root.join("endpoint"),
        library: root.into(),
    }
}

#[test]
fn keys_are_disabled_by_default_and_revocation_is_immediate() {
    let root = tempfile::tempdir().expect("root");
    let service = service(root.path());
    let token = "a".repeat(64);
    assert!(service.authenticate(&token).is_err());
    service.settings.lock().expect("lock").enabled = true;
    assert_eq!(service.authenticate(&token).expect("authorized"), "client");
    assert!(service.authenticate(&"b".repeat(64)).is_err());
    service.settings.lock().expect("lock").connections.clear();
    assert!(service.authenticate(&token).is_err());
}

#[test]
fn export_cannot_replace_existing_files_or_library_blobs() {
    let root = tempfile::tempdir().expect("root");
    let library = root.path().join("library");
    std::fs::create_dir(&library).expect("library");
    let file = root.path().join("existing.png");
    std::fs::write(&file, b"original").expect("original");
    assert!(dispatch::export_new_png(&file, &library, b"bad png").is_err());
    assert_eq!(std::fs::read(&file).expect("read"), b"original");
    assert!(dispatch::export_new_png(&library.join("blob.png"), &library, b"bad png").is_err());
}

#[test]
fn token_comparison_checks_all_bytes() {
    assert!(constant_time_equal(b"abcd", b"abcd"));
    assert!(!constant_time_equal(b"abcd", b"abce"));
    assert!(!constant_time_equal(b"abcd", b"abc"));
}

#[test]
fn opencode_configuration_uses_local_command_array_and_environment() {
    let command = std::path::Path::new("/Applications/Cute Screen Ω/cute-screen-mcp");
    let args = vec!["--endpoint".into(), "/Users/Example Name/mcp.json".into()];
    let config = settings::connection_configuration("opencode", command, &args, "test-key")
        .expect("configuration");
    let value: Value = serde_json::from_str(&config).expect("JSON");
    let entry = &value["mcp"]["cute-screen"];
    assert_eq!(entry["type"], "local");
    assert_eq!(entry["enabled"], true);
    assert_eq!(
        entry["command"],
        serde_json::json!([command, args[0], args[1]])
    );
    assert_eq!(entry["environment"]["CUTE_SCREEN_MCP_TOKEN"], "test-key");
    assert!(entry.get("args").is_none());
    assert!(entry.get("env").is_none());
}

#[test]
fn every_client_receives_its_own_configuration_shape_and_escaped_paths() {
    let command = std::path::Path::new("/Applications/Cute Screen Ω/cute-screen-mcp");
    let args = vec!["--endpoint".into(), "/Users/Example Name/mcp.json".into()];
    for client in [
        "claude",
        "cursor",
        "gigacode",
        "zcode",
        "claude-desktop",
        "gemini",
        "windsurf",
        "cline",
        "roo",
        "zed",
        "vscode",
        "generic",
    ] {
        let config =
            settings::connection_configuration(client, command, &args, "test-key").expect("config");
        let value: Value = serde_json::from_str(&config).expect("JSON");
        let entry = if client == "zcode" {
            &value["mcp"]["servers"]["cute-screen"]
        } else if client == "zed" {
            &value["context_servers"]["cute-screen"]
        } else if client == "vscode" {
            assert_eq!(value["servers"]["cute-screen"]["type"], "stdio");
            &value["servers"]["cute-screen"]
        } else if client == "generic" {
            &value
        } else {
            &value["mcpServers"]["cute-screen"]
        };
        assert_eq!(entry["command"], command.to_string_lossy().as_ref());
        assert_eq!(entry["args"], serde_json::json!(args));
        assert_eq!(entry["env"]["CUTE_SCREEN_MCP_TOKEN"], "test-key");
    }
    let codex =
        settings::connection_configuration("codex", command, &args, "test-key").expect("TOML");
    assert!(codex.starts_with("[mcp_servers.cute-screen]\n"));
    assert!(codex.contains(&format!(
        "command = {}",
        serde_json::to_string(command).expect("path")
    )));
    assert!(codex.contains("[mcp_servers.cute-screen.env]"));
}

#[test]
fn continue_yaml_preserves_every_stdio_argument_as_a_quoted_scalar() {
    let command = std::path::Path::new("C:\\Cute Screen Ω\\cute-screen-mcp.exe");
    let args = vec![
        "--mcp-stdio".into(),
        "--endpoint".into(),
        "C:\\Users\\Example Name\\a\"b.json".into(),
        "line\nbreak".into(),
    ];
    let config =
        settings::connection_configuration("continue", command, &args, "test-key").expect("YAML");
    assert!(config.starts_with("name: Cute Screen MCP\nversion: 1.0.0\nschema: v1\nmcpServers:\n  - name: cute-screen\n    type: stdio\n"));
    // YAML accepts JSON quoted scalars and flow collections. Decode each generated
    // value to ensure Windows paths, quotes, newlines and argument boundaries survive.
    let field = |name: &str| {
        config
            .lines()
            .find_map(|line| line.strip_prefix(&format!("    {name}: ")))
            .expect("field")
    };
    assert_eq!(
        serde_json::from_str::<Value>(field("command")).expect("command"),
        serde_json::json!(command)
    );
    assert_eq!(
        serde_json::from_str::<Value>(field("args")).expect("args"),
        serde_json::json!(args)
    );
    assert_eq!(
        serde_json::from_str::<Value>(field("env")).expect("env"),
        serde_json::json!({"CUTE_SCREEN_MCP_TOKEN":"test-key"})
    );
}

#[test]
fn configuration_rejects_unknown_clients_instead_of_guessing_a_format() {
    assert!(
        settings::connection_configuration(
            "unknown",
            std::path::Path::new("/app/mcp"),
            &[],
            "test-key"
        )
        .is_err()
    );
}

#[test]
fn credentials_survive_reopen_and_are_removed_on_revoke() {
    let root = tempfile::tempdir().expect("root");
    let id = uuid::Uuid::new_v4().to_string();
    let token = "a".repeat(64);
    assert_eq!(credentials::read(root.path(), &id).expect("missing"), None);
    credentials::write(root.path(), &id, &token).expect("write");
    assert_eq!(
        credentials::read(root.path(), &id).expect("reopen"),
        Some(token)
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(root.path().join("mcp-keys"))
                .expect("dir")
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            std::fs::metadata(root.path().join("mcp-keys").join(&id))
                .expect("file")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
    credentials::remove(root.path(), &id).expect("revoke");
    assert_eq!(credentials::read(root.path(), &id).expect("removed"), None);
    assert!(credentials::read(root.path(), "../outside").is_err());
}

#[test]
fn legacy_configuration_key_preserves_the_installed_agent_and_revokes_both() {
    let root = tempfile::tempdir().expect("root");
    let service = service(root.path());
    let legacy = "a".repeat(64);
    let mut connection = settings::new_connection("codex", &legacy);
    let (recovered, created) =
        settings::configuration_credential(root.path(), &connection).expect("legacy recovery");
    assert!(created);
    credentials::write(root.path(), &connection.id, &recovered).expect("persist key");
    connection.configuration_key_hash = Some(format!("{:x}", Sha256::digest(recovered.as_bytes())));
    let (reopened, created_again) =
        settings::configuration_credential(root.path(), &connection).expect("reopen");
    assert!(!created_again);
    assert_eq!(reopened, recovered);
    let id = connection.id.clone();
    let mut saved = service.settings.lock().expect("settings");
    saved.enabled = true;
    saved.connections = vec![connection];
    let serialized = serde_json::to_string(&*saved).expect("serialize");
    assert!(!serialized.contains(&recovered));
    assert!(!serialized.contains(&legacy));
    *saved = serde_json::from_str(&serialized).expect("restart");
    drop(saved);
    assert_eq!(service.authenticate(&legacy).expect("installed agent"), id);
    assert_eq!(service.authenticate(&recovered).expect("config key"), id);
    service
        .settings
        .lock()
        .expect("settings")
        .connections
        .clear();
    assert!(service.authenticate(&legacy).is_err());
    assert!(service.authenticate(&recovered).is_err());
}

#[test]
fn two_keys_for_the_same_client_are_independently_revocable() {
    let root = tempfile::tempdir().expect("root");
    let service = service(root.path());
    let first = settings::new_connection("codex", &"a".repeat(64));
    let second = settings::new_connection("codex", &"b".repeat(64));
    assert_ne!(first.id, second.id);
    let second_id = second.id.clone();
    {
        let mut saved = service.settings.lock().expect("settings");
        saved.enabled = true;
        saved.connections = vec![first, second];
    }
    assert!(service.authenticate(&"a".repeat(64)).is_ok());
    assert_eq!(
        service.authenticate(&"b".repeat(64)).expect("second"),
        second_id
    );
    service
        .settings
        .lock()
        .expect("settings")
        .connections
        .retain(|c| c.id == second_id);
    assert!(service.authenticate(&"a".repeat(64)).is_err());
    assert_eq!(
        service
            .authenticate(&"b".repeat(64))
            .expect("second remains"),
        second_id
    );
}
