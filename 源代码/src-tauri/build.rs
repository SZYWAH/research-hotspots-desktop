fn main() {
    #[cfg(target_os = "windows")]
    {
        let manifest_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("windows-test.manifest");
        let resource_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-test.rc");
        println!("cargo:rerun-if-changed={}", manifest_path.display());
        println!("cargo:rerun-if-changed={}", resource_path.display());
        if std::env::var_os("CARGO_FEATURE_DESKTOP_DIALOG").is_none() {
            embed_resource::compile_for_everything(resource_path, embed_resource::NONE)
                .manifest_required()
                .expect("failed to embed the Common Controls v6 test manifest");
        }
    }

    if std::env::var_os("CARGO_FEATURE_DESKTOP_DIALOG").is_some() {
        tauri_build::build();
    } else {
        println!("cargo:rerun-if-changed=test-capabilities");
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .capabilities_path_pattern("./test-capabilities/**/*"),
        )
        .expect("failed to build the test-only Tauri capability manifest");
    }
}
