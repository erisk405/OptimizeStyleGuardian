use crate::analyzers::usage_extractor::ComponentUsage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub duplicates: Vec<DuplicateStyleIssue>,
    #[serde(rename = "designSystem")]
    pub design_system: Vec<DesignSystemIssue>,
    pub performance: Vec<PerformanceIssue>,
    pub imports: Vec<ImportAnalysisIssue>,
    pub summary: AnalysisSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportAnalysisIssue {
    pub file: String,
    pub line: usize,
    #[serde(rename = "importedItems")]
    pub imported_items: Vec<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "sizeKb")]
    pub size_kb: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "resolvedPath")]
    pub resolved_path: Option<String>,
    pub severity: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "usageContext")]
    pub usage_context: Option<HashMap<String, Vec<ComponentUsage>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateStyleIssue {
    #[serde(rename = "type")]
    pub issue_type: String,
    pub file: String,
    pub line: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<usize>,
    pub class: String,
    #[serde(rename = "duplicateOf")]
    pub duplicate_of: String,
    pub similarity: u8,
    pub severity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignSystemIssue {
    #[serde(rename = "type")]
    pub issue_type: String,
    pub file: String,
    pub line: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<usize>,
    pub current: String,
    pub suggested: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<Vec<String>>,
    pub severity: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceIssue {
    #[serde(rename = "type")]
    pub issue_type: String,
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<usize>,
    pub severity: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<PerformanceDetails>,
    pub recommendation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threshold: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "componentType")]
    pub component_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selector: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisSummary {
    #[serde(rename = "totalFiles")]
    pub total_files: usize,
    #[serde(rename = "totalIssues")]
    pub total_issues: usize,
    #[serde(rename = "duplicateCount")]
    pub duplicate_count: usize,
    #[serde(rename = "designSystemCount")]
    pub design_system_count: usize,
    #[serde(rename = "performanceCount")]
    pub performance_count: usize,
    #[serde(rename = "importCount")]
    pub import_count: usize,
    #[serde(rename = "criticalCount")]
    pub critical_count: usize,
    #[serde(rename = "warningCount")]
    pub warning_count: usize,
    #[serde(rename = "infoCount")]
    pub info_count: usize,
}

// CSS types
#[derive(Debug, Clone, PartialEq)]
pub struct CSSClass {
    pub name: String,
    pub properties: HashMap<String, String>,
    pub file: String,
    pub line: usize,
}

// Design System Config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignSystemConfig {
    #[serde(default)]
    pub components: HashMap<String, ComponentConfig>,
    #[serde(default)]
    pub tokens: Tokens,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentConfig {
    pub selector: String,
    pub keywords: Vec<String>,
    #[serde(default)]
    pub replaces: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Tokens {
    #[serde(default)]
    pub colors: HashMap<String, String>,
    #[serde(default)]
    pub spacing: HashMap<String, String>,
    #[serde(default)]
    pub typography: HashMap<String, String>,
}
