/**
 * Shared CLI helpers — config loading, DB creation, error formatting.
 */

import { loadConfig, createDatabase } from '@qastack/core';
import type { QastackConfig, Database } from '@qastack/core';
import chalk from 'chalk';

/**
 * Load qastack config from the current working directory.
 * Merges with defaults automatically.
 */
export function getConfig(
  overrides?: Partial<QastackConfig>,
): QastackConfig {
  return loadConfig(process.cwd(), overrides);
}

/**
 * Create a database connection from the current config.
 */
export async function getDb(
  config?: QastackConfig,
): Promise<Database> {
  const cfg = config ?? getConfig();
  return createDatabase(cfg.db);
}

/**
 * Print a fatal error and exit with code 1.
 */
export function fatal(message: string): never {
  console.error(chalk.red(`\nError: ${message}\n`));
  process.exit(1);
}

/**
 * Print a success banner.
 */
export function success(message: string): void {
  console.log(chalk.green(`\n✓ ${message}\n`));
}

/**
 * Print an info line.
 */
export function info(message: string): void {
  console.log(chalk.cyan(`  ${message}`));
}

/**
 * Print a warning line.
 */
export function warn(message: string): void {
  console.log(chalk.yellow(`  ⚠ ${message}`));
}

/**
 * Wrap a command body with standard error handling.
 * Catches errors, prints them, and exits with code 1.
 */
export async function withErrorHandler(
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    fatal(message);
  }
}
