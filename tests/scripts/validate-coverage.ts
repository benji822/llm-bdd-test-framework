import path from 'node:path';

import { readTextFile } from './utils/file-operations';
import { StepDefinition, StepVocabulary } from './types/step-vocabulary';

interface ValidateCoverageOptions {
  featurePaths: string[];
  vocabularyPath?: string;
}

interface CoverageResult {
  totalSteps: number;
  coveredSteps: number;
  uncovered: Array<{ file: string; step: string }>;
}

const DEFAULT_VOCABULARY_PATH = path.resolve('tests/artifacts/step-vocabulary.json');

export async function validateFeatureCoverage(options: ValidateCoverageOptions): Promise<CoverageResult> {
  const vocabularyPath = options.vocabularyPath ?? DEFAULT_VOCABULARY_PATH;
  const vocabulary = await loadVocabulary(vocabularyPath);
  const matcher = buildMatcher(vocabulary.definitions);

  let totalSteps = 0;
  const uncovered: CoverageResult['uncovered'] = [];

  for (const featurePath of options.featurePaths) {
    const featureSource = await readTextFile(featurePath);
    const steps = collectSteps(featureSource);

    totalSteps += steps.length;

    for (const step of steps) {
      if (!matcher(step.text)) {
        uncovered.push({ file: featurePath, step: `${step.keyword}${step.text}` });
      }
    }
  }

  if (uncovered.length > 0) {
    const lines = uncovered.map((entry) => `${entry.file}: Step "${entry.step}" is not covered by vocabulary.`);
    throw new Error(lines.join('\n'));
  }

  return {
    totalSteps,
    coveredSteps: totalSteps,
    uncovered,
  };
}

async function loadVocabulary(vocabularyPath: string): Promise<StepVocabulary> {
  const raw = await readTextFile(path.resolve(vocabularyPath));
  return JSON.parse(raw) as StepVocabulary;
}

type StepMatcher = (stepText: string) => boolean;

function buildMatcher(definitions: StepDefinition[]): StepMatcher {
  const regexes = definitions.map((definition) => convertPatternToRegex(definition.pattern));
  return (stepText: string) => regexes.some((regex) => regex.test(stepText));
}

function convertPatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const transformed = escaped.replace(/\\\{[^}]+\\\}/g, '(.+)');
  return new RegExp(`^${transformed}$`, 'i');
}

interface ParsedStep {
  keyword: string;
  text: string;
}

function collectSteps(source: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  const stepLine = /^\s*(Given|When|Then|And|But)\s+(.*)$/i;

  for (const line of source.split(/\r?\n/)) {
    const match = stepLine.exec(line);
    if (!match) {
      continue;
    }
    const keyword = match[1];
    const text = match[2].trim();
    if (text.length === 0) {
      continue;
    }
    steps.push({ keyword: `${keyword} `, text });
  }

  return steps;
}
