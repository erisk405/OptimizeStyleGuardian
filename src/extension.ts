import * as vscode from 'vscode';
import { ScanCommand } from './commands/scanCommand';
import { PanelManager } from './webview/panelManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('Go5 Style Guardian is now active!');

    const panelManager = new PanelManager(context);
    const scanCommand = new ScanCommand(context, panelManager);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('go5StyleGuardian.scanCurrentFile', () => {
            scanCommand.scanCurrentFile();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('go5StyleGuardian.scanSelectedFolder', (uri: vscode.Uri) => {
            scanCommand.scanFolder(uri);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('go5StyleGuardian.scanWorkspace', () => {
            scanCommand.scanWorkspace();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('go5StyleGuardian.openPanel', () => {
            panelManager.showPanel();
        })
    );

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('go5.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Go5 Style Guardian is ready! Use "Go5: Open Style Guardian Panel" to get started.',
            'Open Panel'
        ).then(selection => {
            if (selection === 'Open Panel') {
                vscode.commands.executeCommand('go5StyleGuardian.openPanel');
            }
        });
        context.globalState.update('go5.hasShownWelcome', true);
    }
}

export function deactivate() {
    console.log('Go5 Style Guardian deactivated');
}
