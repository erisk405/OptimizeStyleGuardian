# 🚀 Quick Start Guide

Get up and running with Go5 Style Guardian in 5 minutes!

## 📋 Prerequisites Checklist

Before you begin, make sure you have:

- [ ] **Node.js** v18 or higher installed
  - Check: `node --version`
  - Install from: https://nodejs.org/

- [ ] **Rust** latest stable version
  - Check: `rustc --version`
  - Install from: https://rustup.rs/

- [ ] **VS Code** installed
  - Install from: https://code.visualstudio.com/

## 🏃 Installation (3 Steps)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build Rust Engine

```bash
npm run build:engine
```

This compiles the Rust engine. Takes 1-2 minutes on first build.

### Step 3: Compile TypeScript

```bash
npm run compile
```

## ▶️ Running the Extension

### Option A: Development Mode (Recommended for testing)

1. Open the project in VS Code
2. Press `F5`
3. A new "Extension Development Host" window opens
4. Open any project folder in the new window
5. Try the commands!

### Option B: Install as VSIX

1. Package the extension:
   ```bash
   npx vsce package
   ```

2. Install the `.vsix` file:
   - In VS Code: Extensions → ⋯ (three dots) → Install from VSIX
   - Or: `code --install-extension go5-style-guardian-0.1.0.vsix`

## 🎯 First Scan

### Scan a Test File

1. Create a test file `test.css`:
   ```css
   .button-primary {
       background-color: blue;
       padding: 10px;
   }
   
   .cta-button {
       background-color: blue;
       padding: 10px;
   }
   ```

2. Open Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)

3. Type: `Go5: Scan Current File`

4. View results in the panel that opens!

## 🎨 Understanding the Results

### Style Health Tab
Shows duplicate and similar styles:
- **Red (Critical)**: Exact duplicates
- **Yellow (Warning)**: High similarity (>95%)
- **Blue (Info)**: Moderate similarity

### Design System Tab
Shows component and class recommendations:
- Native elements that should use DS components
- Hardcoded values that should use tokens

### Performance Tab
Shows Lighthouse-style performance issues:
- **Red (Critical)**: Render-blocking resources, large bundles
- **Yellow (Warning)**: Missing optimizations
- **Blue (Info)**: Suggestions and best practices

## ⚙️ Basic Configuration

### Set Up Design System Config

1. Create `config/design-system.yml` in your workspace:
   ```yaml
   components:
     go5-button:
       selector: go5-button
       keywords: ["button", "btn"]
       replaces:
         - "button[type='button']"
   
   tokens:
     colors:
       primary: "#0066cc"
     spacing:
       md: "16px"
   ```

2. Update VS Code settings (optional):
   ```json
   {
     "go5StyleGuardian.designSystemConfigPath": "config/design-system.yml"
   }
   ```

### Adjust Thresholds

Open Settings (`Ctrl+,`) and search for "Go5":

- **Duplicate Similarity**: 90% (default) - Lower = more results
- **JS Bundle Threshold**: 200 KB (default)
- **CSS Size Threshold**: 100 KB (default)
- **Image Size Threshold**: 500 KB (default)

## 🔧 Common Commands

| Command | What it does |
|---------|-------------|
| `Go5: Scan Current File` | Analyze the open file |
| `Go5: Scan Selected Folder` | Analyze a folder (right-click in Explorer) |
| `Go5: Scan Workspace` | Analyze entire workspace |
| `Go5: Open Style Guardian Panel` | Show/focus results panel |

## 💡 Tips & Tricks

### Tip 1: Use Context Menu
Right-click any file or folder in the Explorer → `Go5: Scan with Go5 Style Guardian`

### Tip 2: Jump to Code
Click the **🔍 Go to Code** button on any issue to instantly jump to that line

### Tip 3: Filter by Severity
Look for the severity badges:
- **CRITICAL** (red) - Fix these first!
- **WARNING** (yellow) - Important improvements
- **INFO** (blue) - Suggestions

### Tip 4: Exclude Folders
Add to settings to skip certain directories:
```json
{
  "go5StyleGuardian.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/vendor/**"
  ]
}
```

### Tip 5: Scan on Save (Manual Setup)
While not built-in yet, you can create a task:

`.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Go5: Scan",
      "command": "${command:go5StyleGuardian.scanCurrentFile}",
      "problemMatcher": []
    }
  ]
}
```

## 🧪 Testing with Examples

The project includes example files in `examples/`:

1. **test-duplicate-styles.css** - Shows duplicate detection
2. **test-design-system.html** - Shows DS violations
3. **test-performance.js** - Shows performance issues

Scan these files to see the tool in action!

```bash
# From VS Code
1. Open examples/test-duplicate-styles.css
2. Ctrl+Shift+P → "Go5: Scan Current File"
3. View results in panel
```

## 🐛 Troubleshooting

### Error: "Rust engine not found"

**Solution:**
```bash
npm run build:engine
```

Check that `engine/target/release/go5_engine` (or `.exe` on Windows) exists.

### Error: Rust compilation fails

**Solution:**
```bash
# Update Rust
rustup update stable

# Clean and rebuild
cd engine
cargo clean
cargo build --release
```

### Extension doesn't activate

**Solution:**
1. Check Output panel: View → Output → Select "Go5 Style Guardian"
2. Look for error messages
3. Restart VS Code

### No results shown

**Checklist:**
- [ ] Did the scan complete? (check notification)
- [ ] Is the panel open? (`Go5: Open Style Guardian Panel`)
- [ ] Are the right file types being scanned? (CSS, HTML, JS, TS)
- [ ] Check exclude patterns in settings

## 📚 Next Steps

✅ You're all set! Here's what to explore next:

1. **Customize for your project**
   - Create your `design-system.yml`
   - Set your performance thresholds
   - Add your component patterns

2. **Integrate into workflow**
   - Scan before commits
   - Review issues weekly
   - Track metrics over time

3. **Read the docs**
   - [README.md](README.md) - Full documentation
   - [DEVELOPMENT.md](DEVELOPMENT.md) - Contribute & extend
   - [CHANGELOG.md](CHANGELOG.md) - What's new

## 🆘 Getting Help

- **Issues**: Check existing issues or create new one
- **Questions**: Read the FAQ in README.md
- **Contributing**: See DEVELOPMENT.md

## 🎉 Success!

You're now ready to use Go5 Style Guardian!

Try scanning your first real project and see what insights you discover. Happy coding! 🚀
