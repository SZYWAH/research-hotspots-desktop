use std::path::PathBuf;

fn main() {
    if let Err(error) = run() {
        eprintln!("audit_document_ocr_runtime failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut arguments = std::env::args_os().skip(1);
    let model_root = arguments.next().map(PathBuf::from).ok_or_else(|| {
        "usage: audit_document_ocr_runtime <model-root> [fixture-image]".to_string()
    })?;
    let result = match arguments.next().map(PathBuf::from) {
        Some(image_path) => {
            research_hotspots_desktop_lib::audit_document_ocr_fixture(&model_root, &image_path)?
        }
        None => research_hotspots_desktop_lib::audit_document_ocr_runtime(&model_root)?,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&result)
            .map_err(|_| "SIDERA_DOCUMENT_OCR_AUDIT_SERIALIZE_FAILED".to_string())?
    );
    Ok(())
}
