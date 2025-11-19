import * as vscode from "vscode";
import * as fs from "fs";
import { AnthropicService } from "./anthropicService";
import { ComponentRegistry } from "./componentRegistry";
import { ConversationManager } from "./conversationManager";
import {
  AnalysisResult,
  DuplicateStyleIssue,
  DesignSystemIssue,
  PerformanceIssue,
  ImportAnalysisIssue,
  ImportOptimizationSuggestion,
} from "../types";
import {
  EnhancedAnalysisResult,
  EnhancedDuplicateStyleIssue,
  EnhancedDesignSystemIssue,
  EnhancedPerformanceIssue,
  AISuggestion,
} from "../types/enhanced";

export class IssueEnhancer {
  private conversationManager = new ConversationManager();

  constructor(
    private anthropicService: AnthropicService,
    private maxIssues: number = 10,
    private contextLines: number = 5,
    private componentRegistry?: ComponentRegistry,
  ) {}

  /**
   * Enhance analysis result with AI suggestions
   */
  async enhanceResult(
    result: AnalysisResult,
    workspaceRoot: string,
  ): Promise<EnhancedAnalysisResult> {
    // Collect all issues and prioritize
    const allIssues: Array<{
      type: "duplicate" | "design" | "performance";
      issue: DuplicateStyleIssue | DesignSystemIssue | PerformanceIssue;
      priority: number;
    }> = [];

    // Add duplicates (high priority for critical/error)
    result.duplicates.forEach((issue) => {
      allIssues.push({
        type: "duplicate",
        issue,
        priority:
          issue.severity === "error" ? 3 : issue.severity === "warning" ? 2 : 1,
      });
    });

    // Add design system issues
    result.designSystem.forEach((issue) => {
      allIssues.push({
        type: "design",
        issue,
        priority:
          issue.severity === "error" ? 3 : issue.severity === "warning" ? 2 : 1,
      });
    });

    // Add performance issues (prioritize critical)
    result.performance.forEach((issue) => {
      allIssues.push({
        type: "performance",
        issue,
        priority:
          issue.severity === "critical"
            ? 3
            : issue.severity === "warning"
              ? 2
              : 1,
      });
    });

    // Sort by priority (highest first)
    allIssues.sort((a, b) => b.priority - a.priority);

    // Take top N issues
    const issuesToEnhance = allIssues.slice(0, this.maxIssues);

    // Enhance each issue
    const enhancedDuplicates: EnhancedDuplicateStyleIssue[] = [
      ...result.duplicates,
    ];
    const enhancedDesignSystem: EnhancedDesignSystemIssue[] = [
      ...result.designSystem,
    ];
    const enhancedPerformance: EnhancedPerformanceIssue[] = [
      ...result.performance,
    ];

    for (const { type, issue } of issuesToEnhance) {
      try {
        const aiSuggestion = await this.enhanceIssue(issue, workspaceRoot);

        if (aiSuggestion) {
          if (type === "duplicate") {
            const index = enhancedDuplicates.findIndex(
              (i) => i.file === issue.file && i.line === issue.line,
            );
            if (index >= 0) {
              enhancedDuplicates[index] = {
                ...enhancedDuplicates[index],
                aiSuggestion,
              };
            }
          } else if (type === "design") {
            const index = enhancedDesignSystem.findIndex(
              (i) => i.file === issue.file && i.line === issue.line,
            );
            if (index >= 0) {
              enhancedDesignSystem[index] = {
                ...enhancedDesignSystem[index],
                aiSuggestion,
              };
            }
          } else if (type === "performance") {
            const index = enhancedPerformance.findIndex(
              (i) => i.file === issue.file && i.line === issue.line,
            );
            if (index >= 0) {
              enhancedPerformance[index] = {
                ...enhancedPerformance[index],
                aiSuggestion,
              };
            }
          }
        }
      } catch (error) {
        console.error("Failed to enhance issue:", error);
        // Continue with other issues
      }
    }

    return {
      ...result,
      duplicates: enhancedDuplicates,
      designSystem: enhancedDesignSystem,
      performance: enhancedPerformance,
    };
  }

