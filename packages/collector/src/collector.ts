/**
 * Collector orchestrator.
 * Takes parsed results + Database adapter, inserts into all tables.
 * Ported from SIMS collect-results.cjs insertResults() (lines 204-270).
 */

import type { Database } from '@qastack/core';
import type { ParsedReport } from './parsers/playwright.js';
import { detectRootCause } from './parsers/playwright.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectOptions {
  commitHash: string;
  branch: string;
  trigger: 'push' | 'manual' | 'schedule';
}

export interface CollectResult {
  runId: number;
  totalTests: number;
  healthPct: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
  moduleCount: number;
  failureCount: number;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function collectResults(
  db: Database,
  report: ParsedReport,
  options: CollectOptions,
): Promise<CollectResult> {
  const { modules, failures, allResults, stats } = report;

  // Compute totals from module stats
  const moduleEntries = Object.values(modules);
  const totalPassed = moduleEntries.reduce((s, m) => s + m.passed, 0);
  const totalFailed = moduleEntries.reduce((s, m) => s + m.failed, 0);
  const totalSkipped = moduleEntries.reduce((s, m) => s + m.skipped, 0);
  const totalFlaky = moduleEntries.reduce((s, m) => s + m.flaky, 0);
  const totalTests = moduleEntries.reduce((s, m) => s + m.total, 0);
  const healthPct =
    totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
  const durationMs =
    stats.duration ??
    moduleEntries.reduce((s, m) => s + m.duration, 0);

  // 1. Insert qa_runs row
  const runResult = await db.execute(
    `INSERT INTO qa_runs
       (commit_hash, branch, trigger_type, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      options.commitHash,
      options.branch,
      options.trigger,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      totalFlaky,
      healthPct,
      durationMs,
    ],
  );

  const runId = runResult.insertId;

  // 2. Insert qa_module_results rows
  for (const [moduleName, m] of Object.entries(modules)) {
    const moduleHealth =
      m.total > 0 ? Math.round((m.passed / m.total) * 100) : 0;
    await db.execute(
      `INSERT INTO qa_module_results
         (run_id, module, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        moduleName,
        m.total,
        m.passed,
        m.failed,
        m.skipped,
        m.flaky,
        moduleHealth,
        m.duration,
      ],
    );
  }

  // 3. Insert qa_test_results rows (ALL individual tests)
  for (const r of allResults) {
    const testSignature = `${r.module}::${r.testTitle}`;
    const rootCause =
      r.status === 'failed'
        ? detectRootCause(r.errorMessage, r.isFlaky)
        : null;

    await db.execute(
      `INSERT INTO qa_test_results
         (run_id, module, test_signature, test_title, file_path, status, duration_ms, error_message, root_cause)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        r.module,
        testSignature,
        r.testTitle,
        r.file,
        r.status,
        r.duration,
        r.status === 'failed' ? r.errorMessage : null,
        rootCause,
      ],
    );
  }

  // 4. Insert qa_test_failures rows (failed only)
  for (const f of failures) {
    const rootCause = detectRootCause(f.errorMessage, f.isFlaky);
    await db.execute(
      `INSERT INTO qa_test_failures
         (run_id, module, file_path, test_title, error_message, duration_ms, root_cause, is_flaky)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        f.module,
        f.file,
        f.testTitle,
        f.errorMessage,
        f.duration,
        rootCause,
        f.isFlaky ? 1 : 0,
      ],
    );
  }

  return {
    runId,
    totalTests,
    healthPct,
    passed: totalPassed,
    failed: totalFailed,
    skipped: totalSkipped,
    flaky: totalFlaky,
    durationMs,
    moduleCount: Object.keys(modules).length,
    failureCount: failures.length,
  };
}
