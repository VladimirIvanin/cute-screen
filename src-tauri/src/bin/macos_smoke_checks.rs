use std::io::Cursor;

pub fn require_outcome(actual: &str, expected: &str) -> Result<(), String> {
    if actual == expected {
        Ok(())
    } else {
        Err(format!("capture returned {actual}, expected {expected}"))
    }
}

pub fn decode_png(bytes: &[u8], width: u32, height: u32) -> Result<(), String> {
    let mut reader = png::Decoder::new(Cursor::new(bytes))
        .read_info()
        .map_err(|error| error.to_string())?;
    let mut pixels = vec![0; reader.output_buffer_size().ok_or("PNG size overflow")?];
    let info = reader
        .next_frame(&mut pixels)
        .map_err(|error| error.to_string())?;
    if (info.width, info.height) != (width, height) {
        return Err(format!(
            "decoded PNG is {}x{}, expected {width}x{height}",
            info.width, info.height
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn unexpected_terminal_outcomes_fail() {
        for outcome in ["failed", "permissionDenied", "cancelled", "unavailable"] {
            assert!(super::require_outcome(outcome, "captured").is_err());
        }
        assert!(super::require_outcome("cancelled", "cancelled").is_ok());
    }

    #[test]
    fn png_requires_complete_pixels_and_matching_dimensions() {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 2, 2);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder
                .write_header()
                .expect("header")
                .write_image_data(&[128; 16])
                .expect("pixels");
        }
        assert!(super::decode_png(&bytes, 2, 2).is_ok());
        assert!(super::decode_png(&bytes, 3, 2).is_err());
        assert!(super::decode_png(&bytes[..33], 2, 2).is_err());
    }
}
