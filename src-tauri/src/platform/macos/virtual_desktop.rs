#[derive(Debug, Clone, Copy, PartialEq)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Rect {
    fn intersection(self, other: Self) -> Option<Self> {
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let right = (self.x + self.width).min(other.x + other.width);
        let bottom = (self.y + self.height).min(other.y + other.height);
        (right > x && bottom > y).then_some(Self {
            x,
            y,
            width: right - x,
            height: bottom - y,
        })
    }

    fn union(self, other: Self) -> Self {
        let x = self.x.min(other.x);
        let y = self.y.min(other.y);
        let right = (self.x + self.width).max(other.x + other.width);
        let bottom = (self.y + self.height).max(other.y + other.height);
        Self {
            x,
            y,
            width: right - x,
            height: bottom - y,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct DisplayTransform {
    logical: Rect,
    pixels: Rect,
}

/// Maps an AppKit selection across per-display logical scales into the one
/// top-down physical virtual-desktop buffer used by the native selector.
fn selection_in_virtual_pixels(selection: Rect, displays: &[DisplayTransform]) -> Option<Rect> {
    displays
        .iter()
        .filter_map(|display| {
            let intersection = selection.intersection(display.logical)?;
            let scale_x = display.pixels.width / display.logical.width;
            let scale_y = display.pixels.height / display.logical.height;
            Some(Rect {
                x: display.pixels.x + (intersection.x - display.logical.x) * scale_x,
                y: display.pixels.y
                    + (display.logical.y + display.logical.height
                        - intersection.y
                        - intersection.height)
                        * scale_y,
                width: intersection.width * scale_x,
                height: intersection.height * scale_y,
            })
        })
        .reduce(Rect::union)
}

#[cfg(test)]
mod tests {
    use super::{DisplayTransform, Rect, selection_in_virtual_pixels};

    #[test]
    fn preserves_negative_virtual_origins() {
        let displays = [DisplayTransform {
            logical: Rect {
                x: -1280.0,
                y: 0.0,
                width: 1280.0,
                height: 1024.0,
            },
            pixels: Rect {
                x: 0.0,
                y: 0.0,
                width: 1280.0,
                height: 1024.0,
            },
        }];
        let pixels = selection_in_virtual_pixels(
            Rect {
                x: -1200.0,
                y: 100.0,
                width: 200.0,
                height: 300.0,
            },
            &displays,
        )
        .expect("selection");
        assert_eq!(pixels.x, 80.0);
    }

    #[test]
    fn cross_monitor_selection_uses_each_display_scale() {
        let displays = [
            DisplayTransform {
                logical: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 1440.0,
                    height: 900.0,
                },
                pixels: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 2880.0,
                    height: 1800.0,
                },
            },
            DisplayTransform {
                logical: Rect {
                    x: 1440.0,
                    y: 0.0,
                    width: 1920.0,
                    height: 1080.0,
                },
                pixels: Rect {
                    x: 2880.0,
                    y: 0.0,
                    width: 1920.0,
                    height: 1080.0,
                },
            },
        ];
        let pixels = selection_in_virtual_pixels(
            Rect {
                x: 1400.0,
                y: 100.0,
                width: 140.0,
                height: 100.0,
            },
            &displays,
        )
        .expect("selection");
        assert_eq!(pixels.x, 2800.0);
        assert_eq!(pixels.width, 180.0);
    }

    #[test]
    fn vertical_layout_maps_to_top_down_slices() {
        let displays = [
            DisplayTransform {
                logical: Rect {
                    x: 0.0,
                    y: 900.0,
                    width: 1440.0,
                    height: 900.0,
                },
                pixels: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 2880.0,
                    height: 1800.0,
                },
            },
            DisplayTransform {
                logical: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 1440.0,
                    height: 900.0,
                },
                pixels: Rect {
                    x: 0.0,
                    y: 1800.0,
                    width: 1440.0,
                    height: 900.0,
                },
            },
        ];
        let pixels = selection_in_virtual_pixels(
            Rect {
                x: 100.0,
                y: 850.0,
                width: 200.0,
                height: 100.0,
            },
            &displays,
        )
        .expect("selection");
        assert_eq!(pixels.y, 1700.0);
        assert_eq!(pixels.height, 150.0);
    }
}
