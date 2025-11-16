use crate::parsers::html;
use crate::types::{DesignSystemConfig, DesignSystemIssue};
use anyhow::Result;
use regex::Regex;
use std::fs;
use std::path::Path;

pub fn check_template<P: AsRef<Path>>(
    path: P,
    config: &DesignSystemConfig,
) -> Result<Vec<DesignSystemIssue>> {
    let path = path.as_ref();
    let content = fs::read_to_string(path)?;
    let mut issues = Vec::new();

    // Parse HTML elements
    let elements = html::parse_html_content(&content)?;

    for element in elements {
        // Check if native element should be replaced with DS component
        for (_component_name, component_config) in &config.components {
            // Check if element matches replacement patterns
            for replace_pattern in &component_config.replaces {
                if element_matches_pattern(&element, replace_pattern) {
                    issues.push(DesignSystemIssue {
                        issue_type: "component_replacement".to_string(),
                        file: path.to_string_lossy().to_string(),
                        line: element.line,
                        column: Some(element.column),
                        current: format!("<{}>", element.tag_name),
                        suggested: format!("<{}>", component_config.selector),
                        keywords: Some(component_config.keywords.clone()),
                        severity: "warning".to_string(),
                        reason: format!(
                            "Use design system component <{}> instead of native <{}>",
                            component_config.selector, element.tag_name
                        ),
                    });
                }
            }

            // Check by keywords in attributes (e.g., class="btn")
            for (attr_name, attr_value) in &element.attributes {
                if attr_name == "class" {
                    for keyword in &component_config.keywords {
                        if attr_value.contains(keyword) {
                            issues.push(DesignSystemIssue {
                                issue_type: "component_replacement".to_string(),
                                file: path.to_string_lossy().to_string(),
                                line: element.line,
                                column: Some(element.column),
                                current: format!("<{} class=\"{}\">", element.tag_name, attr_value),
                                suggested: format!("<{}>", component_config.selector),
                                keywords: Some(component_config.keywords.clone()),
                                severity: "info".to_string(),
                                reason: format!(
                                    "Consider using design system component <{}> which matches keyword '{}'",
                                    component_config.selector,
                                    keyword
                                ),
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    Ok(issues)
}

pub fn check_css_tokens<P: AsRef<Path>>(
    path: P,
    config: &DesignSystemConfig,
) -> Result<Vec<DesignSystemIssue>> {
    let path = path.as_ref();
    let content = fs::read_to_string(path)?;
    let mut issues = Vec::new();

    // Check for color values that should use tokens
    if !config.tokens.colors.is_empty() {
        let color_regex = Regex::new(
            r"(?:color|background-color|border-color):\s*(#[0-9a-fA-F]{3,6}|rgb[a]?\([^)]+\))",
        )
        .unwrap();

        for (line_num, line) in content.lines().enumerate() {
            for cap in color_regex.captures_iter(line) {
                let color_value = cap.get(1).unwrap().as_str();

                // Check if this color exists in tokens
                let matching_token = find_matching_color_token(color_value, &config.tokens.colors);

                if let Some(token_name) = matching_token {
                    issues.push(DesignSystemIssue {
                        issue_type: "color_token".to_string(),
                        file: path.to_string_lossy().to_string(),
                        line: line_num + 1,
                        column: None,
                        current: color_value.to_string(),
                        suggested: format!("var(--color-{})", token_name),
                        keywords: None,
                        severity: "info".to_string(),
                        reason: format!(
                            "Use design token var(--color-{}) instead of hardcoded color {}",
                            token_name, color_value
                        ),
                    });
                }
            }
        }
    }

    // Check for spacing values that should use tokens
    if !config.tokens.spacing.is_empty() {
        let spacing_regex = Regex::new(r"(?:margin|padding|gap):\s*(\d+px)").unwrap();

        for (line_num, line) in content.lines().enumerate() {
            for cap in spacing_regex.captures_iter(line) {
                let spacing_value = cap.get(1).unwrap().as_str();

                // Check if this spacing exists in tokens
                let matching_token =
                    find_matching_spacing_token(spacing_value, &config.tokens.spacing);

                if let Some(token_name) = matching_token {
                    issues.push(DesignSystemIssue {
                        issue_type: "spacing_token".to_string(),
                        file: path.to_string_lossy().to_string(),
                        line: line_num + 1,
                        column: None,
                        current: spacing_value.to_string(),
                        suggested: format!("var(--spacing-{})", token_name),
                        keywords: None,
                        severity: "info".to_string(),
                        reason: format!(
                            "Use design token var(--spacing-{}) instead of hardcoded value {}",
                            token_name, spacing_value
                        ),
                    });
                }
            }
        }
    }

    Ok(issues)
}

fn element_matches_pattern(element: &html::HtmlElement, pattern: &str) -> bool {
    // Simple pattern matching
    // Pattern format: "tag[attr='value']" or just "tag"

    if pattern.contains('[') {
        // Parse pattern like "button[type='button']"
        let parts: Vec<&str> = pattern.split('[').collect();
        let tag = parts[0];

        if element.tag_name != tag {
            return false;
        }

        if parts.len() > 1 {
            let attr_part = parts[1].trim_end_matches(']');
            let attr_parts: Vec<&str> = attr_part.split('=').collect();

            if attr_parts.len() == 2 {
                let attr_name = attr_parts[0];
                let attr_value = attr_parts[1].trim_matches('\'').trim_matches('"');

                return element
                    .attributes
                    .iter()
                    .any(|(k, v)| k == attr_name && v == attr_value);
            }
        }

        true
    } else {
        element.tag_name == pattern
    }
}

fn find_matching_color_token(
    color: &str,
    tokens: &std::collections::HashMap<String, String>,
) -> Option<String> {
    let normalized_color = normalize_color(color);

    for (token_name, token_value) in tokens {
        if normalize_color(token_value) == normalized_color {
            return Some(token_name.clone());
        }
    }

    None
}

fn find_matching_spacing_token(
    spacing: &str,
    tokens: &std::collections::HashMap<String, String>,
) -> Option<String> {
    for (token_name, token_value) in tokens {
        if token_value == spacing {
            return Some(token_name.clone());
        }
    }

    None
}

fn normalize_color(color: &str) -> String {
    // Basic color normalization
    color.to_lowercase().replace(" ", "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_element_matches_pattern() {
        let element = html::HtmlElement {
            tag_name: "button".to_string(),
            line: 1,
            column: 1,
            attributes: vec![("type".to_string(), "button".to_string())],
        };

        assert!(element_matches_pattern(&element, "button"));
        assert!(element_matches_pattern(&element, "button[type='button']"));
        assert!(!element_matches_pattern(&element, "input"));
    }
}
