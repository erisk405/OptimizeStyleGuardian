import Anthropic from "@anthropic-ai/sdk";
import { AIServiceResponse } from "../types/enhanced";

export class AnthropicService {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = "claude-sonnet-4-5-20250929") {
    this.client = new Anthropic({
      apiKey,
      defaultHeaders: {
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
    });
    this.model = model;
  }

  /**
   * Ask Claude to analyze code and provide a specific fix suggestion
   */
  async analyzeSuggestion(
    prompt: string,
    systemPrompt?: string,
  ): Promise<AIServiceResponse | null> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt
          ? [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" } as any, // Type cast for beta feature
              },
            ]
          : undefined,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent code suggestions
      } as any); // Type cast for beta feature

      const content = response.content[0];
      if (content.type !== "text") {
        console.error("Unexpected response type from Claude");
        return null;
      }

      // Try to parse JSON response
      const textContent = content.text;

      // Extract JSON from markdown code blocks if present
      const jsonMatch = textContent.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
      );
      const jsonString = jsonMatch ? jsonMatch[1] : textContent;

      try {
        const parsed = JSON.parse(jsonString);
        return {
          explanation: parsed.explanation || "",
          original_code: parsed.original_code || "",
          suggested_code: parsed.suggested_code || "",
          reasoning: parsed.reasoning || "",
          confidence: parsed.confidence || "medium",
          start_line: parsed.start_line || 0,
          end_line: parsed.end_line || 0,
        };
      } catch (parseError) {
        console.error("Failed to parse Claude response as JSON:", parseError);
        console.log("Raw response:", textContent);

        // Fallback: extract information from text response
        return this.parseTextResponse(textContent);
      }
    } catch (error) {
      console.error("Error calling Anthropic API:", error);
      return null;
    }
  }

  /**
   * Fallback parser for non-JSON responses
   */
  private parseTextResponse(text: string): AIServiceResponse | null {
    // Try to extract code blocks
    const codeBlocks = text.match(/```[\s\S]*?```/g);

    if (!codeBlocks || codeBlocks.length < 2) {
      return null;
    }

    const original = codeBlocks[0]
      .replace(/```[\w]*\n?/, "")
      .replace(/```$/, "")
      .trim();
    const suggested = codeBlocks[1]
      .replace(/```[\w]*\n?/, "")
      .replace(/```$/, "")
      .trim();

    return {
      explanation: text.split("```")[0].trim(),
      original_code: original,
      suggested_code: suggested,
      reasoning: "AI analysis",
      confidence: "medium",
      start_line: 0,
      end_line: 0,
    };
  }

  /**
   * Chat with Claude (for follow-up questions)
   */
  async chat(prompt: string, systemPrompt?: string): Promise<string | null> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt
          ? [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" } as any,
              },
            ]
          : undefined,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.5, // Slightly higher for conversational responses
      } as any);

      const content = response.content[0];
      if (content.type !== "text") {
        console.error("Unexpected response type from Claude");
        return null;
      }

      return content.text;
    } catch (error) {
      console.error("Error calling Anthropic API:", error);
      return null;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
      });
      return response.content.length > 0;
    } catch (error) {
      console.error("API connection test failed:", error);
      return false;
    }
  }
}
