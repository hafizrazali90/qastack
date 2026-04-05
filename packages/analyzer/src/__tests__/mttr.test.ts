import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import { trackFailures, getMttrStats } from '../mttr.js';

describe('trackFailures', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();

    // Seed runs
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES (1, 'hash1', 'main', 'push', 10, 9, 1)`,
    );
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES (2, 'hash2', 'main', 'push', 10, 9, 1)`,
    );
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES (3, 'hash3', 'main', 'push', 10, 10, 0)`,
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('records a new failure on first occurrence', async () => {
    const result = await trackFailures(
      db,
      1,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    expect(result.newFailures).toBe(1);
    expect(result.recurring).toBe(0);
    expect(result.resolved).toBe(0);

    // Verify DB record
    const tracking = await db.query<{
      test_signature: string;
      occurrences: number;
      is_active: number;
    }>('SELECT test_signature, occurrences, is_active FROM qa_failure_tracking');

    expect(tracking).toHaveLength(1);
    expect(tracking[0]!.test_signature).toBe('users::can login');
    expect(tracking[0]!.occurrences).toBe(1);
    expect(tracking[0]!.is_active).toBe(1);
  });

  it('increments occurrences for recurring failure', async () => {
    // First occurrence
    await trackFailures(
      db,
      1,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    // Second occurrence
    const result = await trackFailures(
      db,
      2,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    expect(result.newFailures).toBe(0);
    expect(result.recurring).toBe(1);

    // Verify occurrences incremented
    const tracking = await db.query<{ occurrences: number }>(
      'SELECT occurrences FROM qa_failure_tracking',
    );
    expect(tracking[0]!.occurrences).toBe(2);
  });

  it('resolves a failure when test passes', async () => {
    // First: failure
    await trackFailures(
      db,
      1,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    // Second: still failing
    await trackFailures(
      db,
      2,
      [{ module: 'users', testTitle: 'can login' }],
      [],
    );

    // Third: passes
    const result = await trackFailures(
      db,
      3,
      [],
      [{ module: 'users', testTitle: 'can login' }],
    );

    expect(result.newFailures).toBe(0);
    expect(result.recurring).toBe(0);
    expect(result.resolved).toBe(1);

    // Verify record resolved
    const tracking = await db.query<{
      is_active: number;
      resolved_run_id: number | null;
      resolved_at: string | null;
    }>('SELECT is_active, resolved_run_id, resolved_at FROM qa_failure_tracking');

    expect(tracking).toHaveLength(1);
    expect(tracking[0]!.is_active).toBe(0);
    expect(tracking[0]!.resolved_run_id).toBe(3);
    expect(tracking[0]!.resolved_at).not.toBeNull();
  });

  it('handles multiple failures in same run', async () => {
    const result = await trackFailures(
      db,
      1,
      [
        { module: 'users', testTitle: 'can login' },
        { module: 'orders', testTitle: 'can create order' },
      ],
      [],
    );

    expect(result.newFailures).toBe(2);

    const tracking = await db.query<{ test_signature: string }>(
      'SELECT test_signature FROM qa_failure_tracking ORDER BY test_signature',
    );
    expect(tracking).toHaveLength(2);
    expect(tracking[0]!.test_signature).toBe('orders::can create order');
    expect(tracking[1]!.test_signature).toBe('users::can login');
  });

  it('does not resolve a test that was never tracked', async () => {
    const result = await trackFailures(
      db,
      1,
      [],
      [{ module: 'users', testTitle: 'can login' }],
    );

    expect(result.resolved).toBe(0);
  });
});

describe('getMttrStats', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns zeros when no tracking records exist', async () => {
    const stats = await getMttrStats(db);

    expect(stats.activeFailures).toBe(0);
    expect(stats.resolvedCount).toBe(0);
    expect(stats.avgMttrHours).toBeNull();
  });

  it('counts active failures', async () => {
    // Seed a run
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES (1, 'hash1', 'main', 'push', 10, 9, 1)`,
    );

    await db.execute(
      `INSERT INTO qa_failure_tracking
         (test_signature, module, test_title, first_seen_run_id, occurrences, is_active)
       VALUES ('users::can login', 'users', 'can login', 1, 3, 1)`,
    );

    await db.execute(
      `INSERT INTO qa_failure_tracking
         (test_signature, module, test_title, first_seen_run_id, occurrences, is_active)
       VALUES ('orders::can create', 'orders', 'can create', 1, 1, 1)`,
    );

    const stats = await getMttrStats(db);
    expect(stats.activeFailures).toBe(2);
  });

  it('counts resolved failures with MTTR', async () => {
    // Seed runs
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES (1, 'hash1', 'main', 'push', 10, 9, 1)`,
    );

    // Insert resolved failure with known timestamps
    await db.execute(
      `INSERT INTO qa_failure_tracking
         (test_signature, module, test_title, first_seen_run_id, first_seen_at,
          resolved_run_id, resolved_at, occurrences, is_active)
       VALUES ('users::can login', 'users', 'can login', 1, '2026-01-01 00:00:00',
               2, '2026-01-01 12:00:00', 2, 0)`,
    );

    const stats = await getMttrStats(db);
    expect(stats.resolvedCount).toBe(1);
    expect(stats.activeFailures).toBe(0);
    // 12 hours difference
    expect(stats.avgMttrHours).toBe(12);
  });
});
