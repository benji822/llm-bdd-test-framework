import path from 'node:path';

import { readTextFile } from './file-operations';
import type { ValidationIssue } from '../types/validation-report';

interface SecretPattern {
  pattern: RegExp;
  message: string;
  labelIndex?: number;
  valueIndex?: number;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    message: 'Possible AWS access key detected',
  },
  {
    pattern:
      /([A-Za-z0-9._-]*?(?:aws_secret_access_key|awsSecretAccessKey)[A-Za-z0-9._-]*)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    message: 'Possible AWS secret access key detected',
    labelIndex: 1,
    valueIndex: 2,
  },
  {
    pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
    message: 'Possible Stripe live secret key detected',
  },
  {
    pattern: /-----BEGIN (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----/g,
    message: 'Possible private key detected',
  },
  {
    pattern:
      /\b([A-Za-z0-9._-]*?(?:api[-_]?key|apikey|secret|token|password)[A-Za-z0-9._-]*)\b\s*[:=]\s*["']?([A-Za-z0-9_\-]{20,})["']?/gi,
    message: 'Potential credential assignment detected',
    labelIndex: 1,
    valueIndex: 2,
  },
  {
    pattern: /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    message: 'Possible JWT token detected',
  },
];

export interface SecretScanOptions {
  files: string[];
}

export async function scanFilesForSecrets(options: SecretScanOptions): Promise<ValidationIssue[]> {
  const results: ValidationIssue[] = [];
  const seen = new Set<string>();
  const spans = new Set<string>();

  for (const file of options.files) {
    let contents: string;
    try {
      contents = await readTextFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    for (const detector of SECRET_PATTERNS) {
      const regex = new RegExp(detector.pattern);
      let match: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((match = regex.exec(contents)) !== null) {
        const raw = detector.valueIndex !== undefined ? match[detector.valueIndex] : match[0];
        if (!raw || shouldIgnoreSecret(raw)) {
          continue;
        }
        const baseIndex = match.index ?? contents.indexOf(match[0]);
        const valueIndex = baseIndex >= 0 ? contents.indexOf(raw, baseIndex) : baseIndex;
        const cacheKey = `${file}:${valueIndex}:${detector.message}`;
        if (seen.has(cacheKey)) {
          continue;
        }
        seen.add(cacheKey);
        const spanKey = `${file}:${valueIndex}:${raw.length}`;
        if (spans.has(spanKey)) {
          continue;
        }
        spans.add(spanKey);

        const label = detector.labelIndex !== undefined ? match[detector.labelIndex] : undefined;
        const message = label ? `${detector.message} (${label})` : detector.message;

        results.push({
          severity: 'error',
          type: 'secret',
          message: `${message}: ${maskSecret(raw)}`,
          file: path.resolve(file),
          line: computeLineNumber(contents, valueIndex),
          suggestion: 'Replace secrets with environment variables or placeholders before committing.',
        });
      }
    }
  }

  return results;
}

function shouldIgnoreSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return true;
  }
  return /E2E_|PLACEHOLDER/i.test(trimmed);
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return '<redacted>';
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function computeLineNumber(contents: string, index: number): number | undefined {
  if (index < 0) {
    return undefined;
  }
  const substring = contents.slice(0, index);
  return substring.split(/\r?\n/).length;
}
