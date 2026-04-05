import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import { createApiServer } from '../server.js';
import type { ApiServer } from '../server.js';

describe('API server', () => {
  let db: Database;
  let server: ApiServer;

  beforeAll(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();

    // Seed: two runs
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'aaa111', 'main', 'push', 100, 85, 10, 3, 2, 85, 120000, '2026-01-01 10:00:00'],
    );
    await db.execute(
      `INSERT INTO qa_runs (id, commit_hash, branch, trigger_type, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [2, 'bbb222', 'main', 'push', 100, 92, 5, 2, 1, 92, 110000, '2026-01-02 10:00:00'],
    );

    // Seed: module results for run 2
    await db.execute(
      `INSERT INTO qa_module_results (run_id, module, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [2, 'users', 50, 46, 3, 1, 0, 92, 55000],
    );
    await db.execute(
      `INSERT INTO qa_module_results (run_id, module, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [2, 'billing', 50, 46, 2, 1, 1, 92, 55000],
    );

    // Seed: module results for run 1
    await db.execute(
      `INSERT INTO qa_module_results (run_id, module, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'users', 50, 42, 5, 2, 1, 84, 60000],
    );

    // Seed: test failures for run 2
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, root_cause, is_flaky)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [2, 'users', 'users.spec.ts', 'should login', 'timeout', 'timeout', 0],
    );
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, root_cause, is_flaky)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [2, 'billing', 'billing.spec.ts', 'should charge', null, 'ui-bug', 0],
    );
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, root_cause, is_flaky)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [2, 'billing', 'billing.spec.ts', 'flaky payment', null, 'flaky', 1],
    );

    // Seed: test results for run 2
    await db.execute(
      `INSERT INTO qa_test_results (run_id, module, test_signature, test_title, file_path, status, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [2, 'users', 'users::login', 'should login', 'users.spec.ts', 'failed', 5000],
    );
    await db.execute(
      `INSERT INTO qa_test_results (run_id, module, test_signature, test_title, file_path, status, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [2, 'users', 'users::register', 'should register', 'users.spec.ts', 'passed', 2000],
    );
    await db.execute(
      `INSERT INTO qa_test_results (run_id, module, test_signature, test_title, file_path, status, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [2, 'billing', 'billing::charge', 'should charge', 'billing.spec.ts', 'failed', 3000],
    );

    // Seed: regressions
    await db.execute(
      `INSERT INTO qa_regressions (test_signature, module, test_title, previous_pass_run_id, regression_run_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['users::login', 'users', 'should login', 1, 2, 1],
    );

    // Seed: failure tracking (active + resolved)
    await db.execute(
      `INSERT INTO qa_failure_tracking (test_signature, module, test_title, first_seen_run_id, first_seen_at, is_active, occurrences)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['users::login', 'users', 'should login', 1, '2026-01-01 10:00:00', 1, 2],
    );
    await db.execute(
      `INSERT INTO qa_failure_tracking (test_signature, module, test_title, first_seen_run_id, first_seen_at, resolved_run_id, resolved_at, is_active, occurrences)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['billing::old', 'billing', 'old failure', 1, '2026-01-01 08:00:00', 2, '2026-01-02 10:00:00', 0, 5],
    );

    // Seed: flaky failures across run 1
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, root_cause, is_flaky)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [1, 'billing', 'billing.spec.ts', 'flaky payment', null, 'flaky', 1],
    );

    server = createApiServer({ db, port: 0 });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    await db.close();
  });

  // -------------------------------------------------------------------------
  // /api/overview
  // -------------------------------------------------------------------------

  it('GET /api/overview returns latest run, trend, modules, and readiness', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/overview`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.latest).toBeDefined();
    expect((data.latest as Record<string, unknown>).commit_hash).toBe('bbb222');
    expect(data.trend).toBeDefined();
    expect(Array.isArray(data.trend)).toBe(true);
    expect((data.trend as unknown[]).length).toBe(2);
    expect(data.modules).toBeDefined();
    expect((data.modules as unknown[]).length).toBe(2);
    expect(data.readiness).toBe('CONDITIONAL'); // 92% is CONDITIONAL
    expect(data.active_regressions).toBe(1);
    expect(data.active_failures_tracking).toBe(1);
    expect(data.root_cause_summary).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // /api/runs
  // -------------------------------------------------------------------------

  it('GET /api/runs returns paginated results', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/runs`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.runs).toBeDefined();
    expect(Array.isArray(data.runs)).toBe(true);
    expect((data.runs as unknown[]).length).toBe(2);

    const pagination = data.pagination as Record<string, unknown>;
    expect(pagination.page).toBe(1);
    expect(pagination.total).toBe(2);
    expect(pagination.totalPages).toBe(1);
  });

  it('GET /api/runs respects page and limit params', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/runs?page=1&limit=1`);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect((data.runs as unknown[]).length).toBe(1);
    expect((data.pagination as Record<string, unknown>).totalPages).toBe(2);
  });

  // -------------------------------------------------------------------------
  // /api/runs/:id
  // -------------------------------------------------------------------------

  it('GET /api/runs/:id returns run detail with modules and failures', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/runs/2`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect((data.run as Record<string, unknown>).commit_hash).toBe('bbb222');
    expect((data.modules as unknown[]).length).toBe(2);
    expect((data.failures as unknown[]).length).toBe(3);
  });

  it('GET /api/runs/:id returns 404 for unknown run', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/runs/999`);
    expect(res.status).toBe(404);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // /api/modules
  // -------------------------------------------------------------------------

  it('GET /api/modules returns module data with trend', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/modules`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(true);

    const data = json.data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
    // Every module should have avg_health, total_failures, run_count, trend
    for (const mod of data) {
      expect(mod.module).toBeDefined();
      expect(mod.avg_health).toBeDefined();
      expect(mod.total_failures).toBeDefined();
      expect(mod.run_count).toBeDefined();
      expect(mod.trend).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // /api/tests
  // -------------------------------------------------------------------------

  it('GET /api/tests returns test results from latest run', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/tests`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect(data.run_id).toBe(2);
    expect((data.tests as unknown[]).length).toBe(3);
    expect((data.modules as unknown[]).length).toBe(2);
    expect(data.pagination).toBeDefined();
  });

  it('GET /api/tests?module=users filters by module', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/tests?module=users`);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const tests = data.tests as Array<Record<string, unknown>>;
    expect(tests.length).toBe(2);
    for (const t of tests) {
      expect(t.module).toBe('users');
    }
  });

  it('GET /api/tests?status=failed filters by status', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/tests?status=failed`);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const tests = data.tests as Array<Record<string, unknown>>;
    expect(tests.length).toBe(2);
    for (const t of tests) {
      expect(t.status).toBe('failed');
    }
  });

  // -------------------------------------------------------------------------
  // /api/flaky
  // -------------------------------------------------------------------------

  it('GET /api/flaky returns flaky test summary', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/flaky`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
    // "flaky payment" should appear with count 2 (seeded in both runs)
    const flakyPayment = data.find((d) => d.test_title === 'flaky payment');
    expect(flakyPayment).toBeDefined();
    expect(flakyPayment?.flaky_count).toBe(2);
  });

  // -------------------------------------------------------------------------
  // /api/root-causes
  // -------------------------------------------------------------------------

  it('GET /api/root-causes returns breakdown and trend', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/root-causes`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect(data.breakdown).toBeDefined();
    expect(Array.isArray(data.breakdown)).toBe(true);
    expect(data.trend).toBeDefined();
    expect(Array.isArray(data.trend)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // /api/mttr
  // -------------------------------------------------------------------------

  it('GET /api/mttr returns active, resolved, and avg_mttr_hours', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/mttr`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;

    expect(data.active).toBeDefined();
    expect((data.active as unknown[]).length).toBe(1);
    expect(data.resolved).toBeDefined();
    expect((data.resolved as unknown[]).length).toBe(1);
    // avg_mttr_hours should be a number (resolved failure exists)
    expect(typeof data.avg_mttr_hours).toBe('number');
    expect(data.avg_mttr_hours).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // /api/regressions
  // -------------------------------------------------------------------------

  it('GET /api/regressions returns active regressions and per_module', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/regressions`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect(data.total).toBe(1);
    expect((data.active as unknown[]).length).toBe(1);
    expect((data.per_module as unknown[]).length).toBe(1);

    const reg = (data.active as Array<Record<string, unknown>>)[0];
    expect(reg?.pass_commit).toBe('aaa111');
    expect(reg?.fail_commit).toBe('bbb222');
  });

  // -------------------------------------------------------------------------
  // /api/thresholds
  // -------------------------------------------------------------------------

  it('GET /api/thresholds returns alert thresholds', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/thresholds`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Array<Record<string, unknown>>;
    // Seeded by migration: 5 default thresholds
    expect(data.length).toBe(5);
    // Verify one threshold shape
    expect(data[0]?.metric).toBeDefined();
    expect(data[0]?.threshold).toBeDefined();
    expect(data[0]?.severity).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 404 and CORS
  // -------------------------------------------------------------------------

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/nope`);
    expect(res.status).toBe(404);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect(json.error).toBe('Not found');
  });

  it('handles OPTIONS preflight requests', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/overview`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
  });
});
