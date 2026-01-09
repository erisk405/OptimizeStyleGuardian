import { ImportAnalysisIssue, ImportOptimizationSuggestion } from "../types";

export interface ConversationMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

export interface ConversationContext {
    issue: ImportAnalysisIssue;
    suggestion: ImportOptimizationSuggestion;
    messages: ConversationMessage[];
}

export class ConversationManager {
    private conversations: Map<string, ConversationContext> = new Map();

    /**
     * Get conversation key for an issue
     */
    private getConversationKey(issue: ImportAnalysisIssue): string {
        return `${issue.file}:${issue.line}:${issue.source}`;
    }

    /**
     * Start a new conversation for an issue
     */
    startConversation(
        issue: ImportAnalysisIssue,
        suggestion: ImportOptimizationSuggestion
    ): void {
        const key = this.getConversationKey(issue);

        this.conversations.set(key, {
            issue,
            suggestion,
            messages: [
                {
                    role: "assistant",
                    content: suggestion.explanation,
                    timestamp: new Date(),
                },
            ],
        });
    }

    /**
     * Add a user message to conversation
     */
    addUserMessage(issue: ImportAnalysisIssue, message: string): void {
        const key = this.getConversationKey(issue);
        const conversation = this.conversations.get(key);

        if (conversation) {
            conversation.messages.push({
                role: "user",
                content: message,
                timestamp: new Date(),
            });
        }
    }

    /**
     * Add an assistant response to conversation
     */
    addAssistantMessage(issue: ImportAnalysisIssue, message: string): void {
        const key = this.getConversationKey(issue);
        const conversation = this.conversations.get(key);

        if (conversation) {
            conversation.messages.push({
                role: "assistant",
                content: message,
                timestamp: new Date(),
            });
        }
    }

    /**
     * Get conversation history for an issue
     */
    getConversation(issue: ImportAnalysisIssue): ConversationContext | undefined {
        const key = this.getConversationKey(issue);
        return this.conversations.get(key);
    }

    /**
     * Check if conversation exists
     */
    hasConversation(issue: ImportAnalysisIssue): boolean {
        const key = this.getConversationKey(issue);
        return this.conversations.has(key);
    }

    /**
     * Clear conversation for an issue
     */
    clearConversation(issue: ImportAnalysisIssue): void {
        const key = this.getConversationKey(issue);
        this.conversations.delete(key);
    }

    /**
     * Clear all conversations
     */
    clearAll(): void {
        this.conversations.clear();
    }

    /**
     * Get conversation history as formatted text for AI context
     */
    getConversationHistory(issue: ImportAnalysisIssue): string {
        const conversation = this.getConversation(issue);
        if (!conversation) {
            return "";
        }

        return conversation.messages
            .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
            .join("\n\n");
    }

    /**
     * Get message count for a conversation
     */
    getMessageCount(issue: ImportAnalysisIssue): number {
        const conversation = this.getConversation(issue);
        return conversation ? conversation.messages.length : 0;
    }
}
