import { createConnection } from '../connection.js';
import { runMigrations } from '../run-migrations.js';

async function main(): Promise<void> {
  const filename = process.env.WIFI_VOUCHER_DB_PATH ?? 'data.db';
  const db = createConnection({ filename });
  try {
    const result = await runMigrations(db);
    if (result.filesApplied.length === 0) {
      console.warn('Sin migraciones nuevas que aplicar.');
    } else {
      console.warn(`Aplicadas ${result.filesApplied.length} migraciones (batch ${result.batchNo}):`);
      for (const f of result.filesApplied) console.warn(`  - ${f}`);
    }
  } finally {
    await db.destroy();
  }
}

void main();
