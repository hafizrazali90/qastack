import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import { detectRegressions } from '../regression.js';

describe('detectRegressions', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  /**
   * Helper: seed a run and its module results.
   */
  async function seedRun(
    runId: number,
    modules: string[],
    failures: Array<{ module: string; testTitle: string }> = [],
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
        `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message)
         VALUES (?, ?, 'test.spec.ts', ?, 'some error')`,
        [runId, f.module, f.testTitle],
      );
    }
  }

  it('detects a regression when test was passing in previous run', async () => {
    // Run 1: users module, all passing
    await seedRun(1, ['users']);

    // Run 2: users module, one failure
    await seedRun(2, ['users'], [
      { module: 'users', testTitle: 'can login' },
    ]);

    const result = await detectRegressions(
      db,
      2,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    expect(result.detected).toBe(1);
    expect(result.resolved).toBe(0);

    // Verify regression record in DB
    const regressions = await db.query<{
      test_signature: string;
      is_active: number;
      regression_run_id: number;
    }>('SELECT test_signature, is_active, regression_run_id FROM qa_regressions');

    expect(regressions).toHaveLength(1);
    expect(regressions[0]!.test_signature).toBe('users::can login');
    expect(regressions[0]!.is_active).toBe(1);
    expect(regressions[0]!.regression_run_id).toBe(2);
  });

  it('does not detect regression when test was already failing', async () => {
    // Run 1: users module, same test already failing
    await seedRun(1, ['users'], [
      { module: 'users', testTitle: 'can login' },
    ]);

    // Run 2: users module, still failing
    await seedRun(2, ['users'], [
      { module: 'users', testTitle: 'can login' },
    ]);

    const result = await detectRegressions(
      db,
      2,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    expect(result.detected).toBe(0);
  });

  it('does not detect regression for a new module not in previous run', async () => {
    // Run 1: only "orders" module
    await seedRun(1, ['orders']);

    // Run 2: "users" module (new), one failure
    await seedRun(2, ['users'], [
      { module: 'users', testTitle: 'can login' },
    ]);

    const result = await detectRegressions(
      db,
      2,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    // No regression: "users" was not in the previous run
    expect(result.detected).toBe(0);
  });

  it('resolves a regression when the test passes again', async () => {
    // Run 1: all passing
    await seedRun(1, ['users']);

    // Run 2: regression
    await seedRun(2, ['users'], [
      { module: 'users', testTitle: 'can login' },
    ]);

    await detectRegressions(
      db,
      2,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    // Run 3: test passes again
    await seedRun(3, ['users']);

    const result = await detectRegressions(
      db,
      3,
      [],
      [{ module: 'users', testTitle: 'can login' }],
    );

    expect(result.detected).toBe(0);
    expect(result.resolved).toBe(1);

    // Verify regression marked inactive
    const regressions = await db.query<{ is_active: number }>(
      'SELECT is_active FROM qa_regressions',
    );
    expect(regressions).toHaveLength(1);
    expect(regressions[0]!.is_active).toBe(0);
  });

  it('handles multiple regressions in one run', async () => {
    // Run 1: both modules passing
    await seedRun(1, ['users', 'orders']);

    // Run 2: both fail
    await seedRun(2, ['users', 'orders'], [
      { module: 'users', testTitle: 'can login' },
      { module: 'orders', testTitle: 'can create order' },
    ]);

    const result = await detectRegressions(
      db,
      2,
      [
        { module: 'users', testTitle: 'can login' },
        { module: 'orders', testTitle: 'can create order' },
      ],
      [],
    );

    expect(result.detected).toBe(2);
  });
});
