use anyhow::{Context, Result};
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct ImportStatement {
    pub imported_items: Vec<String>,
    pub source: String,
    pub line: usize,
    pub size_kb: Option<u64>,
    pub resolved_path: Option<String>,
}

/// Parse TypeScript/JavaScript import statements from a file
pub fn parse_typescript_imports<P: AsRef<Path>>(path: P) -> Result<Vec<ImportStatement>> {
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read file: {}", path.as_ref().display()))?;

    let mut imports = Vec::new();

    // Regex patterns for different import styles
    // Pattern 1: import { A, B } from './module'
    // Pattern 2: import * as Module from './module'
    // Pattern 3: import Module from './module'
    // Pattern 4: import './module' (side-effect import)
    let import_regex = Regex::new(
        r#"import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))?\s*(?:from\s+)?['"']([^'"']+)['"]"#,
    )
    .unwrap();

    // Also handle require() for CommonJS
    let require_regex = Regex::new(
        r#"(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"']([^'"']+)['"]"#,
    )
    .unwrap();

    for (line_num, line) in content.lines().enumerate() {
        // Skip comments
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with("*") {
            continue;
        }

        // Check for ES6 import
        if let Some(cap) = import_regex.captures(line) {
            let source = cap
                .get(4)
                .or_else(|| cap.get(3))
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();

            if source.is_empty() {
                continue;
            }

            // Extract imported items
            let items = if let Some(named) = cap.get(1) {
                // Named imports: { A, B, C }
                named
                    .as_str()
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            } else if let Some(namespace) = cap.get(2) {
                // Namespace import: * as Module
                vec![format!("* as {}", namespace.as_str())]
            } else if let Some(default) = cap.get(3) {
                // Default import: Module
                if cap.get(4).is_some() {
                    vec![default.as_str().to_string()]
                } else {
                    // Side-effect import only
                    vec!["(side-effect)".to_string()]
                }
            } else {
                // Side-effect import: import './styles.css'
                vec!["(side-effect)".to_string()]
            };

            imports.push(ImportStatement {
                imported_items: items,
                source,
                line: line_num + 1,
                size_kb: None,
                resolved_path: None,
            });
        }
        // Check for CommonJS require
        else if let Some(cap) = require_regex.captures(line) {
            let source = cap.get(3).unwrap().as_str().to_string();

            let items = if let Some(named) = cap.get(1) {
                // const { A, B } = require('./module')
                named
                    .as_str()
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            } else if let Some(default) = cap.get(2) {
                // const Module = require('./module')
                vec![default.as_str().to_string()]
            } else {
                vec![]
            };

            imports.push(ImportStatement {
                imported_items: items,
                source,
                line: line_num + 1,
                size_kb: None,
                resolved_path: None,
            });
        }
    }

    Ok(imports)
}

/// Calculate the size of an imported module
pub fn calculate_import_size<P: AsRef<Path>>(
    import: &mut ImportStatement,
    base_path: P,
) -> Result<()> {
    let resolved = resolve_import_path(&import.source, base_path)?;

    if let Some(path) = resolved {
        import.resolved_path = Some(path.display().to_string());

        if path.exists() {
            if path.is_dir() {
                // It's a package directory - calculate total package size
                match calculate_package_size(&path) {
                    Ok(size) => import.size_kb = Some(size),
                    Err(e) => {
                        eprintln!(
                            "Warning: Failed to calculate package size for {}: {}",
                            path.display(),
                            e
                        );
                        import.size_kb = None;
                    }
                }
            } else {
                // It's a single file
                let metadata = fs::metadata(&path)
                    .with_context(|| format!("Failed to read metadata: {}", path.display()))?;
                let size_bytes = metadata.len();
                import.size_kb = Some(size_bytes / 1024);
            }
        } else {
            import.size_kb = Some(0);
        }
    } else {
        // External package not found in node_modules
        import.size_kb = None;
    }

    Ok(())
}

