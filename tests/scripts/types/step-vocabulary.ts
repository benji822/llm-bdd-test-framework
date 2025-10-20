export type StepDomain = 'auth' | 'navigation' | 'interaction' | 'assertion';
export type StepParameterPrimitive = 'string' | 'number' | 'selector';

export interface StepParameter {
  name: string;
  type: StepParameterPrimitive;
}

export interface StepDefinition {
  pattern: string;
  domain: StepDomain;
  file: string;
  parameters: StepParameter[];
  examples: string[];
  version: string;
}

export interface StepVocabulary {
  version: string;
  lastUpdated: string;
  definitions: StepDefinition[];
}

export type StepVocabularyLookup = Record<string, StepDefinition>;
