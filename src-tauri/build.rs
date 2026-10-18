#[cfg(target_os = "macos")]
fn link_macos_availability_runtime() -> Result<(), Box<dyn std::error::Error>> {
    // @available emits compiler-rt calls. Rust's -nodefaultlibs link does not
    // automatically include Clang's runtime when linking our Objective-C bridges.
    let output = std::process::Command::new("xcrun")
        .args(["clang", "--print-resource-dir"])
        .output()?;
    if !output.status.success() {
        return Err(format!(
            "cannot locate Xcode Clang runtime: {}",
            String::from_utf8_lossy(&output.stderr)
        )
        .into());
    }
    let resource_directory = String::from_utf8(output.stdout)?;
    let archive =
        std::path::Path::new(resource_directory.trim()).join("lib/darwin/libclang_rt.osx.a");
    if !archive.is_file() {
        return Err(format!(
            "Xcode availability runtime is missing: {}",
            archive.display()
        )
        .into());
    }
    // Let Apple's linker select the archive architecture for each universal slice.
    println!("cargo:rustc-link-arg={}", archive.display());
    println!("cargo:rerun-if-env-changed=DEVELOPER_DIR");
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/macos_capture_bridge.m")
            .file("src/macos_autostart_bridge.m")
            .flag("-fobjc-arc")
            .flag("-Wno-deprecated-declarations")
            .compile("cute_screen_macos_capture");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=ImageIO");
        println!("cargo:rustc-link-lib=framework=UniformTypeIdentifiers");
        println!("cargo:rustc-link-lib=framework=ServiceManagement");
        link_macos_availability_runtime()?;
        println!("cargo:rerun-if-changed=src/macos_capture_bridge.m");
        println!("cargo:rerun-if-changed=src/macos_autostart_bridge.m");
    }
    tauri_build::build();
    Ok(())
}
