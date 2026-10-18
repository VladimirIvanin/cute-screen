//! Native-only selection state. Window identifiers never cross the IPC boundary.

use std::sync::atomic::{AtomicBool, Ordering};

static RUSSIAN: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_locale(locale: &str) {
    RUSSIAN.store(locale == "ru", Ordering::Relaxed);
}

#[cfg(any(
    test,
    target_os = "windows",
    target_os = "macos",
    all(target_os = "linux", feature = "x11-capture")
))]
pub(crate) fn russian() -> bool {
    RUSSIAN.load(Ordering::Relaxed)
}

#[cfg(any(
    test,
    target_os = "windows",
    all(target_os = "linux", feature = "x11-capture")
))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[cfg(any(
    test,
    target_os = "windows",
    all(target_os = "linux", feature = "x11-capture")
))]
impl Rect {
    pub fn contains(self, (x, y): (i32, i32)) -> bool {
        i64::from(x) >= i64::from(self.x)
            && i64::from(y) >= i64::from(self.y)
            && i64::from(x) < i64::from(self.x) + i64::from(self.width)
            && i64::from(y) < i64::from(self.y) + i64::from(self.height)
    }
}

#[cfg(any(
    test,
    target_os = "windows",
    all(target_os = "linux", feature = "x11-capture")
))]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Candidate {
    pub id: u64,
    pub owner: u32,
    pub bounds: Rect,
    pub title: String,
}

#[cfg(any(
    test,
    target_os = "windows",
    all(target_os = "linux", feature = "x11-capture")
))]
impl Candidate {
    pub fn identity(&self) -> (u64, u32) {
        (self.id, self.owner)
    }
}

#[cfg(any(
    test,
    target_os = "windows",
    all(target_os = "linux", feature = "x11-capture")
))]
#[derive(Default)]
pub(crate) struct Selection {
    candidates: Vec<Candidate>,
    selected: Option<(u64, u32)>,
    pressed: Option<(u64, u32)>,
}

#[cfg(any(
    test,
    target_os = "windows",
    all(target_os = "linux", feature = "x11-capture")
))]
impl Selection {
    pub fn new(candidates: Vec<Candidate>, pointer: (i32, i32)) -> Self {
        let mut selection = Self {
            candidates,
            ..Self::default()
        };
        selection.hover(pointer);
        selection
    }

    pub fn current(&self) -> Option<&Candidate> {
        self.candidates
            .iter()
            .find(|item| Some(item.identity()) == self.selected)
    }

    pub fn hover(&mut self, pointer: (i32, i32)) {
        self.selected = self
            .candidates
            .iter()
            .find(|item| item.bounds.contains(pointer))
            .map(Candidate::identity);
    }

    #[cfg(any(test, target_os = "windows"))]
    pub fn refresh(&mut self, candidates: Vec<Candidate>) {
        self.candidates = candidates;
        if self.current().is_none() {
            self.selected = None;
            self.pressed = None;
        }
    }

    pub fn cycle(&mut self, reverse: bool) {
        let count = self.candidates.len();
        if count == 0 {
            return;
        }
        let current = self
            .candidates
            .iter()
            .position(|item| Some(item.identity()) == self.selected);
        let next = match (current, reverse) {
            (Some(index), true) => (index + count - 1) % count,
            (Some(index), false) => (index + 1) % count,
            (None, true) => count - 1,
            (None, false) => 0,
        };
        self.selected = Some(self.candidates[next].identity());
        self.pressed = None;
    }

    pub fn press(&mut self) {
        self.pressed = self.selected;
    }

    pub fn release(&mut self) -> Option<Candidate> {
        let pressed = self.pressed.take()?;
        self.current()
            .filter(|item| item.identity() == pressed)
            .cloned()
    }

    pub fn confirm(&self) -> Option<Candidate> {
        self.current().cloned()
    }

    pub fn cancel(&mut self) {
        self.selected = None;
        self.pressed = None;
    }

