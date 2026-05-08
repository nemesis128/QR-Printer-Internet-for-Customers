import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const printerExists = await knex.schema.hasTable('printer');
  if (!printerExists) {
    await knex.schema.createTable('printer', (t) => {
      t.text('id').primary();
      t.text('name').notNullable();
      t.text('connection').notNullable();
      t.text('identifier').notNullable();
      t.integer('width_chars').notNullable();
      t.integer('active').notNullable().defaultTo(1);
      t.text('notes');
    });
  }

  const jobExists = await knex.schema.hasTable('print_job');
  if (!jobExists) {
    await knex.schema.createTable('print_job', (t) => {
      t.text('id').primary();
      t.text('printer_id').notNullable().references('id').inTable('printer');
      t.text('use_case').notNullable();
      t.text('payload_data').notNullable();
      t.text('status').notNullable();
      t.integer('attempts').notNullable().defaultTo(0);
      t.text('last_error');
      t.text('triggered_by');
      t.text('created_at')
        .notNullable()
        .defaultTo(knex.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))"));
      t.text('printed_at');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_job_status ON print_job(status)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_job_printer ON print_job(printer_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_print_job_created ON print_job(created_at)');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('print_job');
  await knex.schema.dropTableIfExists('printer');
}
