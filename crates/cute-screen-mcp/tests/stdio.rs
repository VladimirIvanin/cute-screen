use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
};

#[test]
fn initialize_and_discover_without_launching_the_application() {
    let root = tempfile::tempdir().expect("root");
    let mut child = Command::new(env!("CARGO_BIN_EXE_cute-screen-mcp"))
        .args([
            "--endpoint",
            root.path().join("absent.json").to_str().expect("path"),
            "--application",
            "/application-must-not-be-launched",
        ])
        .env("CUTE_SCREEN_MCP_TOKEN", "a".repeat(64))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("companion");
    let mut input = child.stdin.take().expect("stdin");
    let mut output = BufReader::new(child.stdout.take().expect("stdout"));
    writeln!(input, "{}", json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}})).expect("initialize");
    let mut line = String::new();
    output.read_line(&mut line).expect("response");
    let response: Value = serde_json::from_str(&line).expect("stdout must be JSON-RPC only");
    assert_eq!(response["id"], 1);
    assert!(response["result"]["capabilities"]["tools"].is_object());
    writeln!(
        input,
        "{}",
        json!({"jsonrpc":"2.0","method":"notifications/initialized"})
    )
    .expect("initialized");
    writeln!(
        input,
        "{}",
        json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
    )
    .expect("list");
    line.clear();
    output.read_line(&mut line).expect("list response");
    let response: Value = serde_json::from_str(&line).expect("tools response");
    let tools = response["result"]["tools"].as_array().expect("catalog");
    assert_eq!(tools.len(), cute_screen_mcp::catalog::TOOL_NAMES.len());
    let edits = tools
        .iter()
        .find(|tool| tool["name"] == "apply_edits")
        .expect("edits");
    assert!(edits["inputSchema"]["$defs"].is_object());
    drop(input);
    assert!(child.wait().expect("shutdown").success());
}
