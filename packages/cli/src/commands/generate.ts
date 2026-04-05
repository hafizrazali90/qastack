/**
 * `qastack generate` — generate test skeletons from user stories.
 *
 * 1. Loads stories from qastack-stories.json (or --from file)
 * 2. Calls generateTests() from @qastack/generator
 * 3. If --approve, runs interactive TUI approval
 * 4. Writes approved tests to disk
 * 5. Prints summary
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { UserStory } from '@qastack/core';
import { generateTests } from '@qastack/generator';
import type { GeneratedTest } from '@qastack/generator';
import { getConfig, fatal, success, info, withErrorHandler } from '../helpers.js';
import { approveTests } from '../tui/approval.js';

interface GenerateOpts {
  from?: string;
  approve?: boolean;
}

export async function generateCommand(opts: GenerateOpts): Promise<void> {
  await withErrorHandler(async () => {
    const cwd = process.cwd();
    const config = getConfig();

    console.log(
      chalk.bold('\n  qastack generate\n') +
        chalk.dim('  Generating test skeletons from user stories...\n'),
    );

    // 1. Load stories
    const storiesPath = resolve(
      cwd,
      opts.from ?? 'qastack-stories.json',
    );

    if (!existsSync(storiesPath)) {
      fatal(
        `Stories file not found: ${storiesPath}\n` +
          '  Run `qastack discover` first to generate stories.',
      );
    }

    let stories: UserStory[];
    try {
      const raw = readFileSync(storiesPath, 'utf-8');
      stories = JSON.parse(raw) as UserStory[];
    } catch {
      fatal(`Failed to parse stories from: ${storiesPath}`);
    }

    info(`Loaded ${chalk.bold(String(stories.length))} stories from ${storiesPath}`);

    // 2. Generate test skeletons
    const spinner = ora('Generating test skeletons...').start();

    let tests: GeneratedTest[];
    try {
      tests = generateTests({
        stories,
        testRunner: config.test.runner,
        testDir: config.test.dir,
      });
      spinner.succeed(
        `Generated ${chalk.bold(String(tests.length))} test file(s)`,
      );
    } catch (err) {
      spinner.fail('Generation failed');
      throw err;
    }

    // 3. Interactive approval if --approve
    if (opts.approve) {
      tests = await approveTests(tests);
      info(`${chalk.bold(String(tests.length))} tests approved`);
    }

    // 4. Write tests to disk
    let written = 0;
    for (const test of tests) {
      const fullPath = resolve(cwd, test.filePath);
      const dir = dirname(fullPath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, test.code, 'utf-8');
      written++;
      info(`  ${chalk.dim(test.filePath)}`);
    }

    // 5. Summary
    success(`${written} test file(s) written!`);

    // Show module breakdown
    const modules = new Map<string, number>();
    for (const test of tests) {
      const mod = test.story.module;
      modules.set(mod, (modules.get(mod) ?? 0) + 1);
    }

    if (modules.size > 0) {
      console.log(chalk.bold('  Files by module:'));
      for (const [mod, count] of [...modules.entries()].sort()) {
        console.log(`    ${chalk.cyan(mod)}: ${count}`);
      }
    }

    console.log(
      chalk.dim(
        '\n  Next: review generated files (search for TODO: [HUMAN])\n' +
          '  Then: run your tests and use `qastack collect` to ingest results\n',
      ),
    );
  });
}
