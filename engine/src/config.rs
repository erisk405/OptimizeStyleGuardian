use crate::types::DesignSystemConfig;
use anyhow::Result;
use std::fs;
use std::path::Path;

pub fn load_design_system_config<P: AsRef<Path>>(path: P) -> Result<DesignSystemConfig> {
    let content = fs::read_to_string(path)?;
    let config: DesignSystemConfig = serde_yaml::from_str(&content)?;
    Ok(config)
}
