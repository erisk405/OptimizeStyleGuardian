import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

export interface ComponentInfo {
  name: string;
  path: string;
  exports: string[];
  type: "component" | "utility" | "hook" | "type" | "constant";
}

export interface ProjectContext {
  components: ComponentInfo[];
  totalFiles: number;
  lastScanned: Date;
}

export class ComponentRegistry {
  private context: ProjectContext | null = null;
  private readonly CACHE_KEY = "go5.componentRegistry";
  private readonly CACHE_EXPIRY_DAYS = 1;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private rebuildTimer: NodeJS.Timeout | undefined;

  constructor(private workspaceState: vscode.Memento) {}

  /**
   * Build or refresh the component registry
   */
  async buildRegistry(
    workspaceRoot: string,
    force: boolean = false,
  ): Promise<ProjectContext> {
    // Check cache if not forced
    if (!force) {
      const cached = await this.getCachedRegistry();
      if (cached && this.isCacheValid(cached.lastScanned)) {
        this.context = cached;
        return cached;
      }
    }

    // Show progress
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Building Component Registry",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Scanning workspace..." });

        const components: ComponentInfo[] = [];
        const files = await this.findComponentFiles(workspaceRoot);

        for (let i = 0; i < files.length; i++) {
          progress.report({
            message: `Analyzing ${i + 1}/${files.length} files...`,
            increment: 100 / files.length,
          });

          const componentInfo = await this.analyzeFile(files[i], workspaceRoot);
          if (componentInfo) {
            components.push(...componentInfo);
          }
        }

        const context: ProjectContext = {
          components,
          totalFiles: files.length,
          lastScanned: new Date(),
        };

        // Cache the result
        await this.cacheRegistry(context);
        this.context = context;

        return context;
      },
    );
  }

  /**
   * Get the current registry (from memory or cache)
   */
  async getRegistry(workspaceRoot: string): Promise<ProjectContext | null> {
    if (this.context) {
      return this.context;
    }

    // Try to load from cache
    const cached = await this.getCachedRegistry();
    if (cached && this.isCacheValid(cached.lastScanned)) {
      this.context = cached;
      return cached;
    }

    // If no valid cache, build new registry
    return await this.buildRegistry(workspaceRoot);
  }

  /**
   * Find all component files in workspace
   */
  private async findComponentFiles(workspaceRoot: string): Promise<string[]> {
    const pattern = "**/*.{ts,tsx,js,jsx}";
    const exclude = "**/node_modules/**";

    const uris = await vscode.workspace.findFiles(pattern, exclude, 10000);

    return uris
      .map((uri) => uri.fsPath)
      .filter((filePath) => {
        // Exclude test files, config files, etc.
        const fileName = path.basename(filePath).toLowerCase();
        return (
          !fileName.includes(".test.") &&
          !fileName.includes(".spec.") &&
          !fileName.includes(".config.") &&
          !fileName.startsWith("_")
        );
      });
  }

  /**
   * Analyze a file to extract component information
   */
  private async analyzeFile(
    filePath: string,
    workspaceRoot: string,
  ): Promise<ComponentInfo[] | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const relativePath = path.relative(workspaceRoot, filePath);
      const components: ComponentInfo[] = [];

      // Extract exports
      const exports = this.extractExports(content);

      if (exports.length === 0) {
        return null;
      }

      // Determine component types
      for (const exportName of exports) {
        const type = this.determineType(exportName, content);

        components.push({
          name: exportName,
          path: relativePath,
          exports: [exportName],
          type,
        });
      }

      return components.length > 0 ? components : null;
    } catch (error) {
      console.error(`Failed to analyze file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Extract exported items from file content
   */
  private extractExports(content: string): string[] {
    const exports: Set<string> = new Set();

    // Named exports: export { A, B }
    const namedExportRegex = /export\s+\{\s*([^}]+)\s*\}/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      const items = match[1]
        .split(",")
        .map((s) => s.trim().split(" as ")[0].trim());
      items.forEach((item) => exports.add(item));
    }

    // Direct exports: export const/function/class Name
    const directExportRegex =
      /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    while ((match = directExportRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }

    // Default export with name: export default function Name
    const defaultExportRegex = /export\s+default\s+(?:function|class)\s+(\w+)/g;
    while ((match = defaultExportRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }

    return Array.from(exports);
  }

  /**
   * Determine the type of an export based on naming and context
   */
  private determineType(name: string, content: string): ComponentInfo["type"] {
    // Check for hooks (use* pattern)
    if (
      name.startsWith("use") &&
      name.length > 3 &&
      name[3] === name[3].toUpperCase()
    ) {
      return "hook";
    }

    // Check for types/interfaces
    if (
      content.includes(`interface ${name}`) ||
      content.includes(`type ${name}`)
    ) {
      return "type";
    }

    // Check for constants (ALL_CAPS or CONSTANT_CASE)
    if (name === name.toUpperCase() && name.includes("_")) {
      return "constant";
    }

    // Check if it's a React component (starts with uppercase and has JSX)
    if (name[0] === name[0].toUpperCase()) {
      const componentPattern = new RegExp(
        `(?:function|const|class)\\s+${name}[^{]*{[\\s\\S]*?(?:return|<)`,
      );
      if (componentPattern.test(content)) {
        return "component";
      }
    }

    // Default to utility
    return "utility";
  }

  /**
   * Get cached registry from workspace state
   */
  private async getCachedRegistry(): Promise<ProjectContext | null> {
    const cached = this.workspaceState.get<any>(this.CACHE_KEY);
    if (!cached) {
      return null;
    }

    return {
      ...cached,
      lastScanned: new Date(cached.lastScanned),
    };
  }

  /**
   * Start watching for file changes and auto-rebuild registry
   */
  public startWatching(workspaceRoot: string): void {
    // Check if auto-rebuild is enabled
    const config = vscode.workspace.getConfiguration("go5StyleGuardian");
    const autoRebuildEnabled = config.get<boolean>(
      "componentRegistry.autoRebuild",
      true,
    );

    if (!autoRebuildEnabled) {
      console.log("Component Registry auto-rebuild is disabled");
      return;
    }

    // Stop existing watcher if any
    this.stopWatching();

    // Get rebuild delay from configuration
    const rebuildDelay = config.get<number>(
      "componentRegistry.rebuildDelay",
      2000,
    );

    // Create file watcher for TypeScript/JavaScript files
    const pattern = new vscode.RelativePattern(
      workspaceRoot,
      "**/*.{ts,tsx,js,jsx}",
    );
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Handle file changes with debouncing
    const scheduleRebuild = () => {
      // Clear existing timer
      if (this.rebuildTimer) {
        clearTimeout(this.rebuildTimer);
      }

      // Schedule rebuild after configured delay
      this.rebuildTimer = setTimeout(async () => {
        try {
          await this.buildRegistry(workspaceRoot, true);
          const statusMessage = `Component Registry auto-rebuilt: ${this.context?.components.length || 0} components found`;

          // Show as status bar message instead of notification for less intrusion
          vscode.window.setStatusBarMessage(statusMessage, 3000);
          console.log(statusMessage);
        } catch (error) {
          console.error("Failed to auto-rebuild Component Registry:", error);
        }
      }, rebuildDelay);
    };

    // Watch for file changes
    this.fileWatcher.onDidCreate(() => scheduleRebuild());
    this.fileWatcher.onDidChange(() => scheduleRebuild());
    this.fileWatcher.onDidDelete(() => scheduleRebuild());

    console.log(
      `Component Registry auto-rebuild enabled with ${rebuildDelay}ms delay`,
    );
  }

  /**
   * Stop watching for file changes
   */
  public stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = undefined;
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.stopWatching();
  }

  /**
   * Cache registry to workspace state
   */
  private async cacheRegistry(context: ProjectContext): Promise<void> {
    await this.workspaceState.update(this.CACHE_KEY, context);
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(lastScanned: Date): boolean {
    const now = new Date();
    const diffMs = now.getTime() - lastScanned.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays < this.CACHE_EXPIRY_DAYS;
  }

  /**
   * Invalidate cache (force rebuild on next access)
   */
  async invalidateCache(): Promise<void> {
    await this.workspaceState.update(this.CACHE_KEY, undefined);
    this.context = null;
  }

  /**
   * Get components by type
   */
  async getComponentsByType(
    workspaceRoot: string,
    type: ComponentInfo["type"],
  ): Promise<ComponentInfo[]> {
    const registry = await this.getRegistry(workspaceRoot);
    if (!registry) {
      return [];
    }

    return registry.components.filter((c) => c.type === type);
  }

  /**
   * Search components by name
   */
  async searchComponents(
    workspaceRoot: string,
    query: string,
  ): Promise<ComponentInfo[]> {
    const registry = await this.getRegistry(workspaceRoot);
    if (!registry) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    return registry.components.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.path.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Get project summary for AI context
   */
  async getProjectSummary(workspaceRoot: string): Promise<string> {
    const registry = await this.getRegistry(workspaceRoot);
    if (!registry) {
      return "No component registry available";
    }

    const componentsByType = {
      component: registry.components.filter((c) => c.type === "component"),
      hook: registry.components.filter((c) => c.type === "hook"),
      utility: registry.components.filter((c) => c.type === "utility"),
      type: registry.components.filter((c) => c.type === "type"),
      constant: registry.components.filter((c) => c.type === "constant"),
    };

    const summary = [
      `Project Components (${registry.components.length} total):`,
      "",
      `Components (${componentsByType.component.length}):`,
      componentsByType.component
        .slice(0, 20)
        .map((c) => `  - ${c.name} (${c.path})`)
        .join("\n"),
      componentsByType.component.length > 20
        ? `  ... and ${componentsByType.component.length - 20} more`
        : "",
      "",
      `Hooks (${componentsByType.hook.length}):`,
      componentsByType.hook
        .slice(0, 10)
        .map((c) => `  - ${c.name}`)
        .join("\n"),
      componentsByType.hook.length > 10
        ? `  ... and ${componentsByType.hook.length - 10} more`
        : "",
      "",
      `Utilities (${componentsByType.utility.length}):`,
      componentsByType.utility
        .slice(0, 10)
        .map((c) => `  - ${c.name}`)
        .join("\n"),
      componentsByType.utility.length > 10
        ? `  ... and ${componentsByType.utility.length - 10} more`
        : "",
    ]
      .filter((line) => line !== "")
      .join("\n");

    return summary;
  }
}
