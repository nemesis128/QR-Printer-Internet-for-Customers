import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const configExists = await knex.schema.hasTable('config');
  if (!configExists) {
    await knex.schema.createTable('config', (t) => {
      t.text('key').primary();
      t.text('value').notNullable();
      t.text('updated_at').notNullable();
    });
  }

  const auditExists = await knex.schema.hasTable('audit_log');
  if (!auditExists) {
    await knex.schema.createTable('audit_log', (t) => {
      t.increments('id').primary();
      t.text('event_type').notNullable();
      t.text('payload');
      t.text('created_at')
        .notNullable()
        .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_log');
  await knex.schema.dropTableIfExists('config');
}
