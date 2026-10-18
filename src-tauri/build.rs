fn main() {
    #[cfg(target_os = "macos")]
    {
        warn_about_legacy_macos_sdk();
        cc::Build::new()
            .file("src/macos_capture_bridge.m")
            .file("src/macos_window_capture.m")
            .file("src/macos_autostart_bridge.m")
            .flag("-fobjc-arc")
            .flag("-Wno-deprecated-declarations")
            .compile("cute_screen_macos_capture");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
        println!("cargo:rustc-link-lib=framework=CoreMedia");
        println!("cargo:rustc-link-lib=framework=CoreVideo");
        println!("cargo:rustc-link-lib=framework=CoreImage");
        println!("cargo:rustc-link-lib=framework=ImageIO");
        println!("cargo:rustc-link-lib=framework=UniformTypeIdentifiers");
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
        println!("cargo:rerun-if-changed=src/macos_capture_bridge.m");
        println!("cargo:rerun-if-changed=src/macos_window_capture.m");
        println!("cargo:rerun-if-changed=src/macos_window_capture.h");
        println!("cargo:rerun-if-changed=src/macos_autostart_bridge.m");
        println!("cargo:rerun-if-env-changed=SDKROOT");
        println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
    }
    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn warn_about_legacy_macos_sdk() {
    let sdk = std::env::var("SDKROOT").unwrap_or_else(|_| "macosx".to_owned());
    let version = std::process::Command::new("xcrun")
        .args(["--sdk", &sdk, "--show-sdk-version"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned());
    let Some(version) = version else {
        println!("cargo:warning=macOS SDK version is unknown; xcrun --show-sdk-version failed");
        return;
    };
    let major = version
        .split('.')
        .next()
        .and_then(|part| part.parse::<u32>().ok());
    if major.is_some_and(|major| major < 14) {
        println!(
            "cargo:warning=macOS SDK {version} < 14: system window picker and SCScreenshotManager are compiled out; \
             Window uses the AppKit selector with SCStream/CoreGraphics. Release builds require SDK 14+."
        );
    }
}
