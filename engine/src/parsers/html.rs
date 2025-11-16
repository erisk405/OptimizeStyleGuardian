use anyhow::{Result, Context};
use regex::Regex;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct HtmlElement {
    pub tag_name: String,
    pub line: usize,
    pub column: usize,
    pub attributes: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct ImageElement {
    pub src: String,
    pub has_lazy: bool,
    pub has_width: bool,
    pub has_height: bool,
    pub line: usize,
}

pub fn parse_html_file<P: AsRef<Path>>(path: P) -> Result<Vec<HtmlElement>> {
    let path = path.as_ref();
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read HTML file: {}", path.display()))?;

    parse_html_content(&content)
}

pub fn parse_html_content(content: &str) -> Result<Vec<HtmlElement>> {
    let mut elements = Vec::new();

    // Simple regex-based HTML parsing (not a full parser, but sufficient for our needs)
    let tag_regex = Regex::new(r"<(\w+)([^>]*)>").unwrap();

    for (line_num, line) in content.lines().enumerate() {
        for cap in tag_regex.captures_iter(line) {
            let tag_name = cap.get(1).unwrap().as_str().to_string();
            let attrs_str = cap.get(2).unwrap().as_str();
            let attributes = parse_attributes(attrs_str);

            elements.push(HtmlElement {
                tag_name,
                line: line_num + 1,
                column: cap.get(0).unwrap().start() + 1,
                attributes,
            });
        }
    }

    Ok(elements)
}

pub fn extract_images(content: &str) -> Vec<ImageElement> {
    let mut images = Vec::new();
    let img_regex = Regex::new(r"<img([^>]*)>").unwrap();

    for (line_num, line) in content.lines().enumerate() {
        for cap in img_regex.captures_iter(line) {
            let attrs_str = cap.get(1).unwrap().as_str();
            let attributes = parse_attributes(attrs_str);

            let src = attributes.iter()
                .find(|(k, _)| k == "src")
                .map(|(_, v)| v.clone())
                .unwrap_or_default();

            let has_lazy = attributes.iter().any(|(k, v)|
                k == "loading" && v == "lazy"
            );

            let has_width = attributes.iter().any(|(k, _)| k == "width");
            let has_height = attributes.iter().any(|(k, _)| k == "height");

            images.push(ImageElement {
                src,
                has_lazy,
                has_width,
                has_height,
                line: line_num + 1,
            });
        }
    }

    images
}

pub fn extract_scripts(content: &str) -> Vec<(usize, String, bool)> {
    let mut scripts = Vec::new();
    let script_regex = Regex::new(r#"<script([^>]*)(?:>([^<]*)</script>|/>)"#).unwrap();

    for (line_num, line) in content.lines().enumerate() {
        for cap in script_regex.captures_iter(line) {
            let attrs_str = cap.get(1).unwrap().as_str();
            let attributes = parse_attributes(attrs_str);

            let src = attributes.iter()
                .find(|(k, _)| k == "src")
                .map(|(_, v)| v.clone())
                .unwrap_or_default();

            let is_async = attributes.iter().any(|(k, _)| k == "async" || k == "defer");

            // Check for inline script
            if src.is_empty() {
                if let Some(content_match) = cap.get(2) {
                    let inline_content = content_match.as_str();
                    scripts.push((line_num + 1, inline_content.to_string(), is_async));
                }
            } else {
                scripts.push((line_num + 1, src, is_async));
            }
        }
    }

    scripts
}

pub fn has_viewport_meta(content: &str) -> bool {
    let viewport_regex = Regex::new(r#"<meta\s+name=["']viewport["']"#).unwrap();
    viewport_regex.is_match(content)
}

fn parse_attributes(attrs_str: &str) -> Vec<(String, String)> {
    let mut attributes = Vec::new();
    let attr_regex = Regex::new(r#"(\w+)(?:=["']([^"']*)["']|=(\w+))?"#).unwrap();

    for cap in attr_regex.captures_iter(attrs_str) {
        let key = cap.get(1).unwrap().as_str().to_string();
        let value = cap.get(2)
            .or_else(|| cap.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        attributes.push((key, value));
    }

    attributes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_html() {
        let html = r#"
            <div class="container">
                <button>Click me</button>
                <go5-button>Custom</go5-button>
            </div>
        "#;

        let elements = parse_html_content(html).unwrap();
        assert!(elements.len() >= 3);
    }

    #[test]
    fn test_extract_images() {
        let html = r#"
            <img src="test.png" width="100" height="100">
            <img src="test2.png" loading="lazy">
        "#;

        let images = extract_images(html);
        assert_eq!(images.len(), 2);
        assert!(images[0].has_width);
        assert!(images[1].has_lazy);
    }
}
