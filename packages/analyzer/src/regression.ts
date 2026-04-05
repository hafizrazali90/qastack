/**
 * Regression detection.
 * Ported from SIMS processPhase2() section 3.
 *
 * A regression is a test that was passing in the previous run but is now failing.
 * Regressions are resolved when the test passes again.
 */

import type { Database } from '@qastack/core';

export interface RegressionResult {
  detected: number;
  resolved: number;
}

/**
 * Detect new regressions and resolve existing ones.
 *
 * Detection: a failure in this run that passed (no failure record) in the previous run.
 * Resolution: a previously-regressed test that now passes.
 */
export async function detectRegressions(
  db: Database,
  runId: number,
  failures: Array<{ module: string; testTitle: string }>,
  passedTests: Array<{ module: string; testTitle: string }>,
): Promise<RegressionResult> {
  let detected = 0;
  let resolved = 0;

  const previousRunId = runId - 1;

  // Detect: failures in this run that passed in previous run
  for (const f of failures) {
    const testSignature = `${f.module}::${f.testTitle}`;

    // Check previous run had this module
    const prevModule = await db.query<{ id: number }>(
      'SELECT id FROM qa_module_results WHERE run_id = ? AND module = ? LIMIT 1',
      [previousRunId, f.module],
    );
    if (prevModule.length === 0) continue;

    // Check test wasn't already failing in the previous run
    const prevFailure = await db.query<{ id: number }>(
      'SELECT id FROM qa_test_failures WHERE run_id = ? AND module = ? AND test_title = ? LIMIT 1',
      [previousRunId, f.module, f.testTitle],
    );

    if (prevFailure.length === 0) {
      // Was passing before -- this is a regression
      await db.execute(
        `INSERT INTO qa_regressions
           (test_signature, module, test_title, previous_pass_run_id, regression_run_id, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [testSignature, f.module, f.testTitle, previousRunId, runId],
      );
      detected++;
    }
  }

  // Resolve: tests that now pass
  for (const p of passedTests) {
    const testSignature = `${p.module}::${p.testTitle}`;
    const result = await db.execute(
      'UPDATE qa_regressions SET is_active = 0 WHERE test_signature = ? AND is_active = 1',
      [testSignature],
    );
    resolved += result.affectedRows;
  }

  return { detected, resolved };
}
