import os from 'node:os';
import path from 'node:path';

import { appendLLMAuditEntry } from './audit-log';
import { LLMProvider, createLLMProvider, withLLMRetry } from './llm';
import type { LLMCompletionMetadata, LLMCompletionOptions } from './llm';
import { NormalizedYamlSchema } from './types/yaml-spec';
import { ensureDir, fileExists, readTextFile, writeTextFile } from './utils/file-operations';
import { createContentHash, detectChangedQuestions } from './utils/hash';
import { runConcurrent } from './utils/concurrent';
import { createPromptCacheKey, getCachedCompletion, setCachedCompletion } from './utils/llm-cache';
import { logEvent, logLLMInteraction } from './utils/logging';
import { renderPrompt } from './utils/prompt-loader';
import { parseYaml, sanitizeYamlInput, stringifyYaml } from './utils/yaml-parser';

interface NormalizeYamlParams {
  specPath: string;
  clarificationsPath: string;
  outputPath?: string;
  provider?: LLMProvider;
  llmOptions?: Partial<
    Pick<LLMCompletionOptions, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>
  >;
  force?: boolean;
}

interface NormalizeYamlResult {
  outputPath: string;
  content: string;
  metadata: LLMCompletionMetadata;
}

interface NormalizeYamlBatchParams {
  specPaths: string[];
  clarificationsDir: string;
  outputDir?: string;
  provider?: LLMProvider;
  concurrency?: number;
  llmOptions?: Partial<
    Pick<LLMCompletionOptions, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>
  >;
}

const PROMPT_PATH = path.resolve('tests/prompts/questions-to-yaml.md');
const CLARIFICATION_PENDING_TOKEN = '_[Pending answer]_';

