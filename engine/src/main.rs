mod analyzers;
mod config;
mod detectors;
mod lighthouse_rules;
mod parsers;
mod scanner;
mod types;

use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "go5_engine")]
#[command(about = "Go5 Style Guardian Analysis Engine", long_about = None)]
struct Args {
    /// Workspace root directory
    #[arg(long)]
    workspace_root: PathBuf,

    /// Paths to scan (files or directories)
    #[arg(long = "path", num_args = 1..)]
    paths: Vec<PathBuf>,

    /// Design system config file path
    #[arg(long)]
    config: Option<PathBuf>,

    /// Duplicate similarity threshold (0-100)
    #[arg(long, default_value = "90")]
    similarity: u8,

    /// JavaScript bundle size threshold (KB)
    #[arg(long, default_value = "200")]
    js_threshold: u32,

    /// CSS file size threshold (KB)
    #[arg(long, default_value = "100")]
    css_threshold: u32,

    /// Image file size threshold (KB)
    #[arg(long, default_value = "500")]
    image_threshold: u32,

    /// Disable duplicate style detection
    #[arg(long)]
    disable_duplicates: bool,

    /// Disable design system checks
    #[arg(long)]
    disable_design_system: bool,

    /// Disable performance checks
    #[arg(long)]
    disable_performance: bool,

    /// Disable import analysis
    #[arg(long)]
    disable_imports: bool,

    /// Exclude patterns (glob)
    #[arg(long = "exclude", num_args = 0..)]
    exclude_patterns: Vec<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();

    // Load design system config if provided
    let ds_config = if let Some(config_path) = args.config {
        config::load_design_system_config(&config_path).ok()
    } else {
        None
    };

    // Create scanner options
    let options = scanner::ScanOptions {
        workspace_root: args.workspace_root.clone(),
        paths: args.paths.clone(),
        similarity_threshold: args.similarity,
        performance_thresholds: scanner::PerformanceThresholds {
            js_bundle_kb: args.js_threshold,
            css_size_kb: args.css_threshold,
            image_size_kb: args.image_threshold,
        },
        enabled_categories: scanner::EnabledCategories {
            duplicate_styles: !args.disable_duplicates,
            design_system: !args.disable_design_system,
            performance: !args.disable_performance,
            import_analysis: !args.disable_imports,
        },
        exclude_patterns: args.exclude_patterns,
    };

    // Run the scanner
    let scanner = scanner::Scanner::new(options, ds_config);
    let results = scanner.scan()?;

    // Output results as JSON
    let json_output = serde_json::to_string_pretty(&results)?;
    println!("{}", json_output);

    Ok(())
}
