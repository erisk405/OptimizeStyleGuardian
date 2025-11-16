import * as vscode from 'vscode';
import * as path from 'path';
import { AnalysisResult } from '../types';

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
                type: 'updateResults',
                data: results
            });
        }
    }

    private createPanel() {
        this.panel = vscode.window.createWebviewPanel(
            'go5StyleGuardian',
            'Go5 Style Guardian',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'goToCode':
                        this.goToCode(message.file, message.line, message.column);
                        break;
                    case 'applyFix':
                        this.applyFix(message.issueId, message.fixType);
                        break;
                    case 'ready':
                        // Webview is ready, send current results if available
                        if (this.currentResults) {
                            this.panel?.webview.postMessage({
                                type: 'updateResults',
                                data: this.currentResults
                            });
                        }
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.context.subscriptions
        );

        // Send initial results if available
        if (this.currentResults) {
            setTimeout(() => {
                this.panel?.webview.postMessage({
                    type: 'updateResults',
                    data: this.currentResults
                });
            }, 100);
        }
    }

    private async goToCode(file: string, line: number, column?: number) {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

            const position = new vscode.Position(Math.max(0, line - 1), column ? Math.max(0, column - 1) : 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Could not open file: ${file}`);
        }
    }

    private async applyFix(issueId: string, fixType: string) {
        // TODO: Implement auto-fix functionality
        vscode.window.showInformationMessage('Auto-fix feature coming soon!');
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
                    column: issue.column
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
                    suggestion: issue.suggested
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
                    column: issue.column
                })
            ).join('') + '</div>';
        }

        function getStyleIssueTitle(issue) {
            switch (issue.type) {
                case 'identical_classes':
                    return \`Identical class: <code>\${issue.class}</code> = <code>\${issue.duplicateOf}</code>\`;
                case 'similar_classes':
                    return \`Similar classes: <code>\${issue.class}</code> ~ <code>\${issue.duplicateOf}</code> (\${issue.similarity}% match)\`;
                case 'inline_style_duplicate':
                    return \`Inline style matches existing class <code>\${issue.duplicateOf}</code>\`;
                default:
                    return 'Unknown issue';
            }
        }

        function getStyleIssueDetails(issue) {
            if (issue.properties && issue.properties.length > 0) {
                return \`Matching properties: \${issue.properties.join(', ')}\`;
            }
            return 'Consider using the existing class to reduce duplication.';
        }

        function getDesignSystemIssueTitle(issue) {
            switch (issue.type) {
                case 'component_replacement':
                    return \`Replace <code>\${issue.current}</code> with <code>\${issue.suggested}</code>\`;
                case 'class_replacement':
                    return \`Use design system class <code>\${issue.suggested}</code>\`;
                case 'color_token':
                    return \`Use color token instead of <code>\${issue.current}</code>\`;
                case 'spacing_token':
                    return \`Use spacing token instead of <code>\${issue.current}</code>\`;
                default:
                    return 'Design system recommendation';
            }
        }

        function createIssueCard(issue) {
            return \`
                <div class="issue-card \${issue.severity}">
                    <div class="issue-header">
                        <div class="issue-title">\${issue.title}</div>
                        <span class="severity-badge \${issue.severity}">\${issue.severity}</span>
                    </div>
                    <div class="issue-details">\${issue.details}</div>
                    <div class="issue-location">\${issue.file}:\${issue.line || '?'}\${issue.column ? ':' + issue.column : ''}</div>
                    <div class="issue-actions">
                        <button class="btn btn-primary" onclick="goToCode('\${issue.file}', \${issue.line || 0}, \${issue.column || 0})">
                            🔍 Go to Code
                        </button>
                        \${issue.suggestion ? \`<button class="btn btn-secondary" onclick="applySuggestion()">🔧 Apply Fix</button>\` : ''}
                    </div>
                </div>
            \`;
        }

        function goToCode(file, line, column) {
            vscode.postMessage({
                type: 'goToCode',
                file: file,
                line: line,
                column: column
            });
        }

        function applySuggestion() {
            vscode.postMessage({
                type: 'applyFix'
            });
        }

        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
