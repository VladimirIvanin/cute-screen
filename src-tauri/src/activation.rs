#[cfg(unix)]
use std::{
    io,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

#[cfg(unix)]
use std::io::{Read, Write};

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[cfg(unix)]
use crate::capture::CaptureOutcomeV1;
use crate::capture::{CaptureRequestV1, CaptureTerminalOutcome};

pub const ACTIVATION_PROTOCOL_VERSION: u8 = 1;
#[cfg(unix)]
const MAX_PAYLOAD_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRequestV1 {
    pub version: u8,
    pub request_id: String,
    pub capture: CaptureRequestV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationReplyV1 {
    pub version: u8,
    pub request_id: String,
    pub outcome: CaptureTerminalOutcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivationDispatch {
    NoPrimary,
    Accepted,
    Terminal,
}

#[derive(Debug, Error)]
pub enum ActivationError {
    #[error("activation endpoint is unavailable")]
    Unavailable,
    #[error("activation payload is invalid")]
    InvalidPayload,
    #[error("activation I/O failed: {0}")]
    Io(String),
}

#[cfg(unix)]
mod unix {
    use std::{
        fs,
        io::ErrorKind,
        os::unix::{
            fs::PermissionsExt,
            net::{UnixListener, UnixStream},
        },
    };

    use super::*;

    pub struct ActivationServer {
        endpoint: PathBuf,
        running: Arc<AtomicBool>,
        worker: Option<JoinHandle<()>>,
    }

    impl ActivationServer {
        pub fn start(
            endpoint: PathBuf,
            handler: Arc<dyn Fn(CaptureRequestV1) -> CaptureOutcomeV1 + Send + Sync>,
        ) -> Result<Self, ActivationError> {
            if let Some(parent) = endpoint.parent() {
                fs::create_dir_all(parent).map_err(io_error)?;
            }
            let listener = bind_listener(&endpoint)?;
            listener.set_nonblocking(true).map_err(io_error)?;
            let running = Arc::new(AtomicBool::new(true));
            let worker_running = Arc::clone(&running);
            let worker = thread::Builder::new()
                .name("cute-screen-activation".to_owned())
                .spawn(move || {
                    while worker_running.load(Ordering::Acquire) {
                        match listener.accept() {
                            Ok((stream, _)) => {
                                let handler = Arc::clone(&handler);
                                thread::spawn(move || handle_connection(stream, handler));
                            }
                            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                                thread::sleep(Duration::from_millis(25));
                            }
                            Err(_) => break,
                        }
                    }
                })
                .map_err(io_error)?;
            Ok(Self {
                endpoint,
                running,
                worker: Some(worker),
            })
        }
    }

    impl Drop for ActivationServer {
        fn drop(&mut self) {
            self.running.store(false, Ordering::Release);
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
            let _ = fs::remove_file(&self.endpoint);
        }
    }

    fn bind_listener(endpoint: &Path) -> Result<UnixListener, ActivationError> {
        match UnixListener::bind(endpoint) {
            Ok(listener) => set_socket_permissions(endpoint, listener),
            Err(error) if error.kind() == ErrorKind::AddrInUse => {
                match UnixStream::connect(endpoint) {
                    Ok(_) => Err(ActivationError::Unavailable),
                    Err(_) => {
                        fs::remove_file(endpoint).map_err(io_error)?;
                        let listener = UnixListener::bind(endpoint).map_err(io_error)?;
                        set_socket_permissions(endpoint, listener)
                    }
                }
            }
            Err(error) => Err(io_error(error)),
        }
    }

    fn set_socket_permissions(
        endpoint: &Path,
        listener: UnixListener,
    ) -> Result<UnixListener, ActivationError> {
        fs::set_permissions(endpoint, fs::Permissions::from_mode(0o600)).map_err(io_error)?;
        Ok(listener)
    }

    pub fn dispatch(
        endpoint: &Path,
        request: ActivationRequestV1,
        wait_for_terminal_reply: bool,
    ) -> Result<(ActivationDispatch, Option<ActivationReplyV1>), ActivationError> {
        let mut stream = match UnixStream::connect(endpoint) {
            Ok(stream) => stream,
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::NotFound | ErrorKind::ConnectionRefused
                ) =>
            {
                return Ok((ActivationDispatch::NoPrimary, None));
            }
            Err(error) => return Err(io_error(error)),
        };
        write_frame(&mut stream, &request)?;
        if !wait_for_terminal_reply {
            return Ok((ActivationDispatch::Accepted, None));
        }
        let reply: ActivationReplyV1 = read_frame(&mut stream)?;
        if reply.version != ACTIVATION_PROTOCOL_VERSION || reply.request_id != request.request_id {
            return Err(ActivationError::InvalidPayload);
        }
        Ok((ActivationDispatch::Terminal, Some(reply)))
    }

    fn handle_connection(
        mut stream: UnixStream,
        handler: Arc<dyn Fn(CaptureRequestV1) -> CaptureOutcomeV1 + Send + Sync>,
    ) {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let request: ActivationRequestV1 = match read_frame::<ActivationRequestV1>(&mut stream) {
            Ok(request) if request.version == ACTIVATION_PROTOCOL_VERSION => request,
            _ => return,
        };
        let _ = stream.set_read_timeout(None);
        let outcome = handler(request.capture);
        let reply = ActivationReplyV1 {
            version: ACTIVATION_PROTOCOL_VERSION,
            request_id: request.request_id,
            outcome: outcome.outcome,
        };
        let _ = write_frame(&mut stream, &reply);
    }

    fn write_frame<T: Serialize>(
        stream: &mut UnixStream,
        value: &T,
    ) -> Result<(), ActivationError> {
        let payload = serde_json::to_vec(value).map_err(|_| ActivationError::InvalidPayload)?;
        if payload.len() > MAX_PAYLOAD_BYTES {
            return Err(ActivationError::InvalidPayload);
        }
        let length = u32::try_from(payload.len()).map_err(|_| ActivationError::InvalidPayload)?;
        stream.write_all(&length.to_be_bytes()).map_err(io_error)?;
        stream.write_all(&payload).map_err(io_error)
    }

    fn read_frame<T: for<'de> Deserialize<'de>>(
        stream: &mut UnixStream,
    ) -> Result<T, ActivationError> {
        let mut length = [0_u8; 4];
        stream.read_exact(&mut length).map_err(io_error)?;
        let length = usize::try_from(u32::from_be_bytes(length))
            .map_err(|_| ActivationError::InvalidPayload)?;
        if length > MAX_PAYLOAD_BYTES {
            return Err(ActivationError::InvalidPayload);
        }
        let mut payload = vec![0_u8; length];
        stream.read_exact(&mut payload).map_err(io_error)?;
        serde_json::from_slice(&payload).map_err(|_| ActivationError::InvalidPayload)
    }

    fn io_error(error: io::Error) -> ActivationError {
        ActivationError::Io(error.to_string())
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use crate::capture::{CaptureAction, CaptureInvocationSource, CaptureTerminalOutcome};
        use std::os::unix::fs::PermissionsExt;

        fn request() -> ActivationRequestV1 {
            ActivationRequestV1 {
                version: ACTIVATION_PROTOCOL_VERSION,
                request_id: "request-1".to_owned(),
                capture: CaptureRequestV1 {
                    correlation_id: "capture-1".to_owned(),
                    action: CaptureAction::Area,
                    delay_ms: 0,
                    cursor: false,
                    series_id: None,
                    invocation_source: CaptureInvocationSource::Cli,
                },
            }
        }

        #[test]
        fn activation_round_trip_preserves_the_terminal_request_id() {
            let directory = tempfile::tempdir().expect("temporary socket directory");
            let endpoint = directory.path().join("activation.sock");
            let server = ActivationServer::start(
                endpoint.clone(),
                Arc::new(|_capture| CaptureOutcomeV1 {
                    version: 2,
                    correlation_id: "capture-1".to_owned(),
                    outcome: CaptureTerminalOutcome::Cancelled,
                    completion: None,
                    document: None,
                }),
            )
            .expect("activation server");
            let (_, reply) = dispatch(&endpoint, request(), true).expect("terminal reply");
            let reply = reply.expect("reply");
            assert_eq!(reply.request_id, "request-1");
            assert_eq!(reply.outcome, CaptureTerminalOutcome::Cancelled);
            drop(server);
        }

        #[test]
        fn endpoint_is_private_to_the_current_user() {
            let directory = tempfile::tempdir().expect("temporary socket directory");
            let endpoint = directory.path().join("activation.sock");
            let server = ActivationServer::start(
                endpoint.clone(),
                Arc::new(|_capture| CaptureOutcomeV1 {
                    version: 2,
                    correlation_id: "capture-1".to_owned(),
                    outcome: CaptureTerminalOutcome::Cancelled,
                    completion: None,
                    document: None,
                }),
            )
            .expect("activation server");
            let permissions = fs::metadata(&endpoint)
                .expect("socket metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(permissions, 0o600);
            drop(server);
        }

        #[test]
        fn stale_socket_is_replaced_before_starting_the_primary() {
            let directory = tempfile::tempdir().expect("temporary socket directory");
            let endpoint = directory.path().join("activation.sock");
            let stale_listener = UnixListener::bind(&endpoint).expect("stale socket");
            drop(stale_listener);
            let server = ActivationServer::start(
                endpoint.clone(),
                Arc::new(|_capture| CaptureOutcomeV1 {
                    version: 2,
                    correlation_id: "capture-1".to_owned(),
                    outcome: CaptureTerminalOutcome::Cancelled,
                    completion: None,
                    document: None,
                }),
            )
            .expect("replace stale socket");
            assert!(endpoint.exists());
            drop(server);
        }

        #[test]
        fn absent_server_is_not_reported_as_a_successful_dispatch() {
            let directory = tempfile::tempdir().expect("temporary socket directory");
            let (dispatch, reply) =
                dispatch(&directory.path().join("missing.sock"), request(), false)
                    .expect("missing primary is expected");
            assert_eq!(dispatch, ActivationDispatch::NoPrimary);
            assert!(reply.is_none());
        }
    }
}

#[cfg(unix)]
pub use unix::ActivationServer;

#[cfg(unix)]
pub fn endpoint_for_current_session() -> Result<PathBuf, ActivationError> {
    use sha2::{Digest, Sha256};

    let runtime = std::env::var_os("XDG_RUNTIME_DIR").ok_or(ActivationError::Unavailable)?;
    let scope = [
        "XDG_SESSION_ID",
        "WAYLAND_DISPLAY",
        "DISPLAY",
        "XDG_CURRENT_DESKTOP",
    ]
    .into_iter()
    .filter_map(|name| std::env::var(name).ok())
    .collect::<Vec<_>>()
    .join("\u{1f}");
    let digest = format!("{:x}", Sha256::digest(scope.as_bytes()));
    Ok(PathBuf::from(runtime).join(format!("cute-screen-{}.sock", &digest[..16])))
}

#[cfg(unix)]
pub fn dispatch_to_primary(
    request: ActivationRequestV1,
    wait_for_terminal_reply: bool,
) -> Result<(ActivationDispatch, Option<ActivationReplyV1>), ActivationError> {
    unix::dispatch(
        &endpoint_for_current_session()?,
        request,
        wait_for_terminal_reply,
    )
}

#[cfg(not(unix))]
pub struct ActivationServer;

#[cfg(not(unix))]
pub fn dispatch_to_primary(
    _request: ActivationRequestV1,
    _wait_for_terminal_reply: bool,
) -> Result<(ActivationDispatch, Option<ActivationReplyV1>), ActivationError> {
    Ok((ActivationDispatch::NoPrimary, None))
}
