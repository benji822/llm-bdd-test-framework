import crypto from 'node:crypto';

export function createContentHash(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

export function parseClarificationQuestions(markdown: string): Array<{
  number: number;
  content: string;
  hash: string;
}> {
  const sections = markdown.split(/## Question (\d+)/u).slice(1);
  const questions: Array<{ number: number; content: string; hash: string }> = [];

  for (let i = 0; i < sections.length; i += 2) {
    const number = parseInt(sections[i], 10);
    const content = sections[i + 1]?.trim() ?? '';
    const hash = createContentHash(content);

    questions.push({ number, content, hash });
  }

  return questions;
}

export function detectChangedQuestions(
  currentMarkdown: string,
  previousHash?: string
): number[] | null {
  const currentHash = createContentHash(currentMarkdown);

  if (currentHash === previousHash) {
    return [];
  }

  if (!previousHash) {
    return null;
  }

  return null;
}
