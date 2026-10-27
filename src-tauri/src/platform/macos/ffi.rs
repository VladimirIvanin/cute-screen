use std::{
    ffi::c_void,
    sync::atomic::{AtomicBool, Ordering},
};

#[cfg(target_os = "macos")]
pub(crate) type CancellationProbe = unsafe extern "C" fn(*const c_void) -> bool;

/// Owned native allocation, released only by the matching bridge function.
#[repr(C)]
#[derive(Debug)]
pub(crate) struct NativeDesktopFrame {
    pub(crate) data: *mut u8,
    pub(crate) len: usize,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

impl Default for NativeDesktopFrame {
    fn default() -> Self {
        Self {
            data: std::ptr::null_mut(),
            len: 0,
            width: 0,
            height: 0,
        }
    }
}

impl NativeDesktopFrame {
    pub(crate) fn checked_len(&self) -> Option<usize> {
        if self.data.is_null() || self.width == 0 || self.height == 0 {
            return None;
        }
        let expected = usize::try_from(self.width)
            .ok()?
            .checked_mul(usize::try_from(self.height).ok()?)?
            .checked_mul(4)?;
        (self.len == expected && isize::try_from(expected).is_ok()).then_some(expected)
    }
}

pub(crate) fn native_capture_error_code(status: i32) -> Option<crate::platform::PlatformErrorCode> {
    use crate::platform::PlatformErrorCode;
    match status {
        0 => None,
        1 => Some(PlatformErrorCode::Cancelled),
        2 => Some(PlatformErrorCode::PermissionDenied),
        4 => Some(PlatformErrorCode::InvalidTarget),
        _ => Some(PlatformErrorCode::CaptureFailed),
    }
}

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
    fn desktop_frame_requires_owned_nonempty_exact_bgra_bytes() {
        let mut pixels = [0_u8; 24];
        let frame = super::NativeDesktopFrame {
            data: pixels.as_mut_ptr(),
            len: pixels.len(),
            width: 3,
            height: 2,
        };
        assert_eq!(frame.checked_len(), Some(24));
        assert_eq!(super::NativeDesktopFrame::default().checked_len(), None);
        assert_eq!(
            super::NativeDesktopFrame { len: 23, ..frame }.checked_len(),
            None
        );
        assert_eq!(
            super::NativeDesktopFrame { width: 0, ..frame }.checked_len(),
            None
        );
        assert_eq!(
            super::NativeDesktopFrame {
                data: std::ptr::null_mut(),
                ..frame
            }
            .checked_len(),
            None
        );
        assert_eq!(
            super::NativeDesktopFrame {
                width: u32::MAX,
                height: u32::MAX,
                ..frame
            }
            .checked_len(),
            None
        );
        assert_eq!(std::mem::size_of::<super::NativeDesktopFrame>(), 24);
        assert_eq!(std::mem::offset_of!(super::NativeDesktopFrame, data), 0);
        assert_eq!(std::mem::offset_of!(super::NativeDesktopFrame, len), 8);
        assert_eq!(std::mem::offset_of!(super::NativeDesktopFrame, width), 16);
        assert_eq!(std::mem::offset_of!(super::NativeDesktopFrame, height), 20);
    }

    #[test]
    fn native_capture_status_preserves_cancel_permission_and_failure() {
        use crate::platform::PlatformErrorCode;
        assert_eq!(super::native_capture_error_code(0), None);
        assert_eq!(
            super::native_capture_error_code(1),
            Some(PlatformErrorCode::Cancelled)
        );
        assert_eq!(
            super::native_capture_error_code(2),
            Some(PlatformErrorCode::PermissionDenied)
        );
        assert_eq!(
            super::native_capture_error_code(3),
            Some(PlatformErrorCode::CaptureFailed)
        );
        assert_eq!(
            super::native_capture_error_code(4),
            Some(PlatformErrorCode::InvalidTarget)
        );
        assert_eq!(
            super::native_capture_error_code(-1),
            Some(PlatformErrorCode::CaptureFailed)
        );
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
