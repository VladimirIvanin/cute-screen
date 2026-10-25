#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
    // AppImage's AppRun forwards arguments here. Dispatch before GTK/Wayland
    // initialization so stdin/stdout remain the MCP client's pipes.
    if std::env::args_os().nth(1).as_deref() == Some(std::ffi::OsStr::new("--mcp-stdio")) {
        let result = std::env::current_exe().and_then(|path| {
            std::process::Command::new(path.with_file_name(if cfg!(windows) {
                "cute-screen-mcp.exe"
            } else {
                "cute-screen-mcp"
            }))
            .args(std::env::args_os().skip(2))
            .status()
        });
        match result {
            Ok(status) => std::process::exit(status.code().unwrap_or(1)),
            Err(_) => {
                eprintln!("Cute Screen MCP companion unavailable");
                std::process::exit(1);
            }
        }
    }
    #[cfg(target_os = "linux")]
    prefer_native_wayland();
    cute_screen_desktop::run();
}

#[cfg(target_os = "linux")]
fn prefer_native_wayland() {
    use std::os::unix::process::CommandExt;

    if !needs_native_wayland(
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        std::env::var("GDK_BACKEND").ok().as_deref(),
    ) {
        return;
    }
    // Re-exec before GTK initialization. Command::env avoids mutating the
    // environment of a process that could already have native library threads.
    let result = std::env::current_exe().map(|executable| {
        std::process::Command::new(executable)
            .args(std::env::args_os().skip(1))
            .env("GDK_BACKEND", "wayland")
            .exec()
    });
    eprintln!("Cannot start native Wayland desktop: {result:?}");
    std::process::exit(1);
}

#[cfg(target_os = "linux")]
fn needs_native_wayland(session: Option<&str>, backend: Option<&str>) -> bool {
    session.is_some_and(|session| session.eq_ignore_ascii_case("wayland"))
        && backend != Some("wayland")
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    #[test]
    fn wayland_never_inherits_xwayland_preview_scaling() {
        assert!(super::needs_native_wayland(Some("wayland"), Some("x11")));
        assert!(super::needs_native_wayland(Some("Wayland"), None));
        assert!(!super::needs_native_wayland(
            Some("wayland"),
            Some("wayland")
        ));
        assert!(!super::needs_native_wayland(Some("x11"), Some("x11")));
        assert!(!super::needs_native_wayland(None, None));
    }
}
