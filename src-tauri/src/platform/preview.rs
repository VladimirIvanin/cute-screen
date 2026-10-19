use super::{PlatformError, PlatformErrorCode};

pub(crate) fn top_down_bmp_prefix(
    width: u32,
    height: u32,
    pixel_length: usize,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let bmp_width = i32::try_from(width)
        .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    let bmp_height = i32::try_from(height)
        .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    let pixel_length = u32::try_from(pixel_length)
        .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    let file_size = 54_u32
        .checked_add(pixel_length)
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    let capacity = usize::try_from(file_size)
        .map_err(|_| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    let mut bmp = Vec::with_capacity(capacity);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&file_size.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(&54_u32.to_le_bytes());
    bmp.extend_from_slice(&40_u32.to_le_bytes());
    bmp.extend_from_slice(&bmp_width.to_le_bytes());
    bmp.extend_from_slice(&bmp_height.saturating_neg().to_le_bytes());
    bmp.extend_from_slice(&1_u16.to_le_bytes());
    bmp.extend_from_slice(&32_u16.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(&pixel_length.to_le_bytes());
    bmp.extend_from_slice(&0_i32.to_le_bytes());
    bmp.extend_from_slice(&0_i32.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    bmp.extend_from_slice(&0_u32.to_le_bytes());
    Ok(bmp)
}

pub(crate) fn encode_rgba_bmp(
    rgba: &[u8],
    width: u32,
    height: u32,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    let expected_len = usize::try_from(width)
        .ok()
        .and_then(|width| {
            usize::try_from(height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id))?;
    if rgba.len() != expected_len {
        return Err(PlatformError::new(
            PlatformErrorCode::CaptureFailed,
            correlation_id,
        ));
    }
    let mut bmp = top_down_bmp_prefix(width, height, rgba.len(), correlation_id)?;
    bmp.extend_from_slice(rgba);
    for pixel in bmp[54..].chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = u8::MAX;
    }
    Ok(bmp)
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use gtk::gdk_pixbuf::{PixbufLoader, prelude::PixbufLoaderExt};

    #[test]
    fn native_preview_decodes_every_full_resolution_rgb_pixel() {
        let (width, height) = (2560_u32, 1440_u32);
        let rgba: Vec<u8> = (0..width * height)
            .flat_map(|pixel| {
                [
                    (pixel % 251) as u8,
                    ((pixel / width) % 253) as u8,
                    ((pixel * 17) % 255) as u8,
                    255,
                ]
            })
            .collect();
        let encoded = super::encode_rgba_bmp(&rgba, width, height, "preview-test")
            .expect("encode native preview");
        let loader = PixbufLoader::with_type("bmp").expect("BMP decoder");
        loader.write(&encoded).expect("decode BMP bytes");
        loader.close().expect("finish BMP decoding");
        let decoded = loader.pixbuf().expect("decoded pixels");
        assert_eq!(
            (decoded.width(), decoded.height()),
            (
                i32::try_from(width).expect("fixture width"),
                i32::try_from(height).expect("fixture height"),
            )
        );
        let bytes = decoded.read_pixel_bytes();
        let stride = usize::try_from(decoded.rowstride()).expect("positive decoded stride");
        let channels = usize::try_from(decoded.n_channels()).expect("positive channel count");
        for y in 0..height as usize {
            for x in 0..width as usize {
                let source = (y * width as usize + x) * 4;
                let target = y * stride + x * channels;
                assert_eq!(&bytes[target..target + 3], &rgba[source..source + 3]);
            }
        }
    }
}
