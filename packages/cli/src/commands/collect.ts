/**
 * `qastack collect` — collect test results into database.
 *
 * 1. Loads config
 * 2. Reads result file (Playwright JSON or JUnit XML)
 * 3. Parses with collector
 * 4. Inserts into DB
 * 5. Runs analyzer (root cause, regression, MTTR)
 * 6. Prints summary with health %
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import {
  parsePlaywrightReport,
  parseJunitReport,
  collectResults,
} from '@qastack/collector';
import { analyzeRun } from '@qastack/analyzer';
import { getConfig, getDb, fatal, success, info, withErrorHandler } from '../helpers.js';

interface CollectOpts {
  format: string;
  json?: string;
}

export async function collectCommand(opts: CollectOpts): Promise<void> {
  await withErrorHandler(async () => {
    const cwd = process.cwd();
    const config = getConfig();

    console.log(
      chalk.bold('\n  qastack collect\n') +
        chalk.dim('  Collecting test results into database...\n'),
    );

    // 1. Determine result file path
    const resultPath = resolve(
      cwd,
      opts.json ?? config.test.resultPath,
    );

    if (!existsSync(resultPath)) {
      fatal(
        `Result file not found: ${resultPath}\n` +
          '  Run your tests first, then point --json to the output.',
      );
    }

    // 2. Read and parse result file
    const spinner = ora('Parsing test results...').start();

    const raw = readFileSync(resultPath, 'utf-8');
    const format = opts.format ?? config.test.resultFormat;

    let report;
    try {
      if (format === 'junit' || format === 'junit-xml') {
        report = parseJunitReport(raw);
      } else {
        // Default: playwright JSON
        const json = JSON.parse(raw) as Record<string, unknown>;
        report = parsePlaywrightReport(json);
      }
      spinner.succeed('Results parsed');
    } catch (err) {
      spinner.fail('Failed to parse results');
      throw err;
    }

    // 3. Get git info for the run
    let commitHash = 'unknown';
    let branch = 'unknown';
    try {
      commitHash = execSync('git rev-parse --short HEAD', {
        cwd,
        encoding: 'utf-8',
      }).trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        encoding: 'utf-8',
      }).trim();
    } catch {
      // Not a git repo — use defaults
    }

    // 4. Insert into DB
    const insertSpinner = ora('Inserting into database...').start();
    const db = await getDb(config);

    const collectResult = await collectResults(db, report, {
      commitHash,
      branch,
      trigger: 'manual',
    });
    insertSpinner.succeed(`Run #${collectResult.runId} recorded`);

    // 5. Run analysis
    const analysisSpinner = ora('Running analysis...').start();
    const analysis = await analyzeRun(
      db,
      collectResult.runId,
      report.failures.map((f) => ({
        module: f.module,
        testTitle: f.testTitle,
        errorMessage: f.errorMessage,
        isFlaky: f.isFlaky,
      })),
      report.passedTests,
    );
    analysisSpinner.succeed('Analysis complete');

    await db.close();

    // 6. Print summary
    const healthColor =
      collectResult.healthPct >= 80
        ? chalk.green
        : collectResult.healthPct >= 70
          ? chalk.yellow
          : chalk.red;

    console.log(chalk.bold('\n  Results Summary'));
    console.log(`  ${'─'.repeat(40)}`);
    console.log(
      `  Health:     ${healthColor(String(collectResult.healthPct) + '%')}`,
    );
    console.log(
      `  Total:      ${collectResult.totalTests}`,
    );
    console.log(
      `  Passed:     ${chalk.green(String(collectResult.passed))}`,
    );
    console.log(
      `  Failed:     ${chalk.red(String(collectResult.failed))}`,
    );
    console.log(
      `  Skipped:    ${chalk.dim(String(collectResult.skipped))}`,
    );
    console.log(
      `  Flaky:      ${chalk.yellow(String(collectResult.flaky))}`,
    );
    console.log(
      `  Modules:    ${collectResult.moduleCount}`,
    );
    console.log(
      `  Duration:   ${(collectResult.durationMs / 1000).toFixed(1)}s`,
    );

    // Root cause breakdown (if there are failures)
    if (collectResult.failed > 0) {
      console.log(chalk.bold('\n  Root Causes'));
      console.log(`  ${'─'.repeat(40)}`);
      for (const [cause, count] of Object.entries(analysis.rootCauses)) {
        if (count > 0) {
          console.log(`    ${cause}: ${count}`);
        }
      }
    }

    // Regressions
    if (analysis.regressions.detected > 0) {
      console.log(
        chalk.red(
          `\n  ⚠ ${analysis.regressions.detected} new regression(s) detected!`,
        ),
      );
    }

    if (analysis.regressions.resolved > 0) {
      console.log(
        chalk.green(
          `  ✓ ${analysis.regressions.resolved} regression(s) resolved`,
        ),
      );
    }

    success(`Run #${collectResult.runId} collected`);
    console.log(
      chalk.dim(
        '  View details: `qastack dashboard` or `qastack status`\n',
      ),
    );
  });
}
