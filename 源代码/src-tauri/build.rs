fn main() {
    #[cfg(target_os = "windows")]
    {
        let manifest_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("windows-test.manifest");
        println!("cargo:rerun-if-changed={}", manifest_path.display());
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest_path.display()
        );
    }

    tauri_build::build();
}
