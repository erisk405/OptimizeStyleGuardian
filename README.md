# 🛡️ Go5 Style Guardian

A powerful VS Code extension powered by Rust engine for frontend developers to maintain clean, consistent, and performant codebases.

## 🎯 Features

### ✨ Duplicate Style Analyzer
- Detects identical and similar CSS classes
- Identifies inline styles that match existing classes
- Configurable similarity threshold (default: 90%)
- Helps reduce CSS bloat and maintain consistency

### 📐 Design System Enforcement
- YAML-based design system configuration
- Detects usage of native HTML elements that should use design system components
- Suggests design system classes for custom styles
- Validates color and spacing tokens
- Keyword-based component matching

### ⚡ Lighthouse Performance Tuning
Static analysis for common performance issues:
- **JavaScript**: Large bundles, synchronous scripts
- **CSS**: Large files, expensive selectors, unused styles
- **HTML**: Missing viewport meta, render-blocking resources
- **Images**: Missing lazy loading, missing dimensions (CLS risk), large file sizes
- **Components**: Heavy components (mat-table, excessive mat-icons)

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
  ```bash
  # Install Rust from https://rustup.rs/
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

### Installation

1. **Clone the repository**
   ```bash
   cd Go5StyleGuardian
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the Rust engine**
   ```bash
   npm run build:engine
   ```

   This compiles the Rust engine to `engine/target/release/go5_engine` (or `.exe` on Windows)

4. **Compile the TypeScript extension**
   ```bash
   npm run compile
   ```

5. **Run the extension**
   - Press `F5` in VS Code to open a new Extension Development Host window
   - Or package the extension:
     ```bash
     npx vsce package
     # Install the generated .vsix file
     ```

## 📖 Usage

### Commands

- **Go5: Scan Current File** - Analyze the currently open file
- **Go5: Scan Selected Folder** - Analyze a specific folder (right-click in Explorer)
- **Go5: Scan Workspace** - Analyze the entire workspace
- **Go5: Open Style Guardian Panel** - Open the results panel

### Context Menu

Right-click any file or folder in the Explorer:
- **Go5: Scan with Go5 Style Guardian**

### Results Panel

The panel shows three tabs:

1. **Style Health** 🎨
   - Duplicate classes
   - Similar classes
   - Inline style duplicates
   - Heavy selectors

2. **Design System** 📐
   - Component replacement suggestions
   - Class recommendations
   - Token usage validation

3. **Performance** ⚡
   - Critical, Warning, and Info level issues
   - File-specific recommendations
   - Lighthouse-inspired checks

### "Go to Code" Button

Click **🔍 Go to Code** on any issue to jump directly to the problematic line in your editor.

## ⚙️ Configuration

### VS Code Settings

Open Settings (Ctrl/Cmd + ,) and search for "Go5 Style Guardian":

```json
{
  // Duplicate detection similarity threshold (0-100)
  "go5StyleGuardian.duplicateSimilarityThreshold": 90,

  // Performance thresholds
  "go5StyleGuardian.performanceJsBundleThreshold": 200,  // KB
  "go5StyleGuardian.performanceCssSizeThreshold": 100,   // KB
  "go5StyleGuardian.performanceImageSizeThreshold": 500, // KB

  // Design system config path (relative to workspace root)
  "go5StyleGuardian.designSystemConfigPath": "config/design-system.yml",

  // Enable/disable categories
  "go5StyleGuardian.enabledCategories": {
    "duplicateStyles": true,
    "designSystem": true,
    "performance": true
  },

  // File patterns to include
  "go5StyleGuardian.filePatterns": [
    "**/*.css",
    "**/*.scss",
    "**/*.html",
    "**/*.ts",
    "**/*.js",
    "**/*.jsx",
    "**/*.tsx",
    "**/*.vue"
  ],

  // Patterns to exclude
  "go5StyleGuardian.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**"
  ]
}
```

### Design System Configuration

Create a `config/design-system.yml` file in your workspace:

