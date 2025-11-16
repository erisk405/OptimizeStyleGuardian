# Changelog

All notable changes to the "Go5 Style Guardian" extension will be documented in this file.

## [0.1.0] - 2025-01-16

### 🎉 Initial Release

#### ✨ Features

**Duplicate Style Analyzer**
- Detect identical CSS classes (100% match)
- Detect similar CSS classes with configurable threshold (default 90%)
- Identify inline styles matching existing classes
- Show common properties between duplicate styles
- Configurable similarity threshold via settings

**Design System Enforcement**
- YAML-based design system configuration
- Component replacement suggestions (e.g., `<button>` → `<go5-button>`)
- Keyword-based component matching
- Color token validation (detect hardcoded colors)
- Spacing token validation (detect hardcoded spacing values)
- Typography token support

**Lighthouse Performance Tuning**
- JavaScript bundle size checking
- Large inline script detection
- CSS file size monitoring
- Expensive CSS selector detection
- Image lazy loading validation
- Missing image dimensions detection (CLS prevention)
- Synchronous script detection (render-blocking)
- Missing viewport meta tag detection
- Heavy component detection (mat-table, mat-icon)
- Excessive component usage warnings
- Large image file detection

**VS Code Integration**
- Four scan commands: Current File, Selected Folder, Workspace, Open Panel
- Context menu integration (right-click in Explorer)
- Interactive results panel with 3 tabs:
  - Style Health 🎨
  - Design System 📐
  - Performance ⚡
- "Go to Code" functionality (click to jump to issue location)
- Real-time issue severity badges (Critical, Warning, Info)
- Summary statistics dashboard

**Configuration**
- Customizable similarity threshold
- Configurable performance thresholds (JS, CSS, images)
- Enable/disable analysis categories
- Custom file patterns
- Exclude patterns support
- Custom design system config path

**Developer Experience**
- Fast Rust-powered engine (10-40x faster than Node.js)
- Respects .gitignore patterns
- Works with CSS, SCSS, HTML, JS, TS, JSX, TSX, Vue files
- JSON-based communication between extension and engine
- Detailed error messages and recommendations

#### 📦 Technical Details

- Built with TypeScript + Rust
- Uses lightningcss for CSS parsing
- Regex-based HTML parsing
- Child process architecture for engine isolation
- Supports Windows, macOS, and Linux

#### 🐛 Known Limitations

- CSS parser may not handle all edge cases
- HTML parser is regex-based (not a full DOM parser)
- Auto-fix functionality not yet implemented
- No real-time analysis (must run scan manually)

---

## Upcoming Features

### [0.2.0] - Planned

**Auto-Fix Capabilities**
- Auto-replace duplicate classes
- Auto-add lazy loading to images
- Auto-add dimensions to images
- Auto-replace native elements with DS components

**Enhanced Analysis**
- Unused CSS detection (cross-reference with templates)
- Dead code detection in JavaScript
- Real-time analysis as you type
- Incremental scanning (only changed files)

**UI Improvements**
- Diff preview for fixes
- Batch apply multiple fixes
- Filter and sort issues
- Export report (HTML, PDF)

**Framework Support**
- Better React component detection
- Vue SFC analysis
- Angular template improvements
- Svelte support

**CI/CD Integration**
- CLI-only mode for pipelines
- JSON report output
- Exit codes for build failures
- GitHub Actions integration

### Future Considerations

- Team-shared configuration presets
- Custom rule definitions (plugin system)
- Machine learning for pattern detection
- Integration with design tools (Figma, Sketch)
- Browser DevTools integration
- Remote design system config fetching

---

## Version History

- **0.1.0** (2025-01-16) - Initial release

---

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for contribution guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.
