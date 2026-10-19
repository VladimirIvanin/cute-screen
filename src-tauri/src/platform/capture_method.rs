use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum LinuxCaptureMethod {
    #[default]
    Auto,
    Portal,
    GnomeShell,
    GnomeScreenshot,
    Grim,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LinuxCaptureMethods {
    pub selected: LinuxCaptureMethod,
    pub resolved: Option<LinuxCaptureMethod>,
    pub available: Vec<LinuxCaptureMethod>,
}

#[derive(Debug, Default)]
pub struct CaptureMethodsProbe {
    pub legacy_gnome: bool,
    pub gnome: bool,
    pub grim: bool,
    pub portal: bool,
}

impl CaptureMethodsProbe {
    pub fn resolve(&self, method: LinuxCaptureMethod) -> Option<LinuxCaptureMethod> {
        use LinuxCaptureMethod as Method;
        match method {
            Method::Auto if self.legacy_gnome => Some(Method::GnomeShell),
            Method::Auto if self.portal => Some(Method::Portal),
            Method::Auto if self.grim => Some(Method::Grim),
            Method::Auto if self.gnome => Some(Method::GnomeScreenshot),
            Method::Portal if self.portal => Some(method),
            Method::GnomeShell if self.legacy_gnome => Some(method),
            Method::GnomeScreenshot if self.gnome => Some(method),
            Method::Grim if self.grim => Some(method),
            _ => None,
        }
    }

    pub fn snapshot(&self, selected: LinuxCaptureMethod) -> LinuxCaptureMethods {
        let available = [
            LinuxCaptureMethod::Auto,
            LinuxCaptureMethod::Portal,
            LinuxCaptureMethod::GnomeShell,
            LinuxCaptureMethod::GnomeScreenshot,
            LinuxCaptureMethod::Grim,
        ]
        .into_iter()
        .filter(|method| *method == LinuxCaptureMethod::Auto || self.resolve(*method).is_some())
        .collect();
        LinuxCaptureMethods {
            selected,
            resolved: self.resolve(selected),
            available,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{CaptureMethodsProbe, LinuxCaptureMethod as Method};

    #[test]
    fn legacy_gnome_is_available_without_an_installed_screenshot_program() {
        let probe = CaptureMethodsProbe {
            legacy_gnome: true,
            portal: true,
            ..Default::default()
        };
        assert_eq!(probe.resolve(Method::Auto), Some(Method::GnomeShell));
        assert_eq!(probe.resolve(Method::GnomeShell), Some(Method::GnomeShell));
    }

    #[test]
    fn legacy_gnome_uses_helper_and_other_desktops_keep_the_screenshot_portal() {
        for (legacy_gnome, grim, portal, expected) in [
            (true, true, true, Some(Method::GnomeShell)),
            (false, true, true, Some(Method::Portal)),
            (false, true, false, Some(Method::Grim)),
            (false, false, true, Some(Method::Portal)),
            (false, false, false, None),
        ] {
            let probe = CaptureMethodsProbe {
                legacy_gnome,
                gnome: false,
                grim,
                portal,
            };
            assert_eq!(probe.resolve(Method::Auto), expected);
        }
    }

    #[test]
    fn ubuntu_24_keeps_portal_even_when_gnome_helper_is_installed() {
        let probe = CaptureMethodsProbe {
            gnome: true,
            portal: true,
            ..Default::default()
        };
        assert_eq!(probe.resolve(Method::Auto), Some(Method::Portal));
    }

    #[test]
    fn unavailable_explicit_selection_survives_reopen_without_silent_switch() {
        let snapshot = CaptureMethodsProbe::default().snapshot(Method::GnomeScreenshot);
        assert_eq!(snapshot.selected, Method::GnomeScreenshot);
        assert_eq!(snapshot.resolved, None);
        assert_eq!(snapshot.available, vec![Method::Auto]);
    }

    #[test]
    fn explicit_method_never_falls_back_to_another_method() {
        let probe = CaptureMethodsProbe {
            portal: true,
            ..Default::default()
        };
        assert_eq!(probe.resolve(Method::GnomeScreenshot), None);
        assert_eq!(probe.resolve(Method::Grim), None);
        assert_eq!(probe.resolve(Method::Portal), Some(Method::Portal));
    }
}
