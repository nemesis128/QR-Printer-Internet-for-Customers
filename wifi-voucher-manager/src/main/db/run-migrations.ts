import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Knex } from 'knex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MigrationResult {
  batchNo: number;
  filesApplied: string[];
}

export async function runMigrations(db: Knex): Promise<MigrationResult> {
  const [batchNo, filesApplied] = (await db.migrate.latest({
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
    loadExtensions: ['.ts', '.js'],
  })) as [number, string[]];

  return { batchNo, filesApplied };
}