export async function normalizeYamlSpecification(
  params: NormalizeYamlParams
): Promise<NormalizeYamlResult> {
  const { specPath, clarificationsPath } = params;

  const specContent = await readTextFile(path.resolve(specPath));
  const clarificationsContent = await readTextFile(path.resolve(clarificationsPath));

  if (hasPendingClarifications(clarificationsContent)) {
    throw new Error('Missing required clarification answers. YAML generation blocked.');
  }

  const specFilename = path.basename(specPath);

  // Calculate output path early to check for existing YAML
  const outputPath =
    params.outputPath ??
    path.resolve(
      'tests/normalized',
      `${createSlug(specFilename.replace(path.extname(specFilename), ''))}.yaml`
    );

  // Check if output already exists and load it
  let existingYaml = undefined;
  if (await fileExists(outputPath)) {
    try {
      const existingContent = await readTextFile(outputPath);
      const parsedValue = parseYaml<unknown>(existingContent);
      existingYaml = NormalizedYamlSchema.parse(parsedValue);
    } catch {
      existingYaml = undefined;
    }
  }

  // Detect changes in clarifications
  const clarificationsHash = createContentHash(clarificationsContent);
  const changedQuestions = detectChangedQuestions(
    clarificationsContent,
    existingYaml?.metadata?.clarificationsHash
  );

  // If no changes detected and not forced, return existing YAML
  if (!params.force && changedQuestions !== null && changedQuestions.length === 0 && existingYaml) {
    logEvent('normalize.cache-hit', `Using cached YAML for ${specFilename}`, {
      outputPath,
      clarificationsHash,
      previousHash: existingYaml.metadata.clarificationsHash,
    });

    console.log(`✓ No changes detected, using cached YAML: ${path.basename(outputPath)}`);

    return {
      outputPath,
      content: stringifyYaml(existingYaml).trimEnd(),
      metadata: {
        provider: existingYaml.metadata.llmProvider as 'codex' | 'claude',
        model: existingYaml.metadata.llmModel,
        tokensUsed: 0,
        responseTime: 0,
      },
    };
  }

  // Load step vocabulary to ensure generated steps match vocabulary patterns
  const vocabularyPath = path.resolve('tests/artifacts/step-vocabulary.json');
  const vocabularyJson = await readTextFile(vocabularyPath);
  const vocabularyPatterns = extractVocabularyPatterns(vocabularyJson);
  const prompt = await renderPrompt(PROMPT_PATH, {
    SPEC_FILENAME: specFilename,
    SPEC_CONTENT: specContent.trim(),
    CLARIFICATIONS_MARKDOWN: clarificationsContent.trim(),
    STEP_VOCABULARY_PATTERNS: vocabularyPatterns,
    SELECTOR_REGISTRY_SNIPPET: '',
    LLM_PROVIDER: process.env.LLM_PROVIDER ?? 'codex',
    LLM_MODEL: resolveModelName(params.llmOptions?.model),
  });

  const provider = params.provider ?? createLLMProvider();
  const options = buildLlmOptions(provider.name, params.llmOptions);
  const cacheKey = createPromptCacheKey(prompt, provider.name, options.model, {
    stage: 'normalize-yaml',
    temperature: options.temperature,
  });

  const cached = await getCachedCompletion(cacheKey);
  const completion =
    cached ??
    (await withLLMRetry(() => provider.generateCompletion(prompt, options), {
      provider: provider.name,
    }));

  if (!cached) {
    await setCachedCompletion(cacheKey, completion);
  }

  logLLMInteraction('normalize-yaml', {
    provider: completion.metadata.provider,
    model: completion.metadata.model,
    totalTokens: completion.metadata.tokensUsed,
    responseTimeMs: completion.metadata.responseTime,
    metadata: { cached: Boolean(cached) },
  });

  await appendLLMAuditEntry({
    stage: 'normalize-yaml',
    provider: completion.metadata.provider,
    model: completion.metadata.model,
    tokensUsed: completion.metadata.tokensUsed,
    responseTimeMs: completion.metadata.responseTime,
    prompt,
    response: completion.completion,
    cached: Boolean(cached),
    promptHash: cacheKey,
    metadata: { specPath, clarificationsPath },
  });

  const sanitized = sanitizeYamlInput(completion.completion);
  const parsedValue = parseYaml<unknown>(sanitized);
  coerceMetadataTypes(parsedValue);

  // Add clarifications hash to metadata
  if (parsedValue && typeof parsedValue === 'object') {
    const record = parsedValue as Record<string, unknown>;
    if (record.metadata && typeof record.metadata === 'object') {
      const metadata = record.metadata as Record<string, unknown>;
      metadata.clarificationsHash = clarificationsHash;
    }
  }

  let parsed;
  try {
    parsed = NormalizedYamlSchema.parse(parsedValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Normalized YAML validation failed: ${message}. See tests/schemas/yaml-spec.schema.json and specs/001-llm-bdd-test-pipeline/quickstart.md for required structure.`,
      { cause: error instanceof Error ? error : undefined }
    );
  }
  const canonicalYaml = stringifyYaml(parsed).trimEnd();

  await ensureDir(path.dirname(outputPath));
  await writeTextFile(outputPath, `${canonicalYaml}\n`);

  return {
    outputPath,
    content: canonicalYaml,
    metadata: completion.metadata,
  };
}

function resolveModelName(overridden?: string): string {
  return overridden ?? process.env.LLM_MODEL ?? 'codex-typescript';
}

function buildLlmOptions(
  providerName: string,
  overrides?: NormalizeYamlParams['llmOptions']
): LLMCompletionOptions {
  return {
    model: resolveModelName(overrides?.model),
    // Lower temperature (0.1 vs 0.3) for more deterministic YAML generation
    temperature: overrides?.temperature ?? readNumberEnv('LLM_TEMPERATURE', 0.1),
    // Reduced max tokens (3000 vs 4000) - YAML specs rarely exceed 3000 tokens
    maxTokens: overrides?.maxTokens ?? readNumberEnv('LLM_MAX_TOKENS', 3000),
    // Reduced timeout (2 min vs 3 min) - most normalizations complete within 2 minutes
    timeoutMs: overrides?.timeoutMs ?? readNumberEnv('LLM_TIMEOUT_MS', 120000),
    metadata: { provider: providerName },
  };
}

function readNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasPendingClarifications(markdown: string): boolean {
  const sections = markdown.split(/## Question \d+/u).slice(1);

  return sections.some((section) => {
    const requiredMatch = section.match(/\*\*Required\*\*:\s*(Yes|No)/i);
    if (!requiredMatch) {
      return false;
    }
    const isRequired = requiredMatch[1].toLowerCase() === 'yes';
    return isRequired && /_\s*\[Pending answer]_/.test(section);
  });
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function normalizeYamlBatch(
  params: NormalizeYamlBatchParams
): Promise<NormalizeYamlResult[]> {
  const { specPaths, clarificationsDir, outputDir } = params;

  if (specPaths.length === 0) {
    return [];
  }

  const concurrency = Math.max(
    1,
    Math.min(
      params.concurrency ?? Math.max(1, os.cpus().length - 1),
      specPaths.length
    )
  );

  const provider = params.provider ?? createLLMProvider();

  const tasks = specPaths.map((specPath) => {
    const specFilename = path.basename(specPath, path.extname(specPath));
    const clarificationsPath = path.join(
      clarificationsDir,
      `${specFilename}.md`
    );

    const outputPath = outputDir
      ? path.join(outputDir, `${createSlug(specFilename)}.yaml`)
      : undefined;

    return () =>
      normalizeYamlSpecification({
        specPath,
        clarificationsPath,
        outputPath,
        provider,
        llmOptions: params.llmOptions,
      });
  });

  return runConcurrent(tasks, concurrency);
}

export type { NormalizeYamlParams, NormalizeYamlResult, NormalizeYamlBatchParams };

function coerceMetadataTypes(value: unknown): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  const metadata = record.metadata;

  if (!metadata || typeof metadata !== 'object') {
    return;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  const generatedAt = metadataRecord.generatedAt;

  if (generatedAt instanceof Date) {
    metadataRecord.generatedAt = generatedAt.toISOString();
  }
}

function extractVocabularyPatterns(vocabularyJson: string): string {
  try {
    const vocabulary = JSON.parse(vocabularyJson) as {
      definitions?: Array<{ pattern?: unknown }>;
    };

    if (!Array.isArray(vocabulary.definitions)) {
      throw new Error('Step vocabulary file is missing the definitions array.');
    }

    const patterns = vocabulary.definitions
      .map((definition) =>
        typeof definition.pattern === 'string' ? definition.pattern.trim() : null
      )
      .filter((pattern): pattern is string => Boolean(pattern));

    if (patterns.length === 0) {
      throw new Error('No pattern strings found in step vocabulary definitions.');
    }

    return patterns.map((pattern) => `- ${pattern}`).join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract step vocabulary patterns: ${message}`);
  }
}
