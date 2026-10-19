use std::{
    future::Future,
    os::fd::{AsRawFd, OwnedFd},
    sync::Arc,
    time::Duration,
};

use ashpd::desktop::{
    Session,
    screencast::{CursorMode, Screencast, SelectSourcesOptions, SourceType},
};
use gstreamer as gst;
use gstreamer_video::prelude::*;

use crate::{
    image_transport::ImageTransportService,
    linux_platform::{map_ashpd_error, portal_handshake},
    platform::{CaptureRequest, CaptureResult, CaptureTarget, PlatformError, PlatformErrorCode},
};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_FRAME_BYTES: usize = 512 * 1024 * 1024;

#[derive(Default)]
pub struct ScreencastCaptureService {
    active: tokio::sync::Mutex<Option<AuthorizedMonitor>>,
}

struct AuthorizedMonitor {
    portal: Screencast,
    session: Session<Screencast>,
    node: u32,
}

pub fn raw_capture_available() -> bool {
    gst::init().is_ok()
        && ["pipewiresrc", "videoconvert", "appsink"]
            .iter()
            .all(|name| gst::ElementFactory::make(name).build().is_ok())
}

impl ScreencastCaptureService {
    pub async fn select_monitor(&self) -> Result<bool, PlatformError> {
        let id = "screen-selection";
        if !raw_capture_available() {
            return Err(PlatformError::new(PlatformErrorCode::PortalUnavailable, id));
        }
        let mut active = self
            .active
            .try_lock()
            .map_err(|_| PlatformError::new(PlatformErrorCode::Busy, id))?;
        match replace_authorization(&mut active, authorize_monitor(id)).await {
            Ok(mut previous) => {
                close_authorization(&mut previous).await;
                Ok(true)
            }
            Err(error) if error.code == PlatformErrorCode::Cancelled => Ok(false),
            Err(error) => Err(error),
        }
    }

    pub async fn capture(
        &self,
        request: CaptureRequest,
        transport: Arc<ImageTransportService>,
    ) -> Result<CaptureResult, PlatformError> {
        let started = std::time::Instant::now();
        let id = &request.correlation_id;
        if !raw_capture_available() {
            return Err(PlatformError::new(PlatformErrorCode::PortalUnavailable, id));
        }
        let mut active = self
            .active
            .try_lock()
            .map_err(|_| PlatformError::new(PlatformErrorCode::Busy, id))?;
        let authorized = reuse_authorization(&mut active, authorize_monitor(id), id).await?;
        capture_timing(id, "authorized", started);
        let remote = portal_handshake(
            authorized
                .portal
                .open_pipe_wire_remote(&authorized.session, Default::default()),
            HANDSHAKE_TIMEOUT,
            id,
        )
        .await;
        let node = authorized.node;
        let pixels = match remote {
            Ok(fd) => tokio::task::spawn_blocking(move || capture_rgba(fd, node))
                .await
                .map_err(|error| error.to_string())
                .and_then(|result| result),
            Err(error) => {
                close_authorization(&mut active).await;
                return Err(error);
            }
        };
        let (rgba, width, height) = match pixels {
            Ok(frame) => frame,
            Err(error) => {
                eprintln!("cute-screen PipeWire frame ({id}): {error}");
                close_authorization(&mut active).await;
                return Err(PlatformError::new(PlatformErrorCode::CaptureFailed, id));
            }
        };
        capture_timing(id, "raw-frame", started);
        let token = format!("pipewire-{}", uuid::Uuid::now_v7().simple());
        if request.target == CaptureTarget::Area {
            let bytes = crate::platform::preview::encode_rgba_bmp(&rgba, width, height, id)?;
            transport.import_owned_memory(&token, bytes, "image/bmp", width, height, id)?;
        } else {
            let bytes = encode_png(&rgba, width, height)
                .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, id))?;
            transport.import_owned_bytes(&token, &bytes, "image/png", width, height, id)?;
        }
        capture_timing(id, "preview-staged", started);
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
}

fn capture_timing(id: &str, phase: &str, started: std::time::Instant) {
    if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
        eprintln!(
            "cute-screen PipeWire {id} {phase}: {} ms",
            started.elapsed().as_millis()
        );
    }
}

async fn reuse_authorization<'a, T>(
    active: &'a mut Option<T>,
    open: impl Future<Output = Result<T, PlatformError>>,
    id: &str,
) -> Result<&'a T, PlatformError> {
    if active.is_none() {
        *active = Some(open.await?);
    }
    active
        .as_ref()
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::CaptureFailed, id))
}

async fn replace_authorization<T>(
    active: &mut Option<T>,
    open: impl Future<Output = Result<T, PlatformError>>,
) -> Result<Option<T>, PlatformError> {
    let candidate = open.await?;
    Ok(active.replace(candidate))
}

