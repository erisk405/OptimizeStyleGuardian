import * as vscode from "vscode";
import * as path from "path";
import { RustBridge } from "../rustBridge";
import { ImportDecorator } from "../decorations/importDecorator";
import { AnalysisResult, ImportAnalysisIssue } from "../types";

export class ImportCommand {
  constructor(
    private context: vscode.ExtensionContext,
    private rustBridge: RustBridge,
    private importDecorator: ImportDecorator,
  ) {}

  async checkImportAtCursor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const lineText = line.text.trim();

    // Check if line contains an import
    const isImport =
      lineText.match(/^import\s+/) ||
      lineText.match(/require\s*\(/) ||
      lineText.match(/^from\s+/);

    if (!isImport) {
      vscode.window.showInformationMessage(
        "Place cursor on an import statement to check its size",
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing import...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const result = await this.analyzeCurrentFile();

          // Find import at current line (1-indexed in result)
          const importAtLine = result.imports.find(
            (imp) => imp.line === position.line + 1,
          );

          if (importAtLine) {
            await this.showImportDetailsPanel(importAtLine);
          } else {
            vscode.window.showInformationMessage(
              "No import found at current line in analysis results",
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to analyze import: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  }

  async analyzeAllImports() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    // Check if file is TypeScript/JavaScript
    const ext = path.extname(editor.document.fileName);
    if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      vscode.window.showInformationMessage(
        "This command only works with TypeScript/JavaScript files",
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing all imports...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const result = await this.analyzeCurrentFile();

          // Update decorations
          const config = vscode.workspace.getConfiguration("go5StyleGuardian");
          const threshold = config.get("importSizeThreshold", 100);

          this.importDecorator.setEnabled(true);
          this.importDecorator.updateDecorations(
            editor,
            result.imports,
            threshold,
          );

          // Show summary
          const total = result.imports.length;
          const withSize = result.imports.filter(
            (i) => i.sizeKb !== undefined && i.sizeKb !== null,
          ).length;
          const large = result.imports.filter(
            (i) => i.sizeKb && i.sizeKb > threshold,
          ).length;
          const external = result.imports.filter(
            (i) => !i.source.startsWith("."),
          ).length;

          const message =
            `Found ${total} imports:\n` +
            `• ${withSize} with calculated size\n` +
            `• ${external} external packages\n` +
            `• ${large} exceed ${threshold} KB threshold`;

          vscode.window.showInformationMessage(message, "View Details").then((selection) => {
            if (selection === "View Details") {
              vscode.commands.executeCommand("go5StyleGuardian.openPanel");
            }
          });
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to analyze imports: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  }

  private async analyzeCurrentFile(): Promise<AnalysisResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("No active editor");
    }

    const filePath = editor.document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      editor.document.uri,
    );

    if (!workspaceFolder) {
      throw new Error("File is not part of a workspace");
    }

    const config = vscode.workspace.getConfiguration("go5StyleGuardian");

    // Call Rust bridge to analyze only imports
    const result = await this.rustBridge.analyze({
      paths: [filePath],
      workspaceRoot: workspaceFolder.uri.fsPath,
      enabledCategories: {
        duplicateStyles: false,
        designSystem: false,
        performance: false,
        importAnalysis: true,
      },
      excludePatterns: [],
    });

    return result;
  }

  private async showImportDetailsPanel(imp: ImportAnalysisIssue) {
    const panel = vscode.window.createWebviewPanel(
      "importDetails",
      `Import: ${imp.source}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: false,
      },
    );

    const sizeText = imp.sizeKb
      ? `${this.formatSize(imp.sizeKb)}`
      : "Not calculated (external package)";

    const itemsList = imp.importedItems
      .map((item) => `<li><code>${this.escapeHtml(item)}</code></li>`)
      .join("");

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Import Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        h1 {
            font-size: 24px;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .detail-row {
            margin: 15px 0;
        }
        .label {
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
            display: inline-block;
            width: 150px;
        }
        .value {
            color: var(--vscode-editor-foreground);
        }
        .size {
            font-size: 32px;
            font-weight: bold;
            color: ${imp.sizeKb && imp.sizeKb > 100 ? "var(--vscode-editorWarning-foreground)" : "var(--vscode-charts-green)"};
            margin: 20px 0;
        }
        code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        ul {
            list-style: none;
            padding-left: 0;
        }
        li {
            margin: 5px 0;
        }
        .message {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px 15px;
            margin: 20px 0;
            font-style: italic;
        }
    </style>
</head>
<body>
    <h1>📦 Import Analysis</h1>

    <div class="size">${this.escapeHtml(sizeText)}</div>

    <div class="detail-row">
        <span class="label">Source:</span>
        <span class="value"><code>${this.escapeHtml(imp.source)}</code></span>
    </div>

    <div class="detail-row">
        <span class="label">File:</span>
        <span class="value"><code>${this.escapeHtml(imp.file)}</code></span>
    </div>

    <div class="detail-row">
        <span class="label">Line:</span>
        <span class="value">${imp.line}</span>
    </div>

    ${imp.resolvedPath ? `
    <div class="detail-row">
        <span class="label">Resolved Path:</span>
        <span class="value"><code>${this.escapeHtml(imp.resolvedPath)}</code></span>
    </div>
    ` : ""}

    <div class="detail-row">
        <span class="label">Imported Items:</span>
        <div class="value">
            <ul>${itemsList}</ul>
        </div>
    </div>

    ${imp.message ? `
    <div class="message">${this.escapeHtml(imp.message)}</div>
    ` : ""}

    <div class="detail-row">
        <span class="label">Severity:</span>
        <span class="value">${this.escapeHtml(imp.severity)}</span>
    </div>
</body>
</html>`;
  }

  private formatSize(sizeKb: number): string {
    if (sizeKb < 1) {
      return `${Math.round(sizeKb * 1024)} B`;
    } else if (sizeKb >= 1024) {
      return `${(sizeKb / 1024).toFixed(2)} MB`;
    } else {
      return `${sizeKb.toFixed(1)} KB`;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
