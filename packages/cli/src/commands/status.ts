/**
 * `qastack status` — show quick QA health summary.
 *
 * Queries the latest run and prints:
 * - Health %, pass/fail counts
 * - Active regressions
 * - MTTR stats
 */

import chalk from 'chalk';
import ora from 'ora';
import { getMttrStats } from '@qastack/analyzer';
import type { RunSummary } from '@qastack/core';
import { getConfig, getDb, info, warn, withErrorHandler } from '../helpers.js';

export async function statusCommand(): Promise<void> {
  await withErrorHandler(async () => {
    const config = getConfig();

    console.log(
      chalk.bold('\n  qastack status\n') +
        chalk.dim('  Quick QA health summary\n'),
    );

    const spinner = ora('Loading...').start();
    const db = await getDb(config);

    // 1. Get latest run
    const runs = await db.query<RunSummary>(
      `SELECT
         id as runId, commit_hash as commitHash, branch,
         trigger_type as trigger, total_tests as totalTests,
         passed, failed, skipped, flaky, health_pct as healthPct,
         duration_ms as durationMs, created_at as createdAt
       FROM qa_runs
       ORDER BY id DESC
       LIMIT 1`,
    );

    if (runs.length === 0) {
      spinner.info('No test runs found');
      await db.close();
      console.log(
        chalk.dim(
          '\n  Run your tests, then `qastack collect` to ingest results.\n',
        ),
      );
      return;
    }

    const latest = runs[0]!;
    spinner.stop();

    // 2. Health badge
    const healthColor =
      latest.healthPct >= 80
        ? chalk.green
        : latest.healthPct >= 70
          ? chalk.yellow
          : chalk.red;

    console.log(
      `  ${chalk.bold('Health:')}  ${healthColor(String(latest.healthPct) + '%')}  ${chalk.dim(`(Run #${latest.runId})`)}`,
    );
    console.log(
      `  ${chalk.bold('Commit:')}  ${latest.commitHash}  ${chalk.dim(`on ${latest.branch}`)}`,
    );
    console.log(
      `  ${chalk.bold('Time:')}    ${latest.createdAt}`,
    );
    console.log();

    // 3. Test counts
    console.log(
      `  ${chalk.green('●')} Passed:  ${latest.passed}   ` +
        `${chalk.red('●')} Failed:  ${latest.failed}   ` +
        `${chalk.yellow('●')} Flaky:   ${latest.flaky}   ` +
        `${chalk.dim('●')} Skip:    ${latest.skipped}`,
    );
    console.log(
      `  ${chalk.dim('Total:')} ${latest.totalTests}   ${chalk.dim('Duration:')} ${(latest.durationMs / 1000).toFixed(1)}s`,
    );

    // 4. Active regressions
    const regressions = await db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM qa_regressions WHERE status = 'active'`,
    );
    const activeRegressions = regressions[0]?.count ?? 0;

    if (activeRegressions > 0) {
      console.log(
        chalk.red(
          `\n  ⚠ ${activeRegressions} active regression(s)`,
        ),
      );
    } else {
      console.log(chalk.green('\n  ✓ No active regressions'));
    }

    // 5. MTTR stats
    try {
      const mttr = await getMttrStats(db);
      if (mttr.avgMttrHours !== null && mttr.avgMttrHours > 0) {
        info(`MTTR: ${mttr.avgMttrHours}h avg  (${mttr.resolvedCount} resolved, ${mttr.activeFailures} active)`);
      }
    } catch {
      // MTTR table might not exist yet — skip silently
    }

    // 6. Module breakdown (top 5 worst)
    interface ModuleRow {
      module: string;
      health_pct: number;
      failed: number;
    }
    const worstModules = await db.query<ModuleRow>(
      `SELECT module, health_pct, failed
       FROM qa_module_results
       WHERE run_id = ?
       ORDER BY health_pct ASC
       LIMIT 5`,
      [latest.runId],
    );

    if (worstModules.length > 0 && worstModules.some((m) => m.failed > 0)) {
      console.log(chalk.bold('\n  Modules needing attention:'));
      for (const mod of worstModules) {
        if (mod.failed === 0) continue;
        const color = mod.health_pct >= 80 ? chalk.yellow : chalk.red;
        console.log(
          `    ${color(String(mod.health_pct) + '%')}  ${mod.module}  (${mod.failed} failed)`,
        );
      }
    }

    await db.close();
    console.log();
  });
}
