/**
 * `qastack migrate` — run database migrations.
 *
 * Creates all required tables if they don't exist.
 */

import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getDb, success, withErrorHandler } from '../helpers.js';

export async function migrateCommand(): Promise<void> {
  await withErrorHandler(async () => {
    const config = getConfig();

    console.log(
      chalk.bold('\n  qastack migrate\n') +
        chalk.dim('  Running database migrations...\n'),
    );

    const spinner = ora(
      `Migrating ${config.db.driver} database...`,
    ).start();

    const db = await getDb(config);
    await db.migrate();
    await db.close();

    spinner.succeed('Migrations complete');
    success('Database is up to date!');
  });
}
