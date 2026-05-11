import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasApplied = await knex.schema.hasColumn('passwords', 'applied');
  if (!hasApplied) {
    await knex.schema.alterTable('passwords', (t) => {
      t.integer('applied').notNullable().defaultTo(1);
    });
  }
  const hasMethod = await knex.schema.hasColumn('passwords', 'applied_method');
  if (!hasMethod) {
    await knex.schema.alterTable('passwords', (t) => {
      t.text('applied_method');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasApplied = await knex.schema.hasColumn('passwords', 'applied');
  if (hasApplied) {
    await knex.schema.alterTable('passwords', (t) => t.dropColumn('applied'));
  }
  const hasMethod = await knex.schema.hasColumn('passwords', 'applied_method');
  if (hasMethod) {
    await knex.schema.alterTable('passwords', (t) => t.dropColumn('applied_method'));
  }
}
