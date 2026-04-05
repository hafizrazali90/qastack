/**
 * `qastack catalog` — scan test files and populate qa_test_catalog table.
 *
 * Walks the configured test directory, extracts test titles using regex
 * patterns for common test runners, and upserts into the catalog table.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getDb, success, info, fatal, withErrorHandler } from '../helpers.js';

interface CatalogEntry {
  module: string;
  file: string;
  title: string;
}

/**
 * Extract test titles from a file based on common runner patterns.
 */
function extractTestTitles(
  content: string,
  filePath: string,
): string[] {
  const titles: string[] = [];

  // Playwright / Jest / Vitest: test('...') or it('...')
  const jsPattern = /(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = jsPattern.exec(content)) !== null) {
    if (match[1]) titles.push(match[1]);
  }

  // Pest PHP: it('...') or test('...')
  const pestPattern = /(?:it|test)\s*\(\s*'([^']+)'/g;
  while ((match = pestPattern.exec(content)) !== null) {
    if (match[1] && !titles.includes(match[1])) {
      titles.push(match[1]);
    }
  }

  // Pytest: def test_something(...)
  const pytestPattern = /def\s+(test_\w+)\s*\(/g;
  while ((match = pytestPattern.exec(content)) !== null) {
    if (match[1]) titles.push(match[1]);
  }

  // RSpec: it '...' do
  const rspecPattern = /it\s+'([^']+)'\s+do/g;
  while ((match = rspecPattern.exec(content)) !== null) {
    if (match[1]) titles.push(match[1]);
  }

  return titles;
}

/**
 * Derive module name from file path.
 * e.g., "tests/e2e/classes/classes-index.spec.ts" -> "classes"
 */
function moduleFromPath(
  filePath: string,
  testDir: string,
): string {
  const rel = filePath.replace(/\\/g, '/');
  const dir = testDir.replace(/\\/g, '/').replace(/\/$/, '');

  const regex = new RegExp(
    `${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)`,
  );
  const match = rel.match(regex);
  if (match?.[1]) return match[1];

  // Fallback: first directory component
  const parts = rel.split('/');
  if (parts.length >= 2 && parts[0]) return parts[0];

  return 'unknown';
}

export async function catalogCommand(): Promise<void> {
  await withErrorHandler(async () => {
    const cwd = process.cwd();
    const config = getConfig();
    const testDir = resolve(cwd, config.test.dir);

    console.log(
      chalk.bold('\n  qastack catalog\n') +
        chalk.dim('  Scanning test files and updating catalog...\n'),
    );

    if (!existsSync(testDir)) {
      fatal(
        `Test directory not found: ${testDir}\n` +
          '  Check your qastack.config.js `test.dir` setting.',
      );
    }

    // 1. Walk test directory
    const spinner = ora('Scanning test files...').start();
    const testPattern = /\.(spec|test)\.(ts|js|tsx|jsx|php|py|rb)$/;
    const entries: CatalogEntry[] = [];

    function walk(dir: string): void {
      let items: string[];
      try {
        items = readdirSync(dir);
      } catch {
        return;
      }

      for (const item of items) {
        const fullPath = join(dir, item);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            if (item !== 'node_modules' && !item.startsWith('.')) {
              walk(fullPath);
            }
          } else if (testPattern.test(item)) {
            const content = readFileSync(fullPath, 'utf-8');
            const relPath = relative(cwd, fullPath);
            const module = moduleFromPath(relPath, config.test.dir);
            const titles = extractTestTitles(content, relPath);

            for (const title of titles) {
              entries.push({ module, file: relPath, title });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    walk(testDir);
    spinner.succeed(
      `Found ${chalk.bold(String(entries.length))} test(s) in ${chalk.bold(String(new Set(entries.map((e) => e.file)).size))} file(s)`,
    );

    // 2. Insert into DB
    const dbSpinner = ora('Updating catalog...').start();
    const db = await getDb(config);

    // Ensure catalog table exists (may have been created by migrate)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS qa_test_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module TEXT NOT NULL,
        file_path TEXT NOT NULL,
        test_title TEXT NOT NULL,
        test_signature TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(test_signature)
      )
    `);

    // Clear and repopulate
    await db.execute('DELETE FROM qa_test_catalog');

    let inserted = 0;
    for (const entry of entries) {
      const signature = `${entry.module}::${entry.title}`;
      await db.execute(
        `INSERT OR REPLACE INTO qa_test_catalog
           (module, file_path, test_title, test_signature, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [entry.module, entry.file, entry.title, signature],
      );
      inserted++;
    }

    await db.close();
    dbSpinner.succeed(`Catalog updated: ${inserted} entries`);

    // 3. Module summary
    const modules = new Map<string, number>();
    for (const entry of entries) {
      modules.set(entry.module, (modules.get(entry.module) ?? 0) + 1);
    }

    if (modules.size > 0) {
      console.log(chalk.bold('\n  Tests by module:'));
      for (const [mod, count] of [...modules.entries()].sort()) {
        console.log(`    ${chalk.cyan(mod)}: ${count}`);
      }
    }

    success('Catalog updated!');
  });
}
