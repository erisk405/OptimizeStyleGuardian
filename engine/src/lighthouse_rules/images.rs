use crate::types::{PerformanceIssue, PerformanceDetails};
use crate::scanner::PerformanceThresholds;
use anyhow::Result;
use std::path::Path;
use std::fs;

pub fn check_image_file<P: AsRef<Path>>(
    path: P,
    thresholds: &PerformanceThresholds,
) -> Result<Vec<PerformanceIssue>> {
    let path = path.as_ref();
    let mut issues = Vec::new();

    // Check file size
    let metadata = fs::metadata(path)?;
    let size_kb = metadata.len() / 1024;

    if size_kb > thresholds.image_size_kb as u64 {
        issues.push(PerformanceIssue {
            issue_type: "large_image".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "warning".to_string(),
            message: format!("Large image file detected: {} KB", size_kb),
            details: Some(PerformanceDetails {
                size: Some(size_kb),
                threshold: Some(thresholds.image_size_kb as u64),
                component_type: None,
                selector: None,
            }),
            recommendation: format!(
                "Consider compressing the image or using modern formats (WebP, AVIF) to reduce size below {} KB",
                thresholds.image_size_kb
            ),
        });
    }

    // Check if using modern formats
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");

    if matches!(extension, "jpg" | "jpeg" | "png") && size_kb > 100 {
        issues.push(PerformanceIssue {
            issue_type: "image_format".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "info".to_string(),
            message: format!("Consider using modern image format instead of .{}", extension),
            details: Some(PerformanceDetails {
                size: Some(size_kb),
                threshold: None,
                component_type: None,
                selector: None,
            }),
            recommendation: "Convert to WebP or AVIF format for better compression and quality".to_string(),
        });
    }

    Ok(issues)
}
