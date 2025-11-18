import * as vscode from "vscode";
import * as path from "path";
import { AnalysisResult, ImportAnalysisIssue } from "../types";
import { IssueEnhancer } from "../services/issueEnhancer";
import { AnthropicService } from "../services/anthropicService";
import { ApiKeyManager } from "../config/apiKeyManager";

export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentResults: AnalysisResult | undefined;
  private issueEnhancer: IssueEnhancer | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private apiKeyManager: ApiKeyManager,
  ) {}

  public showPanel() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      this.createPanel();
    }
  }

  public updateResults(results: AnalysisResult) {
    this.currentResults = results;
    console.log("[PanelManager] Updating results:", {
      duplicates: results.duplicates?.length || 0,
      designSystem: results.designSystem?.length || 0,
      performance: results.performance?.length || 0,
      imports: results.imports?.length || 0,
    });

    if (this.panel) {
      console.log("[PanelManager] Sending results to webview");
      this.panel.webview.postMessage({
        type: "updateResults",
        data: results,
      });
    } else {
      console.log("[PanelManager] No panel to update");
    }
  }

  private createPanel() {
    this.panel = vscode.window.createWebviewPanel(
      "go5StyleGuardian",
      "Go5 Style Guardian",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, "media")),
        ],
      },
    );

    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "goToCode":
            this.goToCode(message.file, message.line, message.column);
            break;
          case "applyFix":
            this.applyFix(message.issueId, message.fixType);
            break;
          case "applyAiFix":
            this.applyAiFix(
              message.file,
              message.startLine,
              message.endLine,
              message.suggestedCode,
            );
            break;
          case "requestImportSuggestion":
            await this.requestImportSuggestion(message.importIndex);
            break;
          case "ready":
            // Webview is ready, send current results if available
            if (this.currentResults) {
              this.panel?.webview.postMessage({
                type: "updateResults",
                data: this.currentResults,
              });
            }
            break;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this.context.subscriptions,
    );

    // Send initial results if available
    if (this.currentResults) {
      setTimeout(() => {
        this.panel?.webview.postMessage({
          type: "updateResults",
          data: this.currentResults,
        });
      }, 100);
    }
  }

  private async goToCode(file: string, line: number, column?: number) {
    try {
      console.log("goToCode received:", { file, line, column });

      // Normalize the file path (remove double backslashes)
      const normalizedPath = file.replace(/\\\\/g, "\\");
      console.log("Normalized path:", normalizedPath);

      const document = await vscode.workspace.openTextDocument(normalizedPath);
      const editor = await vscode.window.showTextDocument(
        document,
        vscode.ViewColumn.One,
      );

      const position = new vscode.Position(
        Math.max(0, line - 1),
        column ? Math.max(0, column - 1) : 0,
      );
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter,
      );

      console.log("Successfully navigated to:", normalizedPath, "line:", line);
    } catch (error) {
      console.error("Error opening file:", error);
      vscode.window.showErrorMessage(
        `Could not open file: ${file}\nError: ${error}`,
      );
    }
  }

  private async applyFix(issueId: string, fixType: string) {
    // TODO: Implement auto-fix functionality
    vscode.window.showInformationMessage("Auto-fix feature coming soon!");
  }

  private async applyAiFix(
    file: string,
    startLine: number,
    endLine: number,
    suggestedCode: string,
  ) {
    try {
      console.log("Applying AI fix:", { file, startLine, endLine });

      // Normalize the file path
      const normalizedPath = file.replace(/\\\\/g, "\\");

      // Open the document
      const document = await vscode.workspace.openTextDocument(normalizedPath);
      const editor = await vscode.window.showTextDocument(
        document,
        vscode.ViewColumn.One,
      );

      // Create edit
      const edit = new vscode.WorkspaceEdit();

      // Calculate range (lines are 0-indexed in VSCode API)
      const startPos = new vscode.Position(Math.max(0, startLine - 1), 0);
      const endPos = new vscode.Position(
        Math.max(0, endLine - 1),
        document.lineAt(Math.max(0, endLine - 1)).text.length,
      );
      const range = new vscode.Range(startPos, endPos);

      // Replace the range with suggested code
      edit.replace(document.uri, range, suggestedCode);

      // Apply the edit
      const success = await vscode.workspace.applyEdit(edit);

      if (success) {
        // Show success message
        vscode.window.showInformationMessage(
          "✓ AI suggestion applied successfully!",
        );

        // Move cursor to the changed location
        const newPosition = new vscode.Position(Math.max(0, startLine - 1), 0);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(
          new vscode.Range(newPosition, newPosition),
          vscode.TextEditorRevealType.InCenter,
        );
      } else {
        vscode.window.showErrorMessage("Failed to apply AI suggestion");
      }
    } catch (error) {
      console.error("Error applying AI fix:", error);
      vscode.window.showErrorMessage(
        `Failed to apply AI fix: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async requestImportSuggestion(importIndex: number) {
    try {
      console.log("Requesting AI suggestion for import:", importIndex);

      if (!this.currentResults || !this.currentResults.imports) {
        vscode.window.showErrorMessage("No import data available");
        return;
      }

      const importIssue = this.currentResults.imports[importIndex];
      if (!importIssue) {
        vscode.window.showErrorMessage("Import not found");
        return;
      }

      // Get workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Initialize IssueEnhancer if needed
      if (!this.issueEnhancer) {
        const apiKey = await this.apiKeyManager.getApiKey();

        if (!apiKey) {
          vscode.window.showErrorMessage(
            "Please set your Anthropic API key first. Use: Go5 Style Guardian: Configure API Key",
          );
          return;
        }

        const config = vscode.workspace.getConfiguration("go5StyleGuardian");
        const aiModel = config.get<string>(
          "aiModel",
          "claude-sonnet-4-5-20250929",
        );
        const maxIssues = config.get<number>("aiMaxIssuesPerScan", 10);
        const contextLines = config.get<number>("aiContextLines", 5);

        const anthropicService = new AnthropicService(apiKey, aiModel);
        this.issueEnhancer = new IssueEnhancer(
          anthropicService,
          maxIssues,
          contextLines,
        );
      }

      // Request AI suggestion
      vscode.window.showInformationMessage("🤖 Requesting AI suggestion...");

      const suggestion = await this.issueEnhancer.enhanceImportIssue(
        importIssue,
        workspaceRoot,
      );

      if (suggestion) {
        // Update the import with the suggestion
        importIssue.aiSuggestion = suggestion;

        // Update the results and refresh the webview
        this.currentResults.imports[importIndex] = importIssue;

        if (this.panel) {
          this.panel.webview.postMessage({
            type: "updateResults",
            data: this.currentResults,
          });
        }

        vscode.window.showInformationMessage("✓ AI suggestion received!");
      } else {
        vscode.window.showWarningMessage("Could not generate AI suggestion");
      }
    } catch (error) {
      console.error("Error requesting AI suggestion:", error);
      vscode.window.showErrorMessage(
        `Failed to get AI suggestion: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Go5 Style Guardian</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 13px;
            color: #e1e1e1;
            background: #0a0a0a;
            padding: 20px;
            line-height: 1.5;
        }

        h1 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #ffffff;
            letter-spacing: -0.3px;
        }

        .tabs {
            display: flex;
            gap: 0;
            margin-bottom: 16px;
            border-bottom: 1px solid #2a2a2a;
        }

        .tab {
            padding: 8px 16px;
            cursor: pointer;
            background: transparent;
            border: none;
            color: #888888;
            font-size: 13px;
            font-weight: 500;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .tab:hover {
            color: #e1e1e1;
        }

        .tab.active {
            color: #ffffff;
            border-bottom-color: #ffffff;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .summary {
            background: #141414;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            display: flex;
            gap: 32px;
            flex-wrap: wrap;
            border: 1px solid #2a2a2a;
        }

        .summary-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .summary-label {
            font-size: 11px;
            color: #888888;
            font-weight: 500;
        }

        .summary-value {
            font-size: 24px;
            font-weight: 600;
            color: #ffffff;
        }

        .summary-value.critical {
            color: #ef4444;
        }

        .summary-value.warning {
            color: #f59e0b;
        }

        .issue-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .issue-card {
            background: #141414;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #2a2a2a;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .issue-card:hover {
            border-color: #3a3a3a;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
            transform: translateY(-1px);
        }

        .issue-card.critical {
            border-left: 3px solid #ef4444;
        }

        .issue-card.warning {
            border-left: 3px solid #f59e0b;
        }

        .issue-card.info {
            border-left: 3px solid #6366f1;
        }

        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
            gap: 12px;
        }

        .issue-title {
            font-weight: 500;
            font-size: 13px;
            color: #ffffff;
            line-height: 1.5;
            flex: 1;
        }

        .severity-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .severity-badge.critical {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }

        .severity-badge.warning {
            background: rgba(245, 158, 11, 0.15);
            color: #f59e0b;
        }

        .severity-badge.info {
            background: rgba(99, 102, 241, 0.15);
            color: #6366f1;
        }

        .size-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
            margin-left: 8px;
        }

        .size-badge.external {
            background: rgba(148, 163, 184, 0.15);
            color: #94a3b8;
        }

        .issue-details {
            font-size: 12px;
            margin-bottom: 8px;
            color: #a1a1a1;
            line-height: 1.5;
        }

        .issue-location {
            font-size: 11px;
            color: #6b7280;
            margin-bottom: 12px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .issue-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .btn {
            padding: 6px 12px;
            border: 1px solid #2a2a2a;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
            background: transparent;
        }

        .btn:hover {
            border-color: #3a3a3a;
            background: #1a1a1a;
        }

        .btn-primary {
            color: #ffffff;
        }

        .btn-secondary {
            color: #a1a1a1;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #6b7280;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.4;
        }

        /* AI Suggestion Styles */
        .ai-suggestion-panel {
            margin-top: 16px;
            padding: 20px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.03) 0%, rgba(139, 92, 246, 0.03) 100%);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);
        }

        .ai-suggestion-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(99, 102, 241, 0.1);
        }

        .ai-badge {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: #ffffff;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
        }

        .ai-badge::before {
            content: "⚡";
            font-size: 14px;
        }

        .confidence-badge {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .confidence-high {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
        }

        .confidence-medium {
            background: rgba(245, 158, 11, 0.15);
            color: #f59e0b;
        }

        .confidence-low {
            background: rgba(156, 163, 175, 0.15);
            color: #9ca3af;
        }

        .ai-explanation {
            margin: 12px 0;
            color: #e1e1e1;
            line-height: 1.6;
        }

        .code-diff {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin: 12px 0;
        }

        .code-section {
            display: flex;
            flex-direction: column;
        }

        .code-label {
            font-size: 10px;
            font-weight: 500;
            color: #888888;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .code-block {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 12px;
            margin: 0;
            overflow-x: auto;
            font-size: 12px;
            line-height: 1.6;
        }

        .code-block code {
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Menlo', 'Consolas', monospace;
            color: #e1e1e1;
        }

        /* Syntax highlighting - GitHub Dark theme */
        .code-block .keyword { color: #ff7b72; }
        .code-block .string { color: #a5d6ff; }
        .code-block .function { color: #d2a8ff; }
        .code-block .variable { color: #ffa657; }
        .code-block .comment { color: #8b949e; }
        .code-block .operator { color: #ff7b72; }
        .code-block .punctuation { color: #c9d1d9; }

        .code-original {
            border-left: 3px solid #da3633;
            background: rgba(218, 54, 51, 0.05);
        }

        .code-suggested {
            border-left: 3px solid #3fb950;
            background: rgba(63, 185, 80, 0.05);
        }

        .ai-reasoning {
            margin: 12px 0;
            padding: 10px;
            background: rgba(0, 0, 0, 0.2);
            border-left: 3px solid #6366f1;
            color: #a1a1a1;
            font-size: 12px;
            line-height: 1.6;
        }

        .alternative-package {
            margin: 12px 0;
            padding: 8px 12px;
            background: rgba(245, 158, 11, 0.1);
            border-radius: 4px;
            color: #f59e0b;
            font-size: 12px;
        }

        .alternative-package code {
            background: rgba(245, 158, 11, 0.2);
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 600;
        }

        .ai-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        .ai-suggestion-request {
            margin-top: 12px;
            text-align: center;
        }

        /* Usage Context Styles */
        .usage-context {
            margin: 12px 0;
            padding: 12px;
            background: rgba(99, 102, 241, 0.05);
            border-radius: 8px;
            border: 1px solid rgba(99, 102, 241, 0.1);
        }

        .usage-header {
            font-size: 11px;
            font-weight: 600;
            color: #8b949e;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .usage-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            padding: 8px;
            background: #141414;
            border-radius: 6px;
        }

        .usage-item.unused {
            border-left: 3px solid #f59e0b;
        }

        .usage-name {
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 12px;
            color: #e1e1e1;
            font-weight: 600;
        }

        .usage-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
        }

        .usage-badge.used {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
        }

        .usage-badge.unused {
            background: rgba(245, 158, 11, 0.15);
            color: #f59e0b;
        }

        .usage-examples {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-top: 8px;
            width: 100%;
        }

        .usage-code {
            font-size: 11px;
            padding: 4px 8px;
            background: #0d1117;
            border-left: 2px solid #6366f1;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, monospace;
        }

        .usage-more {
            font-size: 10px;
            color: #8b949e;
            font-style: italic;
        }

        /* Comparison Table Styles */
        .comparison-table {
            margin: 16px 0;
            border: 1px solid #2a2a2a;
            border-radius: 8px;
            overflow: hidden;
        }

        .comparison-header,
        .comparison-row {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 12px;
            padding: 12px;
        }

        .comparison-header {
            background: #1a1a1a;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            color: #8b949e;
            letter-spacing: 0.5px;
        }

        .comparison-row {
            border-top: 1px solid #2a2a2a;
        }

        .comparison-row.highlight {
            background: rgba(34, 197, 94, 0.05);
        }

        .col-after.savings {
            color: #22c55e;
            font-weight: 600;
        }

        /* Action Links Styles */
        .action-links {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #2a2a2a;
            flex-wrap: wrap;
        }

        .action-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 6px;
            color: #6366f1;
            text-decoration: none;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .action-link:hover {
            background: #2a2a2a;
            border-color: #6366f1;
            transform: translateY(-1px);
        }

        .btn-ai {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: #ffffff;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .btn-ai:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
        }

        .btn-ai:active {
            transform: translateY(0);
        }

        .btn-ai:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .ai-icon {
            font-size: 16px;
            animation: pulse-ai 2s ease-in-out infinite;
        }

        @keyframes pulse-ai {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }

        .empty-state-text {
            font-size: 13px;
            color: #888888;
        }

        code {
            background: #1a1a1a;
            color: #e1e1e1;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
            border: 1px solid #2a2a2a;
        }

        /* AI Suggestion Styles */
        .ai-suggestion {
            margin-top: 12px;
            padding: 12px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 6px;
        }

        .ai-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 500;
            color: #ffffff;
            margin-bottom: 8px;
        }

        .ai-explanation {
            font-size: 12px;
            margin-bottom: 12px;
            line-height: 1.5;
            color: #a1a1a1;
        }

        .code-diff {
            margin: 12px 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .code-block {
            background: #0a0a0a;
            border: 1px solid #2a2a2a;
            border-radius: 6px;
            padding: 10px;
        }

        .code-block .label {
            display: block;
            font-size: 10px;
            font-weight: 500;
            margin-bottom: 6px;
            color: #888888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .code-block.before .label {
            color: #ef4444;
        }

        .code-block.after .label {
            color: #10b981;
        }

        .code-block pre {
            margin: 0;
            padding: 0;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
            color: #e1e1e1;
        }

        .ai-reasoning {
            font-size: 11px;
            color: #888888;
            margin-top: 8px;
            font-style: italic;
        }

        .confidence-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 500;
            margin-left: 6px;
        }

        .confidence-badge.high {
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
        }

        .confidence-badge.medium {
            background: rgba(245, 158, 11, 0.15);
            color: #f59e0b;
        }

        .confidence-badge.low {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }
    </style>
</head>
<body>
    <h1>🛡️ Go5 Style Guardian</h1>

    <div id="summary" class="summary" style="display: none;">
        <div class="summary-item">
            <span class="summary-label">Total Issues</span>
            <span class="summary-value" id="totalIssues">0</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Critical</span>
            <span class="summary-value critical" id="criticalCount">0</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Warnings</span>
            <span class="summary-value warning" id="warningCount">0</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Files Scanned</span>
            <span class="summary-value" id="filesScanned">0</span>
        </div>
    </div>

    <div class="tabs">
        <button class="tab active" data-tab="style-health">Style Health</button>
        <button class="tab" data-tab="design-system">Design System</button>
        <button class="tab" data-tab="performance">Performance</button>
        <button class="tab" data-tab="imports">Imports</button>
    </div>

    <div id="style-health" class="tab-content active">
        <div class="empty-state">
            <div class="empty-state-icon">🎨</div>
            <div class="empty-state-text">Run a scan to see style health issues</div>
        </div>
    </div>

    <div id="design-system" class="tab-content">
        <div class="empty-state">
            <div class="empty-state-icon">📐</div>
            <div class="empty-state-text">Run a scan to see design system recommendations</div>
        </div>
    </div>

    <div id="performance" class="tab-content">
        <div class="empty-state">
            <div class="empty-state-icon">⚡</div>
            <div class="empty-state-text">Run a scan to see performance issues</div>
        </div>
    </div>

    <div id="imports" class="tab-content">
        <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <div class="empty-state-text">Run a scan to see import analysis</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[Webview] Received message:', message.type);

            if (message.type === 'updateResults') {
                console.log('[Webview] updateResults message received with data:', message.data);
                try {
                    updateResults(message.data);
                    console.log('[Webview] updateResults completed successfully');
                } catch (error) {
                    console.error('[Webview] Error in updateResults:', error);
                }
            }
        });

        function updateResults(results) {
            console.log('Received results:', results);
            console.log('Imports data:', results.imports);

            // Update summary
            document.getElementById('summary').style.display = 'flex';
            document.getElementById('totalIssues').textContent = results.summary.totalIssues;
            document.getElementById('criticalCount').textContent = results.summary.criticalCount;
            document.getElementById('warningCount').textContent = results.summary.warningCount;
            document.getElementById('filesScanned').textContent = results.summary.totalFiles;

            // Update each tab
            updateStyleHealthTab(results.duplicates);
            updateDesignSystemTab(results.designSystem);
            updatePerformanceTab(results.performance);
            updateImportsTab(results.imports || []);
        }

        function updateStyleHealthTab(issues) {
            const container = document.getElementById('style-health');
            if (issues.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No duplicate styles found!</div></div>';
                return;
            }

            container.innerHTML = '<div class="issue-list">' + issues.map(issue =>
                createIssueCard({
                    severity: issue.severity,
                    title: getStyleIssueTitle(issue),
                    details: getStyleIssueDetails(issue),
                    file: issue.file,
                    line: issue.line,
                    column: issue.column,
                    aiSuggestion: issue.aiSuggestion
                })
            ).join('') + '</div>';
        }

        function updateDesignSystemTab(issues) {
            const container = document.getElementById('design-system');
            if (issues.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">Design system compliance looks good!</div></div>';
                return;
            }

            container.innerHTML = '<div class="issue-list">' + issues.map(issue =>
                createIssueCard({
                    severity: issue.severity,
                    title: getDesignSystemIssueTitle(issue),
                    details: issue.reason,
                    file: issue.file,
                    line: issue.line,
                    column: issue.column,
                    suggestion: issue.suggested,
                    aiSuggestion: issue.aiSuggestion
                })
            ).join('') + '</div>';
        }

        function updatePerformanceTab(issues) {
            const container = document.getElementById('performance');
            if (issues.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No performance issues detected!</div></div>';
                return;
            }

            container.innerHTML = '<div class="issue-list">' + issues.map(issue =>
                createIssueCard({
                    severity: issue.severity,
                    title: issue.message,
                    details: issue.recommendation,
                    file: issue.file,
                    line: issue.line,
                    column: issue.column,
                    aiSuggestion: issue.aiSuggestion
                })
            ).join('') + '</div>';
        }

        function updateImportsTab(issues) {
            console.log('updateImportsTab called with:', issues);
            const container = document.getElementById('imports');
            currentImports = issues; // Store for AI suggestion requests

            if (!issues || issues.length === 0) {
                console.log('No imports found, showing empty state');
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No imports found or all imports are optimal!</div></div>';
                return;
            }
            console.log('Processing', issues.length, 'imports');

            container.innerHTML = '<div class="issue-list">' + issues.map((issue, index) => {
                const sizeInfo = issue.sizeKb !== undefined && issue.sizeKb !== null
                    ? '<span class="size-badge">' + issue.sizeKb + ' KB</span>'
                    : '<span class="size-badge external">External Package</span>';

                const importedItemsText = issue.importedItems.join(', ');

                const title = 'Import from <code>' + escapeHtml(issue.source) + '</code> ' + sizeInfo;
                const details = 'Imported items: <strong>' + escapeHtml(importedItemsText) + '</strong>';

                return createImportCard({
                    issue: issue,
                    index: index,
                    severity: issue.severity,
                    title: title,
                    details: details,
                    file: issue.file,
                    line: issue.line
                });
            }).join('') + '</div>';
        }

        function createImportCard(data) {
            const { issue, index, severity, title, details, file, line } = data;

            const severityClass = severity === 'warning' ? 'warning' : severity === 'error' ? 'critical' : 'info';

            let aiSuggestionHtml = '';
            if (issue.aiSuggestion) {
                const suggestion = issue.aiSuggestion;
                const typeLabel = suggestion.optimizationType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                const savingsText = suggestion.potentialSavings
                    ? ' (Save ~' + suggestion.potentialSavings + ' KB)'
                    : '';

                aiSuggestionHtml = '<div class="ai-suggestion-panel">' +
                    '<div class="ai-suggestion-header">' +
                        '<span class="ai-badge">🤖 AI Suggestion: ' + typeLabel + savingsText + '</span>' +
                        '<span class="confidence-badge confidence-' + suggestion.confidence + '">' + suggestion.confidence + ' confidence</span>' +
                    '</div>' +
                    '<div class="ai-explanation">' + escapeHtml(suggestion.explanation) + '</div>' +
                    '<div class="code-diff">' +
                        '<div class="code-section">' +
                            '<div class="code-label">Current:</div>' +
                            '<pre class="code-block code-original"><code>' + highlightCode(suggestion.codeChange.original) + '</code></pre>' +
                        '</div>' +
                        '<div class="code-section">' +
                            '<div class="code-label">Suggested:</div>' +
                            '<pre class="code-block code-suggested"><code>' + highlightCode(suggestion.codeChange.suggested) + '</code></pre>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ai-reasoning"><strong>Why:</strong> ' + escapeHtml(suggestion.reasoning) + '</div>' +
                    (suggestion.alternativePackage ? '<div class="alternative-package">💡 Alternative: <code>' + escapeHtml(suggestion.alternativePackage) + '</code></div>' : '') +
                    (suggestion.potentialSavings && issue.sizeKb ?
                        '<div class="comparison-table">' +
                            '<div class="comparison-header">' +
                                '<div class="col-label">Metric</div>' +
                                '<div class="col-before">Current</div>' +
                                '<div class="col-after">After Optimization</div>' +
                            '</div>' +
                            '<div class="comparison-row">' +
                                '<div class="col-label">Bundle Size</div>' +
                                '<div class="col-before">' + issue.sizeKb + ' KB</div>' +
                                '<div class="col-after">' + (issue.sizeKb - suggestion.potentialSavings) + ' KB</div>' +
                            '</div>' +
                            '<div class="comparison-row highlight">' +
                                '<div class="col-label">Savings</div>' +
                                '<div class="col-before">-</div>' +
                                '<div class="col-after savings">-' + suggestion.potentialSavings + ' KB (' + Math.round((suggestion.potentialSavings / issue.sizeKb) * 100) + '%)</div>' +
                            '</div>' +
                        '</div>'
                    : '') +
                    '<div class="ai-actions">' +
                        '<button class="btn btn-primary" onclick="applyImportSuggestion(' + index + ')">Apply Suggestion</button>' +
                        '<button class="btn" onclick="copyImportSuggestion(' + index + ')">📋 Copy Code</button>' +
                        '<button class="btn" onclick="learnMoreAbout(' + index + ')">🔍 Learn More</button>' +
                        '<button class="btn" onclick="dismissSuggestion(' + index + ')">Dismiss</button>' +
                    '</div>' +
                '</div>';
            } else {
                // Show button to request AI suggestion
                aiSuggestionHtml = '<div class="ai-suggestion-request">' +
                    '<button class="btn btn-ai" onclick="requestImportSuggestion(' + index + ')" id="suggest-btn-' + index + '">' +
                        '<span class="ai-icon">⚡</span>' +
                        '<span>Get AI Suggestion</span>' +
                    '</button>' +
                '</div>';
            }

            // Create usage context display
            let usageHtml = '';
            if (issue.usageContext) {
                const usageItems = [];
                for (const [itemName, usages] of Object.entries(issue.usageContext)) {
                    const isUnused = !usages || usages.length === 0;
                    const usageClass = isUnused ? 'unused' : '';

                    let itemHtml = '<div class="usage-item ' + usageClass + '">';
                    itemHtml += '<span class="usage-name">' + escapeHtml(itemName) + '</span>';

                    if (isUnused) {
                        itemHtml += '<span class="usage-badge unused">Not Used</span>';
                    } else {
                        itemHtml += '<span class="usage-badge used">' + usages.length + '×</span>';
                        itemHtml += '<div class="usage-examples">';

                        // Show first 3 usages
                        const usageCodes = usages.slice(0, 3).map(function(usage) {
                            return '<code class="usage-code">Line ' + usage.line + ': ' + escapeHtml(usage.code_snippet) + '</code>';
                        }).join('');
                        itemHtml += usageCodes;

                        if (usages.length > 3) {
                            itemHtml += '<span class="usage-more">+' + (usages.length - 3) + ' more usage(s)</span>';
                        }

                        itemHtml += '</div>';
                    }

                    itemHtml += '</div>';
                    usageItems.push(itemHtml);
                }

                usageHtml = '<div class="usage-context">' +
                    '<div class="usage-header">📦 Usage in this file:</div>' +
                    usageItems.join('') +
                    '</div>';
            }

            // Create documentation links
            const packageName = issue.source.replace(/^['"]|['"]$/g, '').split('/')[0].replace('@', '');
            const linksHtml = '<div class="action-links">' +
                '<a href="https://bundlephobia.com/package/' + encodeURIComponent(issue.source) + '" target="_blank" class="action-link">' +
                    '📊 Bundle Size' +
                '</a>' +
                '<a href="https://www.npmjs.com/package/' + encodeURIComponent(issue.source) + '" target="_blank" class="action-link">' +
                    '📦 NPM Page' +
                '</a>' +
                '<a href="https://www.google.com/search?q=' + encodeURIComponent(issue.source + ' documentation') + '" target="_blank" class="action-link">' +
                    '📚 Documentation' +
                '</a>' +
            '</div>';

            // Escape file path for safe attribute usage
            const safeFile = file.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");

            return '<div class="issue-card ' + severityClass + '" data-import-index="' + index + '">' +
                '<div class="issue-header">' +
                    '<div class="issue-title">' + title + '</div>' +
                    '<span class="severity-badge ' + severityClass + '">' + severity + '</span>' +
                '</div>' +
                '<div class="issue-details">' + details + '</div>' +
                '<div class="issue-location">' + escapeHtml(file) + ':' + line + '</div>' +
                usageHtml +
                '<div class="issue-actions">' +
                    '<button class="btn btn-secondary" onclick="goToCode(\'' + safeFile + '\', ' + line + ')">📍 Go to Code</button>' +
                '</div>' +
                linksHtml +
                aiSuggestionHtml +
            '</div>';
        }

        function escapeHtml(text) {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function highlightCode(code) {
            if (!code) return '';

            // Escape HTML first
            let highlighted = escapeHtml(code);

            // Highlight keywords (import, from, const, let, var, export, default, etc.)
            highlighted = highlighted.replace(
                /\b(import|from|const|let|var|export|default|async|await|function|return|if|else|for|while|class|extends|new|this|super)\b/g,
                '<span class="keyword">$1</span>'
            );

            // Highlight strings ('...' or "..." or \`...\`)
            highlighted = highlighted.replace(
                /(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1/g,
                '<span class="string">$1$2$1</span>'
            );

            // Highlight function names (word followed by ()
            highlighted = highlighted.replace(
                /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
                '<span class="function">$1</span>('
            );

            // Highlight component names (PascalCase)
            highlighted = highlighted.replace(
                /\b([A-Z][a-zA-Z0-9_]*)\b/g,
                '<span class="variable">$1</span>'
            );

            // Highlight comments
            highlighted = highlighted.replace(
                /(\/\/.*$)/gm,
                '<span class="comment">$1</span>'
            );

            return highlighted;
        }

        function getStyleIssueTitle(issue) {
            switch (issue.type) {
                case 'identical_classes':
                    return 'Identical class: <code>' + escapeHtml(issue.class) + '</code> = <code>' + escapeHtml(issue.duplicateOf) + '</code>';
                case 'similar_classes':
                    return 'Similar classes: <code>' + escapeHtml(issue.class) + '</code> ~ <code>' + escapeHtml(issue.duplicateOf) + '</code> (' + issue.similarity + '% match)';
                case 'inline_style_duplicate':
                    return 'Inline style matches existing class <code>' + escapeHtml(issue.duplicateOf) + '</code>';
                default:
                    return 'Unknown issue';
            }
        }

        function getStyleIssueDetails(issue) {
            if (issue.properties && issue.properties.length > 0) {
                return 'Matching properties: ' + issue.properties.join(', ');
            }
            return 'Consider using the existing class to reduce duplication.';
        }

        function getDesignSystemIssueTitle(issue) {
            switch (issue.type) {
                case 'component_replacement':
                    return 'Replace <code>' + escapeHtml(issue.current) + '</code> with <code>' + escapeHtml(issue.suggested) + '</code>';
                case 'class_replacement':
                    return 'Use design system class <code>' + escapeHtml(issue.suggested) + '</code>';
                case 'color_token':
                    return 'Use color token instead of <code>' + escapeHtml(issue.current) + '</code>';
                case 'spacing_token':
                    return 'Use spacing token instead of <code>' + escapeHtml(issue.current) + '</code>';
                default:
                    return 'Design system recommendation';
            }
        }

        function createIssueCard(issue) {
            const displayFile = issue.file.replace(/\\\\/g, '\\\\');
            const fileAttr = issue.file.replace(/"/g, '&quot;').replace(/\\\\/g, '\\\\');
            const fixButton = issue.suggestion ? '<button class="btn btn-secondary" data-action="fix">🔧 Apply Fix</button>' : '';

            // AI Suggestion section
            let aiSuggestionHtml = '';
            if (issue.aiSuggestion) {
                const ai = issue.aiSuggestion;
                const confidenceBadge = '<span class="confidence-badge ' + ai.confidence + '">' + ai.confidence.toUpperCase() + '</span>';

                aiSuggestionHtml = '<div class="ai-suggestion">' +
                    '<div class="ai-badge">✨ AI Suggestion' + confidenceBadge + '</div>' +
                    '<div class="ai-explanation">' + escapeHtml(ai.explanation) + '</div>' +
                    '<div class="code-diff">' +
                    '<div class="code-block before">' +
                    '<span class="label">❌ Current Code:</span>' +
                    '<pre>' + escapeHtml(ai.codeChange.original) + '</pre>' +
                    '</div>' +
                    '<div class="code-block after">' +
                    '<span class="label">✅ Suggested Code:</span>' +
                    '<pre>' + escapeHtml(ai.codeChange.suggested) + '</pre>' +
                    '</div>' +
                    '</div>' +
                    '<div class="ai-reasoning">💡 ' + escapeHtml(ai.reasoning) + '</div>' +
                    '<button class="btn btn-primary" data-action="apply-ai" data-file="' + fileAttr + '" ' +
                    'data-start-line="' + ai.codeChange.startLine + '" ' +
                    'data-end-line="' + ai.codeChange.endLine + '" ' +
                    'data-suggested-code="' + escapeHtml(ai.codeChange.suggested).replace(/"/g, '&quot;') + '">' +
                    '⚡ Apply AI Fix' +
                    '</button>' +
                    '</div>';
            }

            return '<div class="issue-card ' + issue.severity + '">' +
                '<div class="issue-header">' +
                '<div class="issue-title">' + issue.title + '</div>' +
                '<span class="severity-badge ' + issue.severity + '">' + issue.severity + '</span>' +
                '</div>' +
                '<div class="issue-details">' + issue.details + '</div>' +
                '<div class="issue-location">' + displayFile + ':' + (issue.line || '?') + (issue.column ? ':' + issue.column : '') + '</div>' +
                '<div class="issue-actions">' +
                '<button class="btn btn-primary" data-action="goto" data-file="' + fileAttr + '" data-line="' + (issue.line || 0) + '" data-column="' + (issue.column || 0) + '">' +
                '🔍 Go to Code' +
                '</button>' +
                fixButton +
                '</div>' +
                aiSuggestionHtml +
                '</div>';
        }

        // Store current imports for AI suggestion requests
        let currentImports = [];

        function requestImportSuggestion(index) {
            const btn = document.getElementById('suggest-btn-' + index);
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Requesting AI Suggestion...';
            }

            vscode.postMessage({
                type: 'requestImportSuggestion',
                importIndex: index
            });
        }

        function applyImportSuggestion(index) {
            const issue = currentImports[index];
            if (!issue || !issue.aiSuggestion) return;

            const suggestion = issue.aiSuggestion;

            vscode.postMessage({
                type: 'applyAiFix',
                file: issue.file,
                startLine: suggestion.codeChange.startLine,
                endLine: suggestion.codeChange.endLine,
                suggestedCode: suggestion.codeChange.suggested
            });
        }

        function copyImportSuggestion(index) {
            const issue = currentImports[index];
            if (!issue || !issue.aiSuggestion) return;

            const suggestedCode = issue.aiSuggestion.codeChange.suggested;

            // Use modern clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(suggestedCode).then(() => {
                    // Visual feedback
                    const btn = event.target.closest('button');
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '✓ Copied!';
                    btn.style.background = '#22c55e';

                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.style.background = '';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
        }

        function learnMoreAbout(index) {
            const issue = currentImports[index];
            if (!issue) return;

            let searchQuery = issue.source;
            const alternativePackage = issue.aiSuggestion && issue.aiSuggestion.alternativePackage;

            if (alternativePackage) {
                searchQuery = alternativePackage + ' vs ' + issue.source + ' bundle size comparison';
            } else {
                searchQuery = 'optimize ' + issue.source + ' bundle size';
            }

            const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(searchQuery);
            window.open(searchUrl, '_blank');
        }

        function dismissSuggestion(index) {
            const card = document.querySelector('[data-import-index="' + index + '"]');
            if (card) {
                const suggestionPanel = card.querySelector('.ai-suggestion-panel');
                if (suggestionPanel) {
                    suggestionPanel.style.display = 'none';
                }
            }
        }

        function goToCode(file, line, column) {
            vscode.postMessage({
                type: 'goToCode',
                file: file,
                line: line,
                column: column || 0
            });
        }

        function attachEventListeners() {
            document.addEventListener('click', function(e) {
                const target = e.target;
                if (target.tagName === 'BUTTON' && target.dataset.action === 'goto') {
                    const file = target.dataset.file;
                    const line = parseInt(target.dataset.line) || 0;
                    const column = parseInt(target.dataset.column) || 0;

                    console.log('Go to Code clicked:', { file, line, column });

                    vscode.postMessage({
                        type: 'goToCode',
                        file: file,
                        line: line,
                        column: column
                    });
                }

                if (target.tagName === 'BUTTON' && target.dataset.action === 'fix') {
                    console.log('Apply Fix clicked');
                    vscode.postMessage({
                        type: 'applyFix'
                    });
                }

                if (target.tagName === 'BUTTON' && target.dataset.action === 'apply-ai') {
                    const file = target.dataset.file;
                    const startLine = parseInt(target.dataset.startLine) || 0;
                    const endLine = parseInt(target.dataset.endLine) || 0;
                    const suggestedCode = target.dataset.suggestedCode;

                    console.log('Apply AI Fix clicked:', { file, startLine, endLine });

                    vscode.postMessage({
                        type: 'applyAiFix',
                        file: file,
                        startLine: startLine,
                        endLine: endLine,
                        suggestedCode: suggestedCode
                    });
                }
            });
        }

        // Initialize event listeners on load
        attachEventListeners();

        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
  }
}
