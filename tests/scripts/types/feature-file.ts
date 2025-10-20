export type GherkinKeyword = 'Feature' | 'Background' | 'Scenario' | 'Scenario Outline';
export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface GherkinStep {
  keyword: StepKeyword;
  text: string;
  docString?: string;
  dataTable?: string[][];
}

export interface ScenarioExampleRow {
  [column: string]: string;
}

export interface ScenarioExamples {
  name?: string;
  tags?: string[];
  rows: ScenarioExampleRow[];
}

export interface GherkinBackground {
  steps: GherkinStep[];
}

export interface GherkinScenario {
  name: string;
  tags?: string[];
  steps: GherkinStep[];
  examples?: ScenarioExamples[];
  outline?: boolean;
}

export interface FeatureMetadata {
  specId: string;
  generatedAt: string;
  llmProvider: string;
  llmModel: string;
}

export interface FeatureDocument {
  name: string;
  description?: string;
  tags?: string[];
  background?: GherkinBackground;
  scenarios: GherkinScenario[];
  filepath?: string;
  metadata?: FeatureMetadata;
}