/// Resolve import path to absolute file path
fn resolve_import_path<P: AsRef<Path>>(
    import_source: &str,
    base_path: P,
) -> Result<Option<PathBuf>> {
    let base = base_path.as_ref();

    // Check if it's a relative import (starts with ./ or ../)
    if import_source.starts_with("./") || import_source.starts_with("../") {
        let base_dir = if base.is_file() {
            base.parent().unwrap_or(base)
        } else {
            base
        };

        let mut path = base_dir.join(import_source);

        // Try different extensions if file doesn't exist
        if !path.exists() {
            for ext in &[".ts", ".tsx", ".js", ".jsx", ".d.ts"] {
                let with_ext = base_dir.join(format!("{}{}", import_source, ext));
                if with_ext.exists() {
                    path = with_ext;
                    break;
                }
            }
        }

        // Try index files if it's a directory
        if !path.exists() || path.is_dir() {
            for index in &["index.ts", "index.tsx", "index.js", "index.jsx"] {
                let index_path = path.join(index);
                if index_path.exists() {
                    path = index_path;
                    break;
                }
            }
        }

        Ok(Some(path))
    } else {
        // External package from node_modules
        resolve_node_modules_path(import_source, base)
    }
}

/// Resolve external package path from node_modules
fn resolve_node_modules_path<P: AsRef<Path>>(
    package_name: &str,
    base_path: P,
) -> Result<Option<PathBuf>> {
    let base = base_path.as_ref();

    let base_dir = if base.is_file() {
        base.parent().unwrap_or(base)
    } else {
        base
    };

    // Walk up directory tree to find node_modules
    let mut current = base_dir;
    loop {
        let node_modules = current.join("node_modules");

        if node_modules.exists() {
            // Handle scoped packages (@scope/package)
            let package_path = node_modules.join(package_name);

            if package_path.exists() {
                // Try to find the main entry point
                if let Some(main_file) = find_package_main(&package_path)? {
                    return Ok(Some(main_file));
                }

                // Fallback: return package directory for size calculation
                return Ok(Some(package_path));
            }
        }

        // Move up directory tree
        match current.parent() {
            Some(parent) => current = parent,
            None => break,
        }
    }

    // Package not found in node_modules
    Ok(None)
}

/// Find the main entry point of a package from package.json
fn find_package_main(package_path: &Path) -> Result<Option<PathBuf>> {
    let package_json = package_path.join("package.json");

    if package_json.exists() {
        let content = fs::read_to_string(&package_json)?;

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            // Try different entry points in order of preference
            let entry_points = ["main", "module", "browser"];

            for entry in &entry_points {
                if let Some(main) = json[entry].as_str() {
                    let main_path = package_path.join(main);
                    if main_path.exists() {
                        return Ok(Some(main_path));
                    }
                }
            }
        }
    }

    // Fallback: try common index files
    for index in &["index.js", "index.ts", "index.jsx", "index.tsx"] {
        let index_path = package_path.join(index);
        if index_path.exists() {
            return Ok(Some(index_path));
        }
    }

    // Return None if no entry point found, but package dir exists
    Ok(None)
}

/// Calculate total size of a package directory
pub fn calculate_package_size(package_path: &Path) -> Result<u64> {
    let mut total_size = 0u64;

    for entry in WalkDir::new(package_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let path = entry.path();
            let path_str = path.to_string_lossy();

            // Skip certain files that don't affect bundle size
            let should_skip = path_str.contains("node_modules") // nested node_modules
                || path_str.contains("__tests__")
                || path_str.contains("test")
                || path_str.contains("tests")
                || path_str.contains("spec")
                || path_str.ends_with(".md")
                || path_str.ends_with(".map")
                || path_str.ends_with(".d.ts")
                || path_str.ends_with("LICENSE")
                || path_str.ends_with("README");

            if !should_skip {
                if let Ok(metadata) = entry.metadata() {
                    total_size += metadata.len();
                }
            }
        }
    }

    Ok(total_size / 1024) // Return KB
}

