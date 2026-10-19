use std::{
    future::Future,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use ashpd::zbus::{self, Connection, fdo::RequestNameFlags};
use futures_util::future::{Either, select};

use crate::{
    image_transport::ImageTransportService,
    platform::{CaptureRequest, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

// GNOME <=42 explicitly permits this legacy screenshot client name. Never
// replace another screenshot application's owner or retain the name between shots.
const CLIENT_NAME: &str = "org.gnome.Screenshot";

async fn bounded<T>(
    work: impl Future<Output = Result<T, PlatformErrorCode>>,
    cancelled: &AtomicBool,
    timeout: Duration,
) -> Result<T, PlatformErrorCode> {
    let cancel = async {
        loop {
            if cancelled.load(Ordering::Acquire) {
                return Err(PlatformErrorCode::Cancelled);
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    };
    futures_util::pin_mut!(work, cancel);
    match tokio::time::timeout(timeout, select(cancel, work)).await {
        Ok(Either::Left((result, _))) | Ok(Either::Right((result, _))) => result,
        Err(_) => Err(PlatformErrorCode::CaptureFailed),
    }
}

fn dbus_error(error: zbus::Error) -> PlatformErrorCode {
    eprintln!("cute-screen GNOME Screenshot: {error}");
    match error {
        zbus::Error::NameTaken => PlatformErrorCode::Busy,
        zbus::Error::MethodError(name, _, _) if name.as_str().ends_with("AccessDenied") => {
            PlatformErrorCode::PermissionDenied
        }
        _ => PlatformErrorCode::CaptureFailed,
    }
}

fn validate_reply(reply: (bool, String), output: &Path) -> Result<(), PlatformErrorCode> {
    if reply.0 && Path::new(&reply.1) == output {
        Ok(())
    } else {
        Err(PlatformErrorCode::CaptureFailed)
    }
}

async fn screenshot(connection: &Connection, output: &Path) -> Result<(), PlatformErrorCode> {
    connection
        .request_name_with_flags(CLIENT_NAME, RequestNameFlags::DoNotQueue.into())
        .await
        .map_err(dbus_error)?;
    let output_name = output.to_str().ok_or(PlatformErrorCode::CaptureFailed)?;
    let reply = connection
        .call_method(
            Some("org.gnome.Shell.Screenshot"),
            "/org/gnome/Shell/Screenshot",
            Some("org.gnome.Shell.Screenshot"),
            "Screenshot",
            &(false, false, output_name),
        )
        .await
        .map_err(dbus_error)?
        .body()
        .deserialize::<(bool, String)>()
        .map_err(|_| PlatformErrorCode::CaptureFailed)?;
    validate_reply(reply, output)
}

pub async fn capture(
    request: CaptureRequest,
    transport: Arc<ImageTransportService>,
    cancelled: Arc<AtomicBool>,
) -> Result<CaptureResult, PlatformError> {
    let id = request.correlation_id.clone();
    let failure = |code| PlatformError::new(code, &id);
    if !matches!(request.target, CaptureTarget::Area | CaptureTarget::Monitor) {
        return Err(failure(PlatformErrorCode::InvalidTarget));
    }
    let directory = tempfile::Builder::new()
        .prefix("cute-screen-gnome-")
        .tempdir()
        .map_err(|_| failure(PlatformErrorCode::CaptureFailed))?;
    let output = directory.path().join("frame.png");
    let connection = bounded(
        async { Connection::session().await.map_err(dbus_error) },
        &cancelled,
        Duration::from_secs(2),
    )
    .await
    .map_err(failure)?;
    let captured = bounded(
        screenshot(&connection, &output),
        &cancelled,
        Duration::from_secs(10),
    )
    .await;
    // Closing the dedicated socket also releases the compatibility name on
    // failure/cancellation, even if the Screenshot reply never arrived.
    let closed = tokio::time::timeout(Duration::from_secs(2), connection.close()).await;
    if !matches!(closed, Ok(Ok(()))) {
        eprintln!("cute-screen GNOME Screenshot connection close: {closed:?}");
        return Err(failure(PlatformErrorCode::CaptureFailed));
    }
    captured.map_err(failure)?;
    tokio::task::spawn_blocking(move || {
        let failure = |code| PlatformError::new(code, &request.correlation_id);
        let (width, height) = super::helpers::validate_png(&output).map_err(failure)?;
        if cancelled.load(Ordering::Acquire) {
            return Err(failure(PlatformErrorCode::Cancelled));
        }
        let token = format!("gnome-shell-{}", uuid::Uuid::now_v7().simple());
        transport.import_owned_image(
            &token,
            &output,
            "image/png",
            width,
            height,
            &request.correlation_id,
        )?;
        drop(directory);
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
    })
    .await
    .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, id))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_successful_reply_for_our_private_output_is_accepted() {
        let path = Path::new("/private/frame.png");
        assert!(validate_reply((true, path.to_string_lossy().into_owned()), path).is_ok());
        assert!(validate_reply((false, path.to_string_lossy().into_owned()), path).is_err());
        assert!(validate_reply((true, "/other/file.png".to_owned()), path).is_err());
        assert_eq!(dbus_error(zbus::Error::NameTaken), PlatformErrorCode::Busy);
    }

    #[test]
    fn cancellation_prevents_work_and_timeout_is_bounded() {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap()
            .block_on(async {
                let cancelled = AtomicBool::new(true);
                let never_poll = async { panic!("cancelled capture must not start D-Bus work") };
                assert_eq!(
                    bounded::<()>(never_poll, &cancelled, Duration::from_secs(1)).await,
                    Err(PlatformErrorCode::Cancelled)
                );
                cancelled.store(false, Ordering::Release);
                assert_eq!(
                    bounded::<()>(std::future::pending(), &cancelled, Duration::from_millis(5))
                        .await,
                    Err(PlatformErrorCode::CaptureFailed)
                );
            });
    }
}
