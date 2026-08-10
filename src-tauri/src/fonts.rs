use std::collections::BTreeSet;
use std::process::Command;

use serde::Serialize;

const MAX_SYSTEM_FONT_FACES: usize = 512;

/// A compact, platform-neutral font face reference. Font bytes never cross the
/// IPC boundary: the webview resolves the family through its host font stack.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFace {
    pub family: String,
    pub weight: u16,
    pub style: SystemFontStyle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SystemFontStyle {
    Normal,
    Italic,
}

/// Queries Fontconfig on Linux. Other hosts deliberately return an empty
/// catalog rather than guessing a family name or moving system font data over
/// JSON/IPC.
pub fn list_system_font_faces() -> Result<Vec<SystemFontFace>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("fc-list")
            .arg("--format=%{family}\\t%{style}\\t%{weight}\\n")
            .output()
            .map_err(|error| format!("Fontconfig fc-list is unavailable: {error}"))?;
        if !output.status.success() {
            return Err(format!(
                "Fontconfig fc-list failed with status {}",
                output.status
            ));
        }
        let output = String::from_utf8(output.stdout)
            .map_err(|error| format!("Fontconfig returned non-UTF-8 data: {error}"))?;
        Ok(parse_fontconfig_catalog(&output))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(Vec::new())
    }
}

fn parse_fontconfig_catalog(output: &str) -> Vec<SystemFontFace> {
    let mut faces = BTreeSet::new();
    for line in output.lines() {
        let mut fields = line.splitn(3, '\t');
        let Some(raw_family) = fields.next() else {
            continue;
        };
        let style = fields.next().unwrap_or_default();
        let weight = fields.next().unwrap_or_default();
        let family = raw_family
            .split(',')
            .map(str::trim)
            .find(|name| !name.is_empty());
        let Some(family) = family else {
            continue;
        };
        faces.insert(SystemFontFace {
            family: family.to_owned(),
            weight: fontconfig_weight(weight),
            style: if style.to_ascii_lowercase().contains("italic")
                || style.to_ascii_lowercase().contains("oblique")
            {
                SystemFontStyle::Italic
            } else {
                SystemFontStyle::Normal
            },
        });
        if faces.len() >= MAX_SYSTEM_FONT_FACES {
            break;
        }
    }
    faces.into_iter().collect()
}

fn fontconfig_weight(value: &str) -> u16 {
    let Ok(weight) = value.trim().parse::<i16>() else {
        return 400;
    };
    match weight {
        ..=20 => 100,
        21..=45 => 200,
        46..=60 => 300,
        61..=90 => 400,
        91..=130 => 500,
        131..=190 => 600,
        191..=202 => 700,
        203..=207 => 800,
        _ => 900,
    }
}

#[cfg(test)]
mod tests {
    use super::{SystemFontFace, SystemFontStyle, parse_fontconfig_catalog};

    #[test]
    fn parses_deduplicated_fontconfig_faces_without_leaking_aliases() {
        let faces = parse_fontconfig_catalog(
            "Noto Sans, Noto Sans Display\tRegular\t80\nNoto Sans\tBold Italic\t200\nNoto Sans\tBold Italic\t200\n",
        );

        assert_eq!(
            faces,
            vec![
                SystemFontFace {
                    family: "Noto Sans".to_owned(),
                    weight: 400,
                    style: SystemFontStyle::Normal,
                },
                SystemFontFace {
                    family: "Noto Sans".to_owned(),
                    weight: 700,
                    style: SystemFontStyle::Italic,
                },
            ],
        );
    }
}
