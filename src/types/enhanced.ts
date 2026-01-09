import {
  DuplicateStyleIssue,
  DesignSystemIssue,
  PerformanceIssue,
  AnalysisResult,
} from "../types";

export interface AISuggestion {
  explanation: string;
  codeChange: {
    original: string;
    suggested: string;
    startLine: number;
    endLine: number;
  };
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

export interface EnhancedDuplicateStyleIssue extends DuplicateStyleIssue {
  aiSuggestion?: AISuggestion;
}

export interface EnhancedDesignSystemIssue extends DesignSystemIssue {
  aiSuggestion?: AISuggestion;
}

export interface EnhancedPerformanceIssue extends PerformanceIssue {
  aiSuggestion?: AISuggestion;
}

export interface EnhancedAnalysisResult extends AnalysisResult {
  duplicates: EnhancedDuplicateStyleIssue[];
  designSystem: EnhancedDesignSystemIssue[];
  performance: EnhancedPerformanceIssue[];
}

export interface AIServiceResponse {
  explanation: string;
  original_code: string;
  suggested_code: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  start_line: number;
  end_line: number;
  optimization_type?: string;
  potential_savings?: number;
  alternative_package?: string;
}
