use std::collections::BTreeSet;

use super::Bindings;
use crate::platform::ShortcutSpec;

pub fn specs(bindings: &Bindings) -> Vec<ShortcutSpec> {
    bindings
        .iter()
        .map(|(action, trigger)| ShortcutSpec {
            id: action.id().to_owned(),
            preferred_trigger: Some(trigger.clone()),
        })
        .collect()
}

/// Keep old grabs throughout staging and persistence. Pending IDs never dispatch.
pub fn replace_transaction(
    old: &Bindings,
    candidate: &Bindings,
    mut apply: impl FnMut(&[ShortcutSpec]) -> Result<(), String>,
    save: impl FnOnce(&Bindings) -> Result<(), String>,
) -> Result<(), String> {
    let mut seen = BTreeSet::new();
    if candidate.values().any(|trigger| !seen.insert(trigger)) {
        return Err(
            "This combination is already assigned to another Cute Screen action".to_owned(),
        );
    }
    let mut staged = specs(old);
    for (action, trigger) in candidate {
        if old.get(action) != Some(trigger) && !old.values().any(|value| value == trigger) {
            staged.push(ShortcutSpec {
                id: format!("pending-{}", action.id()),
                preferred_trigger: Some(trigger.clone()),
            });
        }
    }
    apply(&staged)?;
    if let Err(error) = save(candidate) {
        return match apply(&specs(old)) {
            Ok(()) => Err(error),
            Err(rollback) => Err(format!(
                "{error}; failed to restore registrations: {rollback}"
            )),
        };
    }
    apply(&specs(candidate))
}