/// Track usage of imported items throughout a file
pub fn track_item_usage<P: AsRef<Path>>(
    file_path: P,
    imported_items: &[String],
) -> Result<HashMap<String, (usize, Vec<usize>)>> {
    let content = fs::read_to_string(&file_path)
        .with_context(|| format!("Failed to read file: {}", file_path.as_ref().display()))?;

    let mut usage_map: HashMap<String, (usize, Vec<usize>)> = HashMap::new();

    // Initialize map for all imported items
    for item in imported_items {
        // Clean up item name (remove aliases like "as X")
        let clean_item = if item.contains(" as ") {
            item.split(" as ").last().unwrap_or(item).trim()
        } else {
            item.trim()
        };

        // Skip side-effect imports and namespace imports
        if clean_item == "(side-effect)" || clean_item.starts_with("* as ") {
            continue;
        }

        usage_map.insert(clean_item.to_string(), (0, Vec::new()));
    }

    // Search for usage in file content
    for (line_num, line) in content.lines().enumerate() {
        let line_number = line_num + 1;

        // Skip import lines and comments
        let trimmed = line.trim();
        if trimmed.starts_with("import ")
            || trimmed.starts_with("//")
            || trimmed.starts_with("/*")
            || trimmed.starts_with("*")
        {
            continue;
        }

        // Check for each imported item usage
        for (item, (count, lines)) in usage_map.iter_mut() {
            // Create patterns to match usage
            // Pattern 1: Component usage in JSX: <Component or </Component>
            // Pattern 2: Function call: Component( or Component.
            // Pattern 3: As identifier: const x = Component
            let patterns = vec![
                format!(r"<{}", regex::escape(item)),
                format!(r"</{}", regex::escape(item)),
                format!(r"\b{}\(", regex::escape(item)),
                format!(r"\b{}\.", regex::escape(item)),
                format!(r"= {}\b", regex::escape(item)),
                format!(r"{{ {} }}", regex::escape(item)),
                format!(r"\b{} =", regex::escape(item)),
                format!(r"extends {}\b", regex::escape(item)),
                format!(r": {}\b", regex::escape(item)),
            ];

            for pattern in patterns {
                if let Ok(re) = Regex::new(&pattern) {
                    if re.is_match(line) {
                        *count += 1;
                        if !lines.contains(&line_number) {
                            lines.push(line_number);
                        }
                        break; // Count once per line
                    }
                }
            }
        }
    }

    Ok(usage_map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_parse_named_imports() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "import {{ Component, Button }} from './components'").unwrap();

        let imports = parse_typescript_imports(file.path()).unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].imported_items, vec!["Component", "Button"]);
        assert_eq!(imports[0].source, "./components");
        assert_eq!(imports[0].line, 1);
    }

    #[test]
    fn test_parse_default_import() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "import React from 'react'").unwrap();

        let imports = parse_typescript_imports(file.path()).unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].imported_items, vec!["React"]);
        assert_eq!(imports[0].source, "react");
    }

    #[test]
    fn test_parse_namespace_import() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "import * as Utils from './utils'").unwrap();

        let imports = parse_typescript_imports(file.path()).unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].imported_items, vec!["* as Utils"]);
    }

    #[test]
    fn test_parse_require() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "const fs = require('fs')").unwrap();

        let imports = parse_typescript_imports(file.path()).unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].imported_items, vec!["fs"]);
        assert_eq!(imports[0].source, "fs");
    }

    #[test]
    fn test_skip_comments() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "// import {{ A }} from './test'").unwrap();
        writeln!(file, "/* import {{ B }} from './test' */").unwrap();
        writeln!(file, "import {{ C }} from './real'").unwrap();

        let imports = parse_typescript_imports(file.path()).unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].imported_items, vec!["C"]);
    }
}
