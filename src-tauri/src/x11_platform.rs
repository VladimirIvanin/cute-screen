use std::{
    collections::BTreeSet,
    sync::mpsc::{self, Receiver, Sender},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    thread::JoinHandle,
    time::{Duration, Instant},
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use x11rb::{
    CURRENT_TIME, NONE,
    connection::Connection,
    image::{Image, PixelLayout},
    protocol::{
        Event,
        composite::ConnectionExt as _,
        randr::ConnectionExt as _,
        xfixes::ConnectionExt as _,
        xproto::{
            AtomEnum, ButtonIndex, ChangeWindowAttributesAux, ConnectionExt as _, CreateGCAux,
            CreateWindowAux, EventMask, GX, GrabMode, GrabStatus, LineStyle, MapState, Rectangle,
            WindowClass,
        },
    },
    rust_connection::RustConnection,
};

use crate::{
    image_transport::ImageTransportService,
    platform::{
        CaptureGeometry, CaptureResult, PlatformError, PlatformErrorCode, SessionKind,
        ShortcutBindingResult, ShortcutSpec,
    },
};

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

const X11_COMPOSITOR_UNMAP_SETTLE: Duration = Duration::from_millis(100);

struct X11HotkeyWorker {
    stop: Arc<AtomicBool>,
    commands: Sender<X11HotkeyCommand>,
    join: JoinHandle<()>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct X11MonitorLayout {
    id: String,
    x: i16,
    y: i16,
    width: u16,
    height: u16,
    width_mm: u32,
    height_mm: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct X11TargetCapabilities {
    pub window_selector: bool,
    pub active_window: bool,
}

enum X11HotkeyCommand {
    Replace {
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: String,
        on_activated: Arc<dyn Fn(String) + Send + Sync>,
        response: Sender<Result<(), PlatformError>>,
    },
}

/// Native X11 passive-grab service. It intentionally lives only in the
/// `x11-capture` feature boundary and is never selected on Wayland.
pub struct X11HotkeyService {
    binding: Mutex<()>,
    worker: Mutex<Option<X11HotkeyWorker>>,
}

impl Default for X11HotkeyService {
    fn default() -> Self {
        Self {
            binding: Mutex::new(()),
            worker: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct X11HotkeyBinding {
    id: String,
    keycode: u8,
    modifiers: x11rb::protocol::xproto::ModMask,
}

#[derive(Clone, Copy)]
struct X11HotkeyTrigger {
    modifiers: x11rb::protocol::xproto::ModMask,
    keysyms: [u32; 2],
}

impl X11HotkeyService {
    pub fn bind(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: &str,
        on_activated: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<Vec<ShortcutBindingResult>, PlatformError> {
        let _binding = self
            .binding
            .lock()
            .map_err(|_| hotkey_error(correlation_id, "bindingLock"))?;
        if self.has_worker()? {
            self.replace_active_bindings(shortcuts.clone(), correlation_id, on_activated)?;
            return Ok(active_binding_results(shortcuts, correlation_id));
        }
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| hotkey_error(correlation_id, "connect"))?;
        let root = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| hotkey_error(correlation_id, "screen"))?
            .root;
        let bindings = build_hotkey_bindings(&connection, &shortcuts, correlation_id)?;
        replacement_plan(&[], &bindings, correlation_id)?;
        if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
            for binding in &bindings {
                eprintln!(
                    "cute-screen x11 hotkey bind: id={} keycode={} modifiers={}",
                    binding.id,
                    binding.keycode,
                    u16::from(binding.modifiers)
                );
            }
        }
        connection
            .change_window_attributes(
                root,
                &ChangeWindowAttributesAux::new().event_mask(EventMask::KEY_PRESS),
            )
            .map_err(|_| hotkey_error(correlation_id, "selectKeyPress"))?;
        grab_bindings(&connection, root, &bindings, correlation_id)?;
        connection
            .flush()
            .map_err(|_| hotkey_error(correlation_id, "grabFlush"))?;
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let (commands, command_receiver) = mpsc::channel();
        let join = thread::Builder::new()
            .name("cute-screen-x11-hotkeys".to_owned())
            .spawn(move || {
                run_hotkey_worker(
                    connection,
                    root,
                    bindings,
                    worker_stop,
                    on_activated,
                    command_receiver,
                )
            })
            .map_err(|_| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?;
        self.worker
            .lock()
            .map_err(|_| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            })?
            .replace(X11HotkeyWorker {
                stop,
                commands,
                join,
            });
        Ok(active_binding_results(shortcuts, correlation_id))
    }

    pub fn close(&self) {
        let Ok(_binding) = self.binding.lock() else {
            return;
        };
        self.stop_current();
    }

    fn stop_current(&self) {
        let worker = self.worker.lock().ok().and_then(|mut value| value.take());
        if let Some(worker) = worker {
            worker.stop.store(true, Ordering::Release);
            let _ = worker.join.join();
        }
    }

    fn has_worker(&self) -> Result<bool, PlatformError> {
        self.worker
            .lock()
            .map(|worker| worker.is_some())
            .map_err(|_| PlatformError::new(PlatformErrorCode::ShortcutUnavailable, "x11-hotkey"))
    }

    fn replace_active_bindings(
        &self,
        shortcuts: Vec<ShortcutSpec>,
        correlation_id: &str,
        on_activated: Arc<dyn Fn(String) + Send + Sync>,
    ) -> Result<(), PlatformError> {
        let (response, reply) = mpsc::channel();
        let commands = self
            .worker
            .lock()
            .map_err(|_| hotkey_error(correlation_id, "workerLock"))?
            .as_ref()
            .ok_or_else(|| hotkey_error(correlation_id, "workerMissing"))?
            .commands
            .clone();
        commands
            .send(X11HotkeyCommand::Replace {
                shortcuts,
                correlation_id: correlation_id.to_owned(),
                on_activated,
                response,
            })
            .map_err(|_| hotkey_error(correlation_id, "workerDisconnected"))?;
        reply
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| hotkey_error(correlation_id, "workerTimeout"))?
    }
}

fn active_binding_results(
    shortcuts: Vec<ShortcutSpec>,
    correlation_id: &str,
) -> Vec<ShortcutBindingResult> {
    shortcuts
        .into_iter()
        .map(|shortcut| ShortcutBindingResult {
            id: shortcut.id,
            active: true,
            correlation_id: correlation_id.to_owned(),
        })
        .collect()
}

fn build_hotkey_bindings(
    connection: &RustConnection,
    shortcuts: &[ShortcutSpec],
    correlation_id: &str,
) -> Result<Vec<X11HotkeyBinding>, PlatformError> {
    shortcuts
        .iter()
        .map(|shortcut| {
            let trigger = shortcut
                .preferred_trigger
                .as_deref()
                .ok_or_else(|| {
                    PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
                })
                .and_then(|trigger| parse_hotkey_trigger(trigger, correlation_id))?;
            let keycode = keycode_for_trigger(connection, trigger, correlation_id)?;
            Ok(X11HotkeyBinding {
                id: shortcut.id.clone(),
                keycode,
                modifiers: trigger.modifiers,
            })
        })
        .collect()
}

fn grab_bindings(
    connection: &RustConnection,
    root: u32,
    bindings: &[X11HotkeyBinding],
    correlation_id: &str,
) -> Result<(), PlatformError> {
    let mut grabbed = Vec::new();
    for binding in bindings {
        let result = connection
            .grab_key(
                false,
                root,
                binding.modifiers,
                binding.keycode,
                GrabMode::ASYNC,
                GrabMode::ASYNC,
            )
            .map_err(|_| hotkey_error(correlation_id, "grabRequest"))?
            .check()
            .map_err(|_| {
                PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
            });
        if let Err(error) = result {
            ungrab_bindings(connection, root, &grabbed);
            return Err(error);
        }
        grabbed.push(binding.clone());
    }
    if connection.flush().is_err() {
        ungrab_bindings(connection, root, &grabbed);
        return Err(hotkey_error(correlation_id, "grabFlush"));
    }
    Ok(())
}

fn ungrab_bindings(connection: &RustConnection, root: u32, bindings: &[X11HotkeyBinding]) {
    for binding in bindings {
        let _ = connection.ungrab_key(binding.keycode, root, binding.modifiers);
    }
    let _ = connection.flush();
}

fn binding_key(binding: &X11HotkeyBinding) -> (u8, u16) {
    (binding.keycode, u16::from(binding.modifiers))
}

fn replacement_plan(
    current: &[X11HotkeyBinding],
    candidate: &[X11HotkeyBinding],
    correlation_id: &str,
) -> Result<(Vec<X11HotkeyBinding>, Vec<X11HotkeyBinding>), PlatformError> {
    let mut candidate_keys = BTreeSet::new();
    if candidate
        .iter()
        .any(|binding| !candidate_keys.insert(binding_key(binding)))
    {
        return Err(PlatformError::new(
            PlatformErrorCode::ShortcutUnavailable,
            correlation_id,
        ));
    }
    let current_keys: BTreeSet<_> = current.iter().map(binding_key).collect();
    let candidate_keys: BTreeSet<_> = candidate.iter().map(binding_key).collect();
    let additions = candidate
        .iter()
        .filter(|binding| !current_keys.contains(&binding_key(binding)))
        .cloned()
        .collect();
    let removals = current
        .iter()
        .filter(|binding| !candidate_keys.contains(&binding_key(binding)))
        .cloned()
        .collect();
    Ok((additions, removals))
}

fn replace_hotkey_bindings(
    connection: &RustConnection,
    root: u32,
    current: &[X11HotkeyBinding],
    shortcuts: &[ShortcutSpec],
    correlation_id: &str,
) -> Result<Vec<X11HotkeyBinding>, PlatformError> {
    let candidate = build_hotkey_bindings(connection, shortcuts, correlation_id)?;
    let (additions, removals) = replacement_plan(current, &candidate, correlation_id)?;

    // This order is the X11 transaction boundary: any conflict while adding a
    // candidate leaves every old grab active. Only after all additions succeed
    // can obsolete grabs be released.
    grab_bindings(connection, root, &additions, correlation_id)?;
    ungrab_bindings(connection, root, &removals);
    Ok(candidate)
}

fn parse_hotkey_trigger(
    trigger: &str,
    correlation_id: &str,
) -> Result<X11HotkeyTrigger, PlatformError> {
    use x11rb::protocol::xproto::ModMask;

    let mut pieces = trigger
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty());
    let key = pieces.next_back().ok_or_else(|| {
        PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
    })?;
    let mut modifiers = ModMask::default();
    for modifier in pieces {
        modifiers |= match modifier.to_ascii_uppercase().as_str() {
            "CTRL" | "CONTROL" => ModMask::CONTROL,
            "SHIFT" => ModMask::SHIFT,
            "ALT" | "MOD1" => ModMask::M1,
            "SUPER" | "META" | "MOD4" => ModMask::M4,
            _ => {
                return Err(PlatformError::new(
                    PlatformErrorCode::ShortcutUnavailable,
                    correlation_id,
                ));
            }
        };
    }
    let key = key.to_ascii_uppercase();
    let keysyms = match key.as_str() {
        "PRINT" | "PRINTSCREEN" => [0xff61, 0xff61],
        value if value.len() == 1 && value.as_bytes()[0].is_ascii_alphabetic() => {
            let upper = u32::from(value.as_bytes()[0]);
            [upper + 32, upper]
        }
        value if value.len() == 1 && value.as_bytes()[0].is_ascii_digit() => {
            let symbol = u32::from(value.as_bytes()[0]);
            [symbol, symbol]
        }
        value if value.starts_with('F') => {
            let number = value[1..].parse::<u32>().ok();
            let symbol = number
                .filter(|number| (1..=35).contains(number))
                .map(|number| 0xffbd + number)
                .ok_or_else(|| {
                    PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id)
                })?;
            [symbol, symbol]
        }
        _ => {
            return Err(PlatformError::new(
                PlatformErrorCode::ShortcutUnavailable,
                correlation_id,
            ));
        }
    };
    Ok(X11HotkeyTrigger { modifiers, keysyms })
}

fn keycode_for_trigger(
    connection: &RustConnection,
    trigger: X11HotkeyTrigger,
    correlation_id: &str,
) -> Result<u8, PlatformError> {
    let setup = connection.setup();
    let count = setup
        .max_keycode
        .checked_sub(setup.min_keycode)
        .and_then(|value| value.checked_add(1))
        .ok_or_else(|| hotkey_error(correlation_id, "keycodeRange"))?;
    let mapping = connection
        .get_keyboard_mapping(setup.min_keycode, count)
        .map_err(|_| hotkey_error(correlation_id, "keymapRequest"))?
        .reply()
        .map_err(|_| hotkey_error(correlation_id, "keymapReply"))?;
    let stride = usize::from(mapping.keysyms_per_keycode);
    if stride == 0 {
        return Err(hotkey_error(correlation_id, "keymapEmpty"));
    }
    mapping
        .keysyms
        .chunks(stride)
        .enumerate()
        .find(|(_, symbols)| {
            symbols
                .iter()
                .any(|symbol| trigger.keysyms.contains(symbol))
        })
        .and_then(|(offset, _)| u8::try_from(usize::from(setup.min_keycode) + offset).ok())
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id))
}

