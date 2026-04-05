import type { Database } from './db.js';
import type { DbConfig } from './types.js';
import { MYSQL_MIGRATIONS } from './migrations.js';

export async function createMysqlDatabase(config: DbConfig): Promise<Database> {
  // mysql2 is an optional peer dependency — only loaded when driver is 'mysql'
  const mysql = await import('mysql2/promise');

  const pool = mysql.createPool({
    host: config.host ?? 'localhost',
    port: config.port ?? 3306,
    user: config.user ?? 'root',
    password: config.password ?? '',
    database: config.database ?? 'qastack',
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true,
  });

  return {
    async migrate(): Promise<void> {
      // Split by semicolon and execute each statement individually
      const statements = MYSQL_MIGRATIONS
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        await pool.execute(stmt);
      }
    },

    async execute(
      sql: string,
      params: unknown[] = [],
    ): Promise<{ insertId: number; affectedRows: number }> {
      const [result] = await pool.execute(sql, params);
      const res = result as { insertId?: number; affectedRows?: number };
      return {
        insertId: res.insertId ?? 0,
        affectedRows: res.affectedRows ?? 0,
      };
    },

    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const [rows] = await pool.execute(sql, params);
      return rows as T[];
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
