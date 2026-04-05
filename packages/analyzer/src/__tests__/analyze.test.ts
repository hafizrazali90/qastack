import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import { analyzeRun } from '../analyze.js';

describe('analyzeRun', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  /**
   * Helper: seed a run with modules and failure records.
   */
  async function seedRun(
    runId: number,
    modules: string[],
    failures: Array<{
      module: string;
      testTitle: string;
      errorMessage: string | null;
      isFlaky: boolean;
    }> = [],
  ) {
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES (?, ?, 'main', 'push', 10, ?, ?)`,
      [runId, `hash${runId}`, 10 - failures.length, failures.length],
    );

    for (const mod of modules) {
      await db.execute(
        `INSERT INTO qa_module_results (run_id, module, total_tests, passed, failed)
         VALUES (?, ?, 5, 5, 0)`,
        [runId, mod],
      );
    }

    for (const f of failures) {
      await db.execute(
        `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, is_flaky)
         VALUES (?, ?, 'test.spec.ts', ?, ?, ?)`,
        [runId, f.module, f.testTitle, f.errorMessage, f.isFlaky ? 1 : 0],
      );
    }
  }

  it('runs full analysis on a run with regressions and failures', async () => {
    // Run 1: all passing
    await seedRun(1, ['users', 'orders']);

    // Run 2: two new failures (regressions from run 1)
    const failures = [
      {
        module: 'users',
        testTitle: 'can login',
        errorMessage: 'Timeout 30000ms exceeded',
        isFlaky: false,
      },
      {
        module: 'orders',
        testTitle: 'can create order',
        errorMessage: 'ECONNREFUSED 127.0.0.1:3000',
        isFlaky: false,
      },
    ];

    await seedRun(2, ['users', 'orders'], failures);

    const passedTests = [
      { module: 'users', testTitle: 'can view profile' },
      { module: 'orders', testTitle: 'can list orders' },
    ];

    const result = await analyzeRun(db, 2, failures, passedTests);

    // Root causes
    expect(result.rootCauses.timeout).toBe(1);
    expect(result.rootCauses.infra).toBe(1);

    // Regressions: both tests were passing in run 1
    expect(result.regressions.detected).toBe(2);
    expect(result.regressions.resolved).toBe(0);

    // Tracking: both are new failures
    expect(result.tracking.newFailures).toBe(2);
    expect(result.tracking.recurring).toBe(0);
    expect(result.tracking.resolved).toBe(0);
  });

  it('resolves regressions and tracking when tests pass again', async () => {
    // Run 1: all passing
    await seedRun(1, ['users']);

    // Run 2: failure (regression)
    const run2Failures = [
      {
        module: 'users',
        testTitle: 'can login',
        errorMessage: 'Timeout exceeded',
        isFlaky: false,
      },
    ];
    await seedRun(2, ['users'], run2Failures);

    await analyzeRun(db, 2, run2Failures, []);

    // Run 3: passes again
    await seedRun(3, ['users']);

    const result = await analyzeRun(
      db,
      3,
      [],
      [{ module: 'users', testTitle: 'can login' }],
    );

    // No new root causes (no failures)
    expect(Object.keys(result.rootCauses).length).toBe(0);

    // Regression resolved
    expect(result.regressions.detected).toBe(0);
    expect(result.regressions.resolved).toBe(1);

    // Tracking resolved
    expect(result.tracking.newFailures).toBe(0);
    expect(result.tracking.recurring).toBe(0);
    expect(result.tracking.resolved).toBe(1);
  });

  it('handles recurring failures across runs', async () => {
    // Run 1: failure (no previous run, so no regression)
    const failures = [
      {
        module: 'users',
        testTitle: 'can login',
        errorMessage: 'assert failed',
        isFlaky: false,
      },
    ];
    await seedRun(1, ['users'], failures);

    const result1 = await analyzeRun(db, 1, failures, []);
    expect(result1.tracking.newFailures).toBe(1);
    expect(result1.tracking.recurring).toBe(0);
    expect(result1.rootCauses.assertion).toBe(1);

    // Run 2: same failure
    await seedRun(2, ['users'], failures);

    const result2 = await analyzeRun(db, 2, failures, []);
    expect(result2.tracking.newFailures).toBe(0);
    expect(result2.tracking.recurring).toBe(1);

    // Not a regression (was already failing in run 1)
    expect(result2.regressions.detected).toBe(0);
  });

  it('handles flaky tests in root cause categorization', async () => {
    const failures = [
      {
        module: 'users',
        testTitle: 'can login',
        errorMessage: 'Timeout exceeded',
        isFlaky: true,
      },
    ];
    await seedRun(1, ['users'], failures);

    const result = await analyzeRun(db, 1, failures, []);

    // isFlaky takes precedence over the error message
    expect(result.rootCauses.flaky).toBe(1);
    expect(result.rootCauses.timeout).toBeUndefined();
  });

  it('returns empty results when no failures and no passes', async () => {
    await seedRun(1, ['users']);

    const result = await analyzeRun(db, 1, [], []);

    expect(Object.keys(result.rootCauses).length).toBe(0);
    expect(result.regressions.detected).toBe(0);
    expect(result.regressions.resolved).toBe(0);
    expect(result.tracking.newFailures).toBe(0);
    expect(result.tracking.recurring).toBe(0);
    expect(result.tracking.resolved).toBe(0);
  });
});
