import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(targetDir: string): Promise<void> {
  const resolved = path.resolve(targetDir);
  await fs.mkdir(resolved, { recursive: true });
}

export async function readTextFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  return fs.readFile(resolved, 'utf8');
}

export async function writeTextFile(filePath: string, contents: string): Promise<void> {
  const resolved = path.resolve(filePath);
  await ensureDir(path.dirname(resolved));
  await fs.writeFile(resolved, contents, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(path.resolve(filePath));
    return true;
  } catch {
    return false;
  }
}
