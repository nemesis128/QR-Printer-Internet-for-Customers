import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('print_log');
  if (exists) return;

  await knex.schema.createTable('print_log', (t) => {
    t.increments('id').primary();
    t.integer('password_id').notNullable().references('id').inTable('passwords');
    t.text('printed_at')
      .notNullable()
      .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
    t.integer('success').notNullable();
    t.text('error_message');
    t.text('job_id');
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_log_date ON print_log(printed_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_log_password ON print_log(password_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('print_log');
}
