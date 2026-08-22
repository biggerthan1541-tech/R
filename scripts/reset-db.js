import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.env.DB_PATH ?? resolve(process.cwd(), 'data/gap-analysis.db');
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(path + suffix, { force: true });
}
console.log(`Removed ${path}`);
