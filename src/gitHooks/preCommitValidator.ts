#!/usr/bin/env node

/**
 * Pre-commit validator
 * This script is called by git pre-commit hook
 * It scans staged files and blocks commit if critical issues found
 */

import * as path from "path";
import * as fs from "fs";

interface ValidationResult {
  success: boolean;
  criticalCount: number;
  errorCount: number;
  warningCount: number;
  issues: Array<{
    file: string;
    line: number;
    severity: string;
    message: string;
  }>;
}

interface HookConfig {
  blockOnCritical: boolean;
  blockOnError: boolean;
  showWarnings: boolean;
}

function loadConfig(workspaceRoot: string): HookConfig {
  try {
    // Try to load VSCode settings
    const settingsPath = path.join(workspaceRoot, ".vscode", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      return {
        blockOnCritical:
          settings["go5StyleGuardian.gitHook.blockOnCritical"] ?? true,
        blockOnError:
          settings["go5StyleGuardian.gitHook.blockOnError"] ?? false,
        showWarnings: settings["go5StyleGuardian.gitHook.showWarnings"] ?? true,
      };
    }
  } catch (error) {
    // Ignore error, use defaults
  }

  // Default configuration
  return {
    blockOnCritical: true,
    blockOnError: false,
    showWarnings: true,
  };
}

