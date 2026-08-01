use std::path::PathBuf;

fn argument(name: &str) -> Option<String> {
    let mut arguments = std::env::args();
    while let Some(value) = arguments.next() {
        if value == name {
            return arguments.next();
        }
    }
    None
}

fn main() -> Result<(), String> {
    let database = argument("--database")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data/library/research-hotspots-v7.sqlite"));
    let project_id = argument("--project").unwrap_or_else(|| "project-default".to_string());
    let result = research_hotspots_desktop_lib::audit_agent_immersive_background_database(
        &database,
        &project_id,
    )?;
    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|error| error.to_string())?
    );
    Ok(())
}