async fn close_authorization(active: &mut Option<AuthorizedMonitor>) {
    if let Some(authorized) = active.take()
        && let Err(error) = authorized.session.close().await
    {
        eprintln!("cute-screen ScreenCast session close: {error}");
    }
}

async fn authorize_monitor(id: &str) -> Result<AuthorizedMonitor, PlatformError> {
    let portal = portal_handshake(Screencast::new(), HANDSHAKE_TIMEOUT, id).await?;
    let sources = portal_handshake(portal.available_source_types(), HANDSHAKE_TIMEOUT, id).await?;
    let cursor = portal_handshake(portal.available_cursor_modes(), HANDSHAKE_TIMEOUT, id).await?;
    if !sources.contains(SourceType::Monitor) || !cursor.contains(CursorMode::Hidden) {
        return Err(PlatformError::new(PlatformErrorCode::InvalidTarget, id));
    }
    let session = portal_handshake(
        portal.create_session(Default::default()),
        HANDSHAKE_TIMEOUT,
        id,
    )
    .await?;
    let selected = portal_handshake(
        portal.select_sources(
            &session,
            SelectSourcesOptions::default()
                .set_sources(ashpd::enumflags2::BitFlags::from_flag(SourceType::Monitor))
                .set_multiple(false)
                .set_cursor_mode(CursorMode::Hidden),
        ),
        HANDSHAKE_TIMEOUT,
        id,
    )
    .await
    .and_then(|request| {
        request
            .response()
            .map_err(|error| map_ashpd_error(error, id))
    });
    let result = match selected {
        Ok(()) => portal
            .start(&session, None, Default::default())
            .await
            .and_then(|request| request.response())
            .map_err(|error| map_ashpd_error(error, id)),
        Err(error) => Err(error),
    };
    match result {
        Ok(streams) if streams.streams().len() == 1 => {
            let stream = &streams.streams()[0];
            if stream
                .source_type()
                .is_some_and(|kind| kind != SourceType::Monitor)
            {
                if let Err(error) = session.close().await {
                    eprintln!("cute-screen ScreenCast close: {error}");
                }
                return Err(PlatformError::new(PlatformErrorCode::InvalidTarget, id));
            }
            Ok(AuthorizedMonitor {
                node: stream.pipe_wire_node_id(),
                portal,
                session,
            })
        }
        other => {
            if let Err(error) = session.close().await {
                eprintln!("cute-screen ScreenCast close: {error}");
            }
            Err(other
                .err()
                .unwrap_or_else(|| PlatformError::new(PlatformErrorCode::InvalidTarget, id)))
        }
    }
}

struct PipelineGuard(gst::Pipeline);

impl Drop for PipelineGuard {
    fn drop(&mut self) {
        if let Err(error) = self.0.set_state(gst::State::Null) {
            eprintln!("cute-screen PipeWire pipeline close: {error}");
        }
    }
}

fn capture_rgba(fd: OwnedFd, node: u32) -> Result<(Vec<u8>, u32, u32), String> {
    let pipeline = gst::Pipeline::new();
    let source = gst::ElementFactory::make("pipewiresrc")
        .property("fd", fd.as_raw_fd())
        .property("path", node.to_string())
        .build()
        .map_err(|error| error.to_string())?;
    let convert = gst::ElementFactory::make("videoconvert")
        .build()
        .map_err(|error| error.to_string())?;
    let sink = gstreamer_app::AppSink::builder()
        .caps(
            &gst::Caps::builder("video/x-raw")
                .field("format", "RGBA")
                .build(),
        )
        .max_buffers(1)
        .drop(true)
        .sync(false)
        .build();
    pipeline
        .add_many([&source, &convert, sink.upcast_ref()])
        .map_err(|error| error.to_string())?;
    gst::Element::link_many([&source, &convert, sink.upcast_ref()])
        .map_err(|error| error.to_string())?;
    let guard = PipelineGuard(pipeline);
    guard
        .0
        .set_state(gst::State::Playing)
        .map_err(|error| error.to_string())?;
    let sample = sink
        .try_pull_sample(gst::ClockTime::from_seconds(5))
        .ok_or("PipeWire did not produce a frame")?;
    let info = gstreamer_video::VideoInfo::from_caps(sample.caps().ok_or("Missing frame caps")?)
        .map_err(|error| error.to_string())?;
    if info.format() != gstreamer_video::VideoFormat::Rgba {
        return Err("Frame is not raw RGBA".to_owned());
    }
    let frame = gstreamer_video::VideoFrameRef::from_buffer_ref_readable(
        sample.buffer().ok_or("Missing frame buffer")?,
        &info,
    )
    .map_err(|error| error.to_string())?;
    let rgba = packed_rgba(
        frame.plane_data(0).map_err(|error| error.to_string())?,
        info.width(),
        info.height(),
        frame.plane_stride()[0],
    )?;
    Ok((rgba, info.width(), info.height()))
}

