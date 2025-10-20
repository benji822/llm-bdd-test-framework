import path from 'node:path';

import { createLLMProvider, LLMProvider, withLLMRetry } from './llm';
import type { LLMCompletionMetadata, LLMCompletionOptions } from './llm';
import { ensureDir, readTextFile, writeTextFile } from './utils/file-operations';
import { renderPrompt } from './utils/prompt-loader';
import { createPromptCacheKey, getCachedCompletion, setCachedCompletion } from './utils/llm-cache';
import { appendLLMAuditEntry } from './audit-log';

interface GenerateClarificationParams {
  specPath: string;
  outputPath?: string;
  provider?: LLMProvider;
  author?: string;
  llmOptions?: Partial<Pick<LLMCompletionOptions, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>>;
}

interface GenerateClarificationResult {
  outputPath: string;
  content: string;
  metadata: LLMCompletionMetadata;
}

const PROMPT_PATH = path.resolve('tests/prompts/spec-to-questions.md');
const MIN_SPEC_LENGTH = 50;

export async function generateClarificationQuestions(
  params: GenerateClarificationParams,
): Promise<GenerateClarificationResult> {
  const { specPath } = params;
  const absoluteSpecPath = path.resolve(specPath);
  const specContent = await readTextFile(absoluteSpecPath);

  if (specContent.trim().length < MIN_SPEC_LENGTH) {
    throw new Error(`Specification must contain at least ${MIN_SPEC_LENGTH} characters of content.`);
  }

  const specFilename = path.basename(absoluteSpecPath);
  const specSlug = createSlug(specFilename.replace(path.extname(specFilename), ''));

  const prompt = await renderPrompt(PROMPT_PATH, {
    SPEC_FILENAME: specFilename,
    SPEC_AUTHOR: params.author ?? 'unknown',
    SPEC_CONTENT: specContent.trim(),
    SPEC_SLUG: specSlug,
  });

  const provider = params.provider ?? createLLMProvider();
  const llmOptions = buildLlmOptions(provider.name, params.llmOptions);
  const cacheKey = createPromptCacheKey(prompt, provider.name, llmOptions.model, {
    stage: 'generate-questions',
    temperature: llmOptions.temperature,
  });

  const cached = await getCachedCompletion(cacheKey);
  const completion =
    cached ??
    (await withLLMRetry(
      () => provider.generateCompletion(prompt, llmOptions),
      { provider: provider.name },
    ));

  if (!cached) {
    await setCachedCompletion(cacheKey, completion);
  }

  const content = completion.completion.trimEnd();
  validateClarificationMarkdown(content);

  const outputPath = params.outputPath ?? path.resolve('tests/clarifications', `${specSlug}.md`);
  await ensureDir(path.dirname(outputPath));
  await writeTextFile(outputPath, `${content}\n`);

  await appendLLMAuditEntry({
    stage: 'generate-questions',
    provider: completion.metadata.provider,
    model: completion.metadata.model,
    tokensUsed: completion.metadata.tokensUsed,
    responseTimeMs: completion.metadata.responseTime,
    prompt,
    response: completion.completion,
    cached: Boolean(cached),
    promptHash: cacheKey,
    metadata: { specPath: absoluteSpecPath },
  });

  return {
    outputPath,
    content,
    metadata: completion.metadata,
  };
}

function buildLlmOptions(
  providerName: string,
  overrides?: GenerateClarificationParams['llmOptions'],
): LLMCompletionOptions {
  const defaultModel =
    overrides?.model ??
    process.env.LLM_MODEL ??
    (providerName === 'claude' ? 'claude-3-opus' : 'codex-typescript');

  return {
    model: defaultModel,
    temperature: overrides?.temperature ?? readNumberEnv('LLM_TEMPERATURE', 0.3),
    maxTokens: overrides?.maxTokens ?? readNumberEnv('LLM_MAX_TOKENS', 4000),
    timeoutMs: overrides?.timeoutMs ?? readNumberEnv('LLM_TIMEOUT_MS', 180000),
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

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateClarificationMarkdown(markdown: string): void {
  if (!markdown.startsWith('# Clarifications:')) {
    throw new Error('Clarification output must start with "# Clarifications:" header.');
  }
  if (!/## Question \d+/u.test(markdown)) {
    throw new Error('Clarification output must include at least one question section.');
  }
  if (!markdown.includes(CLARIFICATION_PENDING_TOKEN)) {
    throw new Error('Clarification output is missing answer placeholders.');
  }
}

export type { GenerateClarificationParams, GenerateClarificationResult };
const CLARIFICATION_PENDING_TOKEN = '_[Pending answer]_';
