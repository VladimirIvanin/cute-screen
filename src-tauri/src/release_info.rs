use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::Write;

#[derive(Serialize)]
struct AssetSummary {
    path: String,
    bytes: usize,
    sha256: String,
}

fn asset_summary(path: &str, bytes: &[u8]) -> AssetSummary {
    AssetSummary {
        path: path.to_owned(),
        bytes: bytes.len(),
        sha256: format!("{:x}", Sha256::digest(bytes)),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseInfo {
    version: &'static str,
    app_version: String,
    custom_protocol: bool,
    fake_platform: bool,
    test_harness: bool,
    platform_smoke: bool,
    assets: Vec<AssetSummary>,
}

pub fn requested() -> bool {
    let mut arguments = std::env::args_os().skip(1);
    arguments.next().as_deref() == Some(std::ffi::OsStr::new("--release-info"))
        && arguments.next().is_none()
}

pub fn print(context: &tauri::Context<tauri::Wry>) -> Result<(), String> {
    let assets = context.assets();
    let mut summaries = Vec::new();
    for (key, _) in assets.iter() {
        // iter() exposes compressed bytes; get() decodes the exact bytes served by Tauri.
        let bytes = assets
            .get(&key.as_ref().into())
            .ok_or_else(|| format!("cannot decode embedded resource {key}"))?;
        summaries.push(asset_summary(&key, &bytes));
    }
    summaries.sort_by(|left, right| left.path.cmp(&right.path));
    let report = ReleaseInfo {
        version: env!("CARGO_PKG_VERSION"),
        app_version: context.package_info().version.to_string(),
        // Tauri CLI may enable tauri/custom-protocol directly rather than our forwarding feature.
        // The build-script dev cfg reflects the actual linked Tauri dependency mode.
        custom_protocol: !cfg!(dev),
        fake_platform: cfg!(feature = "fake-platform"),
        test_harness: cfg!(feature = "test-harness"),
        platform_smoke: cfg!(feature = "platform-smoke"),
        assets: summaries,
    };
    let json = serde_json::to_string(&report).map_err(|error| error.to_string())?;
    writeln!(std::io::stdout().lock(), "{json}").map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn resource_hashes_describe_decoded_bytes_without_exposing_content() {
        let asset = super::asset_summary("/assets/font.woff2", b"hello");
        assert_eq!(asset.path, "/assets/font.woff2");
        assert_eq!(asset.bytes, 5);
        assert_eq!(
            asset.sha256,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }
}
