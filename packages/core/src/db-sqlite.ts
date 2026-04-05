import BetterSqlite3 from 'better-sqlite3';
import type { Database } from './db.js';
import { SQLITE_MIGRATIONS } from './migrations.js';

export function createSqliteDatabase(dbPath: string): Database {
  const sqlite = new BetterSqlite3(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  // Enforce foreign key constraints
  sqlite.pragma('foreign_keys = ON');

  return {
    async migrate(): Promise<void> {
      sqlite.exec(SQLITE_MIGRATIONS);
    },

    async execute(
      sql: string,
      params: unknown[] = [],
    ): Promise<{ insertId: number; affectedRows: number }> {
      const stmt = sqlite.prepare(sql);
      const result = stmt.run(...params);
      return {
        insertId: Number(result.lastInsertRowid),
        affectedRows: result.changes,
      };
    },

    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...params) as T[];
    },

    async close(): Promise<void> {
      sqlite.close();
    },
  };
}
