use tauri::image::Image;

pub(crate) fn load_icon(template: bool) -> tauri::Result<Image<'static>> {
    // App tiles lose their details at tray sizes. macOS tints the alpha mask;
    // other platforms retain the two-tone outline on both light and dark panels.
    let bytes: &[u8] = if template {
        include_bytes!("../icons/tray-template.png")
    } else {
        include_bytes!("../icons/tray.png")
    };
    Image::from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use super::load_icon;

    #[test]
    fn tray_icon_keeps_large_solid_cat_without_capture_corners() {
        let icon = load_icon(false).expect("embedded tray PNG must decode");
        assert_eq!((icon.width(), icon.height()), (32, 32));
        let pixel = |x: usize, y: usize| &icon.rgba()[(y * 32 + x) * 4..][..4];
        assert_eq!(pixel(0, 0)[3], 0, "no app-tile background");
        assert_eq!(pixel(16, 7)[3], 0, "gap between cat ears");
        assert_eq!(pixel(12, 4)[3], 0, "no capture corner above the cat");
        assert_eq!(
            pixel(16, 20),
            &[255, 255, 255, 255],
            "solid cat without face details"
        );
        assert_eq!(pixel(7, 9), &[255, 255, 255, 255], "large solid ear");
        assert_eq!(
            pixel(4, 17),
            &[35, 31, 38, 255],
            "dark outline on light panels"
        );
    }

    #[test]
    fn macos_template_keeps_solid_cat_and_transparent_surroundings() {
        let icon = load_icon(true).expect("embedded template PNG must decode");
        assert_eq!((icon.width(), icon.height()), (32, 32));
        let alpha = |x: usize, y: usize| icon.rgba()[(y * 32 + x) * 4 + 3];
        assert_eq!(alpha(0, 0), 0);
        assert_eq!(alpha(16, 7), 0, "gap between ears");
        assert_eq!(alpha(12, 4), 0, "no capture corners");
        assert_eq!(alpha(16, 20), 255, "solid cat silhouette");
        assert_eq!(alpha(7, 9), 255, "ear remains opaque");
    }
}
