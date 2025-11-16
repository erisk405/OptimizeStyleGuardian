import * as vscode from 'vscode';
import * as path from 'path';
import { RustBridge } from '../rustBridge';
import { PanelManager } from '../webview/panelManager';
import { ScanOptions } from '../types';

export class ScanCommand {
    private rustBridge: RustBridge;

    constructor(
        private context: vscode.ExtensionContext,
        private panelManager: PanelManager
    ) {
        this.rustBridge = new RustBridge(context);
    }

    async scanCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No file is currently open');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);

        if (!workspaceFolder) {
            vscode.window.showWarningMessage('File is not in a workspace');
            return;
        }

        await this.performScan([filePath], workspaceFolder.uri.fsPath);
    }

    async scanFolder(uri: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

        if (!workspaceFolder) {
            vscode.window.showWarningMessage('Selected folder is not in a workspace');
            return;
        }

        await this.performScan([uri.fsPath], workspaceFolder.uri.fsPath);
    }

    async scanWorkspace() {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder is open');
            return;
        }

        // If multiple workspace folders, let user choose
        let targetFolder = workspaceFolders[0];
        if (workspaceFolders.length > 1) {
            const picked = await vscode.window.showQuickPick(
                workspaceFolders.map(f => ({ label: f.name, folder: f })),
                { placeHolder: 'Select workspace folder to scan' }
            );
            if (!picked) return;
            targetFolder = picked.folder;
        }

        await this.performScan([targetFolder.uri.fsPath], targetFolder.uri.fsPath);
    }

    private async performScan(paths: string[], workspaceRoot: string) {
        // Check engine availability
        const engineCheck = await this.rustBridge.checkEngineAvailability();
        if (!engineCheck.available) {
            const action = await vscode.window.showErrorMessage(
                engineCheck.error || 'Rust engine is not available',
                'View Instructions'
            );
            if (action === 'View Instructions') {
                vscode.window.showInformationMessage(
                    'To build the Rust engine:\n1. Open terminal\n2. Run: npm run build:engine'
                );
            }
            return;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration('go5StyleGuardian');

        const scanOptions: ScanOptions = {
            paths,
            workspaceRoot,
            configPath: path.join(workspaceRoot, config.get('designSystemConfigPath', 'config/design-system.yml')),
            similarity: config.get('duplicateSimilarityThreshold', 90),
            performanceThresholds: {
                jsBundleKb: config.get('performanceJsBundleThreshold', 200),
                cssSizeKb: config.get('performanceCssSizeThreshold', 100),
                imageSizeKb: config.get('performanceImageSizeThreshold', 500),
            },
            enabledCategories: config.get('enabledCategories', {
                duplicateStyles: true,
                designSystem: true,
                performance: true,
            }),
            excludePatterns: config.get('excludePatterns', [
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/.git/**'
            ]),
        };

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Go5 Style Guardian',
                cancellable: false,
            },
            async (progress) => {
                progress.report({ message: 'Analyzing files...' });

                try {
                    const result = await this.rustBridge.analyze(scanOptions);

                    // Show panel with results
                    this.panelManager.showPanel();
                    this.panelManager.updateResults(result);

                    // Show summary notification
                    const { totalIssues, criticalCount, warningCount } = result.summary;
                    if (totalIssues === 0) {
                        vscode.window.showInformationMessage('✓ No issues found!');
                    } else {
                        const message = `Found ${totalIssues} issue(s): ${criticalCount} critical, ${warningCount} warnings`;
                        vscode.window.showWarningMessage(message, 'View Details').then(action => {
                            if (action === 'View Details') {
                                vscode.commands.executeCommand('go5StyleGuardian.openPanel');
                            }
                        });
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(`Scan failed: ${errorMessage}`);
                    console.error('Scan error:', error);
                }
            }
        );
    }
}
