export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationIssueType = 'schema' | 'lint' | 'selector' | 'coverage' | 'secret';

export interface ValidationIssue {
  severity: ValidationSeverity;
  type: ValidationIssueType;
  message: string;
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationSummary {
  schemaErrors: number;
  lintErrors: number;
  selectorMismatches: number;
  coverageGaps: number;
  secretFindings: number;
}

export interface ValidationReport {
  timestamp: string;
  totalFiles: number;
  passed: number;
  failed: number;
  issues: ValidationIssue[];
  summary: ValidationSummary;
}
