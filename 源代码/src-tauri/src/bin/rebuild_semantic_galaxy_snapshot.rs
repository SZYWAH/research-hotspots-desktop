use std::path::PathBuf;

fn main() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let database_dir = required_arg(&args, "--database-dir")?;
    let project_id =
        optional_arg(&args, "--project-id").unwrap_or_else(|| "project-default".to_string());
    let device = optional_arg(&args, "--device").unwrap_or_else(|| "cpu".to_string());
    let result = research_hotspots_desktop_lib::rebuild_semantic_galaxy_snapshot(
        &PathBuf::from(database_dir),
        &project_id,
        &device,
    )?;
    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn required_arg(args: &[String], name: &str) -> Result<String, String> {
    optional_arg(args, name).ok_or_else(|| format!("missing required argument {name}"))
}

fn optional_arg(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|value| value == name)
        .and_then(|index| args.get(index + 1))
        .cloned()
}