  /**
   * Enhance a single issue with AI suggestion
   */
  private async enhanceIssue(
    issue: DuplicateStyleIssue | DesignSystemIssue | PerformanceIssue,
    workspaceRoot: string,
  ): Promise<AISuggestion | null> {
    try {
      // Read file content
      const fileContent = await this.readFileContent(issue.file);
      if (!fileContent) {
        return null;
      }

      // Extract context around the issue
      const context = this.extractContext(fileContent, issue.line || 1);

      // Generate prompt based on issue type
      const prompt = this.generatePrompt(issue, context);

      // Call AI service with cacheable system prompt
      const systemPrompt = this.getSystemPrompt();
      const aiResponse = await this.anthropicService.analyzeSuggestion(
        prompt,
        systemPrompt,
      );
      if (!aiResponse) {
        return null;
      }

      // Convert to AISuggestion
      return {
        explanation: aiResponse.explanation,
        codeChange: {
          original: aiResponse.original_code,
          suggested: aiResponse.suggested_code,
          startLine: aiResponse.start_line || issue.line || 1,
          endLine: aiResponse.end_line || issue.line || 1,
        },
        reasoning: aiResponse.reasoning,
        confidence: aiResponse.confidence,
      };
    } catch (error) {
      console.error("Error enhancing issue:", error);
      return null;
    }
  }

  /**
   * Enhance import issue with AI optimization suggestion
   */
  async enhanceImportIssue(
    issue: ImportAnalysisIssue,
    workspaceRoot: string,
  ): Promise<ImportOptimizationSuggestion | null> {
    try {
      const fileContent = await this.readFileContent(issue.file);
      if (!fileContent) return null;

      const prompt = await this.generateImportOptimizationPrompt(
        issue,
        fileContent,
        workspaceRoot,
      );
      const systemPrompt =
        await this.getImportOptimizationSystemPrompt(workspaceRoot);

      const aiResponse = await this.anthropicService.analyzeSuggestion(
        prompt,
        systemPrompt,
      );

      if (!aiResponse) return null;

      const suggestion: ImportOptimizationSuggestion = {
        explanation: aiResponse.explanation,
        codeChange: {
          original: aiResponse.original_code,
          suggested: aiResponse.suggested_code,
          startLine: aiResponse.start_line || issue.line,
          endLine: aiResponse.end_line || issue.line,
        },
        reasoning: aiResponse.reasoning,
        confidence: aiResponse.confidence,
        optimizationType: this.parseOptimizationType(aiResponse),
        potentialSavings: this.extractPotentialSavings(aiResponse),
        alternativePackage: aiResponse.alternative_package,
        references: this.generateReferences(issue, aiResponse),
      };

      // Start conversation for this issue
      this.conversationManager.startConversation(issue, suggestion);

      return suggestion;
    } catch (error) {
      console.error("Error enhancing import:", error);
      return null;
    }
  }

  /**
   * Handle follow-up question in conversation
   */
  async askFollowUp(
    issue: ImportAnalysisIssue,
    question: string,
    workspaceRoot: string,
  ): Promise<string | null> {
    try {
      // Check if conversation exists
      if (!this.conversationManager.hasConversation(issue)) {
        return "No active conversation. Please request an AI suggestion first.";
      }

      // Add user question to conversation
      this.conversationManager.addUserMessage(issue, question);

      // Get conversation history
      const history = this.conversationManager.getConversationHistory(issue);

      // Get file content for context
      const fileContent = await this.readFileContent(issue.file);
      if (!fileContent) return null;

      // Build prompt with conversation history
      const prompt = `Previous conversation about import optimization:

${history}

User's follow-up question: ${question}

File: ${issue.file}
Import: ${issue.source}
Imported Items: ${issue.importedItems.join(", ")}

Full File Content:
\`\`\`typescript
${fileContent}
\`\`\`

Please answer the user's follow-up question based on the context of our previous conversation.
Keep your answer concise and actionable.`;

      const systemPrompt =
        await this.getImportOptimizationSystemPrompt(workspaceRoot);

      // Get AI response (plain text response for follow-up)
      const response = await this.anthropicService.chat(prompt, systemPrompt);

      if (response) {
        // Add assistant response to conversation
        this.conversationManager.addAssistantMessage(issue, response);
      }

      return response;
    } catch (error) {
      console.error("Error handling follow-up question:", error);
      return null;
    }
  }

  /**
   * Get conversation history for an issue
   */
  getConversation(issue: ImportAnalysisIssue) {
    return this.conversationManager.getConversation(issue);
  }

  /**
   * Clear conversation for an issue
   */
  clearConversation(issue: ImportAnalysisIssue): void {
    this.conversationManager.clearConversation(issue);
  }

  /**
   * Read file content
   */
  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Extract code context around a specific line
   */
  private extractContext(content: string, line: number): string {
    const lines = content.split("\n");
    const startLine = Math.max(0, line - this.contextLines - 1);
    const endLine = Math.min(lines.length, line + this.contextLines);

    return lines
      .slice(startLine, endLine)
      .map((l, i) => `${startLine + i + 1}: ${l}`)
      .join("\n");
  }

