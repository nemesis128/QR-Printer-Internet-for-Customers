import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('system_info');
  if (exists) return;

  await knex.schema.createTable('system_info', (t) => {
    t.text('key').primary();
    t.text('value').notNullable();
    t.text('updated_at').notNullable();
  });

  const now = new Date().toISOString();
  await knex('system_info').insert([
    { key: 'schema_version', value: '1', updated_at: now },
    { key: 'app_version_last_run', value: '0.0.0', updated_at: now },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_info');
}
