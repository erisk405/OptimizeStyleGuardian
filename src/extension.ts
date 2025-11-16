import * as vscode from "vscode";
import { ScanCommand } from "./commands/scanCommand";
import { PanelManager } from "./webview/panelManager";
import { ApiKeyManager } from "./config/apiKeyManager";
import { GitHookManager } from "./gitHooks/hookManager";

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  console.log("Go5 Style Guardian is now active!");

  const apiKeyManager = new ApiKeyManager(context);
  const panelManager = new PanelManager(context);
  const scanCommand = new ScanCommand(context, panelManager, apiKeyManager);
  const hookManager = new GitHookManager(context);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  // Update status bar
  updateHookStatus(hookManager);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "go5StyleGuardian.scanCurrentFile",
      (uri?: vscode.Uri) => {
        scanCommand.scanCurrentFile(uri);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "go5StyleGuardian.scanSelectedFolder",
      (uri: vscode.Uri) => {
        scanCommand.scanFolder(uri);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("go5StyleGuardian.scanWorkspace", () => {
      scanCommand.scanWorkspace();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("go5StyleGuardian.openPanel", () => {
      panelManager.showPanel();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("go5StyleGuardian.configureApiKey", () => {
      apiKeyManager.manageApiKey();
    }),
  );

  // Git hook commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "go5StyleGuardian.installGitHook",
      async () => {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
          return;
        }

        const installed = await hookManager.installHook(workspaceRoot);
        if (installed) {
          vscode.window.showInformationMessage(
            "✅ Git pre-commit hook installed! Your commits will now be validated.",
          );
          updateHookStatus(hookManager);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "go5StyleGuardian.uninstallGitHook",
      async () => {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
          return;
        }

        const uninstalled = await hookManager.uninstallHook(workspaceRoot);
        if (uninstalled) {
          vscode.window.showInformationMessage(
            "Git pre-commit hook uninstalled.",
          );
          updateHookStatus(hookManager);
        }
      },
    ),
  );

  // Prompt to install git hook if not installed
  checkAndPromptGitHook(context, hookManager);

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get("go5.hasShownWelcome", false);
  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        'Go5 Style Guardian is ready! Use "Go5: Open Style Guardian Panel" to get started.',
        "Open Panel",
      )
      .then((selection) => {
        if (selection === "Open Panel") {
          vscode.commands.executeCommand("go5StyleGuardian.openPanel");
        }
      });
    context.globalState.update("go5.hasShownWelcome", true);
  }
}

export function deactivate() {
  console.log("Go5 Style Guardian deactivated");
}

function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open");
    return undefined;
  }
  return workspaceFolders[0].uri.fsPath;
}

async function updateHookStatus(hookManager: GitHookManager) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    statusBarItem.hide();
    return;
  }

  const isInstalled = await hookManager.isHookInstalled(workspaceRoot);

  if (isInstalled) {
    statusBarItem.text = "$(shield) Hook: ON";
    statusBarItem.tooltip = "Go5 pre-commit hook is active (click to manage)";
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(shield) Hook: OFF";
    statusBarItem.tooltip =
      "Go5 pre-commit hook is not installed (click to install)";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
  }

  statusBarItem.command = isInstalled
    ? "go5StyleGuardian.uninstallGitHook"
    : "go5StyleGuardian.installGitHook";
  statusBarItem.show();
}

async function checkAndPromptGitHook(
  context: vscode.ExtensionContext,
  hookManager: GitHookManager,
) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const hasPrompted = context.globalState.get("go5.hasPromptedGitHook", false);
  if (hasPrompted) {
    return;
  }

  const isInstalled = await hookManager.isHookInstalled(workspaceRoot);
  if (isInstalled) {
    return;
  }

  const config = vscode.workspace.getConfiguration("go5StyleGuardian");
  const autoInstall = config.get("gitHook.autoInstall", false);

  if (autoInstall) {
    await hookManager.installHook(workspaceRoot);
    vscode.window.showInformationMessage(
      "✅ Git pre-commit hook auto-installed!",
    );
    updateHookStatus(hookManager);
    context.globalState.update("go5.hasPromptedGitHook", true);
    return;
  }

  const result = await vscode.window.showInformationMessage(
    "🛡️ Install Git pre-commit hook to prevent bad code from being committed?",
    "Install",
    "Not Now",
    "Don't Ask Again",
  );

  if (result === "Install") {
    const installed = await hookManager.installHook(workspaceRoot);
    if (installed) {
      vscode.window.showInformationMessage(
        "✅ Git pre-commit hook installed! Use --no-verify to bypass if needed.",
      );
      updateHookStatus(hookManager);
    }
  }

  if (result === "Install" || result === "Don't Ask Again") {
    context.globalState.update("go5.hasPromptedGitHook", true);
  }
}
