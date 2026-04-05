/**
 * Analysis orchestrator.
 * Runs all analysis steps on a completed run:
 *   1. Root cause categorization
 *   2. Failure tracking (MTTR)
 *   3. Regression detection
 */

import type { Database, RootCause } from '@qastack/core';
import { categorizeRootCauses } from './root-cause.js';
import { detectRegressions } from './regression.js';
import type { RegressionResult } from './regression.js';
import { trackFailures } from './mttr.js';
import type { TrackingResult } from './mttr.js';

export interface AnalysisResult {
  rootCauses: Record<RootCause, number>;
  regressions: RegressionResult;
  tracking: TrackingResult;
}

/**
 * Run all analysis on a completed test run.
 */
export async function analyzeRun(
  db: Database,
  runId: number,
  failures: Array<{
    module: string;
    testTitle: string;
    errorMessage: string | null;
    isFlaky: boolean;
  }>,
  passedTests: Array<{ module: string; testTitle: string }>,
): Promise<AnalysisResult> {
  const rootCauses = await categorizeRootCauses(db, runId, failures);
  const regressions = await detectRegressions(db, runId, failures, passedTests);
  const tracking = await trackFailures(db, runId, failures, passedTests);

  return { rootCauses, regressions, tracking };
}