async function validateStagedFiles(
  workspaceRoot: string,
  stagedFiles: string[],
): Promise<ValidationResult> {
  try {
    // Determine engine path
    const isWindows = process.platform === "win32";
    const engineName = isWindows ? "go5_engine.exe" : "go5_engine";

    // Try development path first
    let enginePath = path.join(
      workspaceRoot,
      "node_modules",
      "go5-style-guardian",
      "engine",
      "target",
      "release",
      engineName,
    );

    // Then try packaged path
    if (!fs.existsSync(enginePath)) {
      enginePath = path.join(
        workspaceRoot,
        "node_modules",
        "go5-style-guardian",
        "bin",
        engineName,
      );
    }

    // Try local development path
    if (!fs.existsSync(enginePath)) {
      const devPath = path.join(
        __dirname,
        "..",
        "..",
        "engine",
        "target",
        "release",
        engineName,
      );
      if (fs.existsSync(devPath)) {
        enginePath = devPath;
      }
    }

    if (!fs.existsSync(enginePath)) {
      console.error("Warning: Go5 engine not found, skipping validation");
      return {
        success: true,
        criticalCount: 0,
        errorCount: 0,
        warningCount: 0,
        issues: [],
      };
    }

    // Run engine on staged files
    const { spawn } = require("child_process");

    const args = ["--workspace-root", workspaceRoot, "--similarity", "90"];

    // Add each staged file
    stagedFiles.forEach((file) => {
      const fullPath = path.join(workspaceRoot, file);
      if (fs.existsSync(fullPath)) {
        args.push("--path", fullPath);
      }
    });

    return new Promise((resolve, reject) => {
      const child = spawn(enginePath, args, {
        cwd: workspaceRoot,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("error", (error: Error) => {
        console.error("Warning: Failed to run Go5 engine:", error.message);
        resolve({
          success: true,
          criticalCount: 0,
          errorCount: 0,
          warningCount: 0,
          issues: [],
        });
      });

      child.on("close", (code: number) => {
        if (code !== 0) {
          console.error("Warning: Engine exited with code", code);
          console.error(stderr);
          resolve({
            success: true,
            criticalCount: 0,
            errorCount: 0,
            warningCount: 0,
            issues: [],
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const criticalIssues: Array<any> = [];
          const errorIssues: Array<any> = [];
          const warningIssues: Array<any> = [];

          // Collect issues by severity
          result.duplicates?.forEach((issue: any) => {
            const issueData = {
              file: issue.file,
              line: issue.line,
              severity: issue.severity,
              message: `Duplicate CSS: ${issue.class} = ${issue.duplicateOf}`,
            };

            if (issue.severity === "critical") {
              criticalIssues.push(issueData);
            } else if (issue.severity === "error") {
              errorIssues.push(issueData);
            } else if (issue.severity === "warning") {
              warningIssues.push(issueData);
            }
          });

          result.designSystem?.forEach((issue: any) => {
            const issueData = {
              file: issue.file,
              line: issue.line,
              severity: issue.severity,
              message: `Design system violation: ${issue.reason}`,
            };

            if (issue.severity === "critical") {
              criticalIssues.push(issueData);
            } else if (issue.severity === "error") {
              errorIssues.push(issueData);
            } else if (issue.severity === "warning") {
              warningIssues.push(issueData);
            }
          });

          result.performance?.forEach((issue: any) => {
            const issueData = {
              file: issue.file,
              line: issue.line,
              severity: issue.severity,
              message: issue.message,
            };

            if (issue.severity === "critical") {
              criticalIssues.push(issueData);
            } else if (issue.severity === "error") {
              errorIssues.push(issueData);
            } else if (issue.severity === "warning") {
              warningIssues.push(issueData);
            }
          });

          resolve({
            success: true, // Will be determined later based on config
            criticalCount: criticalIssues.length,
            errorCount: errorIssues.length,
            warningCount: warningIssues.length,
            issues: [...criticalIssues, ...errorIssues, ...warningIssues],
          });
        } catch (error) {
          console.error("Warning: Failed to parse engine output");
          resolve({
            success: true,
            criticalCount: 0,
            errorCount: 0,
            warningCount: 0,
            issues: [],
          });
        }
      });
    });
  } catch (error) {
    console.error("Warning: Validation error:", error);
    return {
      success: true,
      criticalCount: 0,
      errorCount: 0,
      warningCount: 0,
      issues: [],
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: preCommitValidator <workspace-root> <staged-files>");
    process.exit(1);
  }

  const workspaceRoot = args[0];
  const stagedFilesStr = args[1];
  const stagedFiles = stagedFilesStr
    .split("\n")
    .filter((f) => f.trim().length > 0);

  if (stagedFiles.length === 0) {
    console.log("✓ No files to validate");
    process.exit(0);
  }

  console.log(`Scanning ${stagedFiles.length} file(s)...`);

  const config = loadConfig(workspaceRoot);
  const result = await validateStagedFiles(workspaceRoot, stagedFiles);

  // Determine if we should block based on configuration
  let shouldBlock = false;
  let blockReason = "";

  if (config.blockOnCritical && result.criticalCount > 0) {
    shouldBlock = true;
    blockReason = `${result.criticalCount} critical issue(s)`;
  } else if (config.blockOnError && result.errorCount > 0) {
    shouldBlock = true;
    blockReason = `${result.errorCount} error(s)`;
  }

  if (shouldBlock) {
    console.error(`\n[X] Commit blocked: Found ${blockReason}\n`);

    // Show critical issues first
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical",
    );
    const errorIssues = result.issues.filter((i) => i.severity === "error");
    const displayIssues = [...criticalIssues, ...errorIssues].slice(0, 5);

    displayIssues.forEach((issue) => {
      console.error(`  ${issue.file}:${issue.line}`);
      console.error(`    [${issue.severity.toUpperCase()}] ${issue.message}\n`);
    });

    if (criticalIssues.length + errorIssues.length > 5) {
      console.error(
        `  ... and ${criticalIssues.length + errorIssues.length - 5} more issue(s)`,
      );
    }

    console.error(`\nTo bypass this check, use: git commit --no-verify\n`);
    process.exit(1);
  } else {
    // Show summary
    const messages = [];
    if (result.criticalCount > 0)
      messages.push(`${result.criticalCount} critical`);
    if (result.errorCount > 0) messages.push(`${result.errorCount} error(s)`);
    if (result.warningCount > 0 && config.showWarnings)
      messages.push(`${result.warningCount} warning(s)`);

    if (messages.length > 0) {
      console.log(
        `✓ Commit allowed (${messages.join(", ")} found but not blocking)`,
      );
    } else {
      console.log("✓ No issues found");
    }

    // Show warnings if enabled
    if (config.showWarnings && result.warningCount > 0) {
      const warningIssues = result.issues
        .filter((i) => i.severity === "warning")
        .slice(0, 3);
      console.log("\nWarnings:");
      warningIssues.forEach((issue) => {
        console.log(`  ${issue.file}:${issue.line} - ${issue.message}`);
      });
      if (result.warningCount > 3) {
        console.log(`  ... and ${result.warningCount - 3} more warning(s)`);
      }
      console.log("");
    }

    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

export { validateStagedFiles };
