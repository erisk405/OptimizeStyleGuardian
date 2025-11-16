import * as vscode from 'vscode';
import * as fs from 'fs';
import { AnthropicService } from './anthropicService';
import {
    AnalysisResult,
    DuplicateStyleIssue,
    DesignSystemIssue,
    PerformanceIssue
} from '../types';
import {
    EnhancedAnalysisResult,
    EnhancedDuplicateStyleIssue,
    EnhancedDesignSystemIssue,
    EnhancedPerformanceIssue,
    AISuggestion
} from '../types/enhanced';

export class IssueEnhancer {
    constructor(
        private anthropicService: AnthropicService,
        private maxIssues: number = 10,
        private contextLines: number = 5
    ) {}

    /**
     * Enhance analysis result with AI suggestions
     */
    async enhanceResult(
        result: AnalysisResult,
        workspaceRoot: string
    ): Promise<EnhancedAnalysisResult> {
        // Collect all issues and prioritize
        const allIssues: Array<{
            type: 'duplicate' | 'design' | 'performance';
            issue: DuplicateStyleIssue | DesignSystemIssue | PerformanceIssue;
            priority: number;
        }> = [];

        // Add duplicates (high priority for critical/error)
        result.duplicates.forEach(issue => {
            allIssues.push({
                type: 'duplicate',
                issue,
                priority: issue.severity === 'error' ? 3 : issue.severity === 'warning' ? 2 : 1
            });
        });

        // Add design system issues
        result.designSystem.forEach(issue => {
            allIssues.push({
                type: 'design',
                issue,
                priority: issue.severity === 'error' ? 3 : issue.severity === 'warning' ? 2 : 1
            });
        });

        // Add performance issues (prioritize critical)
        result.performance.forEach(issue => {
            allIssues.push({
                type: 'performance',
                issue,
                priority: issue.severity === 'critical' ? 3 : issue.severity === 'warning' ? 2 : 1
            });
        });

        // Sort by priority (highest first)
        allIssues.sort((a, b) => b.priority - a.priority);

        // Take top N issues
        const issuesToEnhance = allIssues.slice(0, this.maxIssues);

        // Enhance each issue
        const enhancedDuplicates: EnhancedDuplicateStyleIssue[] = [...result.duplicates];
        const enhancedDesignSystem: EnhancedDesignSystemIssue[] = [...result.designSystem];
        const enhancedPerformance: EnhancedPerformanceIssue[] = [...result.performance];

        for (const { type, issue } of issuesToEnhance) {
            try {
                const aiSuggestion = await this.enhanceIssue(issue, workspaceRoot);

                if (aiSuggestion) {
                    if (type === 'duplicate') {
                        const index = enhancedDuplicates.findIndex(i =>
                            i.file === issue.file && i.line === issue.line
                        );
                        if (index >= 0) {
                            enhancedDuplicates[index] = { ...enhancedDuplicates[index], aiSuggestion };
                        }
                    } else if (type === 'design') {
                        const index = enhancedDesignSystem.findIndex(i =>
                            i.file === issue.file && i.line === issue.line
                        );
                        if (index >= 0) {
                            enhancedDesignSystem[index] = { ...enhancedDesignSystem[index], aiSuggestion };
                        }
                    } else if (type === 'performance') {
                        const index = enhancedPerformance.findIndex(i =>
                            i.file === issue.file && i.line === issue.line
                        );
                        if (index >= 0) {
                            enhancedPerformance[index] = { ...enhancedPerformance[index], aiSuggestion };
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to enhance issue:', error);
                // Continue with other issues
            }
        }

        return {
            ...result,
            duplicates: enhancedDuplicates,
            designSystem: enhancedDesignSystem,
            performance: enhancedPerformance
        };
    }

    /**
     * Enhance a single issue with AI suggestion
     */
    private async enhanceIssue(
        issue: DuplicateStyleIssue | DesignSystemIssue | PerformanceIssue,
        workspaceRoot: string
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

            // Call AI service
            const aiResponse = await this.anthropicService.analyzeSuggestion(prompt);
            if (!aiResponse) {
                return null;
            }

            // Convert to AISuggestion
            return {
                explanation: aiResponse.explanation,
                codeChange: {
                    original: aiResponse.original_code,
                    suggested: aiResponse.suggested_code,
                    startLine: aiResponse.start_line || (issue.line || 1),
                    endLine: aiResponse.end_line || (issue.line || 1)
                },
                reasoning: aiResponse.reasoning,
                confidence: aiResponse.confidence
            };
        } catch (error) {
            console.error('Error enhancing issue:', error);
            return null;
        }
    }

    /**
     * Read file content
     */
    private async readFileContent(filePath: string): Promise<string | null> {
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            console.error(`Failed to read file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Extract code context around a specific line
     */
    private extractContext(content: string, line: number): string {
        const lines = content.split('\n');
        const startLine = Math.max(0, line - this.contextLines - 1);
        const endLine = Math.min(lines.length, line + this.contextLines);

        return lines
            .slice(startLine, endLine)
            .map((l, i) => `${startLine + i + 1}: ${l}`)
            .join('\n');
    }

    /**
     * Generate prompt for AI based on issue type
     */
    private generatePrompt(
        issue: DuplicateStyleIssue | DesignSystemIssue | PerformanceIssue,
        context: string
    ): string {
        const basePrompt = `You are a frontend code review assistant. Analyze this code issue and provide a specific, actionable fix.

File: ${issue.file}
Line: ${issue.line || 'N/A'}

Code Context:
\`\`\`
${context}
\`\`\`

`;

        let specificPrompt = '';

        if ('duplicateOf' in issue) {
            // Duplicate style issue
            specificPrompt = `Issue Type: Duplicate Style
Current Class: ${issue.class}
Duplicate Of: ${issue.duplicateOf}
Similarity: ${issue.similarity}%
Properties: ${issue.properties?.join(', ') || 'N/A'}

Task: Suggest how to refactor this code to use the existing class "${issue.duplicateOf}" instead of the duplicate class "${issue.class}".`;
        } else if ('current' in issue && 'suggested' in issue) {
            // Design system issue
            specificPrompt = `Issue Type: Design System Compliance
Current: ${issue.current}
Suggested: ${issue.suggested}
Reason: ${issue.reason}

Task: Show how to replace "${issue.current}" with the design system component/token "${issue.suggested}".`;
        } else if ('message' in issue) {
            // Performance issue
            specificPrompt = `Issue Type: Performance
Problem: ${issue.message}
Details: ${JSON.stringify(issue.details)}
Recommendation: ${issue.recommendation}

Task: Provide specific code changes to fix this performance issue.`;
        }

        return basePrompt + specificPrompt + `

Please respond with a JSON object in the following format:
{
    "explanation": "Brief explanation of the problem (2-3 sentences)",
    "original_code": "The exact code that needs to be changed",
    "suggested_code": "The replacement code",
    "reasoning": "Why this fix improves the code",
    "confidence": "high|medium|low",
    "start_line": ${issue.line || 1},
    "end_line": ${issue.line || 1}
}`;
    }
}