```yaml
components:
  go5-button:
    selector: go5-button
    keywords: ["button", "btn", "cta"]
    replaces:
      - "button[type='button']"
      - "button[type='submit']"

  go5-input:
    selector: go5-input
    keywords: ["input", "textbox", "field"]
    replaces:
      - "input[type='text']"

tokens:
  colors:
    primary: "#0066cc"
    secondary: "#6c757d"
    success: "#28a745"

  spacing:
    sm: "8px"
    md: "16px"
    lg: "24px"

  typography:
    font-primary: "'Segoe UI', sans-serif"
    text-base: "16px"
    weight-bold: "700"
```

See `config/design-system.yml` for a complete example.

## 🏗️ Project Structure

```
Go5StyleGuardian/
├── extension/               # VS Code Extension (TypeScript)
│   └── src/
│       ├── extension.ts    # Entry point
│       ├── commands/       # Command handlers
│       ├── webview/        # UI Panel
│       ├── rustBridge.ts   # Rust engine communication
│       └── types.ts        # TypeScript types
├── engine/                 # Rust Analysis Engine
│   └── src/
│       ├── main.rs         # CLI entry point
│       ├── parsers/        # CSS/HTML parsers
│       ├── detectors/      # Duplicate & DS checkers
│       ├── lighthouse_rules/ # Performance rules
│       ├── scanner.rs      # File scanner
│       ├── types.rs        # Rust types
│       └── config.rs       # YAML config loader
├── config/
│   └── design-system.yml   # Example DS config
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript config
└── Cargo.toml              # Rust dependencies
```

## 🛠️ Development

### Watch Mode

```bash
# Terminal 1: Watch TypeScript
npm run watch

# Terminal 2: Watch Rust (rebuild on changes)
cd engine
cargo watch -x build
```

### Debugging

1. Open VS Code in the project root
2. Press `F5` to start debugging
3. Set breakpoints in TypeScript files
4. For Rust debugging, use `println!` or attach a debugger to the engine process

### Testing

```bash
# Test Rust engine
cd engine
cargo test

# Test TypeScript extension
npm test
```

## 📊 Example Output

```json
{
  "duplicates": [
    {
      "type": "identical_classes",
      "file": "src/styles.css",
      "line": 34,
      "class": ".login-title",
      "duplicateOf": ".text-heading-xl",
      "similarity": 100,
      "severity": "warning",
      "properties": ["font-size", "font-weight", "color"]
    }
  ],
  "designSystem": [
    {
      "type": "component_replacement",
      "file": "src/app/login.component.html",
      "line": 12,
      "current": "<button>",
      "suggested": "<go5-button>",
      "severity": "warning",
      "reason": "Use design system component <go5-button> instead of native <button>"
    }
  ],
  "performance": [
    {
      "type": "large_bundle",
      "file": "dist/main.js",
      "severity": "critical",
      "message": "Large JavaScript bundle detected: 420 KB",
      "recommendation": "Consider code splitting or lazy loading"
    }
  ],
  "summary": {
    "totalFiles": 42,
    "totalIssues": 15,
    "duplicateCount": 5,
    "designSystemCount": 6,
    "performanceCount": 4,
    "criticalCount": 1,
    "warningCount": 10,
    "infoCount": 4
  }
}
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - see LICENSE file for details

## 🔧 Troubleshooting

### Engine not found error

If you see "Rust engine not found", run:
```bash
npm run build:engine
```

### Rust compilation errors

Make sure you have the latest stable Rust:
```bash
rustup update stable
```

### Extension not activating

Check the Output panel (View → Output → Go5 Style Guardian) for error messages.

## 🗺️ Roadmap

- [ ] Auto-fix capabilities
- [ ] Batch fix multiple issues
- [ ] Custom rule definitions
- [ ] Integration with CI/CD pipelines
- [ ] Support for more frameworks (React, Vue)
- [ ] Real-time analysis as you type
- [ ] Team-shared configuration presets

## 📧 Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/yourusername/go5-style-guardian/issues) page.

---

Made with ❤️ for Frontend Developers