  /**
   * Get static system prompt (cacheable)
   */
  private getSystemPrompt(): string {
    return `You are a frontend code review assistant specialized in analyzing CSS, HTML, and TypeScript/JavaScript code. Your task is to analyze code issues and provide specific, actionable fixes.

When analyzing issues, consider:
- Code maintainability and reusability
- Design system compliance
- Performance best practices
- Modern frontend patterns

Always respond with a JSON object in the following format:
{
    "explanation": "Brief explanation of the problem (2-3 sentences)",
    "original_code": "The exact code that needs to be changed",
    "suggested_code": "The replacement code",
    "reasoning": "Why this fix improves the code (be specific about benefits)",
    "confidence": "high|medium|low",
    "start_line": <line_number>,
    "end_line": <line_number>
}

Important:
- Be concise but specific
- Provide complete, working code in suggestions
- Explain the reasoning behind your suggestion
- Set confidence based on how certain you are about the fix`;
  }

  /**
   * Generate prompt for AI based on issue type
   */
  private generatePrompt(
    issue: DuplicateStyleIssue | DesignSystemIssue | PerformanceIssue,
    context: string,
  ): string {
    const userPrompt = `Analyze this code issue and provide a fix:

File: ${issue.file}
Line: ${issue.line || "N/A"}

Code Context:
\`\`\`
${context}
\`\`\`

`;

    let specificPrompt = "";

    if ("duplicateOf" in issue) {
      // Duplicate style issue
      specificPrompt = `Issue Type: Duplicate Style
Current Class: ${issue.class}
Duplicate Of: ${issue.duplicateOf}
Similarity: ${issue.similarity}%
Properties: ${issue.properties?.join(", ") || "N/A"}

Task: Suggest how to refactor this code to use the existing class "${issue.duplicateOf}" instead of the duplicate class "${issue.class}".`;
    } else if ("current" in issue && "suggested" in issue) {
      // Design system issue
      specificPrompt = `Issue Type: Design System Compliance
Current: ${issue.current}
Suggested: ${issue.suggested}
Reason: ${issue.reason}

Task: Show how to replace "${issue.current}" with the design system component/token "${issue.suggested}".`;
    } else if ("message" in issue) {
      // Performance issue
      specificPrompt = `Issue Type: Performance
Problem: ${issue.message}
Details: ${JSON.stringify(issue.details)}
Recommendation: ${issue.recommendation}

Task: Provide specific code changes to fix this performance issue.`;
    }

    return (
      userPrompt +
      specificPrompt +
      `

Expected line numbers: start_line=${issue.line || 1}, end_line=${issue.line || 1}`
    );
  }

  /**
   * Generate prompt for import optimization
   */
  private async generateImportOptimizationPrompt(
    issue: ImportAnalysisIssue,
    fileContent: string,
    workspaceRoot: string,
  ): Promise<string> {
    const sizeInfo = issue.sizeKb
      ? `${issue.sizeKb} KB`
      : "Unknown (external package)";

    // Build usage information
    let usageInfo = "";
    if (issue.itemUsage) {
      usageInfo = "\n\nImported Items Usage Analysis:";
      for (const [item, usage] of Object.entries(issue.itemUsage)) {
        const itemUsage = usage as { count: number; lines: number[] };
        if (itemUsage.count === 0) {
          usageInfo += `\n  - ${item}: UNUSED (can be safely removed!)`;
        } else {
          usageInfo += `\n  + ${item}: Used ${itemUsage.count} time(s) at line(s) ${itemUsage.lines.join(", ")}`;
        }
      }
    }

    return `Analyze this import statement and suggest optimizations to reduce bundle size:

File: ${issue.file}
Import Line: ${issue.line}
Source: ${issue.source}
Imported Items: ${issue.importedItems.join(", ")}
Current Size: ${sizeInfo}
${issue.resolvedPath ? `Resolved Path: ${issue.resolvedPath}` : ""}${usageInfo}

Full File Content:
\`\`\`typescript
${fileContent}
\`\`\`

Task: Provide specific suggestions to reduce the bundle size impact of this import. Consider:
1. Tree-shaking: Can we import only specific functions/components instead of the whole package?
2. Code-splitting: Should this be lazy-loaded or dynamically imported?
3. Lighter alternatives: Is there a smaller package that provides similar functionality?
4. Remove unused: Are all imported items actually used in the code?

Respond with JSON including:
- explanation: Brief overview of the optimization
- original_code: Current import statement
- suggested_code: Optimized import(s) with comments explaining the change
- reasoning: Why this reduces bundle size (be specific with estimated savings if possible)
- confidence: "high" | "medium" | "low"
- optimization_type: "tree-shaking" | "code-splitting" | "lazy-loading" | "lighter-alternative" | "remove-unused"
- potential_savings: Estimated KB saved (number)
- alternative_package: If suggesting alternative, provide package name
- start_line: ${issue.line}
- end_line: ${issue.line}

Be practical and ensure the suggested code actually works and maintains functionality.`;
  }

