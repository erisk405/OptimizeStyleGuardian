use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentUsage {
    pub line: usize,
    pub usage_type: UsageType,
    pub code_snippet: String,
    pub attributes: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageType {
    HtmlTag,
    JsxComponent,
    FunctionCall,
}

/// Extract usage examples of imported items from file content
pub fn extract_component_usage<P: AsRef<Path>>(
    file_path: P,
    imported_items: &[String],
) -> Result<HashMap<String, Vec<ComponentUsage>>> {
    let content = fs::read_to_string(file_path)?;
    let mut usage_map = HashMap::new();

    for item in imported_items {
        let usages = find_component_in_content(&content, item)?;
        usage_map.insert(item.clone(), usages);
    }

    Ok(usage_map)
}

/// Find all occurrences of a component in file content
fn find_component_in_content(content: &str, component_name: &str) -> Result<Vec<ComponentUsage>> {
    let mut usages = Vec::new();

    // Pattern 1: Self-closing JSX/HTML: <Button /> or <Button attr="value" />
    let self_closing_pattern = format!(r"<{}\s*([^>]*?)/?>", regex::escape(component_name));
    let self_closing = Regex::new(&self_closing_pattern)?;

    // Pattern 2: Opening tag: <Button> or <Button attr="value">
    let opening_tag_pattern = format!(r"<{}\s*([^>]*?)>", regex::escape(component_name));
    let opening_tag = Regex::new(&opening_tag_pattern)?;

    // Pattern 3: Function call: Button( or Button({
    let function_call_pattern = format!(r"\b{}\s*\(", regex::escape(component_name));
    let function_call = Regex::new(&function_call_pattern)?;

    for (line_num, line) in content.lines().enumerate() {
        let line_number = line_num + 1;

        // Check self-closing tags
        for cap in self_closing.captures_iter(line) {
            let full_match = cap.get(0).unwrap().as_str();
            let attr_str = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let attributes = if !attr_str.trim().is_empty() {
                Some(parse_jsx_attributes(attr_str))
            } else {
                None
            };

            // Determine if it's self-closing or not
            let usage_type = if full_match.trim_end().ends_with("/>") {
                UsageType::JsxComponent
            } else {
                UsageType::HtmlTag
            };

            usages.push(ComponentUsage {
                line: line_number,
                usage_type,
                code_snippet: full_match.to_string(),
                attributes,
            });
        }

        // Check function calls (only if not already found as tag)
        if !usages.iter().any(|u| u.line == line_number) {
            if function_call.is_match(line) {
                // Extract a reasonable snippet around the function call
                let snippet = if line.len() > 80 {
                    format!("{}...", &line[..80])
                } else {
                    line.to_string()
                };

                usages.push(ComponentUsage {
                    line: line_number,
                    usage_type: UsageType::FunctionCall,
                    code_snippet: snippet.trim().to_string(),
                    attributes: None,
                });
            }
        }
    }

    Ok(usages)
}

/// Parse JSX/HTML attributes from a string
fn parse_jsx_attributes(attr_str: &str) -> HashMap<String, String> {
    let mut attrs = HashMap::new();

    // Pattern for key="value", key='value', key={value}, or standalone key
    let attr_regex = Regex::new(r#"(\w+)(?:=(?:["']([^"']*)["']|\{([^}]*)\}))?"#).unwrap();

    for cap in attr_regex.captures_iter(attr_str) {
        let key = cap.get(1).unwrap().as_str().to_string();
        let value = cap
            .get(2)
            .or_else(|| cap.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "true".to_string());
        attrs.insert(key, value);
    }

    attrs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_jsx_attributes() {
        let attrs = parse_jsx_attributes(r#"variant="primary" size="large" disabled"#);
        assert_eq!(attrs.get("variant"), Some(&"primary".to_string()));
        assert_eq!(attrs.get("size"), Some(&"large".to_string()));
        assert_eq!(attrs.get("disabled"), Some(&"true".to_string()));
    }

    #[test]
    fn test_find_jsx_component() {
        let content = r#"
import { Button } from './components';

function App() {
    return <Button variant="primary">Click</Button>;
}
        "#;

        let usages = find_component_in_content(content, "Button").unwrap();
        assert_eq!(usages.len(), 1);
        assert_eq!(usages[0].line, 5);
    }

    #[test]
    fn test_find_self_closing() {
        let content = r#"
<Icon name="check" />
        "#;

        let usages = find_component_in_content(content, "Icon").unwrap();
        assert_eq!(usages.len(), 1);
        assert!(matches!(usages[0].usage_type, UsageType::JsxComponent));
    }

    #[test]
    fn test_find_function_call() {
        let content = r#"
const result = Button({ label: "Click me" });
        "#;

        let usages = find_component_in_content(content, "Button").unwrap();
        assert_eq!(usages.len(), 1);
        assert!(matches!(usages[0].usage_type, UsageType::FunctionCall));
    }
}
