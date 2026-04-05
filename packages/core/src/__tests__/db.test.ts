import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db.js';

describe('SQLite database adapter', () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates all required tables', async () => {
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('qa_runs');
    expect(names).toContain('qa_module_results');
    expect(names).toContain('qa_test_results');
    expect(names).toContain('qa_test_failures');
    expect(names).toContain('qa_failure_tracking');
    expect(names).toContain('qa_regressions');
    expect(names).toContain('qa_test_catalog');
    expect(names).toContain('qa_alert_thresholds');
  });

  it('seeds default alert thresholds', async () => {
    const thresholds = await db.query<{ metric: string }>(
      'SELECT metric FROM qa_alert_thresholds',
    );
    expect(thresholds.length).toBe(5);
  });

  it('inserts and queries a run', async () => {
    await db.execute(
      `INSERT INTO qa_runs (commit_hash, branch, trigger_type, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['abc123', 'main', 'push', 10, 8, 1, 1, 0, 80, 5000],
    );
    const runs = await db.query<{ id: number; health_pct: number }>(
      'SELECT id, health_pct FROM qa_runs',
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.health_pct).toBe(80);
  });

  it('enforces foreign key on module_results', async () => {
    // Insert without a valid run_id should fail
    await expect(
      db.execute(
        `INSERT INTO qa_module_results (run_id, module, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [9999, 'users', 5, 4, 1, 0, 0, 80, 2000],
      ),
    ).rejects.toThrow();
  });

  it('returns insertId and affectedRows from execute', async () => {
    const result = await db.execute(
      `INSERT INTO qa_runs (commit_hash, branch, trigger_type, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['def456', 'develop', 'manual', 20, 18, 2, 0, 1, 90, 8000],
    );
    expect(result.insertId).toBeGreaterThan(0);
    expect(result.affectedRows).toBe(1);
  });

  it('supports test_catalog unique constraint', async () => {
    await db.execute(
      `INSERT INTO qa_test_catalog (test_signature, friendly_title, module) VALUES (?, ?, ?)`,
      ['sig-1', 'Login test', 'auth'],
    );
    // Duplicate signature should fail
    await expect(
      db.execute(
        `INSERT INTO qa_test_catalog (test_signature, friendly_title, module) VALUES (?, ?, ?)`,
        ['sig-1', 'Duplicate', 'auth'],
      ),
    ).rejects.toThrow();
  });

  it('migration is idempotent', async () => {
    // Running migrate again should not throw or duplicate seed data
    await db.migrate();
    const thresholds = await db.query<{ metric: string }>(
      'SELECT metric FROM qa_alert_thresholds',
    );
    expect(thresholds.length).toBe(5);
  });
});

describe('createDatabase factory', () => {
  it('throws for unsupported driver', async () => {
    await expect(
      createDatabase({ driver: 'postgres' as 'sqlite' }),
    ).rejects.toThrow('Unsupported database driver: postgres');
  });
});
