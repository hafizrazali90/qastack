/**
 * Integration test — full collect -> analyze -> API workflow.
 *
 * Tests the complete qastack pipeline without AI calls:
 * 1. Create in-memory SQLite database
 * 2. Run migrations
 * 3. Parse the Playwright fixture
 * 4. Collect results into DB
 * 5. Run analysis (root cause, regression, MTTR)
 * 6. Start API server, hit /api/overview, verify response
 * 7. Verify DB state (runs, modules, failures)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import {
  parsePlaywrightReport,
  collectResults,
} from '@qastack/collector';
import { analyzeRun } from '@qastack/analyzer';
import { createApiServer } from '@qastack/api';
import type { ApiServer } from '@qastack/api';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Load the shared Playwright fixture from the collector package.
 */
function loadPlaywrightFixture(): Record<string, unknown> {
  const fixturePath = resolve(
    __dirname,
    '../../../collector/src/__tests__/fixtures/playwright-report.json',
  );
  const raw = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('Integration: collect -> analyze -> API', () => {
  let db: Database;
  let server: ApiServer;
  let runId: number;

  // ---------------------------------------------------------------------------
  // Setup: migrate, collect, analyze, start API
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    // 1. Create in-memory SQLite database and migrate
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();

    // 2. Parse the Playwright fixture
    const json = loadPlaywrightFixture();
    const report = parsePlaywrightReport(json);

    // 3. Collect results into DB
    const collectResult = await collectResults(db, report, {
      commitHash: 'int-test-1',
      branch: 'integration',
      trigger: 'manual',
    });
    runId = collectResult.runId;

    // 4. Run analysis
    await analyzeRun(
      db,
      runId,
      report.failures.map((f) => ({
        module: f.module,
        testTitle: f.testTitle,
        errorMessage: f.errorMessage,
        isFlaky: f.isFlaky,
      })),
      report.passedTests,
    );

    // 5. Start API server on random port
    server = createApiServer({ db, port: 0 });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    await db.close();
  });

  // ---------------------------------------------------------------------------
  // DB state verification
  // ---------------------------------------------------------------------------

  it('inserted exactly 1 run into qa_runs', async () => {
    const runs = await db.query<{ id: number; commit_hash: string }>(
      'SELECT id, commit_hash FROM qa_runs',
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.commit_hash).toBe('int-test-1');
  });

  it('inserted module results for 2 modules', async () => {
    const modules = await db.query<{ module: string; total_tests: number }>(
      'SELECT module, total_tests FROM qa_module_results WHERE run_id = ? ORDER BY module',
      [runId],
    );
    expect(modules).toHaveLength(2);
    expect(modules[0]!.module).toBe('orders');
    expect(modules[1]!.module).toBe('users');
  });

  it('inserted 4 individual test results', async () => {
    const results = await db.query<{ status: string }>(
      'SELECT status FROM qa_test_results WHERE run_id = ?',
      [runId],
    );
    expect(results).toHaveLength(4);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(['failed', 'passed', 'passed', 'skipped']);
  });

  it('inserted 1 failure with correct root cause', async () => {
    const failures = await db.query<{
      module: string;
      test_title: string;
      root_cause: string;
      error_message: string;
    }>(
      'SELECT module, test_title, root_cause, error_message FROM qa_test_failures WHERE run_id = ?',
      [runId],
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]!.module).toBe('users');
    expect(failures[0]!.test_title).toBe('US-002: user can search users');
    expect(failures[0]!.root_cause).toBe('timeout');
    expect(failures[0]!.error_message).toContain('Timeout');
  });

  it('created failure tracking record', async () => {
    const tracking = await db.query<{
      test_signature: string;
      is_active: number;
    }>(
      'SELECT test_signature, is_active FROM qa_failure_tracking',
    );
    expect(tracking.length).toBeGreaterThanOrEqual(1);

    const failedTracking = tracking.find(
      (t) => t.test_signature === 'users::US-002: user can search users',
    );
    expect(failedTracking).toBeDefined();
    expect(failedTracking!.is_active).toBe(1);
  });

  it('health percentage is 50% (2 passed out of 4)', async () => {
    const runs = await db.query<{ health_pct: number }>(
      'SELECT health_pct FROM qa_runs WHERE id = ?',
      [runId],
    );
    expect(runs[0]!.health_pct).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // API verification
  // ---------------------------------------------------------------------------

  it('GET /api/overview returns valid response with latest run', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/overview`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(true);

    const data = json.data as Record<string, unknown>;

    // Latest run matches what we inserted
    const latest = data.latest as Record<string, unknown>;
    expect(latest.commit_hash).toBe('int-test-1');
    expect(latest.health_pct).toBe(50);

    // Trend should have 1 run
    const trend = data.trend as unknown[];
    expect(trend).toHaveLength(1);

    // Modules should be present
    const modules = data.modules as unknown[];
    expect(modules).toHaveLength(2);

    // Readiness: 50% health -> NOT_READY
    expect(data.readiness).toBe('NOT_READY');

    // Root cause summary should exist
    const rootCauses = data.root_cause_summary as unknown[];
    expect(rootCauses.length).toBeGreaterThan(0);
  });

  it('GET /api/runs returns the single run', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/runs`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const runs = data.runs as unknown[];
    expect(runs).toHaveLength(1);
  });

  it('GET /api/runs/:id returns run detail', async () => {
    const res = await fetch(
      `http://localhost:${server.port}/api/runs/${runId}`,
    );
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const run = data.run as Record<string, unknown>;
    expect(run.commit_hash).toBe('int-test-1');

    const modules = data.modules as unknown[];
    expect(modules).toHaveLength(2);

    const failures = data.failures as unknown[];
    expect(failures).toHaveLength(1);
  });

  it('GET /api/modules returns module health data', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/modules`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);

    for (const mod of data) {
      expect(mod.module).toBeDefined();
      expect(mod.avg_health).toBeDefined();
    }
  });

  it('GET /api/tests returns test results', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/tests`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    const tests = data.tests as unknown[];
    expect(tests).toHaveLength(4);
  });

  it('GET /api/root-causes returns breakdown', async () => {
    const res = await fetch(
      `http://localhost:${server.port}/api/root-causes`,
    );
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect(data.breakdown).toBeDefined();
    expect(Array.isArray(data.breakdown)).toBe(true);
  });

  it('GET /api/mttr returns tracking data', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/mttr`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;
    expect(data.active).toBeDefined();
    expect(data.resolved).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Second run: collect again to test regression detection
  // ---------------------------------------------------------------------------

  it('second collect detects no regressions (same failures)', async () => {
    const json = loadPlaywrightFixture();
    const report = parsePlaywrightReport(json);

    const collectResult = await collectResults(db, report, {
      commitHash: 'int-test-2',
      branch: 'integration',
      trigger: 'manual',
    });

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

    // Same test still failing -- not a new regression
    expect(analysis.regressions.detected).toBe(0);

    // Failure tracking should show recurring (not new)
    expect(analysis.tracking.recurring).toBeGreaterThanOrEqual(1);

    // DB should now have 2 runs
    const runs = await db.query<{ id: number }>('SELECT id FROM qa_runs');
    expect(runs).toHaveLength(2);
  });
});
