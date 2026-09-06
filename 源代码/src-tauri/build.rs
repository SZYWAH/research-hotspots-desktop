fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP_DIALOG").is_some() {
        tauri_build::build();
    } else {
        println!("cargo:rerun-if-changed=test-capabilities");
        tauri_build::try_build(
            tauri_build::Attributes::new().capabilities_path_pattern("./test-capabilities/**/*"),
        )
        .expect("failed to build the test-only Tauri capability manifest");
    }
}
