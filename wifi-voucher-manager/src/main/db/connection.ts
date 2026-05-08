import knex, { type Knex } from 'knex';

export interface ConnectionOptions {
  filename: string;
}

export function createConnection(options: ConnectionOptions): Knex {
  return knex({
    client: 'better-sqlite3',
    connection: {
      filename: options.filename,
    },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn: { pragma: (q: string) => unknown }, done: (err: Error | null) => void) {
        try {
          conn.pragma('foreign_keys = ON');
          conn.pragma('journal_mode = WAL');
          done(null);
        } catch (err) {
          done(err as Error);
        }
      },
    },
  });
}
