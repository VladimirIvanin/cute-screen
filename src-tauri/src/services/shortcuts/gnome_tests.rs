use super::*;

fn isolated_settings() -> (GnomeSettings, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let xml = format!(
        r#"<schemalist>
      <schema id="{MAIN}" path="/org/gnome/settings-daemon/plugins/media-keys/">
        <key name="custom-keybindings" type="as"><default>[]</default></key>
      </schema>
      <schema id="{CUSTOM}">
        <key name="name" type="s"><default>''</default></key>
        <key name="binding" type="s"><default>''</default></key>
        <key name="command" type="s"><default>''</default></key>
      </schema></schemalist>"#
    );
    std::fs::write(dir.path().join("shortcuts.gschema.xml"), xml).unwrap();
    assert!(
        std::process::Command::new("glib-compile-schemas")
            .arg(dir.path())
            .status()
            .unwrap()
            .success()
    );
    let source = gio::SettingsSchemaSource::from_directory(
        dir.path(),
        None::<&gio::SettingsSchemaSource>,
        false,
    )
    .unwrap();
    let backend = gio::memory_settings_backend_new();
    let main = gio::Settings::new_full(&source.lookup(MAIN, false).unwrap(), Some(&backend), None);
    (
        GnomeSettings {
            main,
            custom: source.lookup(CUSTOM, false).unwrap(),
            backend: Some(backend),
        },
        dir,
    )
}

#[test]
fn staging_and_cancel_preserve_old_binding_and_foreign_settings() {
    let (settings, _directory) = isolated_settings();
    let foreign = format!("{BASE}foreign/");
    settings
        .main
        .set_strv("custom-keybindings", [&foreign])
        .unwrap();
    let old_path = GnomeSettings::owned_path(ShortcutAction::CaptureArea);
    settings
        .write(
            &old_path,
            "CTRL+SHIFT+2",
            "'/opt/Cute Screen' 'capture' '--mode' 'area'",
        )
        .unwrap();
    let pending = settings
        .stage(
            "0123456789abcdef0123456789abcdef",
            "CTRL+SHIFT+3",
            "test-command",
        )
        .unwrap();
    assert_eq!(
        settings.read(ShortcutAction::CaptureArea).unwrap().0,
        "CTRL+SHIFT+2"
    );
    assert!(settings.paths().contains(&foreign));
    settings.remove(&pending).unwrap();
    assert_eq!(settings.paths(), [foreign, old_path]);
    assert_eq!(
        settings.read(ShortcutAction::CaptureArea).unwrap().0,
        "CTRL+SHIFT+2"
    );
}

#[test]
fn rejects_foreign_mutation_and_observes_external_changes() {
    let (settings, _directory) = isolated_settings();
    let path = GnomeSettings::owned_path(ShortcutAction::CaptureScreen);
    settings.write(&path, "CTRL+SHIFT+2", "capture").unwrap();
    assert!(
        settings
            .write(&format!("{BASE}foreign/"), "CTRL+SHIFT+3", "other")
            .is_err()
    );
    assert!(settings.remove(&format!("{BASE}foreign/")).is_err());
    settings
        .entry(&path)
        .set_string("binding", "<Primary><Shift>4")
        .unwrap();
    assert_eq!(
        settings.read(ShortcutAction::CaptureScreen).unwrap().0,
        "CTRL+SHIFT+4"
    );
    assert!(
        settings
            .conflict("CTRL+SHIFT+4", ShortcutAction::CaptureArea)
            .is_some()
    );
}

#[test]
fn restart_cleanup_removes_only_owned_pending_rows() {
    let (settings, _directory) = isolated_settings();
    let stable = GnomeSettings::owned_path(ShortcutAction::ShowEditor);
    settings.write(&stable, "CTRL+SHIFT+2", "show").unwrap();
    settings
        .stage("0123456789abcdef0123456789abcdef", "CTRL+SHIFT+3", "test")
        .unwrap();
    settings.cleanup_pending().unwrap();
    assert_eq!(settings.paths(), [stable]);

    let reopened = GnomeSettings {
        main: gio::Settings::new_full(
            &settings.main.settings_schema().expect("schema"),
            settings.backend.as_ref(),
            None,
        ),
        custom: settings.custom.clone(),
        backend: settings.backend.clone(),
    };
    reopened.cleanup_pending().expect("restart cleanup");
    assert_eq!(
        reopened.read(ShortcutAction::ShowEditor),
        Some(("CTRL+SHIFT+2".to_owned(), "show".to_owned()))
    );
}

#[test]
fn install_commits_the_stable_binding_without_a_pending_row() {
    let (settings, _directory) = isolated_settings();
    let foreign = format!("{BASE}foreign/");
    settings
        .main
        .set_strv("custom-keybindings", [&foreign])
        .unwrap();
    let command = "'/opt/Cute Screen' 'capture' '--mode' 'area'";
    settings
        .install(ShortcutAction::CaptureArea, "CTRL+SHIFT+3", command)
        .unwrap();
    assert_eq!(
        settings.read(ShortcutAction::CaptureArea).unwrap(),
        ("CTRL+SHIFT+3".to_owned(), command.to_owned())
    );
    assert!(settings.paths().contains(&foreign));
    assert!(
        settings
            .paths()
            .iter()
            .all(|path| !path.contains("cute-screen-pending-"))
    );
}

#[test]
fn confirm_rejects_a_binding_the_system_did_not_keep() {
    let (settings, _directory) = isolated_settings();
    let path = GnomeSettings::owned_path(ShortcutAction::CaptureScreen);
    settings.write(&path, "CTRL+SHIFT+2", "capture").unwrap();
    settings
        .entry(&path)
        .set_string("binding", "<Control><Shift>9")
        .unwrap();
    let error = settings
        .confirm(ShortcutAction::CaptureScreen, "CTRL+SHIFT+2", "capture")
        .expect_err("changed binding");
    assert!(error.contains("CTRL+SHIFT+9"), "{error}");
}
