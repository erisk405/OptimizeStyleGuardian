use crate::types::{PerformanceIssue, PerformanceDetails};
use crate::scanner::PerformanceThresholds;
use anyhow::Result;
use std::path::Path;
use std::fs;

pub fn check_js_file<P: AsRef<Path>>(
    path: P,
    thresholds: &PerformanceThresholds,
) -> Result<Vec<PerformanceIssue>> {
    let path = path.as_ref();
    let mut issues = Vec::new();

    // Check file size
    let metadata = fs::metadata(path)?;
    let size_kb = metadata.len() / 1024;

    if size_kb > thresholds.js_bundle_kb as u64 {
        issues.push(PerformanceIssue {
            issue_type: "large_bundle".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "critical".to_string(),
            message: format!("Large JavaScript bundle detected: {} KB", size_kb),
            details: Some(PerformanceDetails {
                size: Some(size_kb),
                threshold: Some(thresholds.js_bundle_kb as u64),
                component_type: None,
                selector: None,
            }),
            recommendation: format!(
                "Consider code splitting, tree shaking, or lazy loading to reduce bundle size below {} KB",
                thresholds.js_bundle_kb
            ),
        });
    }

    // Read content for additional checks
    let content = fs::read_to_string(path)?;

    // Check for large inline scripts (in components)
    if content.len() > 10000 {
        issues.push(PerformanceIssue {
            issue_type: "large_inline_script".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "warning".to_string(),
            message: format!("Large script file: {} bytes", content.len()),
            details: Some(PerformanceDetails {
                size: Some(content.len() as u64),
                threshold: Some(10000),
                component_type: None,
                selector: None,
            }),
            recommendation: "Consider splitting this file into smaller modules".to_string(),
        });
    }

    Ok(issues)
}
