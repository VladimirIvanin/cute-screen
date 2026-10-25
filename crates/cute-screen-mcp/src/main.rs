//! Console executable: no Tauri, GTK or GUI subsystem initialization.
use base64::Engine;
use cute_screen_mcp::{Packet, catalog, read_packet, write_packet};
use rmcp::{
    ErrorData, RoleServer, ServerHandler, ServiceExt,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ListToolsResult,
        PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    },
    service::RequestContext,
};
use serde_json::{Value, json};
use std::{
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Clone)]
struct Companion {
    endpoint: PathBuf,
    application: PathBuf,
    token: String,
}

impl Companion {
    fn request(&self, method: String, arguments: Value) -> Result<Packet, String> {
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut launched = false;
        let mut stream = loop {
            let endpoint = std::fs::read(&self.endpoint)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
            let address = endpoint
                .as_ref()
                .and_then(|value| value["address"].as_str())
                .and_then(|text| text.parse::<SocketAddr>().ok());
            if let Some(address) = address.filter(|a| a.ip().is_loopback())
                && let Ok(stream) = TcpStream::connect_timeout(&address, Duration::from_millis(200))
            {
                break stream;
            }
            if !launched {
                let mut command = std::process::Command::new(&self.application);
                command
                    .arg("--background")
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null());
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    command.creation_flags(0x08000000);
                }
                command
                    .spawn()
                    .map_err(|_| "Cannot start Cute Screen; check application path".to_owned())?;
                launched = true;
            }
            if Instant::now() >= deadline {
                return Err("Cute Screen bridge unavailable; enable MCP in Settings".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        stream
            .set_read_timeout(Some(Duration::from_secs(35)))
            .map_err(|e| e.to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_secs(10)))
            .map_err(|e| e.to_string())?;
        write_packet(&mut stream, &Packet { metadata: json!({"version":1,"token":self.token,"method":method,"arguments":arguments}), bytes: vec![] }).map_err(|_| "Bridge write failed".to_owned())?;
        read_packet(&mut stream).map_err(|_| {
            "Bridge connection lost; read document state before retrying mutations".to_owned()
        })
    }
}

impl ServerHandler for Companion {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(rmcp::model::Implementation::new("cute-screen", env!("CARGO_PKG_VERSION")))
            .with_instructions("Cute Screen edits the visible local document. Read get_status then get_document. Use current stateToken for mutations. apply_edits is one Undo step. get_preview returns committed pixels; inspect it after changes. Capture jobs can require user interaction. Never repeat mutations automatically after a connection failure; reread state. Images sent to your model are controlled by this MCP client.")
    }
    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let tools = serde_json::from_value(catalog::tools())
            .map_err(|_| ErrorData::internal_error("Invalid tool catalog", None))?;
        Ok(ListToolsResult {
            tools,
            ..Default::default()
        })
    }
    fn get_tool(&self, name: &str) -> Option<Tool> {
        catalog::tools()
            .as_array()?
            .iter()
            .find(|t| t["name"] == name)
            .and_then(|tool| serde_json::from_value(tool.clone()).ok())
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let name = request.name.to_string();
        if !catalog::TOOL_NAMES.contains(&name.as_str()) {
            return Ok(CallToolResult::error(vec![ContentBlock::text("Unknown tool")]).into());
        }
        let this = self.clone();
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        let result = tokio::task::spawn_blocking(move || this.request(name, arguments)).await;
        let packet = match result {
            Ok(Ok(packet)) => packet,
            _ => return Ok(CallToolResult::error(vec![ContentBlock::text(
                "Bridge unavailable or request failed; inspect application status before retrying",
            )])
            .into()),
        };
        let mut content = vec![ContentBlock::text(packet.metadata.to_string())];
        if !packet.bytes.is_empty() {
            content.push(ContentBlock::image(
                base64::engine::general_purpose::STANDARD.encode(&packet.bytes),
                "image/png",
            ));
        }
        let response = if packet.metadata.get("error").is_some() {
            CallToolResult::error(content)
        } else {
            CallToolResult::success(content)
        };
        Ok(response.into())
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let mut endpoint = None;
    let mut application = None;
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("--endpoint") => endpoint = args.next().map(PathBuf::from),
            Some("--application") => application = args.next().map(PathBuf::from),
            Some("--self-check") => {
                eprintln!("cute-screen-mcp {}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            _ => return Err("Unknown companion argument".into()),
        }
    }
    let companion = Companion {
        endpoint: endpoint.ok_or("Missing --endpoint")?,
        application: application.ok_or("Missing --application")?,
        token: std::env::var("CUTE_SCREEN_MCP_TOKEN")
            .map_err(|_| "Missing CUTE_SCREEN_MCP_TOKEN")?,
    };
    let service = companion.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}
