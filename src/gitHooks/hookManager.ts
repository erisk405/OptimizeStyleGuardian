import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { RustBridge } from "../rustBridge";

export class GitHookManager {
  private hookPath: string | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Check if hook is installed
   */
  async isHookInstalled(workspaceRoot: string): Promise<boolean> {
    const status = await this.checkHookStatus(workspaceRoot);
    return status.isHookInstalled;
  }

  /**
   * Check if git repository exists and hook is installed
   */
  async checkHookStatus(workspaceRoot: string): Promise<{
    isGitRepo: boolean;
    isHookInstalled: boolean;
    hookPath?: string;
  }> {
    const gitDir = path.join(workspaceRoot, ".git");
    const isGitRepo = fs.existsSync(gitDir);

    if (!isGitRepo) {
      return { isGitRepo: false, isHookInstalled: false };
    }

    const hookPath = path.join(gitDir, "hooks", "pre-commit");
    const isHookInstalled =
      fs.existsSync(hookPath) &&
      fs.readFileSync(hookPath, "utf8").includes("go5-style-guardian");

    return { isGitRepo, isHookInstalled, hookPath };
  }

  /**
   * Install pre-commit hook
   */
  async installHook(workspaceRoot: string): Promise<boolean> {
    try {
      const gitDir = path.join(workspaceRoot, ".git");
      if (!fs.existsSync(gitDir)) {
        vscode.window.showErrorMessage("Not a git repository");
        return false;
      }

      const hooksDir = path.join(gitDir, "hooks");
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
      }

      const hookPath = path.join(hooksDir, "pre-commit");
      this.hookPath = hookPath;

      // Check if hook already exists
      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, "utf8");
        if (content.includes("go5-style-guardian")) {
          // Already installed
          return true;
        }

        // Ask user if they want to append
        const choice = await vscode.window.showWarningMessage(
          "A pre-commit hook already exists. What would you like to do?",
          "Append Go5 Guardian",
          "Replace",
          "Cancel",
        );

        if (choice === "Cancel") {
          return false;
        }

        if (choice === "Append Go5 Guardian") {
          // Append to existing hook
          const newContent =
            content + "\n\n" + this.generateHookScript(workspaceRoot);
          fs.writeFileSync(hookPath, newContent);
        } else {
          // Backup existing hook
          fs.writeFileSync(hookPath + ".backup", content);
          fs.writeFileSync(hookPath, this.generateHookScript(workspaceRoot));
        }
      } else {
        // Create new hook
        fs.writeFileSync(hookPath, this.generateHookScript(workspaceRoot));
      }

      // Make executable (Unix only)
      if (process.platform !== "win32") {
        fs.chmodSync(hookPath, "755");
      }

      vscode.window.showInformationMessage(
        "✓ Go5 Style Guardian pre-commit hook installed!",
      );
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install hook: ${error}`);
      return false;
    }
  }

  /**
   * Uninstall pre-commit hook
   */
  async uninstallHook(workspaceRoot: string): Promise<boolean> {
    try {
      const hookPath = path.join(workspaceRoot, ".git", "hooks", "pre-commit");

      if (!fs.existsSync(hookPath)) {
        vscode.window.showInformationMessage("Hook is not installed");
        return true;
      }

      const content = fs.readFileSync(hookPath, "utf8");

      if (!content.includes("go5-style-guardian")) {
        vscode.window.showInformationMessage("Go5 Guardian hook not found");
        return true;
      }

      // Remove Go5 Guardian section
      const lines = content.split("\n");
      const filteredLines = [];
      let inGo5Section = false;

      for (const line of lines) {
        if (line.includes("BEGIN go5-style-guardian")) {
          inGo5Section = true;
          continue;
        }
        if (line.includes("END go5-style-guardian")) {
          inGo5Section = false;
          continue;
        }
        if (!inGo5Section) {
          filteredLines.push(line);
        }
      }

      const newContent = filteredLines.join("\n").trim();

      if (newContent.length === 0) {
        // Remove file if empty
        fs.unlinkSync(hookPath);
      } else {
        // Write back cleaned content
        fs.writeFileSync(hookPath, newContent);
      }

      vscode.window.showInformationMessage("✓ Go5 Guardian hook uninstalled");
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to uninstall hook: ${error}`);
      return false;
    }
  }

  /**
   * Generate hook script
   */
  private generateHookScript(workspaceRoot: string): string {
    const isWindows = process.platform === "win32";
    const extensionPath = this.context.extensionPath;

    // Use Node.js to run the validation
    const script = `#!/bin/sh
# BEGIN go5-style-guardian
# This hook was installed by Go5 Style Guardian extension
# To bypass this hook, use: git commit --no-verify

echo "🛡️  Go5 Style Guardian: Checking staged files..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(css|scss|html|ts|js|jsx|tsx|vue)$' || true)

if [ -z "$STAGED_FILES" ]; then
    echo "✓ No style/template files to check"
    exit 0
fi

# Run Go5 Guardian validation via Node
node "${extensionPath.replace(/\\/g, "/")}/out/gitHooks/preCommitValidator.js" "${workspaceRoot.replace(/\\/g, "/")}" "$STAGED_FILES"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "X Commit blocked by Go5 Style Guardian"
    echo ""
    echo "To fix: Open VSCode and resolve the critical issues"
    echo "To bypass: Use 'git commit --no-verify' (not recommended)"
    exit 1
fi

echo "✓ All checks passed!"
exit 0
# END go5-style-guardian
`;

    return script;
  }

  /**
   * Prompt user to install hook
   */
  async promptInstall(workspaceRoot: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("go5StyleGuardian");
    const dontAskAgain = config.get("dontAskToInstallGitHook", false);

    if (dontAskAgain) {
      return;
    }

    const status = await this.checkHookStatus(workspaceRoot);

    if (status.isGitRepo && !status.isHookInstalled) {
      const choice = await vscode.window.showInformationMessage(
        "🛡️ Go5 Style Guardian can prevent bad code from being committed. Install git pre-commit hook?",
        "Install",
        "Not Now",
        "Don't Ask Again",
      );

      if (choice === "Install") {
        await this.installHook(workspaceRoot);
      } else if (choice === "Don't Ask Again") {
        await config.update(
          "dontAskToInstallGitHook",
          true,
          vscode.ConfigurationTarget.Global,
        );
      }
    }
  }
}
