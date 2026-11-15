use std::{cell::RefCell, rc::Rc};

use gtk::{glib::ControlFlow, prelude::*};

const SIZE_TOLERANCE: i32 = 2;

#[derive(Debug, Default)]
struct RepaintCycle {
    frames_remaining: u8,
    settled: bool,
    suppress_allocation: bool,
    size: Option<(i32, i32)>,
}

#[derive(Debug, PartialEq)]
enum FrameStep {
    Wait,
    Repaint,
    Stop,
}

impl RepaintCycle {
    fn request(&mut self, mapped: bool) -> bool {
        if !mapped || self.frames_remaining != 0 || self.settled {
            return false;
        }
        self.frames_remaining = 2;
        true
    }

    fn request_size(&mut self, mapped: bool, width: i32, height: i32) -> bool {
        if self.suppress_allocation {
            self.suppress_allocation = false;
            self.size = Some((width, height));
            return false;
        }
        let changed =
            self.size
                .replace((width, height))
                .is_none_or(|(previous_width, previous_height)| {
                    (width - previous_width).abs() >= SIZE_TOLERANCE
                        || (height - previous_height).abs() >= SIZE_TOLERANCE
                });
        if !changed || !mapped || self.frames_remaining != 0 {
            return false;
        }
        self.settled = false;
        self.frames_remaining = 2;
        true
    }

    fn frame(&mut self) -> FrameStep {
        match self.frames_remaining {
            0 => FrameStep::Stop,
            1 => {
                self.frames_remaining = 0;
                self.settled = true;
                self.suppress_allocation = true;
                FrameStep::Repaint
            }
            _ => {
                self.frames_remaining -= 1;
                FrameStep::Wait
            }
        }
    }

    fn cancel(&mut self) {
        self.frames_remaining = 0;
        self.settled = false;
        self.suppress_allocation = false;
    }
}

#[derive(Default)]
struct WindowPaint {
    cycle: RefCell<RepaintCycle>,
    callback: RefCell<Option<gtk::TickCallbackId>>,
}

impl WindowPaint {
    fn request(self: &Rc<Self>, window: &gtk::Window) {
        if self.cycle.borrow_mut().request(window.is_mapped()) {
            self.arm(window);
        }
    }

    fn arm(self: &Rc<Self>, window: &gtk::Window) {
        if self.callback.borrow().is_some() {
            return;
        }
        let state = Rc::clone(self);
        let callback = window.add_tick_callback(move |window, _clock| {
            let step = state.cycle.borrow_mut().frame();
            match step {
                FrameStep::Wait => ControlFlow::Continue,
                FrameStep::Repaint => {
                    window.queue_draw();
                    state.callback.borrow_mut().take();
                    ControlFlow::Break
                }
                FrameStep::Stop => {
                    state.callback.borrow_mut().take();
                    ControlFlow::Break
                }
            }
        });
        *self.callback.borrow_mut() = Some(callback);
    }

    fn cancel(&self) {
        self.cycle.borrow_mut().cancel();
        if let Some(callback) = self.callback.borrow_mut().take() {
            callback.remove();
        }
    }
}

pub fn install(window: &gtk::ApplicationWindow) {
    let window = window.upcast_ref::<gtk::Window>();
    let state = Rc::new(WindowPaint::default());
    let on_map = Rc::clone(&state);
    window.connect_map(move |window| on_map.request(window));
    let on_focus = Rc::clone(&state);
    window.connect_focus_in_event(move |window, _event| {
        on_focus.request(window);
        gtk::glib::Propagation::Proceed
    });
    let on_size = Rc::clone(&state);
    window.connect_size_allocate(move |window, allocation| {
        if on_size.cycle.borrow_mut().request_size(
            window.is_mapped(),
            allocation.width(),
            allocation.height(),
        ) {
            on_size.arm(window);
        }
    });
    window.connect_unmap(move |_window| state.cancel());
}

#[cfg(test)]
mod tests {
    use super::{FrameStep, RepaintCycle};

    #[test]
    fn event_storm_does_not_starve_or_repeat_the_followup_paint() {
        let mut cycle = RepaintCycle::default();
        assert!(cycle.request(true));
        for _ in 0..1_000 {
            assert!(!cycle.request(true));
        }
        assert_eq!(cycle.frame(), FrameStep::Wait);
        for _ in 0..1_000 {
            assert!(!cycle.request(true));
        }
        assert_eq!(cycle.frame(), FrameStep::Repaint);
        for _ in 0..10 {
            assert_eq!(cycle.frame(), FrameStep::Stop);
        }
    }

    #[test]
    fn hidden_window_never_repaints_and_remap_starts_a_fresh_cycle() {
        let mut cycle = RepaintCycle::default();
        assert!(!cycle.request(false));
        assert_eq!(cycle.frame(), FrameStep::Stop);
        assert!(cycle.request(true));
        assert_eq!(cycle.frame(), FrameStep::Wait);
        cycle.cancel();
        assert_eq!(cycle.frame(), FrameStep::Stop);
        assert!(!cycle.request(false));
        assert!(cycle.request(true));
        assert_eq!(cycle.frame(), FrameStep::Wait);
        assert_eq!(cycle.frame(), FrameStep::Repaint);
        assert_eq!(cycle.frame(), FrameStep::Stop);
    }

    #[test]
    fn own_draw_and_one_pixel_jitter_do_not_start_another_cycle() {
        let mut cycle = RepaintCycle::default();
        assert!(cycle.request_size(true, 800, 600));
        assert_eq!(cycle.frame(), FrameStep::Wait);
        assert_eq!(cycle.frame(), FrameStep::Repaint);
        assert!(!cycle.request_size(true, 801, 600));
        assert!(!cycle.request_size(true, 801, 601));
        assert_eq!(cycle.frame(), FrameStep::Stop);
    }

    #[test]
    fn a_real_resize_after_a_settled_paint_starts_one_cycle() {
        let mut cycle = RepaintCycle::default();
        assert!(cycle.request_size(true, 800, 600));
        assert_eq!(cycle.frame(), FrameStep::Wait);
        assert_eq!(cycle.frame(), FrameStep::Repaint);
        assert!(!cycle.request_size(true, 801, 600));
        assert!(cycle.request_size(true, 1200, 800));
        assert!(!cycle.request_size(true, 1200, 800));
        assert_eq!(cycle.frame(), FrameStep::Wait);
        assert_eq!(cycle.frame(), FrameStep::Repaint);
        assert_eq!(cycle.frame(), FrameStep::Stop);
    }

    #[test]
    fn focus_after_a_completed_cycle_stays_quiet_until_remap() {
        let mut cycle = RepaintCycle::default();
        assert!(cycle.request(true));
        assert_eq!(cycle.frame(), FrameStep::Wait);
        assert_eq!(cycle.frame(), FrameStep::Repaint);
        for _ in 0..10 {
            assert!(!cycle.request(true));
        }
        cycle.cancel();
        assert!(cycle.request(true));
        assert_eq!(cycle.frame(), FrameStep::Wait);
    }
}
