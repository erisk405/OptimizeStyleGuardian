use crate::parsers::html;
use crate::scanner::PerformanceThresholds;
use crate::types::{PerformanceDetails, PerformanceIssue};
use anyhow::Result;
use regex::Regex;
use std::fs;
use std::path::Path;

pub fn check_html_file<P: AsRef<Path>>(
    path: P,
    _thresholds: &PerformanceThresholds,
) -> Result<Vec<PerformanceIssue>> {
    let path = path.as_ref();
    let mut issues = Vec::new();
    let content = fs::read_to_string(path)?;

    // Check for missing viewport meta tag
    if !html::has_viewport_meta(&content) {
        issues.push(PerformanceIssue {
            issue_type: "missing_viewport".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "warning".to_string(),
            message: "Missing viewport meta tag".to_string(),
            details: None,
            recommendation: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to improve mobile experience".to_string(),
        });
    }

    // Check images for lazy loading and dimensions
    let images = html::extract_images(&content);
    for img in images {
        // Check for missing lazy loading (except first image)
        if !img.has_lazy && !img.src.is_empty() {
            issues.push(PerformanceIssue {
                issue_type: "missing_lazy_load".to_string(),
                file: path.to_string_lossy().to_string(),
                line: Some(img.line),
                column: None,
                severity: "warning".to_string(),
                message: format!("Image missing lazy loading: {}", img.src),
                details: None,
                recommendation: "Add loading=\"lazy\" attribute to improve initial page load"
                    .to_string(),
            });
        }

        // Check for missing width/height (CLS risk)
        if !img.has_width || !img.has_height {
            issues.push(PerformanceIssue {
                issue_type: "missing_dimensions".to_string(),
                file: path.to_string_lossy().to_string(),
                line: Some(img.line),
                column: None,
                severity: "warning".to_string(),
                message: format!("Image missing dimensions (CLS risk): {}", img.src),
                details: None,
                recommendation: "Add width and height attributes to prevent layout shift"
                    .to_string(),
            });
        }
    }

    // Check scripts
    let scripts = html::extract_scripts(&content);
    for (line, script_src, is_async) in scripts {
        // Check for synchronous external scripts
        if !script_src.is_empty() && !is_async && script_src.starts_with("http") {
            issues.push(PerformanceIssue {
                issue_type: "sync_script".to_string(),
                file: path.to_string_lossy().to_string(),
                line: Some(line),
                column: None,
                severity: "critical".to_string(),
                message: format!(
                    "Synchronous external script (render-blocking): {}",
                    script_src
                ),
                details: None,
                recommendation: "Add async or defer attribute to prevent render blocking"
                    .to_string(),
            });
        }

        // Check for large inline scripts
        if script_src.is_empty() {
            // This would be inline script content
            // Already handled in javascript module
        }
    }

    // Check for heavy Angular Material components
    check_heavy_components(&content, path, &mut issues)?;

    Ok(issues)
}

fn check_heavy_components(
    content: &str,
    path: &Path,
    issues: &mut Vec<PerformanceIssue>,
) -> Result<()> {
    let heavy_components = [
        ("mat-table", "Consider virtual scrolling for large datasets"),
        (
            "mat-paginator",
            "Consider server-side pagination for large datasets",
        ),
        (
            "cdk-virtual-scroll-viewport",
            "Ensure proper configuration for optimal performance",
        ),
    ];

    for (component, recommendation) in &heavy_components {
        let regex = Regex::new(&format!(r"<{}", component)).unwrap();

        for (line_num, line) in content.lines().enumerate() {
            if regex.is_match(line) {
                issues.push(PerformanceIssue {
                    issue_type: "heavy_component".to_string(),
                    file: path.to_string_lossy().to_string(),
                    line: Some(line_num + 1),
                    column: None,
                    severity: "info".to_string(),
                    message: format!("Heavy component detected: {}", component),
                    details: Some(PerformanceDetails {
                        size: None,
                        threshold: None,
                        component_type: Some(component.to_string()),
                        selector: None,
                    }),
                    recommendation: recommendation.to_string(),
                });
            }
        }
    }

    // Check for excessive mat-icon usage (more than 10 on a page)
    let icon_regex = Regex::new(r"<mat-icon").unwrap();
    let icon_count = icon_regex.find_iter(content).count();

    if icon_count > 10 {
        issues.push(PerformanceIssue {
            issue_type: "heavy_component".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "info".to_string(),
            message: format!("Excessive mat-icon usage: {} icons found", icon_count),
            details: Some(PerformanceDetails {
                size: Some(icon_count as u64),
                threshold: Some(10),
                component_type: Some("mat-icon".to_string()),
                selector: None,
            }),
            recommendation: "Consider using SVG sprites or font icons for better performance"
                .to_string(),
        });
    }

    Ok(())
}
