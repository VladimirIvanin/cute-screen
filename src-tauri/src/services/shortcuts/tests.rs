use std::collections::BTreeMap;

use super::{Bindings, ShortcutAction, normalize_trigger, replace_transaction};

fn old_bindings() -> Bindings {
    BTreeMap::from([(ShortcutAction::CaptureArea, "CTRL+SHIFT+2".to_owned())])
}

#[test]
fn validates_actions_and_rejects_reserved_or_ambiguous_keys() {
    assert_eq!(
        normalize_trigger("Shift+Control+Digit2", false).unwrap(),
        "CTRL+SHIFT+2"
    );
    assert!(normalize_trigger("CTRL+F12", false).is_err());
    assert!(normalize_trigger("SHIFT+A", false).is_err());
    assert!(normalize_trigger("CTRL+MediaPlayPause", false).is_err());
    assert!(serde_json::from_str::<ShortcutAction>("\"untrusted-action\"").is_err());
}

#[test]
fn stages_new_binding_before_persisting_and_releasing_old() {
    let old = old_bindings();
    let candidate = BTreeMap::from([(ShortcutAction::CaptureArea, "CTRL+SHIFT+3".to_owned())]);
    let calls = std::cell::RefCell::new(Vec::new());
    replace_transaction(
        &old,
        &candidate,
        |bindings| {
            calls.borrow_mut().push(format!("bind:{}", bindings.len()));
            Ok(())
        },
        |_| {
            calls.borrow_mut().push("save".to_owned());
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(*calls.borrow(), ["bind:2", "save", "bind:1"]);
}

#[test]
fn persistence_failure_restores_old_registration() {
    let old = old_bindings();
    let candidate = BTreeMap::from([(ShortcutAction::CaptureArea, "CTRL+SHIFT+3".to_owned())]);
    let calls = std::cell::RefCell::new(Vec::new());
    let result = replace_transaction(
        &old,
        &candidate,
        |bindings| {
            calls.borrow_mut().push(bindings.to_vec());
            Ok(())
        },
        |_| Err("disk full".to_owned()),
    );
    assert!(result.is_err());
    assert_eq!(calls.borrow().last().unwrap()[0].id, "capture-area");
    assert_eq!(
        calls.borrow().last().unwrap()[0]
            .preferred_trigger
            .as_deref(),
        Some("CTRL+SHIFT+2")
    );
}

#[test]
fn conflict_does_not_write_preferences_or_release_old_binding() {
    let saved = std::cell::Cell::new(false);
    let candidate = BTreeMap::from([(ShortcutAction::CaptureArea, "CTRL+SHIFT+3".to_owned())]);
    let result = replace_transaction(
        &old_bindings(),
        &candidate,
        |_| Err("conflict".to_owned()),
        |_| {
            saved.set(true);
            Ok(())
        },
    );
    assert!(result.is_err());
    assert!(!saved.get());
}

#[test]
fn duplicate_combination_is_rejected_before_os_mutation() {
    let candidate = BTreeMap::from([
        (ShortcutAction::CaptureArea, "CTRL+SHIFT+2".to_owned()),
        (ShortcutAction::CaptureScreen, "CTRL+SHIFT+2".to_owned()),
    ]);
    let result = replace_transaction(
        &Bindings::new(),
        &candidate,
        |_| panic!("must validate first"),
        |_| Ok(()),
    );
    assert!(result.is_err());
}

#[cfg(target_os = "linux")]
#[test]
fn linux_super_combinations_are_available_for_native_and_gnome_backends() {
    assert_eq!(
        normalize_trigger("Super+Control+Digit2", false).unwrap(),
        "CTRL+SUPER+2"
    );
}