    pub fn hint(&self) -> [String; 3] {
        let ru = russian();
        let heading = if ru {
            "Выберите окно"
        } else {
            "Choose a window"
        };
        let detail = self.current().map_or_else(
            || {
                if ru {
                    "Наведите на окно".into()
                } else {
                    "Point to a window".into()
                }
            },
            |item| {
                format!(
                    "{} · {} × {}",
                    item.title, item.bounds.width, item.bounds.height
                )
            },
        );
        let help = if ru {
            "Клик / Enter — снять · Tab — окно · Esc — отмена"
        } else {
            "Click / Enter to capture · Tab to switch · Esc to cancel"
        };
        [heading.into(), detail, help.into()]
    }
}

#[cfg(test)]
mod tests {
    use super::{Candidate, Rect, Selection};

    fn candidate(id: u64, owner: u32, x: i32) -> Candidate {
        Candidate {
            id,
            owner,
            bounds: Rect {
                x,
                y: -200,
                width: 1200,
                height: 900,
            },
            title: format!("Window {id}"),
        }
    }

    #[test]
    fn initial_hover_uses_front_to_back_order_and_negative_physical_coordinates() {
        let selection = Selection::new(
            vec![candidate(2, 10, -600), candidate(1, 11, -800)],
            (-500, 0),
        );
        assert_eq!(selection.current().map(|item| item.id), Some(2));
    }

    #[test]
    fn empty_click_and_enter_keep_selecting() {
        let mut selection = Selection::new(vec![candidate(1, 10, 0)], (1500, 0));
        selection.press();
        assert_eq!(selection.release(), None);
        assert_eq!(selection.confirm(), None);
        selection.hover((10, 0));
        assert_eq!(selection.confirm().map(|item| item.id), Some(1));
    }

    #[test]
    fn dragging_between_windows_cannot_capture_a_different_target() {
        let mut selection =
            Selection::new(vec![candidate(1, 10, 0), candidate(2, 11, 1200)], (10, 0));
        selection.press();
        selection.hover((1300, 0));
        assert_eq!(selection.release(), None);
        selection.press();
        assert_eq!(selection.release().map(|item| item.id), Some(2));
    }

    #[test]
    fn keyboard_cycles_in_both_directions_without_pointer_motion() {
        let mut selection =
            Selection::new(vec![candidate(1, 10, 0), candidate(2, 11, 1200)], (10, 0));
        selection.cycle(false);
        assert_eq!(selection.confirm().map(|item| item.id), Some(2));
        selection.cycle(false);
        assert_eq!(selection.confirm().map(|item| item.id), Some(1));
        selection.cycle(true);
        assert_eq!(selection.confirm().map(|item| item.id), Some(2));
    }

    #[test]
    fn refresh_keeps_identity_but_rejects_destroyed_or_reused_window() {
        let mut selection = Selection::new(vec![candidate(1, 10, 0)], (10, 0));
        selection.press();
        let mut resized = candidate(1, 10, 0);
        resized.bounds.width = 1600;
        selection.refresh(vec![resized]);
        assert_eq!(
            selection.current().expect("same identity").bounds.width,
            1600
        );
        selection.refresh(vec![candidate(1, 99, 0)]);
        assert_eq!(selection.release(), None);
        assert_eq!(selection.confirm(), None);
    }

    #[test]
    fn cancellation_clears_pressed_and_current_targets() {
        let mut selection = Selection::new(vec![candidate(1, 10, 0)], (10, 0));
        selection.press();
        selection.cancel();
        assert_eq!(selection.confirm(), None);
        assert_eq!(selection.release(), None);
    }

    #[test]
    fn hint_identifies_the_window_and_its_physical_size() {
        let selection = Selection::new(vec![candidate(1, 10, -600)], (-500, 0));
        let hint = selection.hint();
        assert!(hint[1].contains("Window 1"));
        assert!(hint[1].contains("1200 × 900"));
        assert!(hint[2].contains("Enter"));
        assert!(hint[2].contains("Esc"));
        assert!(
            !hint
                .iter()
                .any(|line| line.contains("область") || line.contains("area"))
        );
    }
}
