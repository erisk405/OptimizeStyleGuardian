use crate::parsers::typescript::{
    calculate_import_size, parse_typescript_imports, track_item_usage, ImportStatement,
};
use crate::types::{ImportAnalysisIssue, ItemUsage};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ImportAnalysisConfig {
    pub size_threshold_kb: u64,
    pub warn_large_imports: bool,
}

impl Default for ImportAnalysisConfig {
    fn default() -> Self {
        Self {
            size_threshold_kb: 100, // Warn if import > 100KB
            warn_large_imports: true,
        }
    }
}

/// Analyze all imports in a TypeScript/JavaScript file
pub fn analyze_file_imports<P: AsRef<Path>>(
    path: P,
    config: &ImportAnalysisConfig,
) -> Result<Vec<ImportAnalysisIssue>> {
    let path_ref = path.as_ref();
    let mut imports = parse_typescript_imports(path_ref)
        .with_context(|| format!("Failed to parse imports from {}", path_ref.display()))?;

    let mut issues = Vec::new();

    for mut import in imports.iter_mut() {
        // Calculate size for local imports
        if let Err(e) = calculate_import_size(&mut import, path_ref) {
            eprintln!(
                "Warning: Failed to calculate size for {}: {}",
                import.source, e
            );
        }

        // Track usage of imported items
        let item_usage = match track_item_usage(path_ref, &import.imported_items) {
            Ok(usage_map) => {
                let mut usage_hash: HashMap<String, ItemUsage> = HashMap::new();
                for (item, (count, lines)) in usage_map {
                    usage_hash.insert(item, ItemUsage { count, lines });
                }
                Some(usage_hash)
            }
            Err(e) => {
                eprintln!("Warning: Failed to track item usage: {}", e);
                None
            }
        };

        // Create issue based on analysis
        let (severity, message) = determine_issue(&import, config);

        issues.push(ImportAnalysisIssue {
            file: path_ref.display().to_string(),
            line: import.line,
            imported_items: import.imported_items.clone(),
            source: import.source.clone(),
            size_kb: import.size_kb,
            resolved_path: import.resolved_path.clone(),
            severity,
            message,
            item_usage,
        });
    }

    Ok(issues)
}

/// Determine severity and message for an import
fn determine_issue(import: &ImportStatement, config: &ImportAnalysisConfig) -> (String, String) {
    match import.size_kb {
        Some(size) if size > config.size_threshold_kb && config.warn_large_imports => (
            "warning".to_string(),
            format!(
                "Large import detected: {} KB (threshold: {} KB)",
                size, config.size_threshold_kb
            ),
        ),
        Some(0) => (
            "info".to_string(),
            "Import file not found or empty".to_string(),
        ),
        Some(size) => ("info".to_string(), format!("Import size: {} KB", size)),
        None => {
            // External package
            if import.source.starts_with('.') {
                (
                    "info".to_string(),
                    "Local import (size not calculated)".to_string(),
                )
            } else {
                ("info".to_string(), "External package import".to_string())
            }
        }
    }
}

/// Analyze multiple files and aggregate results
pub fn analyze_multiple_files<P: AsRef<Path>>(
    files: &[P],
    config: &ImportAnalysisConfig,
) -> Result<Vec<ImportAnalysisIssue>> {
    let mut all_issues = Vec::new();

    for file in files {
        match analyze_file_imports(file, config) {
            Ok(mut issues) => {
                all_issues.append(&mut issues);
            }
            Err(e) => {
                eprintln!(
                    "Warning: Failed to analyze {}: {}",
                    file.as_ref().display(),
                    e
                );
            }
        }
    }

    Ok(all_issues)
}

/// Get summary statistics for import analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportAnalysisSummary {
    pub total_imports: usize,
    pub local_imports: usize,
    pub external_imports: usize,
    pub large_imports: usize,
    pub total_size_kb: u64,
    pub average_size_kb: f64,
}

pub fn calculate_summary(issues: &[ImportAnalysisIssue]) -> ImportAnalysisSummary {
    let total_imports = issues.len();

    let local_imports = issues.iter().filter(|i| i.source.starts_with('.')).count();

    let external_imports = total_imports - local_imports;

    let large_imports = issues.iter().filter(|i| i.severity == "warning").count();

    let total_size_kb: u64 = issues.iter().filter_map(|i| i.size_kb).sum();

    let imports_with_size = issues.iter().filter(|i| i.size_kb.is_some()).count();

    let average_size_kb = if imports_with_size > 0 {
        total_size_kb as f64 / imports_with_size as f64
    } else {
        0.0
    };

    ImportAnalysisSummary {
        total_imports,
        local_imports,
        external_imports,
        large_imports,
        total_size_kb,
        average_size_kb,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::{NamedTempFile, TempDir};

    #[test]
    fn test_analyze_file_imports() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "import {{ Component }} from './components'").unwrap();
        writeln!(file, "import React from 'react'").unwrap();

        let config = ImportAnalysisConfig::default();
        let issues = analyze_file_imports(file.path(), &config).unwrap();

        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].line, 1);
        assert_eq!(issues[1].line, 2);
    }

    #[test]
    fn test_calculate_summary() {
        let issues = vec![
            ImportAnalysisIssue {
                file: "test.ts".to_string(),
                line: 1,
                imported_items: vec!["A".to_string()],
                source: "./local".to_string(),
                size_kb: Some(50),
                resolved_path: None,
                severity: "info".to_string(),
                message: "OK".to_string(),
            },
            ImportAnalysisIssue {
                file: "test.ts".to_string(),
                line: 2,
                imported_items: vec!["B".to_string()],
                source: "external".to_string(),
                size_kb: None,
                resolved_path: None,
                severity: "info".to_string(),
                message: "OK".to_string(),
            },
        ];

        let summary = calculate_summary(&issues);

        assert_eq!(summary.total_imports, 2);
        assert_eq!(summary.local_imports, 1);
        assert_eq!(summary.external_imports, 1);
        assert_eq!(summary.total_size_kb, 50);
    }
}
