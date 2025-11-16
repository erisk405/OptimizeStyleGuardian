# 🛠️ Development Guide

## Setup Development Environment

### 1. Prerequisites

- **Node.js** v18+ ([Download](https://nodejs.org/))
- **Rust** latest stable ([Install](https://rustup.rs/))
- **VS Code** ([Download](https://code.visualstudio.com/))

### 2. Clone and Install

```bash
git clone <repository-url>
cd Go5StyleGuardian
npm install
```

### 3. Build the Project

```bash
# Build Rust engine
npm run build:engine

# Compile TypeScript
npm run compile
```

## Development Workflow

### Watch Mode (Recommended)

Open two terminal windows:

**Terminal 1: TypeScript Watch**
```bash
npm run watch
```

**Terminal 2: Rust Watch** (requires `cargo-watch`)
```bash
# Install cargo-watch if not installed
cargo install cargo-watch

cd engine
cargo watch -x "build --release"
```

### Running the Extension

1. Press `F5` in VS Code
2. A new "Extension Development Host" window opens
3. Open a folder/workspace in the new window
4. Test the extension commands

### Testing Changes

#### TypeScript Changes
- Changes auto-compile with `npm run watch`
- Reload the Extension Development Host window: `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac)

#### Rust Changes
- Rebuild: `cd engine && cargo build --release`
- Restart the Extension Development Host window

## Project Architecture

### TypeScript Extension Structure

```
src/
├── extension.ts           # Entry point, command registration
├── types.ts              # TypeScript type definitions
├── rustBridge.ts         # Spawns and communicates with Rust engine
├── commands/
│   └── scanCommand.ts    # Handles scan commands
└── webview/
    └── panelManager.ts   # Manages the results UI panel
```

### Rust Engine Structure

```
engine/src/
├── main.rs               # CLI entry point, arg parsing
├── types.rs             # Rust type definitions
├── config.rs            # YAML config loader
├── scanner.rs           # File traversal and orchestration
├── parsers/
│   ├── css.rs          # CSS/SCSS parser (lightningcss)
│   └── html.rs         # HTML parser (regex-based)
├── detectors/
│   ├── duplicate.rs    # Duplicate style detection
│   └── design_system.rs # DS component checker
└── lighthouse_rules/
    ├── javascript.rs   # JS performance checks
    ├── css.rs          # CSS performance checks
    ├── html.rs         # HTML performance checks
    └── images.rs       # Image optimization checks
```

## Communication Flow

```
VS Code Extension (TypeScript)
    ↓
    spawns child process
    ↓
Rust Engine (go5_engine binary)
    ↓
    outputs JSON to stdout
    ↓
VS Code Extension parses JSON
    ↓
Webview Panel displays results
```

## Adding New Features

### Add a New Performance Rule

1. **Create the detector in Rust** (`engine/src/lighthouse_rules/`)

```rust
// engine/src/lighthouse_rules/new_rule.rs
use crate::types::PerformanceIssue;
use anyhow::Result;

pub fn check_new_issue(content: &str) -> Result<Vec<PerformanceIssue>> {
    let mut issues = Vec::new();
    
    // Your detection logic here
    
    Ok(issues)
}
```

2. **Register in mod.rs**

```rust
// engine/src/lighthouse_rules/mod.rs
pub mod new_rule;
```

3. **Call in scanner**

```rust
// engine/src/scanner.rs
let new_issues = lighthouse_rules::new_rule::check_new_issue(&content)?;
performance.extend(new_issues);
```

4. **Update TypeScript types if needed**

```typescript
// src/types.ts
export interface PerformanceIssue {
    type: 'large_bundle' | 'unused_css' | 'new_issue_type' | ...;
    // ...
}
```

### Add a New VS Code Command

1. **Register command in package.json**

```json
{
  "contributes": {
    "commands": [
      {
        "command": "go5StyleGuardian.newCommand",
        "title": "Go5: New Command"
      }
    ]
  }
}
```

2. **Implement in extension.ts**

```typescript
context.subscriptions.push(
    vscode.commands.registerCommand('go5StyleGuardian.newCommand', () => {
        // Implementation
    })
);
```

## Debugging

### Debug TypeScript Extension

1. Set breakpoints in `.ts` files
2. Press `F5` to start debugging
3. Breakpoints will hit in the Extension Development Host

### Debug Rust Engine

**Option 1: Print Debugging**
```rust
eprintln!("Debug: {:?}", variable);
```

**Option 2: Attach Debugger**
1. Add `--debug` flag to Rust CLI
2. Use `lldb` (Mac/Linux) or `gdb` (Linux) to attach

**Option 3: Run Standalone**
```bash
cd engine
cargo build --release
./target/release/go5_engine \
    --workspace-root /path/to/test/project \
    --path /path/to/test/project/src \
    --config /path/to/design-system.yml
```

## Testing

### Unit Tests (Rust)

```bash
cd engine
cargo test
```

### Integration Tests

Create test files in `examples/` directory and run scans:

```bash
# Build engine
npm run build:engine

# Run on test files
cd engine
cargo run -- \
    --workspace-root ../examples \
    --path ../examples \
    --similarity 90
```

### Manual Testing Checklist

- [ ] Scan single file
- [ ] Scan folder
- [ ] Scan workspace
- [ ] View results in panel
- [ ] Click "Go to Code" buttons
- [ ] Switch between tabs
- [ ] Test with/without design-system.yml
- [ ] Test with different threshold settings

## Performance Profiling

### Rust Engine

```bash
cd engine

# Build with profiling
cargo build --release

# Profile with flamegraph (requires flamegraph crate)
cargo install flamegraph
cargo flamegraph --bin go5_engine -- --workspace-root /test/path --path /test/path
```

### Memory Usage

```bash
# Use valgrind (Linux)
valgrind --tool=massif ./target/release/go5_engine <args>

# Use Instruments (Mac)
instruments -t "Time Profiler" ./target/release/go5_engine <args>
```

## Code Quality

### Linting

```bash
# TypeScript
npm run lint

# Rust
cd engine
cargo clippy -- -D warnings
```

### Formatting

```bash
# TypeScript (if prettier is configured)
npm run format

# Rust
cd engine
cargo fmt
```

## Troubleshooting

### "Engine not found" error
- Ensure you've run `npm run build:engine`
- Check that `engine/target/release/go5_engine` (or `.exe`) exists

### Rust compilation fails
```bash
# Update Rust
rustup update stable

# Clean and rebuild
cd engine
cargo clean
cargo build --release
```

### Extension not loading
- Check Output panel: View → Output → Go5 Style Guardian
- Check Developer Tools: Help → Toggle Developer Tools

### Changes not reflected
- TypeScript: Reload window (Ctrl+R)
- Rust: Rebuild engine and restart Extension Host

## Release Checklist

- [ ] Update version in `package.json`
- [ ] Update version in `Cargo.toml`
- [ ] Update CHANGELOG.md
- [ ] Run all tests
- [ ] Build release version
- [ ] Test in clean workspace
- [ ] Package extension: `npx vsce package`
- [ ] Test `.vsix` installation
- [ ] Create git tag
- [ ] Push to repository

## Useful Commands

```bash
# Install dependencies
npm install

# Build everything
npm run compile && npm run build:engine

# Watch TypeScript
npm run watch

# Package extension
npx vsce package

# Clean build
rm -rf out/ node_modules/ engine/target/
npm install
npm run compile
npm run build:engine

# Run Rust tests with output
cd engine
cargo test -- --nocapture

# Check Rust dependencies
cd engine
cargo tree
```

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Rust Book](https://doc.rust-lang.org/book/)
- [lightningcss Docs](https://lightningcss.dev/)
- [clap Documentation](https://docs.rs/clap/latest/clap/)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## Getting Help

- Check existing issues on GitHub
- Read the README.md
- Review example files in `examples/`
- Check console output for errors
