use super::{desktop_entry, desktop_entry_enabled, desktop_exec, windows_command};

#[test]
fn desktop_exec_quotes_each_argument_without_shell_expansion() {
    assert_eq!(
        desktop_exec("/home/me/My App.AppImage", &["--background"]),
        "\"/home/me/My App.AppImage\" \"--background\""
    );
    assert!(desktop_exec("/tmp/$app`x`\\file", &[]).contains("\\\\$"));
}

#[test]
fn hidden_or_disabled_desktop_entry_is_not_enabled() {
    let entry = desktop_entry("/opt/Cute Screen.AppImage");
    assert!(desktop_entry_enabled(&entry, "/opt/Cute Screen.AppImage"));
    assert!(!desktop_entry_enabled(
        &(entry.clone() + "\nHidden=true\n"),
        "/opt/Cute Screen.AppImage"
    ));
    assert!(!desktop_entry_enabled(
        &(entry.clone() + "\nX-GNOME-Autostart-enabled=false\n"),
        "/opt/Cute Screen.AppImage"
    ));
    assert!(!desktop_entry_enabled(&entry, "/opt/other.AppImage"));
}

#[test]
fn windows_startup_command_quotes_the_executable() {
    assert_eq!(
        windows_command("C:\\Program Files\\Cute Screen\\cute-screen.exe"),
        "\"C:\\Program Files\\Cute Screen\\cute-screen.exe\" --background"
    );
}

#[test]
fn try_exec_uses_desktop_string_escaping_for_control_characters_and_spaces() {
    let entry = desktop_entry("/tmp/Cute Screen\tfile\rname.AppImage");
    assert!(entry.contains("TryExec=/tmp/Cute\\sScreen\\tfile\\rname.AppImage\n"));
    assert!(!entry.contains('\t'));
    assert!(!entry.contains('\r'));
}
