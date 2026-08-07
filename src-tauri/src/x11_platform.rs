use serde::Serialize;
use sha2::{Digest, Sha256};
use x11rb::{
    connection::Connection,
    image::{Image, PixelLayout},
    protocol::{randr::ConnectionExt as _, xproto::ConnectionExt as _},
};

use crate::platform::{PlatformError, PlatformErrorCode, SessionKind};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X11MonitorEvidence {
    pub x: i16,
    pub y: i16,
    pub width: u16,
    pub height: u16,
    pub width_mm: u32,
    pub height_mm: u32,
    pub primary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X11GateEvidence {
    pub correlation_id: String,
    pub monitors: Vec<X11MonitorEvidence>,
    pub window_x: i16,
    pub window_y: i16,
    pub width: u16,
    pub height: u16,
    pub rgba_sha256: String,
}

#[derive(Debug, Default)]
pub struct X11CaptureAdapter;

impl X11CaptureAdapter {
    /// Runs only against a caller-created controlled window. The session check
    /// happens before opening an X11 connection, so this code is unreachable
    /// from the Wayland production path.
    pub fn controlled_window_gate(
        &self,
        session: SessionKind,
        window_id: u32,
        correlation_id: &str,
    ) -> Result<X11GateEvidence, PlatformError> {
        if session != SessionKind::X11 {
            return Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        self.run_gate(window_id, correlation_id)
    }

    fn run_gate(
        &self,
        window_id: u32,
        correlation_id: &str,
    ) -> Result<X11GateEvidence, PlatformError> {
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "connect"))?;
        let screen = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| gate_error(correlation_id, "screen"))?;
        let monitors = connection
            .randr_get_monitors(screen.root, true)
            .map_err(|_| gate_error(correlation_id, "monitorRequest"))?
            .reply()
            .map_err(|_| gate_error(correlation_id, "monitorReply"))?
            .monitors
            .into_iter()
            .map(|monitor| X11MonitorEvidence {
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
                width_mm: monitor.width_in_millimeters,
                height_mm: monitor.height_in_millimeters,
                primary: monitor.primary,
            })
            .collect::<Vec<_>>();
        if monitors.is_empty() {
            return Err(gate_error(correlation_id, "monitorEmpty"));
        }

        let geometry = connection
            .get_geometry(window_id)
            .map_err(|_| gate_error(correlation_id, "geometryRequest"))?
            .reply()
            .map_err(|_| gate_error(correlation_id, "geometryReply"))?;
        if geometry.width == 0 || geometry.height == 0 {
            return Err(gate_error(correlation_id, "geometryEmpty"));
        }
        let coordinates = connection
            .translate_coordinates(window_id, screen.root, 0, 0)
            .map_err(|_| gate_error(correlation_id, "coordinatesRequest"))?
            .reply()
            .map_err(|_| gate_error(correlation_id, "coordinatesReply"))?;
        let (image, visual_id) = Image::get(
            &connection,
            window_id,
            0,
            0,
            geometry.width,
            geometry.height,
        )
        .map_err(|_| gate_error(correlation_id, "image"))?;
        let visual = connection
            .setup()
            .roots
            .iter()
            .flat_map(|root| &root.allowed_depths)
            .flat_map(|depth| &depth.visuals)
            .find(|visual| visual.visual_id == visual_id)
            .ok_or_else(|| gate_error(correlation_id, "visual"))?;
        let layout = PixelLayout::from_visual_type(*visual)
            .map_err(|_| gate_error(correlation_id, "pixelLayout"))?;
        let mut rgba =
            Vec::with_capacity(usize::from(geometry.width) * usize::from(geometry.height) * 4);
        for y in 0..geometry.height {
            for x in 0..geometry.width {
                let (red, green, blue) = layout.decode(image.get_pixel(x, y));
                rgba.extend_from_slice(&[
                    (red >> 8) as u8,
                    (green >> 8) as u8,
                    (blue >> 8) as u8,
                    255,
                ]);
            }
        }

        Ok(X11GateEvidence {
            correlation_id: correlation_id.to_owned(),
            monitors,
            window_x: coordinates.dst_x,
            window_y: coordinates.dst_y,
            width: geometry.width,
            height: geometry.height,
            rgba_sha256: format!("{:x}", Sha256::digest(rgba)),
        })
    }
}

fn gate_error(correlation_id: &str, operation: &str) -> PlatformError {
    let mut error = PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id);
    error
        .context
        .insert("operation".to_owned(), operation.to_owned());
    error
}

#[cfg(test)]
mod tests {
    use crate::platform::{PlatformErrorCode, SessionKind};

    use super::X11CaptureAdapter;

    #[test]
    fn wayland_is_rejected_before_x11_connection() {
        let error = X11CaptureAdapter
            .controlled_window_gate(SessionKind::Wayland, 0, "x11-gate-test")
            .expect_err("Wayland must never reach x11rb");
        assert_eq!(error.code, PlatformErrorCode::CaptureFailed);
    }
}
