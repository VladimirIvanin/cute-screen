use std::{
    ffi::OsStr,
    fs::{self, File},
    io::BufReader,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

use crate::{
    image_transport::ImageTransportService,
    platform::{
        CaptureRequest, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode,
        capture_method::LinuxCaptureMethod,
    },
};

const MAX_FRAME_BYTES: usize = 512 * 1024 * 1024;
const HELPER_TIMEOUT: Duration = Duration::from_secs(10);

pub fn find_program(name: &str) -> Option<PathBuf> {
    let mut directories: Vec<_> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        directories.push(PathBuf::from(home).join(".local/bin"));
    }
    directories
        .into_iter()
        .map(|dir| dir.join(name))
        .find(|path| {
            fs::metadata(path)
                .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        })
}

struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        match self.0.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => {}
            Err(error) => eprintln!("cute-screen capture helper status: {error}"),
        }
        if let Err(error) = self.0.kill() {
            eprintln!("cute-screen capture helper stop: {error}");
        }
        if let Err(error) = self.0.wait() {
            eprintln!("cute-screen capture helper reap: {error}");
        }
    }
}

fn run_helper(
    program: &Path,
    arguments: &[&OsStr],
    cancelled: &AtomicBool,
    timeout: Duration,
) -> Result<(), PlatformErrorCode> {
    if cancelled.load(Ordering::Acquire) {
        return Err(PlatformErrorCode::Cancelled);
    }
    let child = Command::new(program)
        .args(arguments)
        .env("GDK_BACKEND", "wayland")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| {
            eprintln!("cute-screen capture helper {}: {error}", program.display());
            PlatformErrorCode::PortalUnavailable
        })?;
    let mut guard = ChildGuard(child);
    let started = Instant::now();
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Err(PlatformErrorCode::Cancelled);
        }
        if let Some(status) = guard
            .0
            .try_wait()
            .map_err(|_| PlatformErrorCode::CaptureFailed)?
        {
            return status
                .success()
                .then_some(())
                .ok_or(PlatformErrorCode::CaptureFailed);
        }
        if started.elapsed() >= timeout {
            return Err(PlatformErrorCode::CaptureFailed);
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

pub(crate) fn validate_png(path: &Path) -> Result<(u32, u32), PlatformErrorCode> {
    let file = File::open(path).map_err(|_| PlatformErrorCode::CaptureFailed)?;
    let mut decoder = png::Decoder::new(BufReader::new(file));
    decoder.set_limits(png::Limits {
        bytes: MAX_FRAME_BYTES,
    });
    let mut reader = decoder
        .read_info()
        .map_err(|_| PlatformErrorCode::CaptureFailed)?;
    let size = reader
        .output_buffer_size()
        .filter(|size| *size > 0 && *size <= MAX_FRAME_BYTES)
        .ok_or(PlatformErrorCode::CaptureFailed)?;
    let mut pixels = vec![0; size];
    let frame = reader
        .next_frame(&mut pixels)
        .map_err(|_| PlatformErrorCode::CaptureFailed)?;
    // Check the end of the PNG too: a header or a partially written file is not a capture.
    reader
        .finish()
        .map_err(|_| PlatformErrorCode::CaptureFailed)?;
    Ok((frame.width, frame.height))
}

pub fn capture(
    method: LinuxCaptureMethod,
    program: &Path,
    request: CaptureRequest,
    transport: &ImageTransportService,
    cancelled: &AtomicBool,
) -> Result<CaptureResult, PlatformError> {
    let id = &request.correlation_id;
    let failure = |code| PlatformError::new(code, id);
    if !matches!(request.target, CaptureTarget::Area | CaptureTarget::Monitor) {
        return Err(failure(PlatformErrorCode::InvalidTarget));
    }
    let directory = tempfile::Builder::new()
        .prefix("cute-screen-capture-")
        .tempdir()
        .map_err(|_| failure(PlatformErrorCode::CaptureFailed))?;
    let output = directory.path().join("frame.png");
    let arguments: Vec<&OsStr> = match method {
        LinuxCaptureMethod::GnomeScreenshot => vec![OsStr::new("--file"), output.as_os_str()],
        LinuxCaptureMethod::Grim => vec![OsStr::new("-t"), OsStr::new("png"), output.as_os_str()],
        _ => return Err(failure(PlatformErrorCode::InvalidTarget)),
    };
    run_helper(program, &arguments, cancelled, HELPER_TIMEOUT).map_err(failure)?;
    let (width, height) = validate_png(&output).map_err(failure)?;
    if cancelled.load(Ordering::Acquire) {
        return Err(failure(PlatformErrorCode::Cancelled));
    }
    let prefix = if method == LinuxCaptureMethod::Grim {
        "grim"
    } else {
        "gnome-screenshot"
    };
    let token = format!("{prefix}-{}", uuid::Uuid::now_v7().simple());
    transport.import_owned_image(&token, &output, "image/png", width, height, id)?;
    Ok(CaptureResult {
        image_token: token,
        correlation_id: request.correlation_id,
        width,
        height,
        geometry: None,
        quick_frame_geometry: None,
        quick_selection_pending: request.target == CaptureTarget::Area,
        cursor_included: Some(false),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_only_png_is_not_a_successful_capture() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("incomplete.png");
        fs::write(&path, [137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
        assert_eq!(validate_png(&path), Err(PlatformErrorCode::CaptureFailed));
    }

    #[test]
    fn full_size_png_is_decoded_and_truncation_is_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("frame.png");
        let file = File::create(&path).unwrap();
        let mut encoder = png::Encoder::new(file, 2560, 1440);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer
            .write_image_data(&vec![127; 2560 * 1440 * 4])
            .unwrap();
        writer.finish().unwrap();
        assert_eq!(validate_png(&path).unwrap(), (2560, 1440));
        let mut bytes = fs::read(&path).unwrap();
        bytes.truncate(bytes.len() / 2);
        fs::write(&path, bytes).unwrap();
        assert_eq!(validate_png(&path), Err(PlatformErrorCode::CaptureFailed));
    }

    #[test]
    fn cancelled_request_does_not_spawn_and_timeout_reaps_the_helper() {
        let cancelled = AtomicBool::new(true);
        assert_eq!(
            run_helper(Path::new("/not/a/program"), &[], &cancelled, Duration::ZERO),
            Err(PlatformErrorCode::Cancelled)
        );
        cancelled.store(false, Ordering::Release);
        let started = Instant::now();
        assert_eq!(
            run_helper(
                Path::new("/bin/sleep"),
                &[OsStr::new("10")],
                &cancelled,
                Duration::from_millis(40)
            ),
            Err(PlatformErrorCode::CaptureFailed)
        );
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
