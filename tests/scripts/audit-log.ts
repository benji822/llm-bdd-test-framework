import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from './utils/file-operations';

const AUDIT_DIR = path.resolve('tests/artifacts/audit');
const AUDIT_LOG_PATH = path.join(AUDIT_DIR, 'llm-interactions.jsonl');

export interface LLMAuditEntry {
  stage: string;
  provider: string;
  model: string;
  tokensUsed: number;
  responseTimeMs: number;
  prompt: string;
  response: string;
  cached?: boolean;
  promptHash?: string;
  metadata?: Record<string, unknown>;
}

export async function appendLLMAuditEntry(entry: LLMAuditEntry): Promise<void> {
  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
    prompt: truncate(entry.prompt),
    response: truncate(entry.response),
  };

  await ensureDir(AUDIT_DIR);
  await fs.appendFile(AUDIT_LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
}

function truncate(value: string, limit = 4000): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}
