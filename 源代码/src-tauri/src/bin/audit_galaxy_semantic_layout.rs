use std::path::PathBuf;

fn main() -> Result<(), String> {
    let root = std::env::args()
        .skip_while(|value| value != "--root")
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("target/galaxy-semantic-layout-audit"));
    let result = research_hotspots_desktop_lib::audit_galaxy_semantic_layout_database(&root)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|error| error.to_string())?
    );
    Ok(())
}
