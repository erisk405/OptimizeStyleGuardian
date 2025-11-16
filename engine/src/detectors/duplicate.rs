use crate::types::{CSSClass, DuplicateStyleIssue};
use std::collections::HashMap;

pub fn detect_duplicates(classes: &[CSSClass], similarity_threshold: u8) -> Vec<DuplicateStyleIssue> {
    let mut issues = Vec::new();

    // Compare each class with every other class
    for i in 0..classes.len() {
        for j in (i + 1)..classes.len() {
            let class_a = &classes[i];
            let class_b = &classes[j];

            // Skip if same class name
            if class_a.name == class_b.name {
                continue;
            }

            let similarity = calculate_similarity(&class_a.properties, &class_b.properties);

            if similarity >= similarity_threshold {
                let issue_type = if similarity == 100 {
                    "identical_classes"
                } else {
                    "similar_classes"
                };

                let severity = if similarity == 100 {
                    "warning"
                } else if similarity >= 95 {
                    "warning"
                } else {
                    "info"
                };

                // Get common properties
                let common_props = get_common_properties(&class_a.properties, &class_b.properties);

                issues.push(DuplicateStyleIssue {
                    issue_type: issue_type.to_string(),
                    file: class_a.file.clone(),
                    line: class_a.line,
                    column: None,
                    class: class_a.name.clone(),
                    duplicate_of: class_b.name.clone(),
                    similarity: similarity as u8,
                    severity: severity.to_string(),
                    properties: if !common_props.is_empty() {
                        Some(common_props)
                    } else {
                        None
                    },
                });
            }
        }
    }

    issues
}

fn calculate_similarity(props_a: &HashMap<String, String>, props_b: &HashMap<String, String>) -> u8 {
    if props_a.is_empty() || props_b.is_empty() {
        return 0;
    }

    let mut matching_count = 0;
    let mut total_count = 0;

    // Count matching properties
    for (key_a, val_a) in props_a {
        total_count += 1;
        if let Some(val_b) = props_b.get(key_a) {
            if val_a == val_b {
                matching_count += 1;
            }
        }
    }

    // Add properties only in B
    for key_b in props_b.keys() {
        if !props_a.contains_key(key_b) {
            total_count += 1;
        }
    }

    if total_count == 0 {
        return 0;
    }

    ((matching_count as f64 / total_count as f64) * 100.0) as u8
}

fn get_common_properties(props_a: &HashMap<String, String>, props_b: &HashMap<String, String>) -> Vec<String> {
    let mut common = Vec::new();

    for (key_a, val_a) in props_a {
        if let Some(val_b) = props_b.get(key_a) {
            if val_a == val_b {
                common.push(key_a.clone());
            }
        }
    }

    common
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identical_classes() {
        let mut props1 = HashMap::new();
        props1.insert("color".to_string(), "blue".to_string());
        props1.insert("padding".to_string(), "10px".to_string());

        let mut props2 = HashMap::new();
        props2.insert("color".to_string(), "blue".to_string());
        props2.insert("padding".to_string(), "10px".to_string());

        let similarity = calculate_similarity(&props1, &props2);
        assert_eq!(similarity, 100);
    }

    #[test]
    fn test_partial_similarity() {
        let mut props1 = HashMap::new();
        props1.insert("color".to_string(), "blue".to_string());
        props1.insert("padding".to_string(), "10px".to_string());

        let mut props2 = HashMap::new();
        props2.insert("color".to_string(), "blue".to_string());
        props2.insert("margin".to_string(), "5px".to_string());

        let similarity = calculate_similarity(&props1, &props2);
        assert!(similarity > 0 && similarity < 100);
    }
}
