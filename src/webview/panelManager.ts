import * as vscode from "vscode";
import * as path from "path";
import { AnalysisResult } from "../types";

export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentResults: AnalysisResult | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  public showPanel() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      this.createPanel();
    }
  }

  public updateResults(results: AnalysisResult) {
    this.currentResults = results;
    if (this.panel) {
      this.panel.webview.postMessage({
        type: "updateResults",
        data: results,
      });
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
      (message) => {
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
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }

        h1 {
            font-size: 24px;
            margin-bottom: 20px;
            color: var(--vscode-foreground);
        }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tab {
            padding: 10px 20px;
            cursor: pointer;
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            opacity: 0.6;
            font-size: 14px;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .tab:hover {
            opacity: 0.8;
        }

        .tab.active {
            opacity: 1;
            border-bottom-color: var(--vscode-button-background);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .summary {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
        }

        .summary-item {
            display: flex;
            flex-direction: column;
        }

        .summary-label {
            font-size: 12px;
            opacity: 0.7;
            margin-bottom: 5px;
        }

        .summary-value {
            font-size: 20px;
            font-weight: bold;
        }

        .summary-value.critical {
            color: var(--vscode-errorForeground);
        }

        .summary-value.warning {
            color: var(--vscode-list-warningForeground);
        }

        .issue-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .issue-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            border-left: 3px solid;
        }

        .issue-card.critical {
            border-left-color: var(--vscode-errorForeground);
        }

        .issue-card.warning {
            border-left-color: var(--vscode-list-warningForeground);
        }

        .issue-card.info {
            border-left-color: var(--vscode-notificationsInfoIcon-foreground);
        }

        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }

        .issue-title {
            font-weight: bold;
            font-size: 14px;
        }

        .severity-badge {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
        }

        .severity-badge.critical {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }

        .severity-badge.warning {
            background: var(--vscode-list-warningForeground);
            color: var(--vscode-editor-background);
        }

        .severity-badge.info {
            background: var(--vscode-notificationsInfoIcon-foreground);
            color: var(--vscode-editor-background);
        }

        .issue-details {
            font-size: 13px;
            margin-bottom: 10px;
            opacity: 0.9;
        }

        .issue-location {
            font-size: 12px;
            opacity: 0.7;
            margin-bottom: 10px;
            font-family: var(--vscode-editor-font-family);
        }

        .issue-actions {
            display: flex;
            gap: 10px;
        }

        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: opacity 0.2s;
        }

        .btn:hover {
            opacity: 0.8;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            opacity: 0.6;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }

        .empty-state-text {
            font-size: 16px;
        }

        code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        /* AI Suggestion Styles */
        .ai-suggestion {
            margin-top: 15px;
            padding: 15px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid #9b59b6;
            border-radius: 5px;
        }

        .ai-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: bold;
            color: #9b59b6;
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .ai-explanation {
            font-size: 13px;
            margin-bottom: 15px;
            line-height: 1.5;
        }

        .code-diff {
            margin: 15px 0;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .code-block {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            padding: 10px;
        }

        .code-block .label {
            display: block;
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 5px;
            opacity: 0.7;
        }

        .code-block.before .label {
            color: var(--vscode-errorForeground);
        }

        .code-block.after .label {
            color: var(--vscode-testing-iconPassed);
        }

        .code-block pre {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .ai-reasoning {
            font-size: 12px;
            opacity: 0.8;
            margin-top: 10px;
            font-style: italic;
        }

        .confidence-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            margin-left: 5px;
        }

        .confidence-badge.high {
            background: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
        }

        .confidence-badge.medium {
            background: var(--vscode-list-warningForeground);
            color: var(--vscode-editor-background);
        }

        .confidence-badge.low {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
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

            if (message.type === 'updateResults') {
                updateResults(message.data);
            }
        });

        function updateResults(results) {
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

        function escapeHtml(text) {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
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
