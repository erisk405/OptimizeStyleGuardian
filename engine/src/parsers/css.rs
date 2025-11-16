use crate::types::CSSClass;
use anyhow::{Context, Result};
use lightningcss::properties::Property;
use lightningcss::rules::CssRule;
use lightningcss::selector::{Component, Selector};
use lightningcss::stylesheet::{ParserOptions, StyleSheet};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub fn parse_css_file<P: AsRef<Path>>(path: P) -> Result<Vec<CSSClass>> {
    let path = path.as_ref();
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read CSS file: {}", path.display()))?;

    parse_css_content(&content, path.to_string_lossy().to_string())
}

pub fn parse_css_content(content: &str, file_path: String) -> Result<Vec<CSSClass>> {
    let mut classes = Vec::new();

    // Parse with lightningcss
    let stylesheet = StyleSheet::parse(&content, ParserOptions::default());

    let stylesheet = match stylesheet {
        Ok(s) => s,
        Err(e) => {
            // If parsing fails, return empty vec (with warning in production)
            eprintln!("Warning: CSS parse error in {}: {:?}", file_path, e);
            return Ok(classes);
        }
    };

    // Extract class selectors and their properties
    extract_classes_from_rules(&stylesheet.rules.0, &mut classes, &file_path, 1);

    Ok(classes)
}

fn extract_classes_from_rules(
    rules: &[CssRule],
    classes: &mut Vec<CSSClass>,
    file_path: &str,
    line: usize,
) {
    for rule in rules {
        match rule {
            CssRule::Style(style_rule) => {
                // Extract class selectors
                for selector in &style_rule.selectors.0 {
                    if let Some(class_name) = extract_class_name(selector) {
                        let properties = extract_properties(&style_rule.declarations);

                        if !properties.is_empty() {
                            classes.push(CSSClass {
                                name: class_name,
                                properties,
                                file: file_path.to_string(),
                                line,
                            });
                        }
                    }
                }
            }
            CssRule::Media(media_rule) => {
                // Recursively process media queries
                extract_classes_from_rules(&media_rule.rules.0, classes, file_path, line);
            }
            _ => {
                // Handle other rule types if needed
            }
        }
    }
}

fn extract_class_name(selector: &Selector) -> Option<String> {
    // Look for class component in selector
    // Access selector components using the public API
    for component in selector.iter() {
        if let Component::Class(class_name) = component {
            return Some(format!(".{}", class_name));
        }
    }
    None
}

fn extract_properties(
    declarations: &lightningcss::declaration::DeclarationBlock,
) -> HashMap<String, String> {
    let mut properties = HashMap::new();

    for declaration in &declarations.declarations {
        let prop_name = get_property_name(declaration);
        let prop_value = format!("{:?}", declaration); // Simplified for now

        if !prop_name.is_empty() {
            properties.insert(prop_name, prop_value);
        }
    }

    properties
}

fn get_property_name(property: &Property) -> String {
    match property {
        Property::BackgroundColor(_) => "background-color".to_string(),
        Property::Color(_) => "color".to_string(),
        Property::Width(_) => "width".to_string(),
        Property::Height(_) => "height".to_string(),
        Property::Margin(_) => "margin".to_string(),
        Property::Padding(_) => "padding".to_string(),
        Property::Display(_) => "display".to_string(),
        Property::Position(_) => "position".to_string(),
        Property::FontSize(_) => "font-size".to_string(),
        Property::FontWeight(_) => "font-weight".to_string(),
        Property::FontFamily(_) => "font-family".to_string(),
        Property::LineHeight(_) => "line-height".to_string(),
        Property::TextAlign(_) => "text-align".to_string(),
        Property::Border(_) => "border".to_string(),
        Property::BorderRadius(..) => "border-radius".to_string(),
        Property::BoxShadow(..) => "box-shadow".to_string(),
        Property::FlexDirection(..) => "flex-direction".to_string(),
        Property::JustifyContent(..) => "justify-content".to_string(),
        Property::AlignItems(..) => "align-items".to_string(),
        Property::Gap(_) => "gap".to_string(),
        _ => format!("{:?}", property)
            .split('(')
            .next()
            .unwrap_or("")
            .to_lowercase(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_css() {
        let css = r#"
            .button {
                color: blue;
                padding: 10px;
            }
            .header {
                font-size: 20px;
                color: blue;
                padding: 10px;
            }
        "#;

        let classes = parse_css_content(css, "test.css".to_string()).unwrap();
        assert!(classes.len() >= 2);
    }
}