fn packed_rgba(bytes: &[u8], width: u32, height: u32, stride: i32) -> Result<Vec<u8>, String> {
    let row = usize::try_from(width)
        .ok()
        .and_then(|width| width.checked_mul(4))
        .ok_or("Frame width overflow")?;
    let height = usize::try_from(height).map_err(|_| "Frame height overflow")?;
    let stride = usize::try_from(stride).map_err(|_| "Unsupported negative frame stride")?;
    let size = row
        .checked_mul(height)
        .filter(|size| *size > 0 && *size <= MAX_FRAME_BYTES)
        .ok_or("Invalid frame dimensions")?;
    let required = stride
        .checked_mul(height - 1)
        .and_then(|offset| offset.checked_add(row))
        .ok_or("Frame length overflow")?;
    if stride < row || bytes.len() < required {
        return Err("Truncated or invalid frame stride".to_owned());
    }
    let mut packed = Vec::with_capacity(size);
    for y in 0..height {
        packed.extend_from_slice(&bytes[y * stride..y * stride + row]);
    }
    Ok(packed)
}

fn encode_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, png::EncodingError> {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    {
        let mut writer = encoder.write_header()?;
        writer.write_image_data(rgba)?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_rows_keep_every_pixel_and_drop_only_padding() {
        let bytes = [
            1, 2, 3, 255, 4, 5, 6, 255, 99, 99, 99, 99, 7, 8, 9, 255, 10, 11, 12, 255,
        ];
        let packed = packed_rgba(&bytes, 2, 2, 12).expect("padded frame");
        assert_eq!(
            packed,
            [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]
        );
        let png = encode_png(&packed, 2, 2).expect("lossless PNG");
        let mut reader = png::Decoder::new(std::io::Cursor::new(png))
            .read_info()
            .expect("decode PNG");
        let mut decoded = vec![0; reader.output_buffer_size().expect("buffer size")];
        let info = reader.next_frame(&mut decoded).expect("full PNG frame");
        assert_eq!((info.width, info.height), (2, 2));
        assert_eq!(&decoded[..info.buffer_size()], packed);
    }

    #[test]
    fn invalid_frames_fail_instead_of_being_resized_or_partially_copied() {
        for (width, height, stride) in [
            (2, 2, 8),
            (2, 1, 4),
            (0, 1, 8),
            (1, 0, 8),
            (1, 1, -4),
            (u32::MAX, u32::MAX, i32::MAX),
        ] {
            assert!(packed_rgba(&[0; 8], width, height, stride).is_err());
        }
    }

    #[test]
    fn high_resolution_rgba_roundtrips_without_downsampling() {
        let (width, height) = (2560_u32, 1440_u32);
        let mut source = Vec::new();
        for y in 0..height {
            for x in 0..width {
                source.extend_from_slice(&[
                    x.to_le_bytes()[0],
                    y.to_le_bytes()[0],
                    (x ^ y).to_le_bytes()[0],
                    255,
                ]);
            }
        }
        let packed = packed_rgba(&source, width, height, 10240).expect("native-resolution frame");
        let bytes = encode_png(&packed, width, height).expect("PNG");
        let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
            .read_info()
            .expect("PNG header");
        let mut decoded = vec![0; reader.output_buffer_size().expect("decode buffer")];
        let info = reader.next_frame(&mut decoded).expect("all native pixels");
        assert_eq!((info.width, info.height), (width, height));
        assert_eq!(&decoded[..info.buffer_size()], source);
    }

    #[test]
    fn a_second_capture_reuses_the_authorized_session() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime");
        runtime.block_on(async {
            let mut active = None;
            let opens = std::cell::Cell::new(0);
            for _ in 0..2 {
                let session = reuse_authorization(
                    &mut active,
                    async {
                        opens.set(opens.get() + 1);
                        Ok(42)
                    },
                    "reuse",
                )
                .await
                .expect("session");
                assert_eq!(*session, 42);
            }
            assert_eq!(opens.get(), 1, "no second portal Start or consent dialog");
        });
    }

    #[test]
    fn cancelled_screen_selection_keeps_the_previous_authorization() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime");
        runtime.block_on(async {
            let mut active = Some(42);
            let result = replace_authorization(&mut active, async {
                Err(PlatformError::new(PlatformErrorCode::Cancelled, "reselect"))
            })
            .await;
            assert!(result.is_err());
            assert_eq!(active, Some(42));
            let old = replace_authorization(&mut active, async { Ok(99) })
                .await
                .expect("new screen");
            assert_eq!(old, Some(42));
            assert_eq!(active, Some(99));
        });
    }
}
