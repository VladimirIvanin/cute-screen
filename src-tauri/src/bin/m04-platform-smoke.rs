#[cfg(target_os = "linux")]
mod linux {
    use std::{
        env, fs,
        io::ErrorKind,
        os::unix::net::UnixStream,
        path::PathBuf,
        process::Command,
        sync::Arc,
        thread,
        time::{Duration, Instant},
    };

    use cute_screen_desktop::{
        capture::{CaptureAction, CaptureController, CaptureInvocationSource, CaptureRequestV1},
        image_transport::ImageTransportService,
        storage::LibraryRepository,
    };
    use serde::Serialize;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SmokeEvidence {
        schema_version: u8,
        os: String,
        architecture: String,
        session: String,
        action: String,
        outcome: cute_screen_desktop::capture::CaptureOutcomeV1,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ColdCliSmokeEvidence {
        schema_version: u8,
        os: String,
        architecture: String,
        session: String,
        executable: String,
        exit_code: i32,
        reply: cute_screen_desktop::activation::ActivationReplyV1,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct RepeatSmokeEvidence {
        schema_version: u8,
        os: String,
        architecture: String,
        session: String,
        initial: cute_screen_desktop::capture::CaptureOutcomeV1,
        repeat: cute_screen_desktop::capture::CaptureOutcomeV1,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct WarmCliSmokeEvidence {
        schema_version: u8,
        os: String,
        architecture: String,
        session: String,
        executable: String,
        exit_code: i32,
        reply: cute_screen_desktop::activation::ActivationReplyV1,
    }

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let args = env::args().skip(1).collect::<Vec<_>>();
        if !env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .eq_ignore_ascii_case("x11")
        {
            return Err("M04 X11 smoke requires XDG_SESSION_TYPE=x11".into());
        }
        match args.first().map(String::as_str) {
            Some("x11-screen") => screen_smoke(&args, false),
            Some("x11-screen-cursor") => screen_smoke(&args, true),
            Some("x11-area") => area_smoke(&args),
            Some("x11-area-cancel") => area_cancel_smoke(&args),
            Some("x11-window") => window_smoke(&args),
            Some("x11-active-window") => active_window_smoke(&args),
            Some("x11-repeat") => repeat_smoke(&args),
            Some("x11-cli-cold") => cold_cli_smoke(&args),
            Some("x11-cli-warm") => warm_cli_smoke(&args),
            _ => Err("usage: m04-platform-smoke x11-screen|x11-area|x11-area-cancel|x11-window|x11-active-window|x11-repeat --data-dir <path> --output <path> | x11-cli-cold|x11-cli-warm --executable <path> --output <path>".into()),
        }
    }

    fn screen_smoke(args: &[String], cursor: bool) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = required_option(args, "--data-dir")?;
        let output = required_option(args, "--output")?;
        let repository = LibraryRepository::initialize(&data_dir, &data_dir)?;
        let transport = Arc::new(ImageTransportService::new(
            data_dir.join("capture-staging"),
            data_dir.join("asset-staging"),
        )?);
        let controller = CaptureController::new(repository, transport);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()?;
        let outcome = runtime.block_on(controller.capture(CaptureRequestV1 {
            correlation_id: uuid::Uuid::now_v7().to_string(),
            action: CaptureAction::Screen,
            delay_ms: 0,
            cursor,
            series_id: None,
            invocation_source: CaptureInvocationSource::Cli,
        }));
        let evidence = SmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            action: if cursor { "screenCursor" } else { "screen" }.to_owned(),
            outcome,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn cold_cli_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let executable = required_option(args, "--executable")?;
        let output = required_option(args, "--output")?;
        let process = Command::new(&executable)
            .args(["capture", "--mode", "screen", "--json"])
            .output()?;
        let exit_code = process
            .status
            .code()
            .ok_or("cold CLI terminated without an exit code")?;
        if !process.status.success() {
            return Err(format!(
                "cold CLI failed ({exit_code}): {}",
                String::from_utf8_lossy(&process.stderr)
            )
            .into());
        }
        let reply: cute_screen_desktop::activation::ActivationReplyV1 =
            serde_json::from_slice(&process.stdout)?;
        if reply.outcome != cute_screen_desktop::capture::CaptureTerminalOutcome::Captured {
            return Err(format!("cold CLI returned {:?}", reply.outcome).into());
        }
        let evidence = ColdCliSmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            executable: executable.display().to_string(),
            exit_code,
            reply,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn area_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = required_option(args, "--data-dir")?;
        let output = required_option(args, "--output")?;
        let repository = LibraryRepository::initialize(&data_dir, &data_dir)?;
        let transport = Arc::new(ImageTransportService::new(
            data_dir.join("capture-staging"),
            data_dir.join("asset-staging"),
        )?);
        let controller = CaptureController::new(repository, transport);
        // xdotool is a local test driver only; it is never a product capture
        // dependency. The root frame is captured before this synthetic drag.
        let driver = thread::spawn(|| {
            thread::sleep(Duration::from_millis(1200));
            Command::new("xdotool")
                .args([
                    "mousemove",
                    "--sync",
                    "100",
                    "100",
                    "mousedown",
                    "1",
                    "mousemove",
                    "--sync",
                    "400",
                    "300",
                    "mouseup",
                    "1",
                    "key",
                    "Return",
                ])
                .status()
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()?;
        let outcome = runtime.block_on(controller.capture(CaptureRequestV1 {
            correlation_id: uuid::Uuid::now_v7().to_string(),
            action: CaptureAction::Area,
            delay_ms: 0,
            cursor: false,
            series_id: None,
            invocation_source: CaptureInvocationSource::Cli,
        }));
        let driver_status = driver
            .join()
            .map_err(|_| "xdotool driver thread panicked")??;
        if !driver_status.success() {
            return Err(format!("xdotool failed: {driver_status}").into());
        }
        let document = outcome
            .document
            .as_ref()
            .ok_or_else(|| format!("area capture returned {:?}", outcome.outcome))?;
        let document_json: serde_json::Value = serde_json::from_str(&document.document_json)?;
        if document_json["canvas"]["width"] != 300 || document_json["canvas"]["height"] != 200 {
            return Err(format!(
                "area dimensions were {}, expected 300×200",
                document_json["canvas"]
            )
            .into());
        }
        let evidence = SmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            action: "area".to_owned(),
            outcome,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn window_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = required_option(args, "--data-dir")?;
        let output = required_option(args, "--output")?;
        let repository = LibraryRepository::initialize(&data_dir, &data_dir)?;
        let transport = Arc::new(ImageTransportService::new(
            data_dir.join("capture-staging"),
            data_dir.join("asset-staging"),
        )?);
        let controller = CaptureController::new(repository, transport);
        // The test clicks a visible non-desktop client. xdotool is solely the
        // local test driver; the selector itself is native x11rb code.
        let driver = thread::spawn(|| {
            thread::sleep(Duration::from_millis(1200));
            Command::new("xdotool")
                .args(["mousemove", "--sync", "200", "200", "click", "1"])
                .status()
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()?;
        let outcome = runtime.block_on(controller.capture(CaptureRequestV1 {
            correlation_id: uuid::Uuid::now_v7().to_string(),
            action: CaptureAction::Window,
            delay_ms: 0,
            cursor: false,
            series_id: None,
            invocation_source: CaptureInvocationSource::Cli,
        }));
        let driver_status = driver
            .join()
            .map_err(|_| "xdotool window driver thread panicked")??;
        if !driver_status.success() {
            return Err(format!("xdotool failed: {driver_status}").into());
        }
        let document = outcome
            .document
            .as_ref()
            .ok_or_else(|| format!("window capture returned {:?}", outcome.outcome))?;
        let document_json: serde_json::Value = serde_json::from_str(&document.document_json)?;
        if document_json["canvas"]["width"]
            .as_u64()
            .is_none_or(|width| width == 0)
            || document_json["canvas"]["height"]
                .as_u64()
                .is_none_or(|height| height == 0)
        {
            return Err("window selector produced an empty document".into());
        }
        let evidence = SmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            action: "window".to_owned(),
            outcome,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn area_cancel_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = required_option(args, "--data-dir")?;
        let output = required_option(args, "--output")?;
        let repository = LibraryRepository::initialize(&data_dir, &data_dir)?;
        let transport = Arc::new(ImageTransportService::new(
            data_dir.join("capture-staging"),
            data_dir.join("asset-staging"),
        )?);
        let controller = CaptureController::new(repository, transport);
        let running = controller.clone();
        let task = thread::spawn(move || -> std::io::Result<_> {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_time()
                .build()?;
            let outcome = runtime.block_on(running.capture(CaptureRequestV1 {
                correlation_id: uuid::Uuid::now_v7().to_string(),
                action: CaptureAction::Area,
                delay_ms: 0,
                cursor: false,
                series_id: None,
                invocation_source: CaptureInvocationSource::Cli,
            }));
            Ok(outcome)
        });
        thread::sleep(Duration::from_millis(500));
        if !controller.cancel() {
            return Err("controller did not report an active area selection".into());
        }
        let outcome = task
            .join()
            .map_err(|_| "area cancellation thread panicked")??;
        if outcome.outcome != cute_screen_desktop::capture::CaptureTerminalOutcome::Cancelled
            || outcome.document.is_some()
        {
            return Err(format!("area cancel returned {:?}", outcome.outcome).into());
        }
        let evidence = SmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            action: "areaCancel".to_owned(),
            outcome,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn active_window_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = required_option(args, "--data-dir")?;
        let output = required_option(args, "--output")?;
        let repository = LibraryRepository::initialize(&data_dir, &data_dir)?;
        let transport = Arc::new(ImageTransportService::new(
            data_dir.join("capture-staging"),
            data_dir.join("asset-staging"),
        )?);
        let controller = CaptureController::new(repository, transport);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()?;
        let outcome = runtime.block_on(controller.capture(CaptureRequestV1 {
            correlation_id: uuid::Uuid::now_v7().to_string(),
            action: CaptureAction::ActiveWindow,
            delay_ms: 0,
            cursor: false,
            series_id: None,
            invocation_source: CaptureInvocationSource::Cli,
        }));
        let document = outcome
            .document
            .as_ref()
            .ok_or_else(|| format!("active-window capture returned {:?}", outcome.outcome))?;
        let document_json: serde_json::Value = serde_json::from_str(&document.document_json)?;
        if document_json["canvas"]["width"]
            .as_u64()
            .is_none_or(|width| width == 0)
            || document_json["canvas"]["height"]
                .as_u64()
                .is_none_or(|height| height == 0)
        {
            return Err("active-window target produced an empty document".into());
        }
        let evidence = SmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            action: "activeWindow".to_owned(),
            outcome,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn repeat_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = required_option(args, "--data-dir")?;
        let output = required_option(args, "--output")?;
        let repository = LibraryRepository::initialize(&data_dir, &data_dir)?;
        let transport = Arc::new(ImageTransportService::new(
            data_dir.join("capture-staging"),
            data_dir.join("asset-staging"),
        )?);
        let controller = CaptureController::new(repository, transport);
        let driver = thread::spawn(|| {
            thread::sleep(Duration::from_millis(1200));
            Command::new("xdotool")
                .args([
                    "mousemove",
                    "--sync",
                    "100",
                    "100",
                    "mousedown",
                    "1",
                    "mousemove",
                    "--sync",
                    "400",
                    "300",
                    "mouseup",
                    "1",
                    "key",
                    "Return",
                ])
                .status()
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()?;
        let (initial, repeat) = runtime.block_on(async {
            let initial = controller
                .capture(CaptureRequestV1 {
                    correlation_id: uuid::Uuid::now_v7().to_string(),
                    action: CaptureAction::Area,
                    delay_ms: 0,
                    cursor: false,
                    series_id: None,
                    invocation_source: CaptureInvocationSource::Cli,
                })
                .await;
            let repeat = controller
                .capture(CaptureRequestV1 {
                    correlation_id: uuid::Uuid::now_v7().to_string(),
                    action: CaptureAction::Repeat,
                    delay_ms: 0,
                    cursor: false,
                    series_id: None,
                    invocation_source: CaptureInvocationSource::Cli,
                })
                .await;
            (initial, repeat)
        });
        let driver_status = driver
            .join()
            .map_err(|_| "xdotool repeat driver thread panicked")??;
        if !driver_status.success() {
            return Err(format!("xdotool failed: {driver_status}").into());
        }
        for (label, outcome) in [("initial", &initial), ("repeat", &repeat)] {
            let document = outcome
                .document
                .as_ref()
                .ok_or_else(|| format!("{label} returned {:?}", outcome.outcome))?;
            let document_json: serde_json::Value = serde_json::from_str(&document.document_json)?;
            if document_json["canvas"]["width"] != 300 || document_json["canvas"]["height"] != 200 {
                return Err(format!(
                    "{label} dimensions were {}, expected 300×200",
                    document_json["canvas"]
                )
                .into());
            }
        }
        let evidence = RepeatSmokeEvidence {
            schema_version: 1,
            os: env::consts::OS.to_owned(),
            architecture: env::consts::ARCH.to_owned(),
            session: "x11".to_owned(),
            initial,
            repeat,
        };
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn warm_cli_smoke(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
        let executable = required_option(args, "--executable")?;
        let output = required_option(args, "--output")?;
        let endpoint = cute_screen_desktop::activation::endpoint_for_current_session()?;
        remove_stale_endpoint_or_reject_primary(&endpoint)?;
        let isolated_data = tempfile::tempdir()?;
        let data_home = isolated_data.path().join("data");
        let cache_home = isolated_data.path().join("cache");
        let mut primary = Command::new(&executable)
            .arg("--background")
            .env("XDG_DATA_HOME", &data_home)
            .env("XDG_CACHE_HOME", &cache_home)
            .spawn()?;
        let smoke_result = (|| -> Result<WarmCliSmokeEvidence, Box<dyn std::error::Error>> {
            wait_for_endpoint(&endpoint)?;
            let process = Command::new(&executable)
                .args(["capture", "--mode", "screen", "--json"])
                .env("XDG_DATA_HOME", &data_home)
                .env("XDG_CACHE_HOME", &cache_home)
                .output()?;
            let exit_code = process
                .status
                .code()
                .ok_or("warm CLI terminated without an exit code")?;
            if !process.status.success() {
                return Err(format!(
                    "warm CLI failed ({exit_code}): {}",
                    String::from_utf8_lossy(&process.stderr)
                )
                .into());
            }
            let reply: cute_screen_desktop::activation::ActivationReplyV1 =
                serde_json::from_slice(&process.stdout)?;
            if reply.outcome != cute_screen_desktop::capture::CaptureTerminalOutcome::Captured {
                return Err(format!("warm CLI returned {:?}", reply.outcome).into());
            }
            Ok(WarmCliSmokeEvidence {
                schema_version: 1,
                os: env::consts::OS.to_owned(),
                architecture: env::consts::ARCH.to_owned(),
                session: "x11".to_owned(),
                executable: executable.display().to_string(),
                exit_code,
                reply,
            })
        })();
        let _ = primary.kill();
        let _ = primary.wait();
        // The child is intentionally terminated after proving warm dispatch.
        // It therefore cannot execute its normal Drop cleanup; this endpoint
        // was created only after the no-primary precondition above.
        if endpoint.exists() {
            fs::remove_file(&endpoint)?;
        }
        let evidence = smoke_result?;
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&output, serde_json::to_vec_pretty(&evidence)?)?;
        println!("{}", output.display());
        Ok(())
    }

    fn wait_for_endpoint(endpoint: &std::path::Path) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if endpoint.exists() {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(25));
        }
        Err(format!(
            "primary did not create activation endpoint: {}",
            endpoint.display()
        ))
    }

    fn remove_stale_endpoint_or_reject_primary(
        endpoint: &std::path::Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !endpoint.exists() {
            return Ok(());
        }
        match UnixStream::connect(endpoint) {
            Ok(_) => Err(format!(
                "warm CLI smoke requires no existing primary process ({})",
                endpoint.display()
            )
            .into()),
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::ConnectionRefused | ErrorKind::NotFound
                ) =>
            {
                fs::remove_file(endpoint)?;
                Ok(())
            }
            Err(error) => Err(error.into()),
        }
    }

    fn required_option(args: &[String], name: &str) -> Result<PathBuf, String> {
        args.windows(2)
            .find(|pair| pair[0] == name)
            .map(|pair| PathBuf::from(&pair[1]))
            .ok_or_else(|| format!("missing required {name} <path>"))
    }
}

#[cfg(target_os = "linux")]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    linux::run()
}

#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("m04-platform-smoke is available only on Linux");
    std::process::exit(2);
}