  /**
   * Get system prompt for import optimization
   */
  private async getImportOptimizationSystemPrompt(
    workspaceRoot: string,
  ): Promise<string> {
    let projectContext = "";

    // Get project components from registry
    if (this.componentRegistry) {
      try {
        const summary =
          await this.componentRegistry.getProjectSummary(workspaceRoot);
        projectContext = `\n\nProject Context:\n${summary}\n\nWhen suggesting optimizations, consider these available components in the project.`;
      } catch (error) {
        console.error("Failed to get project context:", error);
      }
    }

    return `You are a bundle optimization expert specializing in JavaScript/TypeScript imports.
Your goal is to reduce bundle sizes through:
- More specific imports (tree-shaking)
- Dynamic imports for code-splitting
- Lazy loading heavy dependencies
- Suggesting lighter alternatives
- Removing unused imports

Guidelines:
- Always provide working, syntactically correct code
- Consider both development and production implications
- Be specific about size savings when possible
- Prioritize maintainability alongside bundle size
- For React, suggest proper lazy loading with Suspense
- For utilities, prefer granular imports (e.g., lodash-es over lodash)
- Recommend proven lighter alternatives (e.g., dayjs over moment)
- When imports are UNUSED, prioritize removing them
- Consider if the project already has similar components available

Common patterns:
- \`import { specific } from 'package'\` over \`import * as pkg from 'package'\`
- \`const Component = lazy(() => import('./Heavy'))\` for large components
- \`import('package').then()\` for conditional/deferred loading
- \`date-fns\` over \`moment\`, \`dayjs\` over \`moment\`${projectContext}

Always respond with valid JSON matching the specified format.`;
  }

  /**
   * Parse optimization type from AI response
   */
  private parseOptimizationType(
    response: any,
  ):
    | "tree-shaking"
    | "code-splitting"
    | "lazy-loading"
    | "lighter-alternative"
    | "remove-unused" {
    const type = response.optimization_type || "";
    const validTypes = [
      "tree-shaking",
      "code-splitting",
      "lazy-loading",
      "lighter-alternative",
      "remove-unused",
    ];

    return validTypes.includes(type) ? (type as any) : "tree-shaking";
  }

  /**
   * Extract potential savings from AI response
   */
  private extractPotentialSavings(response: any): number | undefined {
    if (typeof response.potential_savings === "number") {
      return response.potential_savings;
    }
    return undefined;
  }

  private generateReferences(
    issue: ImportAnalysisIssue,
    response: any,
  ): Array<{
    title: string;
    url?: string;
    description?: string;
  }> {
    const references = [];

    // Add package-specific references based on the import source
    if (issue.source) {
      const packageName = issue.source.split("/")[0];

      // Add npm package reference
      references.push({
        title: `${packageName} on npm`,
        url: `https://www.npmjs.com/package/${packageName}`,
        description: "Official npm package page",
      });

      // Add bundlephobia reference for size analysis
      references.push({
        title: `${packageName} bundle size`,
        url: `https://bundlephobia.com/package/${packageName}`,
        description: "Bundle size and performance analysis",
      });
    }

    // Add optimization-specific references
    const optimizationType = this.parseOptimizationType(response);
    switch (optimizationType) {
      case "tree-shaking":
        references.push({
          title: "Tree Shaking Guide",
          url: "https://webpack.js.org/guides/tree-shaking/",
          description: "Learn about tree shaking optimization",
        });
        break;
      case "code-splitting":
        references.push({
          title: "Code Splitting Documentation",
          url: "https://webpack.js.org/guides/code-splitting/",
          description: "Dynamic imports and code splitting",
        });
        break;
      case "lazy-loading":
        references.push({
          title: "Lazy Loading Best Practices",
          url: "https://web.dev/lazy-loading/",
          description: "Performance optimization with lazy loading",
        });
        break;
      case "lighter-alternative":
        if (response.alternative_package) {
          references.push({
            title: `${response.alternative_package} on npm`,
            url: `https://www.npmjs.com/package/${response.alternative_package}`,
            description: "Suggested alternative package",
          });
        }
        break;
    }

    // Add project-specific context if available
    if (this.componentRegistry) {
      references.push({
        title: "Similar imports in project",
        description: `Check other files for consistent import patterns`,
      });
    }

    return references;
  }
}
