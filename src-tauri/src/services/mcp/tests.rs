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
