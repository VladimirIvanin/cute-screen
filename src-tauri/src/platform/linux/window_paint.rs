use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use gtk::{glib::ControlFlow, prelude::*};

#[derive(Debug, Default)]
struct RepaintCycle {
    frames_remaining: u8,
}

#[derive(Debug, PartialEq)]
enum FrameStep {
    Wait,
    Repaint,
    Stop,
}

impl RepaintCycle {
    fn request(&mut self, mapped: bool) -> bool {
        if !mapped || self.frames_remaining != 0 {
            return false;
        }
        self.frames_remaining = 2;
        true
    }

    fn frame(&mut self) -> FrameStep {
        match self.frames_remaining {
            0 => FrameStep::Stop,
            1 => {
                self.frames_remaining = 0;
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
    }
}

#[derive(Default)]
struct WindowPaint {
    cycle: RefCell<RepaintCycle>,
    callback: RefCell<Option<gtk::TickCallbackId>>,
    size: Cell<Option<(i32, i32)>>,
}

impl WindowPaint {
    fn request(self: &Rc<Self>, window: &gtk::Window) {
        if !self.cycle.borrow_mut().request(window.is_mapped()) {
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
        let size = (allocation.width(), allocation.height());
        if on_size.size.replace(Some(size)) != Some(size) {
            on_size.request(window);
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
}
