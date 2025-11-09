import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { generateClarificationQuestions } from '../generate-questions';
import { normalizeYamlSpecification } from '../normalize-yaml';
import { generateFeatureFiles } from '../generate-features';
import { validateFeatureCoverage } from '../validate-coverage';
import { validateSelectors } from '../validate-selectors';
import { LLMProvider, type LLMCompletionOptions, type LLMCompletionResult } from '../llm';

export const MAX_STAGE_DURATION_MS = 3 * 60 * 1000;

class BenchmarkProvider extends LLMProvider {
  private index = 0;

  constructor(private readonly responses: LLMCompletionResult[]) {
    super();
  }

  readonly name = 'codex' as const;

  async generateCompletion(_prompt: string, _options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const result = this.responses[this.index];
    if (!result) {
      throw new Error('BenchmarkProvider exhausted responses');
    }
    this.index += 1;
    return result;
  }
}

export interface PipelineBenchmarkResult {
  stageDurations: Record<string, number>;
}

export async function runPipelineBenchmark(): Promise<PipelineBenchmarkResult> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-benchmark-'));
  const cleanup = async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  };

  const timers: Record<string, number> = {};

  try {
    const specPath = path.join(tmp, 'qa-specs/example-login.txt');
    const clarificationsPath = path.join(tmp, 'clarifications/example-login.md');
    const normalizedPath = path.join(tmp, 'normalized/example-login.yaml');
    const featureDir = path.join(tmp, 'features');
    const selectorsPath = path.join(tmp, 'artifacts', 'selectors', 'registry.json');
    const vocabularyPath = path.join(tmp, 'artifacts/step-vocabulary.json');

    await fs.mkdir(path.dirname(specPath), { recursive: true });
    await fs.mkdir(path.dirname(clarificationsPath), { recursive: true });
    await fs.mkdir(path.dirname(normalizedPath), { recursive: true });
    await fs.mkdir(featureDir, { recursive: true });
    await fs.mkdir(path.dirname(selectorsPath), { recursive: true });

    await fs.writeFile(
      specPath,
      await fs.readFile(path.resolve('tests/qa-specs/example-login.txt'), 'utf8'),
      'utf8',
    );

    const clarDraft = `# Clarifications: example-login\n\n## Question 1\n\n**Q**: Should social login providers appear on the page or only email/password?\n**Why it matters**: Determines UI scope\n**A**: _[Pending answer]_\n**Required**: Yes\n`;

    const normalizeYaml = await fs.readFile(path.resolve('tests/normalized/example-login.yaml'), 'utf8');
    const featureOutput = await fs.readFile(path.resolve('tests/features/example-login.feature'), 'utf8');

    const provider = new BenchmarkProvider([
      {
        completion: clarDraft,
        metadata: { provider: 'codex', model: 'benchmark', tokensUsed: 64, responseTime: 150 },
      },
      {
        completion: normalizeYaml,
        metadata: { provider: 'codex', model: 'benchmark', tokensUsed: 128, responseTime: 220 },
      },
      {
        completion: featureOutput,
        metadata: { provider: 'codex', model: 'benchmark', tokensUsed: 256, responseTime: 310 },
      },
    ]);

    const clarStart = performance.now();
    await generateClarificationQuestions({
      specPath,
      outputPath: clarificationsPath,
      provider,
    });
    timers['spec:questions'] = performance.now() - clarStart;

    await fs.writeFile(
      clarificationsPath,
      `# Clarifications: example-login\n\n## Question 1\n\n**Q**: Should social login providers appear on the page or only email/password?\n**Why it matters**: Determines UI scope\n**A**: Only email and password authentication is in scope.\n**Required**: Yes\n`,
      'utf8',
    );

    const normalizeStart = performance.now();
    await normalizeYamlSpecification({
      specPath,
      clarificationsPath,
      outputPath: normalizedPath,
      provider,
    });
    timers['spec:normalize'] = performance.now() - normalizeStart;

    await fs.writeFile(selectorsPath, await fs.readFile(path.resolve('tests/artifacts/selectors/registry.json'), 'utf8'));
    await fs.writeFile(vocabularyPath, await fs.readFile(path.resolve('tests/artifacts/step-vocabulary.json'), 'utf8'));

    const featureStart = performance.now();
    await generateFeatureFiles({
      yamlPath: normalizedPath,
      outputDir: featureDir,
      provider,
      vocabularyPath,
    });
    timers['spec:features'] = performance.now() - featureStart;

    await validateFeatureCoverage({
      featurePaths: [path.join(featureDir, 'customer-login.feature')],
      vocabularyPath,
    }).catch(() => {});

    await validateSelectors({
      normalizedDir: path.dirname(normalizedPath),
      featuresDir: featureDir,
      registryPath: selectorsPath,
      reportPath: path.join(tmp, 'artifacts/validation-report.json'),
    });

    return { stageDurations: timers };
  } finally {
    await cleanup();
  }
}
