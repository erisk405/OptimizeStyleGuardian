use crate::detectors;
use crate::lighthouse_rules;
use crate::parsers;
use crate::types::*;
use anyhow::Result;
use ignore::WalkBuilder;
use std::path::{Path, PathBuf};

pub struct ScanOptions {
    pub workspace_root: PathBuf,
    pub paths: Vec<PathBuf>,
    pub similarity_threshold: u8,
    pub performance_thresholds: PerformanceThresholds,
    pub enabled_categories: EnabledCategories,
    pub exclude_patterns: Vec<String>,
}

pub struct PerformanceThresholds {
    pub js_bundle_kb: u32,
    pub css_size_kb: u32,
    pub image_size_kb: u32,
}

pub struct EnabledCategories {
    pub duplicate_styles: bool,
    pub design_system: bool,
    pub performance: bool,
}

pub struct Scanner {
    options: ScanOptions,
    ds_config: Option<DesignSystemConfig>,
}

impl Scanner {
    pub fn new(options: ScanOptions, ds_config: Option<DesignSystemConfig>) -> Self {
        Self { options, ds_config }
    }

    pub fn scan(&self) -> Result<AnalysisResult> {
        let mut duplicates = Vec::new();
        let mut design_system = Vec::new();
        let mut performance = Vec::new();

        // Collect files to scan
        let files = self.collect_files()?;

        // Group files by type
        let css_files: Vec<_> = files.iter().filter(|f| self.is_style_file(f)).collect();

        let html_files: Vec<_> = files.iter().filter(|f| self.is_template_file(f)).collect();

        let js_files: Vec<_> = files.iter().filter(|f| self.is_script_file(f)).collect();

        // Parse CSS files and detect duplicates
        if self.options.enabled_categories.duplicate_styles && !css_files.is_empty() {
            let css_classes = self.parse_css_files(&css_files)?;
            duplicates = detectors::duplicate::detect_duplicates(
                &css_classes,
                self.options.similarity_threshold,
            );
        }

        // Check design system compliance
        if self.options.enabled_categories.design_system {
            if let Some(config) = &self.ds_config {
                // Check HTML templates for component usage
                for file in &html_files {
                    let issues = detectors::design_system::check_template(file, config)?;
                    design_system.extend(issues);
                }

                // Check CSS for color/spacing tokens
                for file in &css_files {
                    let issues = detectors::design_system::check_css_tokens(file, config)?;
                    design_system.extend(issues);
                }
            }
        }

        // Check performance issues
        if self.options.enabled_categories.performance {
            // Check JavaScript files
            for file in &js_files {
                let issues = lighthouse_rules::javascript::check_js_file(
                    file,
                    &self.options.performance_thresholds,
                )?;
                performance.extend(issues);
            }

            // Check CSS files
            for file in &css_files {
                let issues = lighthouse_rules::css::check_css_file(
                    file,
                    &self.options.performance_thresholds,
                )?;
                performance.extend(issues);
            }

            // Check HTML templates
            for file in &html_files {
                let issues = lighthouse_rules::html::check_html_file(
                    file,
                    &self.options.performance_thresholds,
                )?;
                performance.extend(issues);
            }

            // Check images
            let image_files: Vec<_> = files.iter().filter(|f| self.is_image_file(f)).collect();

            for file in &image_files {
                let issues = lighthouse_rules::images::check_image_file(
                    file,
                    &self.options.performance_thresholds,
                )?;
                performance.extend(issues);
            }
        }

        // Create summary
        let summary = self.create_summary(files.len(), &duplicates, &design_system, &performance);

        Ok(AnalysisResult {
            duplicates,
            design_system,
            performance,
            summary,
        })
    }

    fn collect_files(&self) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();

        for path in &self.options.paths {
            if path.is_file() {
                files.push(path.clone());
            } else if path.is_dir() {
                // Use ignore crate to respect .gitignore
                let walker = WalkBuilder::new(path).standard_filters(true).build();

                for entry in walker {
                    let entry = entry?;
                    if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                        let file_path = entry.path().to_path_buf();

                        // Check if file should be excluded
                        if !self.should_exclude(&file_path) && self.is_scannable_file(&file_path) {
                            files.push(file_path);
                        }
                    }
                }
            }
        }

        Ok(files)
    }

    fn should_exclude(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy();

        for pattern in &self.options.exclude_patterns {
            if path_str.contains(pattern.trim_matches('*')) {
                return true;
            }
        }

        false
    }

    fn is_scannable_file(&self, path: &Path) -> bool {
        self.is_style_file(path)
            || self.is_template_file(path)
            || self.is_script_file(path)
            || self.is_image_file(path)
    }

    fn is_style_file(&self, path: &Path) -> bool {
        matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("css") | Some("scss") | Some("sass") | Some("less")
        )
    }

    fn is_template_file(&self, path: &Path) -> bool {
        matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("html") | Some("htm") | Some("vue")
        )
    }

    fn is_script_file(&self, path: &Path) -> bool {
        matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("js") | Some("ts") | Some("jsx") | Some("tsx")
        )
    }

    fn is_image_file(&self, path: &Path) -> bool {
        matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("jpg") | Some("jpeg") | Some("png") | Some("gif") | Some("webp") | Some("svg")
        )
    }

    fn parse_css_files(&self, files: &[&PathBuf]) -> Result<Vec<CSSClass>> {
        let mut all_classes = Vec::new();

        for file in files {
            match parsers::css::parse_css_file(file) {
                Ok(classes) => all_classes.extend(classes),
                Err(e) => {
                    eprintln!("Warning: Failed to parse {}: {}", file.display(), e);
                }
            }
        }

        Ok(all_classes)
    }

    fn create_summary(
        &self,
        total_files: usize,
        duplicates: &[DuplicateStyleIssue],
        design_system: &[DesignSystemIssue],
        performance: &[PerformanceIssue],
    ) -> AnalysisSummary {
        let mut critical_count = 0;
        let mut warning_count = 0;
        let mut info_count = 0;

        // Count severity from all issues
        for issue in duplicates {
            match issue.severity.as_str() {
                "error" => critical_count += 1,
                "warning" => warning_count += 1,
                "info" => info_count += 1,
                _ => {}
            }
        }

        for issue in design_system {
            match issue.severity.as_str() {
                "error" => critical_count += 1,
                "warning" => warning_count += 1,
                "info" => info_count += 1,
                _ => {}
            }
        }

        for issue in performance {
            match issue.severity.as_str() {
                "critical" => critical_count += 1,
                "warning" => warning_count += 1,
                "info" => info_count += 1,
                _ => {}
            }
        }

        let total_issues = duplicates.len() + design_system.len() + performance.len();

        AnalysisSummary {
            total_files,
            total_issues,
            duplicate_count: duplicates.len(),
            design_system_count: design_system.len(),
            performance_count: performance.len(),
            critical_count,
            warning_count,
            info_count,
        }
    }
}
