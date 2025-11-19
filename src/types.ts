// Analysis result types returned by Rust engine

export interface AnalysisResult {
  duplicates: DuplicateStyleIssue[];
  designSystem: DesignSystemIssue[];
  performance: PerformanceIssue[];
  imports: ImportAnalysisIssue[];
  summary: AnalysisSummary;
}

export interface DuplicateStyleIssue {
  type: "identical_classes" | "similar_classes" | "inline_style_duplicate";
  file: string;
  line: number;
  column?: number;
  class: string;
  duplicateOf: string;
  similarity: number;
  severity: "error" | "warning" | "info";
  properties?: string[];
}

export interface DesignSystemIssue {
  type:
    | "component_replacement"
    | "class_replacement"
    | "color_token"
    | "spacing_token";
  file: string;
  line: number;
  column?: number;
  current: string;
  suggested: string;
  keywords?: string[];
  severity: "error" | "warning" | "info";
  reason: string;
}

export interface PerformanceIssue {
  type:
    | "large_bundle"
    | "unused_css"
    | "missing_lazy_load"
    | "missing_dimensions"
    | "sync_script"
    | "large_inline_script"
    | "heavy_component"
    | "expensive_selector"
    | "large_image"
    | "missing_viewport"
    | "missing_preload"
    | "layout_shift_risk"
    | "render_blocking";
  file: string;
  line?: number;
  column?: number;
  severity: "critical" | "warning" | "info";
  message: string;
  details?: {
    size?: number;
    threshold?: number;
    componentType?: string;
    selector?: string;
  };
  recommendation: string;
}

export interface ImportAnalysisIssue {
  file: string;
  line: number;
  importedItems: string[];
  source: string;
  sizeKb?: number;
  resolvedPath?: string;
  severity: "error" | "warning" | "info";
  message: string;
  aiSuggestion?: ImportOptimizationSuggestion;
  itemUsage?: {
    [itemName: string]: {
      count: number;
      lines: number[];
    };
  };
}

export interface ImportOptimizationSuggestion {
  explanation: string;
  codeChange: {
    original: string;
    suggested: string;
    startLine: number;
    endLine: number;
  };
  reasoning: string;
  confidence: "high" | "medium" | "low";
  optimizationType:
    | "tree-shaking"
    | "code-splitting"
    | "lazy-loading"
    | "lighter-alternative"
    | "remove-unused";
  potentialSavings?: number; // KB saved
  alternativePackage?: string;
}

export interface AnalysisSummary {
  totalFiles: number;
  totalIssues: number;
  duplicateCount: number;
  designSystemCount: number;
  performanceCount: number;
  importCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

export interface ScanOptions {
  paths: string[];
  workspaceRoot: string;
  configPath?: string;
  similarity?: number;
  performanceThresholds?: {
    jsBundleKb?: number;
    cssSizeKb?: number;
    imageSizeKb?: number;
  };
  enabledCategories?: {
    duplicateStyles?: boolean;
    designSystem?: boolean;
    performance?: boolean;
    importAnalysis?: boolean;
  };
  excludePatterns?: string[];
}

export interface DesignSystemConfig {
  components?: {
    [key: string]: {
      selector: string;
      keywords: string[];
      replaces?: string[];
    };
  };
  tokens?: {
    colors?: { [key: string]: string };
    spacing?: { [key: string]: string };
    typography?: { [key: string]: string };
  };
}
