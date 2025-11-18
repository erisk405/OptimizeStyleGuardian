import * as vscode from "vscode";
import { ImportAnalysisIssue } from "../types";

export class ImportDecorator {
  private normalDecorationType: vscode.TextEditorDecorationType;
  private largeDecorationType: vscode.TextEditorDecorationType;
  private externalDecorationType: vscode.TextEditorDecorationType;
  private isEnabled: boolean = false;

  constructor() {
    // Normal import decoration (green)
    this.normalDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        fontStyle: "italic",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
      },
    });

    // Large import warning decoration (orange/yellow)
    this.largeDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        fontStyle: "italic",
        fontWeight: "bold",
        color: new vscode.ThemeColor("editorWarning.foreground"),
      },
    });

    // External package decoration (gray)
    this.externalDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0 0 1em",
        fontStyle: "italic",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
      },
    });
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public updateDecorations(
    editor: vscode.TextEditor,
    imports: ImportAnalysisIssue[],
    threshold: number,
  ) {
    if (!this.isEnabled || !editor) {
      return;
    }

    const normalDecorations: vscode.DecorationOptions[] = [];
    const largeDecorations: vscode.DecorationOptions[] = [];
    const externalDecorations: vscode.DecorationOptions[] = [];

    // Filter imports for current file
    const fileImports = imports.filter(
      (imp) =>
        this.normalizeFilePath(imp.file) ===
        this.normalizeFilePath(editor.document.uri.fsPath),
    );

    fileImports.forEach((imp) => {
      const line = imp.line - 1; // 0-indexed
      if (line < 0 || line >= editor.document.lineCount) {
        return;
      }

      const range = new vscode.Range(line, 0, line, 0);

      if (imp.sizeKb !== undefined && imp.sizeKb !== null) {
        // Has size information
        const sizeText = this.formatSize(imp.sizeKb);
        const contentText = ` 📦 ${sizeText}`;

        const decoration: vscode.DecorationOptions = {
          range,
          renderOptions: {
            after: {
              contentText,
            },
          },
          hoverMessage: this.createHoverMessage(imp),
        };

        if (imp.sizeKb > threshold) {
          largeDecorations.push(decoration);
        } else {
          normalDecorations.push(decoration);
        }
      } else if (!imp.source.startsWith(".")) {
        // External package without size
        const contentText = " 📦 external";

        const decoration: vscode.DecorationOptions = {
          range,
          renderOptions: {
            after: {
              contentText,
            },
          },
          hoverMessage: this.createHoverMessage(imp),
        };

        externalDecorations.push(decoration);
      }
    });

    editor.setDecorations(this.normalDecorationType, normalDecorations);
    editor.setDecorations(this.largeDecorationType, largeDecorations);
    editor.setDecorations(this.externalDecorationType, externalDecorations);
  }

  public clearDecorations(editor: vscode.TextEditor) {
    if (!editor) {
      return;
    }

    editor.setDecorations(this.normalDecorationType, []);
    editor.setDecorations(this.largeDecorationType, []);
    editor.setDecorations(this.externalDecorationType, []);
  }

  public clearAllDecorations() {
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.clearDecorations(editor);
    });
  }

  private formatSize(sizeKb: number): string {
    if (sizeKb < 1) {
      return `${Math.round(sizeKb * 1024)} B`;
    } else if (sizeKb >= 1024) {
      return `${(sizeKb / 1024).toFixed(1)} MB`;
    } else {
      return `${sizeKb.toFixed(1)} KB`;
    }
  }

  private createHoverMessage(imp: ImportAnalysisIssue): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### Import: \`${imp.source}\`\n\n`);

    if (imp.sizeKb !== undefined && imp.sizeKb !== null) {
      md.appendMarkdown(`**Size:** ${this.formatSize(imp.sizeKb)}\n\n`);
    } else {
      md.appendMarkdown("**Size:** Not calculated (external package)\n\n");
    }

    if (imp.importedItems && imp.importedItems.length > 0) {
      md.appendMarkdown("**Imported items:**\n");
      imp.importedItems.forEach((item) => {
        md.appendMarkdown(`- \`${item}\`\n`);
      });
      md.appendMarkdown("\n");
    }

    if (imp.resolvedPath) {
      md.appendMarkdown(`**Resolved path:** \`${imp.resolvedPath}\`\n\n`);
    }

    if (imp.message) {
      md.appendMarkdown(`*${imp.message}*\n\n`);
    }

    md.appendMarkdown(
      "---\n\n💡 *Right-click and select 'Go5: Check Import Size' for more details*",
    );

    return md;
  }

  private normalizeFilePath(path: string): string {
    return path.replace(/\\/g, "/").toLowerCase();
  }

  public dispose() {
    this.normalDecorationType.dispose();
    this.largeDecorationType.dispose();
    this.externalDecorationType.dispose();
  }
}
