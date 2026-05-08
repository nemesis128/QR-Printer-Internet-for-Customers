import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('passwords');
  if (exists) return;

  await knex.schema.createTable('passwords', (t) => {
    t.increments('id').primary();
    t.text('password').notNullable();
    t.text('ssid').notNullable();
    t.text('created_at')
      .notNullable()
      .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
    t.integer('active').notNullable().defaultTo(0);
    t.text('rotated_by').notNullable();
    t.text('router_response');
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_passwords_active ON passwords(active)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_passwords_created ON passwords(created_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('passwords');
}
