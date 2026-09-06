fn main() {
    #[cfg(target_os = "windows")]
    {
        let manifest_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-test.manifest");
        let resource_path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-test.rc");
        println!("cargo:rerun-if-changed={}", manifest_path.display());
        println!("cargo:rerun-if-changed={}", resource_path.display());
        embed_resource::compile(resource_path, embed_resource::NONE)
            .manifest_required()
            .expect("failed to embed the Common Controls v6 smoke-host manifest");
    }
}
