import fs from 'node:fs';
import path from 'node:path';

import { config } from 'dotenv';

const projectRoot = process.cwd();
const envFiles: Array<{ path: string; override: boolean }> = [
  { path: path.resolve(projectRoot, '.env'), override: false },
  { path: path.resolve(projectRoot, '.env.local'), override: true },
];

for (const { path: envPath, override } of envFiles) {
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override });
  }
}
