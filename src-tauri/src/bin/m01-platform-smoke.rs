#[cfg(target_os = "linux")]
mod linux {
    use std::{
        collections::BTreeMap,
        env, fs,
        path::{Path, PathBuf},
        process::Command,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use cute_screen_desktop::{
        image_transport::ImageTransportService,
        linux_platform::{AshpdPortalClient, PortalShortcutSession, validated_file_uri},
        platform::{CaptureRequest, CaptureTarget, PlatformError, ShortcutSpec},
    };
    use serde::Serialize;
    use serde_json::{Value, json};
    use tempfile::tempdir;

    #[cfg(feature = "x11-capture")]
    use cute_screen_desktop::platform::SessionKind;
    #[cfg(feature = "x11-capture")]
    use cute_screen_desktop::x11_platform::X11CaptureAdapter;
    #[cfg(feature = "x11-capture")]
    use x11rb::{
        COPY_DEPTH_FROM_PARENT,
        connection::Connection,
        protocol::xproto::{
            ConnectionExt as _, CreateGCAux, CreateWindowAux, Rectangle, WindowClass,
        },
    };

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct EvidenceEnvelope {
        schema_version: u8,
        commit_sha: String,
        recorded_at_unix_ms: u128,
        os: String,
        arch: String,
        session: String,
        portal_versions: BTreeMap<String, String>,
        webview_versions: BTreeMap<String, String>,
        monitor_layout: Value,
        correlation_id: String,
        command: String,
        observable_result: Value,
    }

    type Observation = (
        Result<Value, PlatformError>,
        BTreeMap<String, String>,
        Value,
    );

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let args = env::args().skip(1).collect::<Vec<_>>();
        if args.is_empty() || args.iter().any(|arg| arg == "--help") {
            print_help();
            return Ok(());
        }
        let command = args[0].clone();
        let output = required_option(&args, "--output")?;
        let correlation_id = option(&args, "--correlation-id")
            .unwrap_or_else(|| format!("m01-{command}-{}", std::process::id()));

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?;
        let (result, portal_versions, monitor_layout) = match command.as_str() {
            "portal-probe" => runtime.block_on(portal_probe(&correlation_id)),
            "portal-screenshot" => runtime.block_on(portal_screenshot(&correlation_id)),
            "portal-shortcuts" => runtime.block_on(portal_shortcuts(&correlation_id)),
            "portal-invalid-uri" => portal_invalid_uri(&correlation_id),
            "x11-controlled" => x11_controlled(&correlation_id),
            _ => return Err(format!("unknown smoke command: {command}").into()),
        };

        let (observable_result, failed) = match result {
            Ok(value) => (json!({ "outcome": "success", "value": value }), false),
            Err(error) => {
                let cancelled = matches!(
                    error.code,
                    cute_screen_desktop::platform::PlatformErrorCode::Cancelled
                        | cute_screen_desktop::platform::PlatformErrorCode::ShortcutBindCancelled
                );
                (
                    json!({
                        "outcome": if cancelled { "cancelled" } else { "error" },
                        "error": error,
                    }),
                    !cancelled,
                )
            }
        };
        let evidence = EvidenceEnvelope {
            schema_version: 1,
            commit_sha: command_output("git", &["rev-parse", "HEAD"]),
            recorded_at_unix_ms: SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis(),
            os: command_output("uname", &["-sr"]),
            arch: env::consts::ARCH.to_owned(),
            session: env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_owned()),
            portal_versions,
            webview_versions: BTreeMap::from([(
                "webkit2gtk-4.1".to_owned(),
                command_output("pkg-config", &["--modversion", "webkit2gtk-4.1"]),
            )]),
            monitor_layout,
            correlation_id,
            command,
            observable_result,
        };
        write_evidence(&output, &evidence)?;
        println!("{}", output.display());
        if failed {
            return Err("smoke observation returned an error; evidence was written".into());
        }
        Ok(())
    }

    async fn portal_probe(correlation_id: &str) -> Observation {
        let result = AshpdPortalClient::default().probe(correlation_id).await;
        let versions = result
            .as_ref()
            .map(|probe| {
                BTreeMap::from([
                    (
                        "screenshot".to_owned(),
                        probe.screenshot_version.to_string(),
                    ),
                    (
                        "globalShortcuts".to_owned(),
                        probe.global_shortcuts_available.to_string(),
                    ),
                    (
                        "availableTargets".to_owned(),
                        probe.available_targets.to_string(),
                    ),
                ])
            })
            .unwrap_or_default();
        (result.map(|probe| json!(probe)), versions, json!([]))
    }

    async fn portal_screenshot(correlation_id: &str) -> Observation {
        let probe = AshpdPortalClient::default().probe(correlation_id).await;
        let versions = portal_version_map(probe.as_ref().ok());
        let result = async {
            probe?;
            let temp_root = tempdir().map_err(|_| {
                PlatformError::new(
                    cute_screen_desktop::platform::PlatformErrorCode::CaptureFailed,
                    correlation_id,
                )
            })?;
            let transport = ImageTransportService::new(
                temp_root.path().join("library"),
                temp_root.path().join("blobs"),
            )?;
            AshpdPortalClient::default()
                .capture_to_transport(
                    CaptureRequest {
                        correlation_id: correlation_id.to_owned(),
                        target: CaptureTarget::Area,
                    },
                    &transport,
                )
                .await
                .map(|capture| json!(capture))
        }
        .await;
        (result, versions, json!([]))
    }

    async fn portal_shortcuts(correlation_id: &str) -> Observation {
        let probe = AshpdPortalClient::default().probe(correlation_id).await;
        let versions = portal_version_map(probe.as_ref().ok());
        let result = async {
            probe?;
            let shortcuts = [ShortcutSpec {
                id: "capture-area".to_owned(),
                preferred_trigger: Some("CTRL+PRINT".to_owned()),
            }];
            let mut session = PortalShortcutSession::create(correlation_id).await?;
            let first_bind = session.bind_once(&shortcuts, correlation_id).await?;
            let second_bind = session.bind_once(&shortcuts, correlation_id).await?;
            eprintln!("Activate and release the capture-area shortcut within 30 seconds.");
            let activation = session
                .wait_for_activation_cycle(Duration::from_secs(30), correlation_id)
                .await?;
            let replacement = session.recreate(&shortcuts, correlation_id).await?;
            replacement.close(correlation_id).await?;
            Ok(json!({
                "firstBind": first_bind,
                "secondBind": second_bind,
                "activation": activation,
                "recreatedWithSameIds": true,
            }))
        }
        .await;
        (result, versions, json!([]))
    }

    fn portal_invalid_uri(correlation_id: &str) -> Observation {
        let result = match validated_file_uri("https://invalid.example/capture.png", correlation_id)
        {
            Err(error)
                if error.code == cute_screen_desktop::platform::PlatformErrorCode::InvalidUri =>
            {
                Ok(json!({ "rejectedCode": error.code }))
            }
            Err(error) => Err(error),
            Ok(path) => Ok(json!({ "unexpectedPath": path })),
        };
        (result, BTreeMap::new(), json!([]))
    }

    #[cfg(feature = "x11-capture")]
    fn x11_controlled(correlation_id: &str) -> Observation {
        let result = (|| -> Result<_, Box<dyn std::error::Error>> {
            if !env::var("XDG_SESSION_TYPE")
                .unwrap_or_default()
                .eq_ignore_ascii_case("x11")
            {
                return Err("x11-controlled requires XDG_SESSION_TYPE=x11".into());
            }
            let (connection, screen_number) = x11rb::connect(None)?;
            let screen = &connection.setup().roots[screen_number];
            let window = connection.generate_id()?;
            let gc = connection.generate_id()?;
            connection.create_window(
                COPY_DEPTH_FROM_PARENT,
                window,
                screen.root,
                37,
                53,
                96,
                64,
                0,
                WindowClass::INPUT_OUTPUT,
                screen.root_visual,
                &CreateWindowAux::new()
                    .background_pixel(screen.black_pixel)
                    .override_redirect(1),
            )?;
            connection.create_gc(
                gc,
                window,
                &CreateGCAux::new().foreground(screen.white_pixel),
            )?;
            connection.map_window(window)?;
            connection.poly_fill_rectangle(
                window,
                gc,
                &[Rectangle {
                    x: 8,
                    y: 8,
                    width: 40,
                    height: 24,
                }],
            )?;
            connection.flush()?;
            connection.get_input_focus()?.reply()?;
            let evidence = X11CaptureAdapter.controlled_window_gate(
                SessionKind::X11,
                window,
                correlation_id,
            )?;
            connection.destroy_window(window)?;
            connection.flush()?;
            Ok(evidence)
        })()
        .map(|evidence| json!(evidence))
        .map_err(|error| {
            error
                .downcast_ref::<PlatformError>()
                .cloned()
                .unwrap_or_else(|| {
                    PlatformError::new(
                        cute_screen_desktop::platform::PlatformErrorCode::CaptureFailed,
                        correlation_id,
                    )
                })
        });
        let layout = result
            .as_ref()
            .ok()
            .and_then(|value| value.get("monitors").cloned())
            .unwrap_or_else(|| json!([]));
        (result, BTreeMap::new(), layout)
    }

    #[cfg(not(feature = "x11-capture"))]
    fn x11_controlled(correlation_id: &str) -> Observation {
        (
            Err(PlatformError::new(
                cute_screen_desktop::platform::PlatformErrorCode::CaptureFailed,
                correlation_id,
            )),
            BTreeMap::new(),
            json!([]),
        )
    }

    fn portal_version_map(
        probe: Option<&cute_screen_desktop::platform::PortalCapabilityProbe>,
    ) -> BTreeMap<String, String> {
        probe
            .map(|probe| {
                BTreeMap::from([
                    (
                        "screenshot".to_owned(),
                        probe.screenshot_version.to_string(),
                    ),
                    (
                        "globalShortcuts".to_owned(),
                        probe.global_shortcuts_available.to_string(),
                    ),
                ])
            })
            .unwrap_or_default()
    }

    fn required_option(args: &[String], name: &str) -> Result<PathBuf, String> {
        option(args, name)
            .map(PathBuf::from)
            .ok_or_else(|| format!("missing required {name} <path>"))
    }

    fn option(args: &[String], name: &str) -> Option<String> {
        args.windows(2)
            .find(|pair| pair[0] == name)
            .map(|pair| pair[1].clone())
    }

    fn command_output(program: &str, args: &[&str]) -> String {
        Command::new(program)
            .args(args)
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "unavailable".to_owned())
    }

    fn write_evidence(
        path: &Path,
        evidence: &EvidenceEnvelope,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_vec_pretty(evidence)?)?;
        Ok(())
    }

    fn print_help() {
        println!(
            "M01 Linux platform smoke\n\n\
             cargo run --bin m01-platform-smoke -- portal-probe --output <json>\n\
             cargo run --bin m01-platform-smoke -- portal-screenshot --output <json>\n\
             cargo run --bin m01-platform-smoke -- portal-shortcuts --output <json>\n\
             cargo run --bin m01-platform-smoke -- portal-invalid-uri --output <json>\n\
             cargo run --features x11-capture --bin m01-platform-smoke -- x11-controlled --output <json>"
        );
    }
}

#[cfg(target_os = "linux")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    linux::run()
}

#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("m01-platform-smoke is available only on Linux");
    std::process::exit(2);
}
