use crate::types::{PerformanceIssue, PerformanceDetails};
use crate::scanner::PerformanceThresholds;
use anyhow::Result;
use std::path::Path;
use std::fs;
use regex::Regex;

pub fn check_css_file<P: AsRef<Path>>(
    path: P,
    thresholds: &PerformanceThresholds,
) -> Result<Vec<PerformanceIssue>> {
    let path = path.as_ref();
    let mut issues = Vec::new();

    // Check file size
    let metadata = fs::metadata(path)?;
    let size_kb = metadata.len() / 1024;

    if size_kb > thresholds.css_size_kb as u64 {
        issues.push(PerformanceIssue {
            issue_type: "large_css_file".to_string(),
            file: path.to_string_lossy().to_string(),
            line: None,
            column: None,
            severity: "warning".to_string(),
            message: format!("Large CSS file detected: {} KB", size_kb),
            details: Some(PerformanceDetails {
                size: Some(size_kb),
                threshold: Some(thresholds.css_size_kb as u64),
                component_type: None,
                selector: None,
            }),
            recommendation: format!(
                "Consider splitting CSS or removing unused styles to reduce size below {} KB",
                thresholds.css_size_kb
            ),
        });
    }

    // Read content for additional checks
    let content = fs::read_to_string(path)?;

    // Check for expensive selectors
    let expensive_patterns = [
        (r"\*\s+\w+", "Universal selector with descendant combinator"),
        (r"\w+\s+\*", "Universal selector as descendant"),
        (r"(\w+\s+){4,}", "Deep nesting (4+ levels)"),
        (r"\[.*\]\s+\w+", "Attribute selector with descendant combinator"),
    ];

    for (pattern, description) in &expensive_patterns {
        let regex = Regex::new(pattern).unwrap();

        for (line_num, line) in content.lines().enumerate() {
            if regex.is_match(line) {
                issues.push(PerformanceIssue {
                    issue_type: "expensive_selector".to_string(),
                    file: path.to_string_lossy().to_string(),
                    line: Some(line_num + 1),
                    column: None,
                    severity: "info".to_string(),
                    message: format!("Potentially expensive selector: {}", description),
                    details: Some(PerformanceDetails {
                        size: None,
                        threshold: None,
                        component_type: None,
                        selector: Some(line.trim().to_string()),
                    }),
                    recommendation: "Simplify selector for better performance".to_string(),
                });
                break; // Only report once per line
            }
        }
    }

    Ok(issues)
}