fn run_hotkey_worker(
    connection: RustConnection,
    root: u32,
    mut bindings: Vec<X11HotkeyBinding>,
    stop: Arc<AtomicBool>,
    mut on_activated: Arc<dyn Fn(String) + Send + Sync>,
    commands: Receiver<X11HotkeyCommand>,
) {
    while !stop.load(Ordering::Acquire) {
        while let Ok(command) = commands.try_recv() {
            match command {
                X11HotkeyCommand::Replace {
                    shortcuts,
                    correlation_id,
                    on_activated: replacement_callback,
                    response,
                } => {
                    let result = replace_hotkey_bindings(
                        &connection,
                        root,
                        &bindings,
                        &shortcuts,
                        &correlation_id,
                    );
                    if let Ok(replacement) = result.as_ref() {
                        bindings = replacement.clone();
                        on_activated = replacement_callback;
                    }
                    let _ = response.send(result.map(|_| ()));
                }
            }
        }
        match connection.poll_for_event() {
            Ok(Some(Event::KeyPress(event))) => {
                if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
                    eprintln!(
                        "cute-screen x11 hotkey event: keycode={} state={}",
                        event.detail,
                        u16::from(event.state)
                    );
                }
                let state = u16::from(event.state);
                for binding in &bindings {
                    if event.detail == binding.keycode
                        && state & u16::from(binding.modifiers) == u16::from(binding.modifiers)
                    {
                        on_activated(binding.id.clone());
                    }
                }
            }
            Ok(Some(_)) | Ok(None) => thread::sleep(Duration::from_millis(15)),
            Err(error) => {
                if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
                    eprintln!("cute-screen x11 hotkey listener error: {error}");
                }
                break;
            }
        }
    }
    ungrab_bindings(&connection, root, &bindings);
}

impl X11CaptureAdapter {
    /// A capability probe only; it neither reads pixels nor creates an
    /// overlay. Feature compilation alone is insufficient because a desktop
    /// process may start without a usable X server/display.
    pub fn available(&self) -> bool {
        let Ok((connection, screen_number)) = x11rb::connect(None) else {
            return false;
        };
        let Some(screen) = connection.setup().roots.get(screen_number) else {
            return false;
        };
        let root_available = connection
            .get_geometry(screen.root)
            .ok()
            .is_some_and(|request| request.reply().is_ok());
        let randr_available = connection
            .randr_get_monitors(screen.root, true)
            .ok()
            .and_then(|request| request.reply().ok())
            .is_some_and(|reply| !reply.monitors.is_empty());
        root_available && randr_available
    }

    pub fn cursor_available(&self) -> bool {
        let Ok((connection, _)) = x11rb::connect(None) else {
            return false;
        };
        connection
            .xfixes_query_version(5, 0)
            .ok()
            .is_some_and(|request| request.reply().is_ok())
    }

    /// Completes a server round-trip after the editor was hidden by the
    /// Tauri connection. The following capture opens its own scoped X11
    /// connection, so the barrier prevents a stale mapped editor from leaking
    /// into the frozen root frame.
    pub fn round_trip_barrier(&self, correlation_id: &str) -> Result<(), PlatformError> {
        let (connection, _) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "barrierConnect"))?;
        connection
            .get_input_focus()
            .map_err(|_| gate_error(correlation_id, "barrierRequest"))?
            .reply()
            .map_err(|_| gate_error(correlation_id, "barrierReply"))?;
        Ok(())
    }

    /// Waits for the X server to report that every top-level client owned by
    /// this process and its Mutter decoration are gone. Tauri's GTK `hide()`
    /// acknowledgement can arrive before the window manager removes its frame,
    /// so a round trip alone is insufficient before acquiring a frozen frame.
    pub fn wait_for_current_process_unmapped(
        &self,
        correlation_id: &str,
    ) -> Result<(), PlatformError> {
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "unmapWaitConnect"))?;
        let root = connection
            .setup()
            .roots
            .get(screen_number)
            .map(|screen| screen.root)
            .ok_or_else(|| gate_error(correlation_id, "unmapWaitScreen"))?;
        let window_pid = intern_atom(&connection, b"_NET_WM_PID", correlation_id)?;
        let mutter_frame_for = intern_atom(&connection, b"_MUTTER_FRAME_FOR", correlation_id)?;
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut unmapped_since = None;

        loop {
            let windows_are_unmapped = current_process_windows_and_frames_are_unmapped(
                &connection,
                root,
                window_pid,
                mutter_frame_for,
                std::process::id(),
                correlation_id,
            )?;
            if windows_are_unmapped {
                let hidden_since = unmapped_since.get_or_insert_with(Instant::now);
                if compositor_unmap_has_settled(hidden_since.elapsed()) {
                    return Ok(());
                }
            } else {
                unmapped_since = None;
            }
            if Instant::now() >= deadline {
                return Err(gate_error(correlation_id, "unmapWaitTimeout"));
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    /// Window targets require EWMH inventory properties. Do not advertise a
    /// selector merely because root pixel capture happens to be available.
    pub fn target_capabilities(&self) -> X11TargetCapabilities {
        let Ok((connection, _)) = x11rb::connect(None) else {
            return X11TargetCapabilities {
                window_selector: false,
                active_window: false,
            };
        };
        let window_selector = ewmh_atoms_available(
            &connection,
            &[
                b"_NET_CLIENT_LIST_STACKING".as_slice(),
                b"_NET_WM_WINDOW_TYPE".as_slice(),
                b"WM_STATE".as_slice(),
            ],
        );
        let active_window = window_selector
            && ewmh_atoms_available(
                &connection,
                &[
                    b"_NET_ACTIVE_WINDOW".as_slice(),
                    b"_NET_FRAME_EXTENTS".as_slice(),
                ],
            );
        X11TargetCapabilities {
            window_selector,
            active_window,
        }
    }

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

    /// Captures one root drawable into application-owned PNG staging. The
    /// caller can derive a screen target from this frame; it must not perform a
    /// second live capture after a selector is shown.
    pub fn capture_root_to_transport(
        &self,
        session: SessionKind,
        correlation_id: &str,
        transport: &ImageTransportService,
        cursor: bool,
    ) -> Result<CaptureResult, PlatformError> {
        if session != SessionKind::X11 {
            return Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "connect"))?;
        let screen = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| gate_error(correlation_id, "screen"))?;
        let monitors = randr_monitor_layout(&connection, screen.root, correlation_id)?;
        let frame = capture_root_frame(
            &connection,
            screen_number,
            screen.root,
            correlation_id,
            cursor,
        )?;
        let bounds = (0, 0, frame.width, frame.height);
        let geometry = capture_geometry_with_layout(
            bounds,
            frame.width,
            frame.height,
            &monitors,
            correlation_id,
        )?;
        let screen_frame = crop_root_frame(frame, bounds, correlation_id)?;
        let mut result = import_rgba_frame(transport, correlation_id, screen_frame)?;
        result.geometry = Some(geometry);
        Ok(result)
    }

    /// Captures the EWMH active window from a single frozen root frame. This
    /// deliberately does not claim a window-selector UI: it is the direct
    /// `active-window` target for CLI/tray/activation callers.
    pub fn capture_active_window_to_transport(
        &self,
        session: SessionKind,
        correlation_id: &str,
        transport: &ImageTransportService,
        cursor: bool,
    ) -> Result<CaptureResult, PlatformError> {
        if session != SessionKind::X11 {
            return Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "connect"))?;
        let screen = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| gate_error(correlation_id, "screen"))?;
        let active_window = active_window(&connection, screen.root, correlation_id)?;
        let geometry = selectable_windows(&connection, screen.root, correlation_id)?
            .into_iter()
            .find(|candidate| candidate.window == active_window)
            .map(|candidate| candidate.bounds)
            .ok_or_else(|| PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id))?;
        let monitors = randr_monitor_layout(&connection, screen.root, correlation_id)?;
        let root_frame = capture_root_frame(
            &connection,
            screen_number,
            screen.root,
            correlation_id,
            cursor,
        )?;
        let capture_geometry = capture_geometry_with_layout(
            geometry,
            root_frame.width,
            root_frame.height,
            &monitors,
            correlation_id,
        )?;
        let frame = crop_root_frame(root_frame, geometry, correlation_id)?;
        let mut result = import_rgba_frame(transport, correlation_id, frame)?;
        result.geometry = Some(capture_geometry);
        Ok(result)
    }

    /// Captures the root before mapping the overlay, so selection never leaks
    /// into the original. The overlay is a native X11 window and pointer
    /// updates redraw only its selection border.
    pub fn capture_area_to_transport(
        &self,
        session: SessionKind,
        correlation_id: &str,
        transport: &ImageTransportService,
        cancel_signal: &AtomicBool,
        cursor: bool,
    ) -> Result<CaptureResult, PlatformError> {
        if session != SessionKind::X11 {
            return Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "connect"))?;
        let screen = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| gate_error(correlation_id, "screen"))?;
        let root = screen.root;
        let root_depth = screen.root_depth;
        let root_visual = screen.root_visual;
        let monitors = randr_monitor_layout(&connection, root, correlation_id)?;
        let root_frame =
            capture_root_frame(&connection, screen_number, root, correlation_id, cursor)?;
        let bounds = select_frozen_target(
            &connection,
            root,
            root_depth,
            root_visual,
            &root_frame,
            SelectorMode::Area,
            cancel_signal,
            correlation_id,
        )?;
        let geometry = capture_geometry_with_layout(
            bounds,
            root_frame.width,
            root_frame.height,
            &monitors,
            correlation_id,
        )?;
        let frame_geometry = capture_geometry_with_layout(
            (0, 0, root_frame.width, root_frame.height),
            root_frame.width,
            root_frame.height,
            &monitors,
            correlation_id,
        )?;
        let mut result = import_rgba_frame(transport, correlation_id, root_frame)?;
        result.geometry = Some(geometry);
        result.quick_frame_geometry = Some(frame_geometry);
        Ok(result)
    }

    /// Selects a mapped client window from the EWMH stacking list while the
    /// user sees a native overlay backed by a root image captured beforehand.
    /// Desktop and dock windows are deliberately not selectable targets.
    pub fn capture_window_to_transport(
        &self,
        session: SessionKind,
        correlation_id: &str,
        transport: &ImageTransportService,
        cancel_signal: &AtomicBool,
        cursor: bool,
    ) -> Result<CaptureResult, PlatformError> {
        if session != SessionKind::X11 {
            return Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "connect"))?;
        let screen = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| gate_error(correlation_id, "screen"))?;
        let monitors = randr_monitor_layout(&connection, screen.root, correlation_id)?;
        let candidates = selectable_windows(&connection, screen.root, correlation_id)?;
        if candidates.is_empty() {
            return Err(PlatformError::new(
                PlatformErrorCode::InvalidTarget,
                correlation_id,
            ));
        }
        let root_frame = capture_root_frame(
            &connection,
            screen_number,
            screen.root,
            correlation_id,
            cursor,
        )?;
        let bounds = select_frozen_target(
            &connection,
            screen.root,
            screen.root_depth,
            screen.root_visual,
            &root_frame,
            SelectorMode::Window(candidates),
            cancel_signal,
            correlation_id,
        )?;
        let capture_geometry = capture_geometry_with_layout(
            bounds,
            root_frame.width,
            root_frame.height,
            &monitors,
            correlation_id,
        )?;
        let frame = crop_root_frame(root_frame, bounds, correlation_id)?;
        let mut result = import_rgba_frame(transport, correlation_id, frame)?;
        result.geometry = Some(capture_geometry);
        Ok(result)
    }

    /// Repeats the last physical area only when the current root dimensions
    /// still match its snapshot. A changed virtual root requires a fresh
    /// selector rather than silently applying stale coordinates.
    pub fn capture_repeat_area_to_transport(
        &self,
        session: SessionKind,
        correlation_id: &str,
        transport: &ImageTransportService,
        geometry: CaptureGeometry,
        cursor: bool,
    ) -> Result<CaptureResult, PlatformError> {
        if session != SessionKind::X11 {
            return Err(PlatformError::new(
                PlatformErrorCode::CaptureFailed,
                correlation_id,
            ));
        }
        let (connection, screen_number) =
            x11rb::connect(None).map_err(|_| gate_error(correlation_id, "connect"))?;
        let root = connection
            .setup()
            .roots
            .get(screen_number)
            .ok_or_else(|| gate_error(correlation_id, "screen"))?
            .root;
        let root_frame =
            capture_root_frame(&connection, screen_number, root, correlation_id, cursor)?;
        let monitors = randr_monitor_layout(&connection, root, correlation_id)?;
        if u32::from(root_frame.width) != geometry.source_width
            || u32::from(root_frame.height) != geometry.source_height
            || geometry.layout_fingerprint.as_deref()
                != Some(layout_fingerprint(&monitors).as_str())
            || geometry.monitor_ids.as_ref()
                != Some(&monitor_ids_for_bounds(
                    &monitors,
                    (
                        geometry.x,
                        geometry.y,
                        u16::try_from(geometry.width).map_err(|_| {
                            PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id)
                        })?,
                        u16::try_from(geometry.height).map_err(|_| {
                            PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id)
                        })?,
                    ),
                    correlation_id,
                )?)
        {
            return Err(PlatformError::new(
                PlatformErrorCode::InvalidTarget,
                correlation_id,
            ));
        }
        let width = u16::try_from(geometry.width)
            .map_err(|_| PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id))?;
        let height = u16::try_from(geometry.height)
            .map_err(|_| PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id))?;
        let frame = crop_root_frame(
            root_frame,
            (geometry.x, geometry.y, width, height),
            correlation_id,
        )?;
        let mut result = import_rgba_frame(transport, correlation_id, frame)?;
        result.geometry = Some(geometry);
        Ok(result)
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
        let rgba = decode_rgba(&connection, visual_id, &image, correlation_id)?;

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

