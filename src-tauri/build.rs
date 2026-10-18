fn main() {
    #[cfg(target_os = "macos")]
    {
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
    }
    tauri_build::build()
}
