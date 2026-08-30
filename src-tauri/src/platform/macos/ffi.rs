use std::{
    ffi::c_void,
    sync::atomic::{AtomicBool, Ordering},
};

#[cfg(target_os = "macos")]
pub(crate) type CancellationProbe = unsafe extern "C" fn(*const c_void) -> bool;

#[repr(C)]
#[derive(Debug, Default)]
pub(crate) struct NativeCaptureSelection {
    pub(crate) status: i32,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) frame_width: u32,
    pub(crate) frame_height: u32,
}

const _: () = {
    assert!(std::mem::size_of::<NativeCaptureSelection>() == 28);
    assert!(std::mem::align_of::<NativeCaptureSelection>() == 4);
    assert!(std::mem::offset_of!(NativeCaptureSelection, status) == 0);
    assert!(std::mem::offset_of!(NativeCaptureSelection, x) == 4);
    assert!(std::mem::offset_of!(NativeCaptureSelection, y) == 8);
    assert!(std::mem::offset_of!(NativeCaptureSelection, width) == 12);
    assert!(std::mem::offset_of!(NativeCaptureSelection, height) == 16);
    assert!(std::mem::offset_of!(NativeCaptureSelection, frame_width) == 20);
    assert!(std::mem::offset_of!(NativeCaptureSelection, frame_height) == 24);
};

/// Called synchronously by AppKit with the opaque context supplied to the
/// selector. The function contains no panic path and never retains context.
pub(crate) unsafe extern "C" fn atomic_cancel_requested(context: *const c_void) -> bool {
    if context.is_null() {
        return false;
    }
    // SAFETY: the caller guarantees that context points to a live AtomicBool
    // for the duration of the synchronous selector call.
    let signal = unsafe { &*context.cast::<AtomicBool>() };
    signal.load(Ordering::Acquire)
}

#[cfg(test)]
mod tests {
    use std::{
        ffi::c_void,
        sync::{
            Arc,
            atomic::{AtomicBool, Ordering},
        },
        thread,
    };

    use super::{NativeCaptureSelection, atomic_cancel_requested};

    #[test]
    fn native_selection_abi_matches_objective_c_record() {
        assert_eq!(std::mem::size_of::<NativeCaptureSelection>(), 28);
        assert_eq!(std::mem::align_of::<NativeCaptureSelection>(), 4);
    }

    #[test]
    fn cancellation_probe_observes_a_concurrent_atomic_update() {
        let signal = Arc::new(AtomicBool::new(false));
        let writer = Arc::clone(&signal);
        let worker = thread::spawn(move || writer.store(true, Ordering::Release));
        worker.join().expect("cancellation writer");
        let context = Arc::as_ptr(&signal).cast::<c_void>();
        // SAFETY: `signal` remains alive across this synchronous probe.
        assert!(unsafe { atomic_cancel_requested(context) });
    }
}
