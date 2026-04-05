import type { DbConfig } from './types.js';

export interface Database {
  migrate(): Promise<void>;
  execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ insertId: number; affectedRows: number }>;
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  close(): Promise<void>;
}

export async function createDatabase(config: DbConfig): Promise<Database> {
  if (config.driver === 'sqlite') {
    const { createSqliteDatabase } = await import('./db-sqlite.js');
    return createSqliteDatabase(config.path ?? './qastack.db');
  }
  if (config.driver === 'mysql') {
    const { createMysqlDatabase } = await import('./db-mysql.js');
    return createMysqlDatabase(config);
  }
  throw new Error(`Unsupported database driver: ${config.driver}`);
}