fn randr_monitor_layout<C: Connection>(
    connection: &C,
    root: u32,
    correlation_id: &str,
) -> Result<Vec<X11MonitorLayout>, PlatformError> {
    let monitors = connection
        .randr_get_monitors(root, true)
        .map_err(|_| gate_error(correlation_id, "monitorLayoutRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "monitorLayoutReply"))?
        .monitors
        .into_iter()
        .map(|monitor| {
            let name = connection
                .get_atom_name(monitor.name)
                .map_err(|_| gate_error(correlation_id, "monitorNameRequest"))?
                .reply()
                .map_err(|_| gate_error(correlation_id, "monitorNameReply"))?
                .name;
            let id = String::from_utf8(name)
                .map_err(|_| gate_error(correlation_id, "monitorNameEncoding"))?;
            if id.is_empty() {
                return Err(gate_error(correlation_id, "monitorNameEmpty"));
            }
            Ok(X11MonitorLayout {
                id,
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
                width_mm: monitor.width_in_millimeters,
                height_mm: monitor.height_in_millimeters,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if monitors.is_empty() {
        return Err(gate_error(correlation_id, "monitorLayoutEmpty"));
    }
    Ok(monitors)
}

fn layout_fingerprint(monitors: &[X11MonitorLayout]) -> String {
    let mut components = monitors
        .iter()
        .map(|monitor| {
            format!(
                "{}:{}:{}:{}:{}:{}:{}",
                monitor.id,
                monitor.x,
                monitor.y,
                monitor.width,
                monitor.height,
                monitor.width_mm,
                monitor.height_mm
            )
        })
        .collect::<Vec<_>>();
    components.sort_unstable();
    format!("{:x}", Sha256::digest(components.join("|")))
}

fn monitor_ids_for_bounds(
    monitors: &[X11MonitorLayout],
    (x, y, width, height): (i32, i32, u16, u16),
    correlation_id: &str,
) -> Result<Vec<String>, PlatformError> {
    let primary = current_monitor_id_for_bounds(monitors, (x, y, width, height), correlation_id)?;
    let mut ids = monitors
        .iter()
        .filter(|monitor| monitor.id != primary)
        .filter(|monitor| monitor_intersection_area(monitor, (x, y, width, height)) > 0)
        .map(|monitor| monitor.id.clone())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.insert(0, primary);
    Ok(ids)
}

fn current_monitor_id_for_bounds(
    monitors: &[X11MonitorLayout],
    bounds: (i32, i32, u16, u16),
    correlation_id: &str,
) -> Result<String, PlatformError> {
    monitors
        .iter()
        .filter_map(|monitor| {
            let area = monitor_intersection_area(monitor, bounds);
            (area > 0).then_some((area, monitor.id.as_str()))
        })
        // A target exactly on a monitor seam must produce stable repeat
        // metadata even if RandR enumerates outputs in a different order.
        .max_by(|(left_area, left_id), (right_area, right_id)| {
            left_area
                .cmp(right_area)
                .then_with(|| right_id.cmp(left_id))
        })
        .map(|(_, id)| id.to_owned())
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id))
}

fn monitor_intersection_area(
    monitor: &X11MonitorLayout,
    (x, y, width, height): (i32, i32, u16, u16),
) -> u64 {
    let left = i64::from(x).max(i64::from(monitor.x));
    let top = i64::from(y).max(i64::from(monitor.y));
    let right =
        (i64::from(x) + i64::from(width)).min(i64::from(monitor.x) + i64::from(monitor.width));
    let bottom =
        (i64::from(y) + i64::from(height)).min(i64::from(monitor.y) + i64::from(monitor.height));
    let intersection_width = (right - left).max(0);
    let intersection_height = (bottom - top).max(0);
    u64::try_from(intersection_width).unwrap_or_default()
        * u64::try_from(intersection_height).unwrap_or_default()
}

struct RgbaFrame {
    width: u16,
    height: u16,
    rgba: Vec<u8>,
    cursor_included: bool,
}

fn capture_root_frame<C: Connection>(
    connection: &C,
    screen_number: usize,
    root: u32,
    correlation_id: &str,
    cursor: bool,
) -> Result<RgbaFrame, PlatformError> {
    let geometry = connection
        .get_geometry(root)
        .map_err(|_| gate_error(correlation_id, "rootGeometryRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "rootGeometryReply"))?;
    if geometry.width == 0 || geometry.height == 0 {
        return Err(gate_error(correlation_id, "rootGeometryEmpty"));
    }
    let drawable = visible_desktop_drawable(connection, screen_number, root, correlation_id)?;
    let captured = Image::get(
        connection,
        drawable.id(),
        0,
        0,
        geometry.width,
        geometry.height,
    )
    .map_err(|_| gate_error(correlation_id, drawable.image_stage()));
    let released = drawable.release(connection, correlation_id);
    let (image, visual_id) = captured.and_then(|frame| released.map(|()| frame))?;
    let mut frame = RgbaFrame {
        width: geometry.width,
        height: geometry.height,
        rgba: decode_rgba(connection, visual_id, &image, correlation_id)?,
        cursor_included: false,
    };
    if cursor {
        match composite_xfixes_cursor(connection, &mut frame, correlation_id) {
            Ok(()) => frame.cursor_included = true,
            Err(error) if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() => {
                eprintln!("cute-screen x11 cursor unavailable: {error:?}");
            }
            Err(_) => {}
        }
    }
    Ok(frame)
}

#[derive(Clone, Copy)]
enum VisibleDesktopDrawable {
    Root(u32),
    CompositeOverlay { root: u32, overlay: u32 },
}

impl VisibleDesktopDrawable {
    fn id(self) -> u32 {
        match self {
            Self::Root(root) => root,
            Self::CompositeOverlay { overlay, .. } => overlay,
        }
    }

    fn image_stage(self) -> &'static str {
        match self {
            Self::Root(_) => "rootImage",
            Self::CompositeOverlay { .. } => "compositeOverlayImage",
        }
    }

    fn release<C: Connection>(
        self,
        connection: &C,
        correlation_id: &str,
    ) -> Result<(), PlatformError> {
        let Self::CompositeOverlay { root, .. } = self else {
            return Ok(());
        };
        connection
            .composite_release_overlay_window(root)
            .map_err(|_| gate_error(correlation_id, "compositeOverlayReleaseRequest"))?
            .check()
            .map_err(|_| gate_error(correlation_id, "compositeOverlayRelease"))
    }
}

fn visible_desktop_drawable<C: Connection>(
    connection: &C,
    screen_number: usize,
    root: u32,
    correlation_id: &str,
) -> Result<VisibleDesktopDrawable, PlatformError> {
    let selection_name = format!("_NET_WM_CM_S{screen_number}");
    let selection = connection
        .intern_atom(true, selection_name.as_bytes())
        .map_err(|_| gate_error(correlation_id, "compositorSelectionRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "compositorSelectionReply"))?
        .atom;
    if selection == NONE {
        return Ok(VisibleDesktopDrawable::Root(root));
    }
    let owner = connection
        .get_selection_owner(selection)
        .map_err(|_| gate_error(correlation_id, "compositorOwnerRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "compositorOwnerReply"))?
        .owner;
    if !compositor_owner_requires_overlay(owner) {
        return Ok(VisibleDesktopDrawable::Root(root));
    }
    let version = connection
        .composite_query_version(0, 4)
        .map_err(|_| gate_error(correlation_id, "compositeVersionRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "compositeVersionReply"))?;
    if version.major_version == 0 && version.minor_version < 3 {
        return Err(gate_error(correlation_id, "compositeOverlayTooOld"));
    }
    let overlay = connection
        .composite_get_overlay_window(root)
        .map_err(|_| gate_error(correlation_id, "compositeOverlayRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "compositeOverlayReply"))?
        .overlay_win;
    if overlay == NONE {
        return Err(gate_error(correlation_id, "compositeOverlayMissing"));
    }
    Ok(VisibleDesktopDrawable::CompositeOverlay { root, overlay })
}

fn compositor_owner_requires_overlay(owner: u32) -> bool {
    owner != NONE
}

fn composite_xfixes_cursor<C: Connection>(
    connection: &C,
    frame: &mut RgbaFrame,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    connection
        .xfixes_query_version(5, 0)
        .map_err(|_| gate_error(correlation_id, "cursorVersionRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "cursorVersionReply"))?;
    let cursor = connection
        .xfixes_get_cursor_image()
        .map_err(|_| gate_error(correlation_id, "cursorRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "cursorReply"))?;
    let origin_x = i32::from(cursor.x) - i32::from(cursor.xhot);
    let origin_y = i32::from(cursor.y) - i32::from(cursor.yhot);
    if cursor.width == 0 || cursor.height == 0 {
        return Ok(());
    }
    for (index, pixel) in cursor.cursor_image.into_iter().enumerate() {
        let x = origin_x + i32::try_from(index % usize::from(cursor.width)).unwrap_or(i32::MAX);
        let y = origin_y + i32::try_from(index / usize::from(cursor.width)).unwrap_or(i32::MAX);
        if x < 0 || y < 0 || x >= i32::from(frame.width) || y >= i32::from(frame.height) {
            continue;
        }
        let offset = (usize::try_from(y)
            .map_err(|_| gate_error(correlation_id, "cursorOffset"))?
            * usize::from(frame.width)
            + usize::try_from(x).map_err(|_| gate_error(correlation_id, "cursorOffset"))?)
            * 4;
        let alpha = (pixel >> 24) as u8;
        let inverse = u16::from(u8::MAX - alpha);
        for (channel, shift) in [(0, 16), (1, 8), (2, 0)] {
            let source = ((pixel >> shift) & 0xff) as u8;
            let destination = frame.rgba[offset + channel];
            frame.rgba[offset + channel] = u8::try_from(
                (u16::from(source) * u16::from(alpha) + u16::from(destination) * inverse)
                    / u16::from(u8::MAX),
            )
            .map_err(|_| gate_error(correlation_id, "cursorComposite"))?;
        }
    }
    Ok(())
}

enum SelectorMode {
    Area,
    Window(Vec<WindowCandidate>),
}

#[derive(Debug, Clone, Copy)]
struct WindowCandidate {
    window: u32,
    bounds: (i32, i32, u16, u16),
    rectangle: Rectangle,
}

struct WindowSelectionContext<'a> {
    root: u32,
    window_type: u32,
    wm_state: u32,
    window_pid: u32,
    current_process_id: u32,
    excluded_types: &'a [u32],
}

struct WindowSelectionMetadata<'a> {
    map_state: MapState,
    window: u32,
    minimized: bool,
    process_id: Option<u32>,
    types: &'a [u32],
}

#[derive(Debug, Clone, Copy)]
struct X11TopLevelWindowState {
    window: u32,
    process_id: Option<u32>,
    map_state: MapState,
    mutter_frame_for: Option<u32>,
}

#[allow(clippy::too_many_arguments)] // X11 overlay setup needs the root visual/depth and frozen frame explicitly.
fn select_frozen_target<C: Connection>(
    connection: &C,
    root: u32,
    root_depth: u8,
    root_visual: u32,
    frame: &RgbaFrame,
    mode: SelectorMode,
    cancel_signal: &AtomicBool,
    correlation_id: &str,
) -> Result<(i32, i32, u16, u16), PlatformError> {
    let overlay = connection
        .generate_id()
        .map_err(|_| gate_error(correlation_id, "overlayId"))?;
    let frozen_pixmap = connection
        .generate_id()
        .map_err(|_| gate_error(correlation_id, "overlayFrozenPixmapId"))?;
    let background_gc = connection
        .generate_id()
        .map_err(|_| gate_error(correlation_id, "overlayBackgroundGcId"))?;
    let selection_gc = connection
        .generate_id()
        .map_err(|_| gate_error(correlation_id, "overlaySelectionGcId"))?;
    connection
        .create_pixmap(root_depth, frozen_pixmap, root, frame.width, frame.height)
        .map_err(|_| gate_error(correlation_id, "overlayFrozenPixmap"))?;
    let window_aux = CreateWindowAux::new()
        .background_pixmap(frozen_pixmap)
        .override_redirect(1)
        .event_mask(
            EventMask::BUTTON_PRESS
                | EventMask::BUTTON_RELEASE
                | EventMask::POINTER_MOTION
                | EventMask::KEY_PRESS
                | EventMask::FOCUS_CHANGE,
        );
    connection
        .create_window(
            root_depth,
            overlay,
            root,
            0,
            0,
            frame.width,
            frame.height,
            0,
            WindowClass::INPUT_OUTPUT,
            root_visual,
            &window_aux,
        )
        .map_err(|_| gate_error(correlation_id, "overlayCreate"))?;
    connection
        .create_gc(
            background_gc,
            frozen_pixmap,
            &CreateGCAux::new().foreground(0),
        )
        .map_err(|_| gate_error(correlation_id, "overlayBackgroundGc"))?;
    connection
        .create_gc(
            selection_gc,
            overlay,
            &CreateGCAux::new()
                .function(GX::COPY)
                .foreground(u32::MAX)
                .line_width(2)
                .line_style(LineStyle::ON_OFF_DASH),
        )
        .map_err(|_| gate_error(correlation_id, "overlaySelectionGc"))?;
    connection
        .set_dashes(selection_gc, 0, &[7, 5])
        .map_err(|_| gate_error(correlation_id, "overlaySelectionDash"))?;
    let selection = (|| -> Result<(i32, i32, u16, u16), PlatformError> {
        // Secure input on the already-viewable root before the debug-build
        // RGBA conversion. The selector window stays unmapped until its frozen
        // frame is complete, so users never see an uninitialized surface.
        let pointer = connection
            .grab_pointer(
                false,
                root,
                EventMask::BUTTON_PRESS | EventMask::BUTTON_RELEASE | EventMask::POINTER_MOTION,
                GrabMode::ASYNC,
                GrabMode::ASYNC,
                NONE,
                NONE,
                CURRENT_TIME,
            )
            .map_err(|_| gate_error(correlation_id, "overlayPointerGrab"))?
            .reply()
            .map_err(|_| gate_error(correlation_id, "overlayPointerGrab"))?;
        if pointer.status != GrabStatus::SUCCESS {
            if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
                eprintln!("cute-screen x11 pointer grab failed: {:?}", pointer.status);
            }
            return Err(PlatformError::new(PlatformErrorCode::Busy, correlation_id));
        }
        let keyboard = connection
            .grab_keyboard(false, root, CURRENT_TIME, GrabMode::ASYNC, GrabMode::ASYNC)
            .map_err(|_| gate_error(correlation_id, "overlayKeyboardGrab"))?
            .reply()
            .map_err(|_| gate_error(correlation_id, "overlayKeyboardGrab"))?;
        if keyboard.status != GrabStatus::SUCCESS {
            if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
                eprintln!(
                    "cute-screen x11 keyboard grab failed: {:?}",
                    keyboard.status
                );
            }
            return Err(PlatformError::new(PlatformErrorCode::Busy, correlation_id));
        }
        let encode_started = Instant::now();
        let frozen =
            encode_selector_image(connection, root_visual, root_depth, frame, correlation_id)?;
        if std::env::var_os("CUTE_SCREEN_CAPTURE_DEBUG").is_some() {
            eprintln!(
                "cute-screen x11 selector frame encoded in {} ms",
                encode_started.elapsed().as_millis()
            );
        }
        for cookie in frozen
            .put(connection, frozen_pixmap, background_gc, 0, 0)
            .map_err(|_| gate_error(correlation_id, "overlayFrozenFrame"))?
        {
            cookie
                .check()
                .map_err(|_| gate_error(correlation_id, "overlayFrozenFrame"))?;
        }
        connection
            .map_window(overlay)
            .map_err(|_| gate_error(correlation_id, "overlayMap"))?;
        connection
            .flush()
            .map_err(|_| gate_error(correlation_id, "overlayFlush"))?;
        interaction_loop(
            connection,
            SelectorCanvas {
                overlay,
                background_gc,
                foreground_gc: selection_gc,
                width: frame.width,
                height: frame.height,
            },
            &mode,
            cancel_signal,
            correlation_id,
        )
    })();
    let _ = connection.ungrab_pointer(CURRENT_TIME);
    let _ = connection.ungrab_keyboard(CURRENT_TIME);
    let _ = connection.free_gc(selection_gc);
    let _ = connection.free_gc(background_gc);
    let _ = connection.destroy_window(overlay);
    let _ = connection.free_pixmap(frozen_pixmap);
    let _ = connection.flush();
    selection
}

#[derive(Clone, Copy)]
struct SelectorCanvas {
    overlay: u32,
    background_gc: u32,
    foreground_gc: u32,
    width: u16,
    height: u16,
}

fn interaction_loop<C: Connection>(
    connection: &C,
    canvas: SelectorCanvas,
    mode: &SelectorMode,
    cancel_signal: &AtomicBool,
    correlation_id: &str,
) -> Result<(i32, i32, u16, u16), PlatformError> {
    let (width, height) = (canvas.width, canvas.height);
    let deadline = Instant::now() + Duration::from_secs(60);
    let mut anchor = None;
    let mut current = None;
    let mut window_current = None;
    let mut rendered = None;
    let mut rendered_hint = None;
    let mut area_drag = None;
    let mut last_area_click: Option<(Instant, (i16, i16))> = None;
    while Instant::now() < deadline {
        if cancel_signal.load(Ordering::Acquire) {
            return Err(PlatformError::new(
                PlatformErrorCode::Cancelled,
                correlation_id,
            ));
        }
        let Some(event) = connection
            .poll_for_event()
            .map_err(|_| gate_error(correlation_id, "overlayEvents"))?
        else {
            thread::sleep(Duration::from_millis(8));
            continue;
        };
        if let SelectorMode::Window(candidates) = mode {
            match event {
                Event::MotionNotify(event) => {
                    let selected = window_at(candidates, event.event_x, event.event_y);
                    redraw_rectangle(
                        connection,
                        canvas,
                        &mut rendered,
                        selected.map(|candidate| candidate.rectangle),
                        correlation_id,
                    )?;
                    window_current = selected;
                }
                Event::ButtonPress(event) if event.detail == u8::from(ButtonIndex::M1) => {
                    let selected = window_at(candidates, event.event_x, event.event_y);
                    redraw_rectangle(
                        connection,
                        canvas,
                        &mut rendered,
                        selected.map(|candidate| candidate.rectangle),
                        correlation_id,
                    )?;
                    window_current = selected;
                }
                Event::ButtonRelease(event) if event.detail == u8::from(ButtonIndex::M1) => {
                    return window_at(candidates, event.event_x, event.event_y)
                        .map(|candidate| candidate.bounds)
                        .ok_or_else(|| {
                            PlatformError::new(PlatformErrorCode::Cancelled, correlation_id)
                        });
                }
                Event::KeyPress(event) if event.detail == 9 => {
                    return Err(PlatformError::new(
                        PlatformErrorCode::Cancelled,
                        correlation_id,
                    ));
                }
                Event::KeyPress(event) if event.detail == 36 => {
                    return window_current
                        .map(|candidate| candidate.bounds)
                        .ok_or_else(|| {
                            PlatformError::new(PlatformErrorCode::Cancelled, correlation_id)
                        });
                }
                Event::FocusOut(_) => {
                    return Err(PlatformError::new(
                        PlatformErrorCode::Cancelled,
                        correlation_id,
                    ));
                }
                _ => {}
            }
            continue;
        }
        match event {
            Event::ButtonPress(event) if event.detail == u8::from(ButtonIndex::M1) => {
                redraw_area_hint(connection, canvas, &mut rendered_hint, None, correlation_id)?;
                let point = clamp_point(event.event_x, event.event_y, width, height);
                let selected = rectangle_for(anchor, current);
                if let Some(rectangle) = selected
                    && rectangle_contains(rectangle, point)
                    && last_area_click.is_some_and(|(at, previous)| {
                        at.elapsed() <= Duration::from_millis(500) && previous == point
                    })
                {
                    return normalized_selection(anchor, current, correlation_id);
                }
                if let Some(rectangle) =
                    selected.filter(|rectangle| rectangle_contains(*rectangle, point))
                {
                    area_drag = Some(AreaDrag::Move {
                        offset_x: point.0.saturating_sub(rectangle.x),
                        offset_y: point.1.saturating_sub(rectangle.y),
                    });
                } else {
                    anchor = Some(point);
                    current = Some(point);
                    area_drag = Some(AreaDrag::Create);
                }
            }
            Event::MotionNotify(event) if area_drag.is_some() => {
                let point = clamp_point(event.event_x, event.event_y, width, height);
                match area_drag {
                    Some(AreaDrag::Create) => current = Some(point),
                    Some(AreaDrag::Move { offset_x, offset_y }) => {
                        if let Some(rectangle) = rectangle_for(anchor, current) {
                            let moved = move_rectangle(
                                rectangle,
                                i32::from(point.0.saturating_sub(offset_x))
                                    - i32::from(rectangle.x),
                                i32::from(point.1.saturating_sub(offset_y))
                                    - i32::from(rectangle.y),
                                width,
                                height,
                            );
                            anchor = Some((moved.x, moved.y));
                            current = rectangle_endpoint(moved);
                        }
                    }
                    None => {}
                }
                redraw_selection(
                    connection,
                    canvas,
                    &mut rendered,
                    anchor,
                    current,
                    correlation_id,
                )?;
            }
            Event::MotionNotify(event) if anchor.is_none() => {
                redraw_area_hint(
                    connection,
                    canvas,
                    &mut rendered_hint,
                    Some(clamp_point(event.event_x, event.event_y, width, height)),
                    correlation_id,
                )?;
            }
            Event::ButtonRelease(event) if event.detail == u8::from(ButtonIndex::M1) => {
                let created_area = matches!(area_drag, Some(AreaDrag::Create));
                if created_area {
                    current = Some(clamp_point(event.event_x, event.event_y, width, height));
                }
                redraw_selection(
                    connection,
                    canvas,
                    &mut rendered,
                    anchor,
                    current,
                    correlation_id,
                )?;
                area_drag = None;
                last_area_click = Some((
                    Instant::now(),
                    clamp_point(event.event_x, event.event_y, width, height),
                ));
                if should_complete_area_release(created_area, anchor, current) {
                    return normalized_selection(anchor, current, correlation_id);
                }
            }
            // Return remains available for keyboard confirmation before a
            // pointer selection. A completed primary-pointer drag confirms at
            // its ButtonRelease boundary above.
            Event::KeyPress(event) if event.detail == 9 => {
                return Err(PlatformError::new(
                    PlatformErrorCode::Cancelled,
                    correlation_id,
                ));
            }
            Event::KeyPress(event) if event.detail == 36 => {
                return normalized_selection(anchor, current, correlation_id);
            }
            Event::KeyPress(event) if matches!(event.detail, 111 | 113 | 114 | 116) => {
                if let Some(rectangle) = rectangle_for(anchor, current) {
                    let Some((dx, dy)) = (match event.detail {
                        111 => Some((0, -1)),
                        113 => Some((-1, 0)),
                        114 => Some((1, 0)),
                        116 => Some((0, 1)),
                        _ => None,
                    }) else {
                        continue;
                    };
                    let moved = if u16::from(event.state) & 1 != 0 {
                        resize_rectangle(rectangle, event.detail, width, height)
                    } else {
                        move_rectangle(rectangle, dx, dy, width, height)
                    };
                    anchor = Some((moved.x, moved.y));
                    current = rectangle_endpoint(moved);
                    redraw_selection(
                        connection,
                        canvas,
                        &mut rendered,
                        anchor,
                        current,
                        correlation_id,
                    )?;
                }
            }
            Event::FocusOut(_) => {
                return Err(PlatformError::new(
                    PlatformErrorCode::Cancelled,
                    correlation_id,
                ));
            }
            _ => {}
        }
    }
    Err(PlatformError::new(
        PlatformErrorCode::Cancelled,
        correlation_id,
    ))
}

#[derive(Debug, Clone, Copy)]
enum AreaDrag {
    Create,
    Move { offset_x: i16, offset_y: i16 },
}

fn should_complete_area_release(
    created_area: bool,
    anchor: Option<(i16, i16)>,
    current: Option<(i16, i16)>,
) -> bool {
    created_area
        && rectangle_for(anchor, current)
            .is_some_and(|rectangle| rectangle.width > 0 && rectangle.height > 0)
}

fn clamp_point(x: i16, y: i16, width: u16, height: u16) -> (i16, i16) {
    (
        x.clamp(
            0,
            i16::try_from(width.saturating_sub(1)).unwrap_or(i16::MAX),
        ),
        y.clamp(
            0,
            i16::try_from(height.saturating_sub(1)).unwrap_or(i16::MAX),
        ),
    )
}

fn redraw_selection<C: Connection>(
    connection: &C,
    canvas: SelectorCanvas,
    rendered: &mut Option<Rectangle>,
    anchor: Option<(i16, i16)>,
    current: Option<(i16, i16)>,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    if let Some(previous) = *rendered {
        restore_selector_visual(
            connection,
            canvas.overlay,
            &selector_visual_damage(previous, canvas.width, canvas.height),
            correlation_id,
        )?;
    }
    *rendered = rectangle_for(anchor, current);
    if let Some(next) = *rendered {
        connection
            .poly_rectangle(canvas.overlay, canvas.foreground_gc, &[next])
            .map_err(|_| gate_error(correlation_id, "overlayDrawSelection"))?;
        draw_size_badge(
            connection,
            canvas.overlay,
            canvas.background_gc,
            canvas.foreground_gc,
            next,
            correlation_id,
        )?;
    }
    connection
        .flush()
        .map_err(|_| gate_error(correlation_id, "overlayDrawSelection"))
}

fn redraw_area_hint<C: Connection>(
    connection: &C,
    canvas: SelectorCanvas,
    rendered: &mut Option<Rectangle>,
    cursor: Option<(i16, i16)>,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    const HINT_WIDTH: u16 = 190;
    const HINT_HEIGHT: u16 = 42;
    let draw = |card: Rectangle| -> Result<(), PlatformError> {
        connection
            .poly_fill_rectangle(canvas.overlay, canvas.background_gc, &[card])
            .map_err(|_| gate_error(correlation_id, "overlayHintCard"))?;
        connection
            .image_text8(
                canvas.overlay,
                canvas.foreground_gc,
                card.x.saturating_add(12),
                card.y.saturating_add(26),
                b"Select area",
            )
            .map_err(|_| gate_error(correlation_id, "overlayHintText"))?;
        let camera = Rectangle {
            x: card.x.saturating_add(151),
            y: card.y.saturating_add(11),
            width: 26,
            height: 20,
        };
        let camera_top = Rectangle {
            x: camera.x.saturating_add(7),
            y: camera.y.saturating_sub(4),
            width: 12,
            height: 5,
        };
        connection
            .poly_rectangle(canvas.overlay, canvas.foreground_gc, &[camera, camera_top])
            .map_err(|_| gate_error(correlation_id, "overlayHintIcon"))?;
        Ok(())
    };
    if let Some(previous) = rendered.take() {
        restore_selector_visual(connection, canvas.overlay, &[previous], correlation_id)?;
    }
    if let Some((cursor_x, cursor_y)) = cursor {
        let max_x = i32::from(canvas.width.saturating_sub(HINT_WIDTH).saturating_sub(8));
        let max_y = i32::from(canvas.height.saturating_sub(HINT_HEIGHT).saturating_sub(8));
        let x = (i32::from(cursor_x) + 18).clamp(8, max_x.max(8));
        let y = (i32::from(cursor_y) + 22).clamp(8, max_y.max(8));
        let card = Rectangle {
            x: i16::try_from(x).unwrap_or(i16::MAX),
            y: i16::try_from(y).unwrap_or(i16::MAX),
            width: HINT_WIDTH,
            height: HINT_HEIGHT,
        };
        draw(card)?;
        *rendered = Some(card);
    }
    connection
        .flush()
        .map_err(|_| gate_error(correlation_id, "overlayHintFlush"))
}

fn draw_size_badge<C: Connection>(
    connection: &C,
    overlay: u32,
    background_gc: u32,
    foreground_gc: u32,
    rectangle: Rectangle,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    let badge = size_badge_rectangle(rectangle);
    let label = format!("{} x {}", rectangle.width, rectangle.height);
    connection
        .poly_fill_rectangle(overlay, background_gc, &[badge])
        .map_err(|_| gate_error(correlation_id, "overlaySizeBadge"))?;
    connection
        .image_text8(
            overlay,
            foreground_gc,
            badge.x.saturating_add(7),
            badge.y.saturating_add(17),
            label.as_bytes(),
        )
        .map_err(|_| gate_error(correlation_id, "overlaySizeText"))?;
    Ok(())
}

fn redraw_rectangle<C: Connection>(
    connection: &C,
    canvas: SelectorCanvas,
    rendered: &mut Option<Rectangle>,
    next: Option<Rectangle>,
    correlation_id: &str,
) -> Result<(), PlatformError> {
    if let Some(old) = rendered.take() {
        restore_selector_visual(
            connection,
            canvas.overlay,
            &selector_border_damage(old, canvas.width, canvas.height),
            correlation_id,
        )?;
    }
    if let Some(next) = next {
        connection
            .poly_rectangle(canvas.overlay, canvas.foreground_gc, &[next])
            .map_err(|_| gate_error(correlation_id, "overlayDrawSelection"))?;
        *rendered = Some(next);
    }
    connection
        .flush()
        .map_err(|_| gate_error(correlation_id, "overlayDrawSelection"))
}

fn restore_selector_visual<C: Connection>(
    connection: &C,
    overlay: u32,
    damage: &[Rectangle],
    correlation_id: &str,
) -> Result<(), PlatformError> {
    for region in damage {
        connection
            .clear_area(
                false,
                overlay,
                region.x,
                region.y,
                region.width,
                region.height,
            )
            .map_err(|_| gate_error(correlation_id, "overlayRestoreFrozenFrame"))?;
    }
    Ok(())
}

fn size_badge_rectangle(rectangle: Rectangle) -> Rectangle {
    let label = format!("{} x {}", rectangle.width, rectangle.height);
    let width = u16::try_from(label.len().saturating_mul(8).saturating_add(14)).unwrap_or(u16::MAX);
    let x = rectangle.x.max(4);
    let y = if rectangle.y >= 28 {
        rectangle.y - 28
    } else {
        rectangle
            .y
            .saturating_add(i16::try_from(rectangle.height).unwrap_or(i16::MAX))
            .saturating_add(4)
    };
    Rectangle {
        x,
        y,
        width,
        height: 24,
    }
}

fn selector_visual_damage(rectangle: Rectangle, width: u16, height: u16) -> Vec<Rectangle> {
    let mut damage = selector_border_damage(rectangle, width, height);
    damage.push(size_badge_rectangle(rectangle));
    damage
}

fn selector_border_damage(rectangle: Rectangle, width: u16, height: u16) -> Vec<Rectangle> {
    const PAD: i32 = 3;
    let max_x = i32::from(width.saturating_sub(1));
    let max_y = i32::from(height.saturating_sub(1));
    let left = (i32::from(rectangle.x) - PAD).clamp(0, max_x);
    let top = (i32::from(rectangle.y) - PAD).clamp(0, max_y);
    let right = (i32::from(rectangle.x) + i32::from(rectangle.width) + PAD).clamp(0, max_x);
    let bottom = (i32::from(rectangle.y) + i32::from(rectangle.height) + PAD).clamp(0, max_y);
    let outer_width = u16::try_from(right - left + 1).unwrap_or(u16::MAX);
    let outer_height = u16::try_from(bottom - top + 1).unwrap_or(u16::MAX);
    let thickness = u16::try_from(PAD * 2 + 1)
        .unwrap_or(outer_width)
        .min(outer_width)
        .min(outer_height);
    let x = i16::try_from(left).unwrap_or(i16::MAX);
    let y = i16::try_from(top).unwrap_or(i16::MAX);
    let right_x = i16::try_from(right - i32::from(thickness) + 1).unwrap_or(i16::MAX);
    let bottom_y = i16::try_from(bottom - i32::from(thickness) + 1).unwrap_or(i16::MAX);
    vec![
        Rectangle {
            x,
            y,
            width: outer_width,
            height: thickness,
        },
        Rectangle {
            x,
            y: bottom_y,
            width: outer_width,
            height: thickness,
        },
        Rectangle {
            x,
            y,
            width: thickness,
            height: outer_height,
        },
        Rectangle {
            x: right_x,
            y,
            width: thickness,
            height: outer_height,
        },
    ]
}

fn rectangle_for(anchor: Option<(i16, i16)>, current: Option<(i16, i16)>) -> Option<Rectangle> {
    let (start_x, start_y) = anchor?;
    let (end_x, end_y) = current?;
    let x = start_x.min(end_x);
    let y = start_y.min(end_y);
    let width = u16::try_from(i32::from(start_x.max(end_x)) - i32::from(x)).ok()?;
    let height = u16::try_from(i32::from(start_y.max(end_y)) - i32::from(y)).ok()?;
    (width > 0 && height > 0).then_some(Rectangle {
        x,
        y,
        width,
        height,
    })
}

fn rectangle_contains(rectangle: Rectangle, point: (i16, i16)) -> bool {
    let right = i32::from(rectangle.x).saturating_add(i32::from(rectangle.width));
    let bottom = i32::from(rectangle.y).saturating_add(i32::from(rectangle.height));
    i32::from(point.0) >= i32::from(rectangle.x)
        && i32::from(point.0) < right
        && i32::from(point.1) >= i32::from(rectangle.y)
        && i32::from(point.1) < bottom
}

fn rectangle_endpoint(rectangle: Rectangle) -> Option<(i16, i16)> {
    Some((
        i16::try_from(i32::from(rectangle.x).checked_add(i32::from(rectangle.width))?).ok()?,
        i16::try_from(i32::from(rectangle.y).checked_add(i32::from(rectangle.height))?).ok()?,
    ))
}

fn move_rectangle(rectangle: Rectangle, dx: i32, dy: i32, width: u16, height: u16) -> Rectangle {
    let max_x = i32::from(width).saturating_sub(i32::from(rectangle.width));
    let max_y = i32::from(height).saturating_sub(i32::from(rectangle.height));
    Rectangle {
        x: i16::try_from(i32::from(rectangle.x).saturating_add(dx).clamp(0, max_x))
            .unwrap_or(i16::MAX),
        y: i16::try_from(i32::from(rectangle.y).saturating_add(dy).clamp(0, max_y))
            .unwrap_or(i16::MAX),
        ..rectangle
    }
}

fn resize_rectangle(rectangle: Rectangle, keycode: u8, width: u16, height: u16) -> Rectangle {
    let max_x = i32::from(width);
    let max_y = i32::from(height);
    let (mut x, mut y) = (i32::from(rectangle.x), i32::from(rectangle.y));
    let (mut right, mut bottom) = (
        x + i32::from(rectangle.width),
        y + i32::from(rectangle.height),
    );
    match keycode {
        113 if x > 0 => x -= 1,
        114 if right < max_x => right += 1,
        111 if y > 0 => y -= 1,
        116 if bottom < max_y => bottom += 1,
        _ => {}
    }
    Rectangle {
        x: i16::try_from(x).unwrap_or(i16::MAX),
        y: i16::try_from(y).unwrap_or(i16::MAX),
        width: u16::try_from(right - x).unwrap_or(u16::MAX),
        height: u16::try_from(bottom - y).unwrap_or(u16::MAX),
    }
}

fn normalized_selection(
    anchor: Option<(i16, i16)>,
    current: Option<(i16, i16)>,
    correlation_id: &str,
) -> Result<(i32, i32, u16, u16), PlatformError> {
    let rectangle = rectangle_for(anchor, current)
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::Cancelled, correlation_id))?;
    Ok((
        i32::from(rectangle.x),
        i32::from(rectangle.y),
        rectangle.width,
        rectangle.height,
    ))
}

fn capture_geometry(
    (x, y, width, height): (i32, i32, u16, u16),
    source_width: u16,
    source_height: u16,
) -> CaptureGeometry {
    CaptureGeometry {
        x,
        y,
        width: u32::from(width),
        height: u32::from(height),
        source_width: u32::from(source_width),
        source_height: u32::from(source_height),
        layout_fingerprint: None,
        monitor_ids: None,
    }
}

fn capture_geometry_with_layout(
    bounds: (i32, i32, u16, u16),
    source_width: u16,
    source_height: u16,
    monitors: &[X11MonitorLayout],
    correlation_id: &str,
) -> Result<CaptureGeometry, PlatformError> {
    let mut geometry = capture_geometry(bounds, source_width, source_height);
    geometry.layout_fingerprint = Some(layout_fingerprint(monitors));
    // `monitor_ids[0]` is the monitor with the largest physical intersection;
    // following IDs preserve every crossed monitor for repeat validation.
    geometry.monitor_ids = Some(monitor_ids_for_bounds(monitors, bounds, correlation_id)?);
    Ok(geometry)
}

fn selectable_windows<C: Connection>(
    connection: &C,
    root: u32,
    correlation_id: &str,
) -> Result<Vec<WindowCandidate>, PlatformError> {
    let client_list = intern_atom(connection, b"_NET_CLIENT_LIST_STACKING", correlation_id)?;
    let window_type = intern_atom(connection, b"_NET_WM_WINDOW_TYPE", correlation_id)?;
    let wm_state = intern_atom(connection, b"WM_STATE", correlation_id)?;
    let window_pid = intern_atom(connection, b"_NET_WM_PID", correlation_id)?;
    let excluded_types = [
        b"_NET_WM_WINDOW_TYPE_DESKTOP".as_slice(),
        b"_NET_WM_WINDOW_TYPE_DOCK".as_slice(),
        b"_NET_WM_WINDOW_TYPE_UTILITY".as_slice(),
        b"_NET_WM_WINDOW_TYPE_TOOLBAR".as_slice(),
        b"_NET_WM_WINDOW_TYPE_MENU".as_slice(),
        b"_NET_WM_WINDOW_TYPE_DROPDOWN_MENU".as_slice(),
        b"_NET_WM_WINDOW_TYPE_POPUP_MENU".as_slice(),
        b"_NET_WM_WINDOW_TYPE_TOOLTIP".as_slice(),
        b"_NET_WM_WINDOW_TYPE_NOTIFICATION".as_slice(),
        b"_NET_WM_WINDOW_TYPE_SPLASH".as_slice(),
    ]
    .into_iter()
    .map(|name| intern_atom(connection, name, correlation_id))
    .collect::<Result<Vec<_>, _>>()?;
    let clients = connection
        .get_property(false, root, client_list, AtomEnum::WINDOW, 0, u32::MAX)
        .map_err(|_| gate_error(correlation_id, "windowListRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "windowListReply"))?
        .value32()
        .map(|values| values.collect::<Vec<_>>())
        .unwrap_or_default();
    let selection_context = WindowSelectionContext {
        root,
        window_type,
        wm_state,
        window_pid,
        current_process_id: std::process::id(),
        excluded_types: &excluded_types,
    };

    // EWMH publishes the list bottom-to-top. Keep the first hit topmost.
    let mut candidates = Vec::new();
    for window in clients.into_iter().rev() {
        if !is_selectable_window(connection, window, &selection_context) {
            continue;
        }
        if let Ok(bounds) = window_root_geometry(connection, window, root, correlation_id)
            && let Some(rectangle) = overlay_rectangle(bounds)
        {
            candidates.push(WindowCandidate {
                window,
                bounds,
                rectangle,
            });
        }
    }
    Ok(candidates)
}

fn ewmh_atoms_available<C: Connection>(connection: &C, names: &[&[u8]]) -> bool {
    names.iter().all(|name| {
        connection
            .intern_atom(true, name)
            .ok()
            .and_then(|request| request.reply().ok())
            .is_some_and(|reply| reply.atom != NONE)
    })
}

fn intern_atom<C: Connection>(
    connection: &C,
    name: &[u8],
    correlation_id: &str,
) -> Result<u32, PlatformError> {
    connection
        .intern_atom(false, name)
        .map_err(|_| gate_error(correlation_id, "windowAtomRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "windowAtomReply"))
        .map(|reply| reply.atom)
}

fn is_selectable_window<C: Connection>(
    connection: &C,
    window: u32,
    selection_context: &WindowSelectionContext<'_>,
) -> bool {
    let Ok(attributes) = connection.get_window_attributes(window) else {
        return false;
    };
    let Ok(attributes) = attributes.reply() else {
        return false;
    };
    let Ok(types) = connection.get_property(
        false,
        window,
        selection_context.window_type,
        AtomEnum::ATOM,
        0,
        u32::MAX,
    ) else {
        return false;
    };
    let Ok(types) = types.reply() else {
        return false;
    };
    let types = types.value32().into_iter().flatten().collect::<Vec<_>>();
    window_selection_policy_allows(
        WindowSelectionMetadata {
            map_state: attributes.map_state,
            window,
            minimized: window_is_minimized(connection, window, selection_context.wm_state),
            process_id: window_process_id(connection, window, selection_context.window_pid),
            types: &types,
        },
        selection_context,
    )
}

fn window_selection_policy_allows(
    metadata: WindowSelectionMetadata<'_>,
    selection_context: &WindowSelectionContext<'_>,
) -> bool {
    metadata.map_state == MapState::VIEWABLE
        && metadata.window != selection_context.root
        && !metadata.minimized
        // The editor and the selector overlay are owned by the Tauri process;
        // never use title matching for this exclusion because titles are user data.
        && metadata.process_id != Some(selection_context.current_process_id)
        && !metadata
            .types
            .iter()
            .any(|window_type| selection_context.excluded_types.contains(window_type))
}

fn window_is_minimized<C: Connection>(connection: &C, window: u32, wm_state: u32) -> bool {
    connection
        .get_property(false, window, wm_state, AtomEnum::ANY, 0, 2)
        .ok()
        .and_then(|request| request.reply().ok())
        .and_then(|reply| reply.value32().and_then(|mut values| values.next()))
        .is_some_and(|state| state == 3)
}

fn window_process_id<C: Connection>(connection: &C, window: u32, window_pid: u32) -> Option<u32> {
    connection
        .get_property(false, window, window_pid, AtomEnum::CARDINAL, 0, 1)
        .ok()
        .and_then(|request| request.reply().ok())
        .and_then(|reply| reply.value32().and_then(|mut values| values.next()))
}

fn current_process_windows_and_frames_are_unmapped<C: Connection>(
    connection: &C,
    root: u32,
    window_pid: u32,
    mutter_frame_for: u32,
    current_process_id: u32,
    correlation_id: &str,
) -> Result<bool, PlatformError> {
    let windows = connection
        .query_tree(root)
        .map_err(|_| gate_error(correlation_id, "unmapWaitTreeRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "unmapWaitTreeReply"))?
        .children;
    let mut states = Vec::with_capacity(windows.len());
    for window in windows {
        let process_id = window_process_id(connection, window, window_pid);
        let frame_for = window_reference(connection, window, mutter_frame_for);
        if process_id != Some(current_process_id) && frame_for.is_none() {
            continue;
        }
        let Ok(attributes) = connection.get_window_attributes(window) else {
            continue;
        };
        let Ok(attributes) = attributes.reply() else {
            continue;
        };
        states.push(X11TopLevelWindowState {
            window,
            process_id,
            map_state: attributes.map_state,
            mutter_frame_for: frame_for,
        });
    }
    Ok(process_windows_and_frames_are_unmapped(
        &states,
        current_process_id,
    ))
}

fn window_reference<C: Connection>(connection: &C, window: u32, atom: u32) -> Option<u32> {
    connection
        .get_property(false, window, atom, AtomEnum::WINDOW, 0, 1)
        .ok()
        .and_then(|request| request.reply().ok())
        .and_then(|reply| reply.value32().and_then(|mut values| values.next()))
}

fn process_windows_and_frames_are_unmapped(
    windows: &[X11TopLevelWindowState],
    current_process_id: u32,
) -> bool {
    !windows.iter().any(|state| {
        state.map_state == MapState::VIEWABLE
            && (state.process_id == Some(current_process_id)
                || state.mutter_frame_for.is_some_and(|client| {
                    windows.iter().any(|candidate| {
                        candidate.window == client
                            && candidate.process_id == Some(current_process_id)
                    })
                }))
    })
}

fn compositor_unmap_has_settled(hidden_for: Duration) -> bool {
    hidden_for >= X11_COMPOSITOR_UNMAP_SETTLE
}

fn overlay_rectangle(bounds: (i32, i32, u16, u16)) -> Option<Rectangle> {
    let (x, y, width, height) = bounds;
    let x = i16::try_from(x).ok()?;
    let y = i16::try_from(y).ok()?;
    (width > 0 && height > 0).then_some(Rectangle {
        x,
        y,
        width,
        height,
    })
}

fn window_at(candidates: &[WindowCandidate], x: i16, y: i16) -> Option<WindowCandidate> {
    let x = i32::from(x);
    let y = i32::from(y);
    candidates.iter().copied().find(|candidate| {
        let (left, top, width, height) = candidate.bounds;
        let right = left.saturating_add(i32::from(width));
        let bottom = top.saturating_add(i32::from(height));
        x >= left && x < right && y >= top && y < bottom
    })
}

fn active_window<C: Connection>(
    connection: &C,
    root: u32,
    correlation_id: &str,
) -> Result<u32, PlatformError> {
    let atom = connection
        .intern_atom(false, b"_NET_ACTIVE_WINDOW")
        .map_err(|_| gate_error(correlation_id, "activeWindowAtomRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "activeWindowAtomReply"))?
        .atom;
    connection
        .get_property(false, root, atom, AtomEnum::WINDOW, 0, 1)
        .map_err(|_| gate_error(correlation_id, "activeWindowRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "activeWindowReply"))?
        .value32()
        .and_then(|mut values| values.next())
        .filter(|window| *window != 0)
        .ok_or_else(|| PlatformError::new(PlatformErrorCode::InvalidTarget, correlation_id))
}

fn window_root_geometry<C: Connection>(
    connection: &C,
    window: u32,
    root: u32,
    correlation_id: &str,
) -> Result<(i32, i32, u16, u16), PlatformError> {
    let geometry = connection
        .get_geometry(window)
        .map_err(|_| gate_error(correlation_id, "activeWindowGeometryRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "activeWindowGeometryReply"))?;
    if geometry.width == 0 || geometry.height == 0 {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            correlation_id,
        ));
    }
    let coordinates = connection
        .translate_coordinates(window, root, 0, 0)
        .map_err(|_| gate_error(correlation_id, "activeWindowCoordinatesRequest"))?
        .reply()
        .map_err(|_| gate_error(correlation_id, "activeWindowCoordinatesReply"))?;
    let bounds = (
        i32::from(coordinates.dst_x),
        i32::from(coordinates.dst_y),
        geometry.width,
        geometry.height,
    );
    Ok(frame_extents(connection, window)
        .and_then(|extents| apply_frame_extents(bounds, extents))
        .unwrap_or(bounds))
}

fn frame_extents<C: Connection>(connection: &C, window: u32) -> Option<(u32, u32, u32, u32)> {
    let atom = connection
        .intern_atom(false, b"_NET_FRAME_EXTENTS")
        .ok()?
        .reply()
        .ok()?
        .atom;
    let values = connection
        .get_property(false, window, atom, AtomEnum::CARDINAL, 0, 4)
        .ok()?
        .reply()
        .ok()?
        .value32()?
        .collect::<Vec<_>>();
    match values.as_slice() {
        [left, right, top, bottom] => Some((*left, *right, *top, *bottom)),
        _ => None,
    }
}

fn apply_frame_extents(
    (x, y, width, height): (i32, i32, u16, u16),
    (left, right, top, bottom): (u32, u32, u32, u32),
) -> Option<(i32, i32, u16, u16)> {
    let left = i32::try_from(left).ok()?;
    let top = i32::try_from(top).ok()?;
    let horizontal = left.checked_add(i32::try_from(right).ok()?)?;
    let vertical = top.checked_add(i32::try_from(bottom).ok()?)?;
    let width = i32::from(width).checked_add(horizontal)?;
    let height = i32::from(height).checked_add(vertical)?;
    Some((
        x.checked_sub(left)?,
        y.checked_sub(top)?,
        u16::try_from(width).ok()?,
        u16::try_from(height).ok()?,
    ))
}

fn crop_root_frame(
    root: RgbaFrame,
    bounds: (i32, i32, u16, u16),
    correlation_id: &str,
) -> Result<RgbaFrame, PlatformError> {
    let (x, y, width, height) = bounds;
    let root_width = i32::from(root.width);
    let root_height = i32::from(root.height);
    let x0 = x.clamp(0, root_width);
    let y0 = y.clamp(0, root_height);
    let x1 = x
        .checked_add(i32::from(width))
        .unwrap_or(i32::MAX)
        .clamp(0, root_width);
    let y1 = y
        .checked_add(i32::from(height))
        .unwrap_or(i32::MAX)
        .clamp(0, root_height);
    if x0 >= x1 || y0 >= y1 {
        return Err(PlatformError::new(
            PlatformErrorCode::InvalidTarget,
            correlation_id,
        ));
    }
    let output_width =
        u16::try_from(x1 - x0).map_err(|_| gate_error(correlation_id, "cropWidth"))?;
    let output_height =
        u16::try_from(y1 - y0).map_err(|_| gate_error(correlation_id, "cropHeight"))?;
    let root_stride = usize::from(root.width)
        .checked_mul(4)
        .ok_or_else(|| gate_error(correlation_id, "cropStride"))?;
    let output_stride = usize::from(output_width)
        .checked_mul(4)
        .ok_or_else(|| gate_error(correlation_id, "cropStride"))?;
    let output_len = output_stride
        .checked_mul(usize::from(output_height))
        .ok_or_else(|| gate_error(correlation_id, "cropAllocation"))?;
    let mut rgba = Vec::with_capacity(output_len);
    for row in y0..y1 {
        let offset = usize::try_from(row)
            .ok()
            .and_then(|row| row.checked_mul(root_stride))
            .and_then(|row| {
                usize::try_from(x0)
                    .ok()
                    .and_then(|x| x.checked_mul(4))
                    .and_then(|x| row.checked_add(x))
            })
            .ok_or_else(|| gate_error(correlation_id, "cropOffset"))?;
        let end = offset
            .checked_add(output_stride)
            .ok_or_else(|| gate_error(correlation_id, "cropOffset"))?;
        let source = root
            .rgba
            .get(offset..end)
            .ok_or_else(|| gate_error(correlation_id, "cropBounds"))?;
        rgba.extend_from_slice(source);
    }
    Ok(RgbaFrame {
        width: output_width,
        height: output_height,
        rgba,
        cursor_included: root.cursor_included,
    })
}

fn import_rgba_frame(
    transport: &ImageTransportService,
    correlation_id: &str,
    frame: RgbaFrame,
) -> Result<CaptureResult, PlatformError> {
    let mut encoded = Vec::new();
    let mut encoder = png::Encoder::new(
        &mut encoded,
        u32::from(frame.width),
        u32::from(frame.height),
    );
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|_| gate_error(correlation_id, "pngHeader"))?;
    writer
        .write_image_data(&frame.rgba)
        .map_err(|_| gate_error(correlation_id, "pngWrite"))?;
    drop(writer);
    let token = format!("x11-{}", Uuid::now_v7().simple());
    transport.import_owned_bytes(
        &token,
        &encoded,
        "image/png",
        u32::from(frame.width),
        u32::from(frame.height),
        correlation_id,
    )?;
    Ok(CaptureResult {
        image_token: token,
        correlation_id: correlation_id.to_owned(),
        width: u32::from(frame.width),
        height: u32::from(frame.height),
        geometry: None,
        quick_frame_geometry: None,
        cursor_included: Some(frame.cursor_included),
    })
}

fn decode_rgba<C: Connection>(
    connection: &C,
    visual_id: u32,
    image: &Image,
    correlation_id: &str,
) -> Result<Vec<u8>, PlatformError> {
    const MAX_PIXELS: usize = 134_217_728;
    let layout = pixel_layout_for_visual(connection, visual_id, correlation_id)?;
    let pixels = usize::from(image.width())
        .checked_mul(usize::from(image.height()))
        .filter(|pixels| *pixels <= MAX_PIXELS)
        .ok_or_else(|| gate_error(correlation_id, "allocation"))?;
    let capacity = pixels
        .checked_mul(4)
        .ok_or_else(|| gate_error(correlation_id, "allocation"))?;
    let mut rgba = Vec::with_capacity(capacity);
    for y in 0..image.height() {
        for x in 0..image.width() {
            let (red, green, blue) = layout.decode(image.get_pixel(x, y));
            rgba.extend_from_slice(&[(red >> 8) as u8, (green >> 8) as u8, (blue >> 8) as u8, 255]);
        }
    }
    Ok(rgba)
}

fn pixel_layout_for_visual<C: Connection>(
    connection: &C,
    visual_id: u32,
    correlation_id: &str,
) -> Result<PixelLayout, PlatformError> {
    let visual = connection
        .setup()
        .roots
        .iter()
        .flat_map(|root| &root.allowed_depths)
        .flat_map(|depth| &depth.visuals)
        .find(|visual| visual.visual_id == visual_id)
        .ok_or_else(|| gate_error(correlation_id, "visual"))?;
    PixelLayout::from_visual_type(*visual).map_err(|_| gate_error(correlation_id, "pixelLayout"))
}

fn encode_selector_image<C: Connection>(
    connection: &C,
    visual_id: u32,
    depth: u8,
    frame: &RgbaFrame,
    correlation_id: &str,
) -> Result<Image<'static>, PlatformError> {
    let layout = pixel_layout_for_visual(connection, visual_id, correlation_id)?;
    let mut image = Image::allocate_native(frame.width, frame.height, depth, connection.setup())
        .map_err(|_| gate_error(correlation_id, "overlayImageFormat"))?;
    write_rgba_pixels(&mut image, layout, &frame.rgba, correlation_id)?;
    Ok(image)
}

fn write_rgba_pixels(
    image: &mut Image<'_>,
    layout: PixelLayout,
    rgba: &[u8],
    correlation_id: &str,
) -> Result<(), PlatformError> {
    let pixel_count = usize::from(image.width())
        .checked_mul(usize::from(image.height()))
        .ok_or_else(|| gate_error(correlation_id, "overlayImageAllocation"))?;
    let expected_len = pixel_count
        .checked_mul(4)
        .ok_or_else(|| gate_error(correlation_id, "overlayImageAllocation"))?;
    if rgba.len() != expected_len {
        return Err(gate_error(correlation_id, "overlayImageLength"));
    }
    for (index, pixel) in rgba.chunks_exact(4).enumerate() {
        let x = u16::try_from(index % usize::from(image.width()))
            .map_err(|_| gate_error(correlation_id, "overlayImageCoordinate"))?;
        let y = u16::try_from(index / usize::from(image.width()))
            .map_err(|_| gate_error(correlation_id, "overlayImageCoordinate"))?;
        let encoded = layout.encode((
            u16::from(pixel[0]) * 257,
            u16::from(pixel[1]) * 257,
            u16::from(pixel[2]) * 257,
        ));
        image.put_pixel(x, y, encoded);
    }
    Ok(())
}

fn gate_error(correlation_id: &str, operation: &str) -> PlatformError {
    let mut error = PlatformError::new(PlatformErrorCode::CaptureFailed, correlation_id);
    error
        .context
        .insert("operation".to_owned(), operation.to_owned());
    error
}

fn hotkey_error(correlation_id: &str, operation: &str) -> PlatformError {
    let mut error = PlatformError::new(PlatformErrorCode::ShortcutUnavailable, correlation_id);
    error
        .context
        .insert("operation".to_owned(), operation.to_owned());
    error
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crate::platform::{PlatformErrorCode, SessionKind};

    use super::{
        RgbaFrame, WindowCandidate, WindowSelectionContext, WindowSelectionMetadata,
        X11_COMPOSITOR_UNMAP_SETTLE, X11CaptureAdapter, X11HotkeyBinding, X11MonitorLayout,
        X11TopLevelWindowState, apply_frame_extents, compositor_owner_requires_overlay,
        compositor_unmap_has_settled, crop_root_frame, current_monitor_id_for_bounds,
        monitor_ids_for_bounds, move_rectangle, parse_hotkey_trigger,
        process_windows_and_frames_are_unmapped, rectangle_contains, replacement_plan,
        resize_rectangle, selector_visual_damage, should_complete_area_release,
        size_badge_rectangle, window_at, window_selection_policy_allows, write_rgba_pixels,
    };
    use x11rb::image::{BitsPerPixel, ColorComponent, Image, ImageOrder, PixelLayout, ScanlinePad};
    use x11rb::protocol::xproto::{MapState, Rectangle};

    #[test]
    fn wayland_is_rejected_before_x11_connection() {
        let error = X11CaptureAdapter
            .controlled_window_gate(SessionKind::Wayland, 0, "x11-gate-test")
            .expect_err("Wayland must never reach x11rb");
        assert_eq!(error.code, PlatformErrorCode::CaptureFailed);
    }

    #[test]
    fn current_process_must_be_unmapped_before_the_frozen_frame_starts() {
        let windows = [
            X11TopLevelWindowState {
                window: 11,
                process_id: Some(73),
                map_state: MapState::VIEWABLE,
                mutter_frame_for: None,
            },
            X11TopLevelWindowState {
                window: 12,
                process_id: Some(91),
                map_state: MapState::UNMAPPED,
                mutter_frame_for: None,
            },
        ];

        assert!(!process_windows_and_frames_are_unmapped(&windows, 73));
    }

    #[test]
    fn mapped_mutter_decoration_must_disappear_before_the_frozen_frame_starts() {
        let windows = [
            X11TopLevelWindowState {
                window: 11,
                process_id: Some(73),
                map_state: MapState::UNMAPPED,
                mutter_frame_for: None,
            },
            X11TopLevelWindowState {
                window: 22,
                process_id: Some(91),
                map_state: MapState::VIEWABLE,
                mutter_frame_for: Some(11),
            },
        ];

        assert!(!process_windows_and_frames_are_unmapped(&windows, 73));
    }

    #[test]
    fn unmapped_windows_must_remain_absent_until_the_compositor_has_settled() {
        assert!(!compositor_unmap_has_settled(Duration::ZERO));
    }

    #[test]
    fn stable_unmapped_interval_allows_the_frozen_frame_to_start() {
        assert!(compositor_unmap_has_settled(X11_COMPOSITOR_UNMAP_SETTLE));
    }

    #[test]
    fn crop_clamps_a_partly_offscreen_active_window_without_wrapping_coordinates() {
        let root = RgbaFrame {
            width: 3,
            height: 2,
            rgba: vec![
                1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
            ],
            cursor_included: false,
        };
        let cropped = crop_root_frame(root, (-1, 0, 2, 2), "x11-crop-test")
            .expect("intersection remains visible");

        assert_eq!((cropped.width, cropped.height), (1, 2));
        assert_eq!(cropped.rgba, vec![1, 0, 0, 255, 4, 0, 0, 255]);
    }

    #[test]
    fn screen_target_is_a_full_rectangle_crop_of_the_frozen_root_frame() {
        let root = RgbaFrame {
            width: 2,
            height: 1,
            rgba: vec![1, 2, 3, 255, 4, 5, 6, 255],
            cursor_included: false,
        };

        let screen = crop_root_frame(root, (0, 0, 2, 1), "screen-crop-test")
            .expect("the complete frozen root is crop-valid");

        assert_eq!((screen.width, screen.height), (2, 1));
        assert_eq!(screen.rgba, vec![1, 2, 3, 255, 4, 5, 6, 255]);
    }

    #[test]
    fn composited_session_requires_the_overlay_instead_of_the_legacy_root() {
        assert!(!compositor_owner_requires_overlay(x11rb::NONE));
        assert!(compositor_owner_requires_overlay(42));
    }

    #[test]
    fn selector_image_encodes_canonical_rgba_for_the_target_visual() {
        let layout = PixelLayout::new(
            ColorComponent::new(8, 16).expect("red component"),
            ColorComponent::new(8, 8).expect("green component"),
            ColorComponent::new(8, 0).expect("blue component"),
        );
        let mut image = Image::allocate(
            2,
            1,
            ScanlinePad::Pad32,
            24,
            BitsPerPixel::B32,
            ImageOrder::LsbFirst,
        );

        write_rgba_pixels(
            &mut image,
            layout,
            &[255, 0, 0, 255, 0, 128, 255, 255],
            "selector-image-test",
        )
        .expect("canonical RGBA should encode");

        assert_eq!(layout.decode(image.get_pixel(0, 0)), (65535, 0, 0));
        assert_eq!(layout.decode(image.get_pixel(1, 0)), (0, 32896, 65535));
    }

    #[test]
    fn continuous_selector_motion_restores_every_previous_transient_visual() {
        let prior_states = [
            Rectangle {
                x: 100,
                y: 100,
                width: 400,
                height: 300,
            },
            Rectangle {
                x: 100,
                y: 100,
                width: 520,
                height: 360,
            },
        ];

        for previous in prior_states {
            let damage = selector_visual_damage(previous, 1920, 1080);
            let badge = size_badge_rectangle(previous);

            assert_eq!(damage.len(), 5);
            assert!(
                damage
                    .iter()
                    .any(|region| rectangle_contains(*region, (previous.x, previous.y)))
            );
            assert!(damage.iter().any(|region| {
                rectangle_contains(
                    *region,
                    (
                        previous
                            .x
                            .saturating_add(i16::try_from(previous.width).expect("width")),
                        previous
                            .y
                            .saturating_add(i16::try_from(previous.height).expect("height")),
                    ),
                )
            }));
            assert!(damage.iter().any(|region| {
                (region.x, region.y, region.width, region.height)
                    == (badge.x, badge.y, badge.width, badge.height)
            }));
        }
    }

    #[test]
    fn initial_area_drag_completes_on_primary_pointer_release() {
        assert!(should_complete_area_release(
            true,
            Some((100, 120)),
            Some((500, 360)),
        ));
        assert!(!should_complete_area_release(
            true,
            Some((100, 120)),
            Some((100, 120)),
        ));
        assert!(!should_complete_area_release(
            false,
            Some((100, 120)),
            Some((500, 360)),
        ));
    }

    #[test]
    fn native_hotkey_parser_accepts_portal_style_ctrl_print_without_shelling_out() {
        let trigger = parse_hotkey_trigger("CTRL+PRINT", "x11-hotkey-test")
            .expect("CTRL+PRINT is a supported X11 trigger");
        assert_eq!(trigger.keysyms, [0xff61, 0xff61]);
        assert_ne!(u16::from(trigger.modifiers) & 0b100, 0);
        assert!(parse_hotkey_trigger("CTRL+UNKNOWN", "x11-hotkey-test").is_err());
    }

    #[test]
    fn hotkey_replacement_stages_new_grabs_before_releasing_old_ones() {
        use x11rb::protocol::xproto::ModMask;

        let old = X11HotkeyBinding {
            id: "capture-area".to_owned(),
            keycode: 107,
            modifiers: ModMask::CONTROL,
        };
        let retained = X11HotkeyBinding {
            id: "capture-screen".to_owned(),
            keycode: 107,
            modifiers: ModMask::M1,
        };
        let replacement = X11HotkeyBinding {
            id: "capture-window".to_owned(),
            keycode: 108,
            modifiers: ModMask::CONTROL,
        };

        let (additions, removals) = replacement_plan(
            &[old.clone(), retained.clone()],
            &[retained.clone(), replacement.clone()],
            "hotkey-replace",
        )
        .expect("distinct candidate grabs");

        assert_eq!(additions, vec![replacement]);
        assert_eq!(removals, vec![old]);
        assert!(
            replacement_plan(
                std::slice::from_ref(&retained),
                &[retained.clone(), retained.clone()],
                "hotkey-replace",
            )
            .is_err()
        );
    }

    #[test]
    fn monitor_identity_uses_largest_intersection_across_x_and_y_axes() {
        let monitors = [
            X11MonitorLayout {
                id: "HDMI-1".to_owned(),
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
                width_mm: 510,
                height_mm: 290,
            },
            X11MonitorLayout {
                id: "eDP-1".to_owned(),
                x: 0,
                y: 0,
                width: 2560,
                height: 1600,
                width_mm: 340,
                height_mm: 210,
            },
            X11MonitorLayout {
                id: "DP-1".to_owned(),
                x: 0,
                y: -1200,
                width: 1600,
                height: 1200,
                width_mm: 520,
                height_mm: 320,
            },
        ];

        assert_eq!(
            monitor_ids_for_bounds(&monitors, (-100, 20, 50, 100), "monitor-test")
                .expect("negative monitor bounds"),
            ["HDMI-1"]
        );
        assert_eq!(
            monitor_ids_for_bounds(&monitors, (-30, 20, 80, 100), "monitor-test")
                .expect("cross-monitor bounds"),
            ["eDP-1", "HDMI-1"]
        );
        assert_eq!(
            monitor_ids_for_bounds(&monitors, (40, -1100, 100, 100), "monitor-test")
                .expect("vertical monitor bounds"),
            ["DP-1"]
        );
        assert_eq!(
            current_monitor_id_for_bounds(&monitors, (-100, 20, 50, 100), "monitor-test")
                .expect("negative horizontal monitor"),
            "HDMI-1"
        );
        assert_eq!(
            current_monitor_id_for_bounds(&monitors, (-30, 20, 80, 100), "monitor-test")
                .expect("horizontal overlap monitor"),
            "eDP-1"
        );
        assert_eq!(
            current_monitor_id_for_bounds(&monitors, (40, -1100, 100, 100), "monitor-test")
                .expect("vertical monitor"),
            "DP-1"
        );
        assert_eq!(
            current_monitor_id_for_bounds(&monitors, (-100, 0, 200, 100), "monitor-test")
                .expect("seam tie"),
            "HDMI-1"
        );
        assert!(monitor_ids_for_bounds(&monitors, (5000, 5000, 10, 10), "monitor-test").is_err());
    }

    #[test]
    fn horizontal_current_monitor_property_uses_largest_x_overlap() {
        let monitors = [
            X11MonitorLayout {
                id: "HDMI-1".to_owned(),
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
                width_mm: 510,
                height_mm: 290,
            },
            X11MonitorLayout {
                id: "eDP-1".to_owned(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                width_mm: 340,
                height_mm: 210,
            },
        ];

        for x in -150..=100 {
            let current = current_monitor_id_for_bounds(&monitors, (x, 100, 200, 100), "x-axis")
                .expect("capture intersects one horizontal monitor");
            let expected = if x <= -100 { "HDMI-1" } else { "eDP-1" };
            assert_eq!(current, expected, "x={x}");
        }
    }

    #[test]
    fn vertical_current_monitor_property_uses_largest_y_overlap() {
        let monitors = [
            X11MonitorLayout {
                id: "DP-1".to_owned(),
                x: 0,
                y: -1200,
                width: 1920,
                height: 1200,
                width_mm: 600,
                height_mm: 340,
            },
            X11MonitorLayout {
                id: "eDP-1".to_owned(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                width_mm: 340,
                height_mm: 210,
            },
        ];

        for y in -150..=100 {
            let current = current_monitor_id_for_bounds(&monitors, (100, y, 100, 200), "y-axis")
                .expect("capture intersects one vertical monitor");
            let expected = if y <= -100 { "DP-1" } else { "eDP-1" };
            assert_eq!(current, expected, "y={y}");
        }
    }

    #[test]
    fn window_selector_prefers_the_topmost_ewmh_candidate_at_the_pointer() {
        let candidates = [
            WindowCandidate {
                window: 7,
                bounds: (0, 0, 200, 200),
                rectangle: Rectangle {
                    x: 0,
                    y: 0,
                    width: 200,
                    height: 200,
                },
            },
            WindowCandidate {
                window: 8,
                bounds: (50, 50, 100, 100),
                rectangle: Rectangle {
                    x: 50,
                    y: 50,
                    width: 100,
                    height: 100,
                },
            },
        ];

        assert_eq!(
            window_at(&candidates, 75, 75).map(|candidate| candidate.bounds),
            Some((0, 0, 200, 200))
        );
        assert_eq!(
            window_at(&candidates, 225, 75).map(|candidate| candidate.bounds),
            None
        );
    }

    #[test]
    fn window_selector_excludes_non_user_targets_without_title_matching() {
        let desktop = 101;
        let dock = 102;
        let current_process_id = 41;
        let selection_context = WindowSelectionContext {
            root: 1,
            window_type: 0,
            wm_state: 0,
            window_pid: 0,
            current_process_id,
            excluded_types: &[desktop, dock],
        };
        let allows = |map_state, window, minimized, process_id, types: &[u32]| {
            window_selection_policy_allows(
                WindowSelectionMetadata {
                    map_state,
                    window,
                    minimized,
                    process_id,
                    types,
                },
                &selection_context,
            )
        };

        assert!(allows(MapState::VIEWABLE, 7, false, Some(99), &[]));
        assert!(!allows(MapState::UNMAPPED, 7, false, Some(99), &[]));
        assert!(!allows(MapState::VIEWABLE, 1, false, Some(99), &[]));
        assert!(!allows(MapState::VIEWABLE, 7, true, Some(99), &[]));
        assert!(!allows(
            MapState::VIEWABLE,
            7,
            false,
            Some(current_process_id),
            &[],
        ));
        assert!(!allows(MapState::VIEWABLE, 7, false, Some(99), &[desktop]));
        assert!(!allows(MapState::VIEWABLE, 7, false, Some(99), &[dock]));
    }

    #[test]
    fn frame_extents_expand_client_bounds_without_integer_wrapping() {
        assert_eq!(
            apply_frame_extents((100, 80, 800, 600), (8, 8, 32, 8)),
            Some((92, 48, 816, 640))
        );
        assert_eq!(apply_frame_extents((0, 0, 2, 2), (u32::MAX, 0, 0, 0)), None);
    }

    #[test]
    fn area_selection_nudge_clamps_without_changing_the_selected_size() {
        let selected = Rectangle {
            x: 90,
            y: 90,
            width: 10,
            height: 10,
        };
        let moved = move_rectangle(selected, 1, 1, 100, 100);

        assert_eq!(
            (moved.x, moved.y, moved.width, moved.height),
            (90, 90, 10, 10)
        );
        assert!(rectangle_contains(moved, (99, 99)));
        assert!(!rectangle_contains(moved, (100, 99)));
    }

    #[test]
    fn area_selection_shift_arrow_expands_the_relevant_edge_within_bounds() {
        let selected = Rectangle {
            x: 10,
            y: 10,
            width: 20,
            height: 20,
        };
        let resized = resize_rectangle(selected, 113, 100, 100);
        assert_eq!(
            (resized.x, resized.y, resized.width, resized.height),
            (9, 10, 21, 20)
        );
    }
}
