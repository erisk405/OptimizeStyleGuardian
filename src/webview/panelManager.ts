import * as vscode from "vscode";
import * as path from "path";
import { AnalysisResult, ImportAnalysisIssue } from "../types";
import { IssueEnhancer } from "../services/issueEnhancer";
import { AnthropicService } from "../services/anthropicService";
import { ApiKeyManager } from "../config/apiKeyManager";
import { ComponentRegistry } from "../services/componentRegistry";

export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentResults: AnalysisResult | undefined;
  private issueEnhancer: IssueEnhancer | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private apiKeyManager: ApiKeyManager,
    private componentRegistry?: ComponentRegistry,
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
          vscode.Uri.file(
            path.join(this.context.extensionPath, "src", "webview", "styles"),
          ),
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

      // Use the file path as-is - VSCode handles both forward and backslashes
      const document = await vscode.workspace.openTextDocument(file);
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

      console.log("Successfully navigated to:", file, "line:", line);
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
        const config = vscode.workspace.getConfiguration("go5StyleGuardian");
        const apiKey = await this.apiKeyManager.getApiKey();

        if (!apiKey) {
          vscode.window.showErrorMessage(
            "Anthropic API key not configured. Please run 'Go5: Configure API Key' command.",
          );
          return;
        }

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
          this.componentRegistry,
        );
      }

      // Request AI suggestion
      vscode.window.showInformationMessage("Requesting AI suggestion...");

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
    // Get URIs for CSS files
    const stylesPath = vscode.Uri.file(
      path.join(this.context.extensionPath, "src", "webview", "styles"),
    );

    const mainCssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(stylesPath.fsPath, "main.css")),
    );
    const componentsCssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(stylesPath.fsPath, "components.css")),
    );
    const aiSuggestionsCssUri = this.panel!.webview.asWebviewUri(
      vscode.Uri.file(path.join(stylesPath.fsPath, "ai-suggestions.css")),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Go5 Style Guardian</title>
    <link rel="stylesheet" href="${mainCssUri}">
    <link rel="stylesheet" href="${componentsCssUri}">
    <link rel="stylesheet" href="${aiSuggestionsCssUri}">
</head>
<body>
    <h1>Go5 Style Guardian</h1>

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
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">Run a scan to see style health issues</div>
        </div>
    </div>

    <div id="design-system" class="tab-content">
        <div class="empty-state">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">Run a scan to see design system recommendations</div>
        </div>
    </div>

    <div id="performance" class="tab-content">
        <div class="empty-state">
            <div class="empty-state-icon"></div>
            <div class="empty-state-text">Run a scan to see performance issues</div>
        </div>
    </div>

    <div id="imports" class="tab-content">
        <div class="empty-state">
            <div class="empty-state-icon"></div>
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
            updateImportsTab(results.imports || []);
        }

        function updateStyleHealthTab(issues) {
            const container = document.getElementById('style-health');
            if (issues.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">No duplicate styles found!</div></div>';
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
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">Design system compliance looks good!</div></div>';
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
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">No performance issues detected!</div></div>';
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
            const container = document.getElementById('imports');
            currentImports = issues; // Store for AI suggestion requests

            if (issues.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"></div><div class="empty-state-text">No imports found or all imports are optimal!</div></div>';
                return;
            }

            container.innerHTML = '<div class="issue-list">' + issues.map((issue, index) => {
                const sizeInfo = issue.sizeKb !== undefined && issue.sizeKb !== null
                    ? \`<span class="size-badge">\${issue.sizeKb} KB</span>\`
                    : '<span class="size-badge external">External Package</span>';

                const importedItemsText = issue.importedItems.join(', ');

                const title = \`Import from <code>\${escapeHtml(issue.source)}</code> \${sizeInfo}\`;
                const details = \`Imported items: <strong>\${escapeHtml(importedItemsText)}</strong>\`;

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
                    ? \` (Save ~\${suggestion.potentialSavings} KB)\`
                    : '';

                aiSuggestionHtml = \`
                    <div class="ai-suggestion-panel">
                        <div class="ai-suggestion-header">
                            <span class="ai-badge">AI Suggestion: \${typeLabel}\${savingsText}</span>
                            <span class="confidence-badge confidence-\${suggestion.confidence}">\${suggestion.confidence} confidence</span>
                        </div>
                        <div class="ai-explanation">\${escapeHtml(suggestion.explanation)}</div>
                        <div class="code-diff">
                            <div class="code-section">
                                <div class="code-label">Current:</div>
                                <pre class="code-block code-original"><code>\${escapeHtml(suggestion.codeChange.original)}</code></pre>
                            </div>
                            <div class="code-section">
                                <div class="code-label">Suggested:</div>
                                <pre class="code-block code-suggested"><code>\${escapeHtml(suggestion.codeChange.suggested)}</code></pre>
                            </div>
                        </div>
                        <div class="ai-reasoning"><strong>Why:</strong> \${escapeHtml(suggestion.reasoning)}</div>
                        \${suggestion.alternativePackage ? \`<div class="alternative-package">Alternative: <code>\${escapeHtml(suggestion.alternativePackage)}</code></div>\` : ''}
                        <div class="ai-actions">
                            <button class="btn btn-primary" onclick="applyImportSuggestion(\${index})">Apply Suggestion</button>
                            <button class="btn" onclick="dismissSuggestion(\${index})">Dismiss</button>
                        </div>
                    </div>
                \`;
            } else {
                // Show button to request AI suggestion
                aiSuggestionHtml = \`
                    <div class="ai-suggestion-request">
                        <button class="btn btn-ai" onclick="requestImportSuggestion(\${index})" id="suggest-btn-\${index}">
                            Get AI Optimization Suggestion
                        </button>
                    </div>
                \`;
            }

            return \`
                <div class="issue-card \${severityClass}" data-import-index="\${index}">
                    <div class="issue-header">
                        <div class="issue-title">\${title}</div>
                        <span class="severity-badge \${severityClass}">\${severity}</span>
                    </div>
                    <div class="issue-details">\${details}</div>
                    <div class="issue-location">\${escapeHtml(file)}:\${line}</div>
                    <div class="issue-actions">
                        <button class="btn btn-secondary" onclick="goToCode('\${escapeJsString(file)}', \${line})">Go to Code</button>
                    </div>
                    \${aiSuggestionHtml}
                </div>
            \`;
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

        function escapeJsString(text) {
            if (!text) return '';
            var result = '';
            for (var i = 0; i < text.length; i++) {
                var c = text.charAt(i);
                switch (c) {
                    case '\\\\': result += '\\\\\\\\'; break;
                    case "'": result += "\\\\'"; break;
                    case '"': result += '\\\\"'; break;
                    case '\\n': result += '\\\\n'; break;
                    case '\\r': result += '\\\\r'; break;
                    case '\\t': result += '\\\\t'; break;
                    default: result += c;
                }
            }
            return result;
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
            // Use forward slashes for display (cross-platform)
            const displayFile = issue.file.split('\\\\').join('/');
            // For data attributes, just escape quotes - don't double-escape backslashes
            const fileAttr = issue.file.split('"').join('&quot;');
            const fixButton = issue.suggestion ? '<button class="btn btn-secondary" data-action="fix">Apply Fix</button>' : '';

            // AI Suggestion section
            let aiSuggestionHtml = '';
            if (issue.aiSuggestion) {
                const ai = issue.aiSuggestion;
                const confidenceBadge = '<span class="confidence-badge ' + ai.confidence + '">' + ai.confidence.toUpperCase() + '</span>';

                aiSuggestionHtml = '<div class="ai-suggestion">' +
                    '<div class="ai-badge">AI Suggestion' + confidenceBadge + '</div>' +
                    '<div class="ai-explanation">' + escapeHtml(ai.explanation) + '</div>' +
                    '<div class="code-diff">' +
                    '<div class="code-block before">' +
                    '<span class="label">Current Code:</span>' +
                    '<pre>' + escapeHtml(ai.codeChange.original) + '</pre>' +
                    '</div>' +
                    '<div class="code-block after">' +
                    '<span class="label">Suggested Code:</span>' +
                    '<pre>' + escapeHtml(ai.codeChange.suggested) + '</pre>' +
                    '</div>' +
                    '</div>' +
                    '<div class="ai-reasoning">Reasoning: ' + escapeHtml(ai.reasoning) + '</div>' +
                    '<button class="btn btn-primary" data-action="apply-ai" data-file="' + fileAttr + '" ' +
                    'data-start-line="' + ai.codeChange.startLine + '" ' +
                    'data-end-line="' + ai.codeChange.endLine + '" ' +
                    'data-suggested-code="' + escapeHtml(ai.codeChange.suggested).split('"').join('&quot;') + '">' +
                    'Apply AI Fix' +
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
                'Go to Code' +
                '</button>' +
                fixButton +
                '</div>' +
                aiSuggestionHtml +
                '</div>';
        }

        // Store current imports for AI suggestion requests
        let currentImports = [];

        function requestImportSuggestion(index) {
            const btn = document.getElementById(\`suggest-btn-\${index}\`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Requesting AI Suggestion...';
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

        function dismissSuggestion(index) {
            const card = document.querySelector(\`[data-import-index="\${index}"]\`);
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
