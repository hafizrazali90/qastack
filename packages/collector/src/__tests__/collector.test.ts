import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import { parsePlaywrightReport } from '../parsers/playwright.js';
import { collectResults } from '../collector.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadPlaywrightFixture() {
  const raw = readFileSync(
    resolve(__dirname, 'fixtures/playwright-report.json'),
    'utf-8',
  );
  return JSON.parse(raw);
}

describe('collectResults integration', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  it('inserts a complete run with all related rows', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    const result = await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    // Check return value
    expect(result.runId).toBeGreaterThan(0);
    expect(result.totalTests).toBe(4);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.moduleCount).toBe(2);
    expect(result.failureCount).toBe(1);

    // Health: 2 passed out of 4 = 50%
    expect(result.healthPct).toBe(50);
  });

  it('has 1 row in qa_runs with correct health_pct', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    const runs = await db.query<{
      id: number;
      health_pct: number;
      total_tests: number;
      commit_hash: string;
    }>('SELECT id, health_pct, total_tests, commit_hash FROM qa_runs');

    expect(runs).toHaveLength(1);
    expect(runs[0]!.health_pct).toBe(50);
    expect(runs[0]!.total_tests).toBe(4);
    expect(runs[0]!.commit_hash).toBe('abc12345');
  });

  it('has 2 rows in qa_module_results (users, orders)', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    const modules = await db.query<{
      module: string;
      total_tests: number;
      health_pct: number;
    }>('SELECT module, total_tests, health_pct FROM qa_module_results ORDER BY module');

    expect(modules).toHaveLength(2);
    expect(modules[0]!.module).toBe('orders');
    expect(modules[0]!.total_tests).toBe(1);
    expect(modules[0]!.health_pct).toBe(100);

    expect(modules[1]!.module).toBe('users');
    expect(modules[1]!.total_tests).toBe(3);
    // users: 1 passed / 3 total = 33%
    expect(modules[1]!.health_pct).toBe(33);
  });

  it('has 1 row in qa_test_failures', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    const failures = await db.query<{
      module: string;
      test_title: string;
      error_message: string;
      root_cause: string;
    }>('SELECT module, test_title, error_message, root_cause FROM qa_test_failures');

    expect(failures).toHaveLength(1);
    expect(failures[0]!.module).toBe('users');
    expect(failures[0]!.test_title).toBe('US-002: user can search users');
    expect(failures[0]!.error_message).toBe('Timeout waiting for selector');
    expect(failures[0]!.root_cause).toBe('timeout');
  });

  it('has 4 rows in qa_test_results', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    const results = await db.query<{
      module: string;
      test_title: string;
      status: string;
      test_signature: string;
    }>('SELECT module, test_title, status, test_signature FROM qa_test_results ORDER BY id');

    expect(results).toHaveLength(4);

    // Verify test_signature format
    expect(results[0]!.test_signature).toBe(
      'users::US-001: user can view user list',
    );

    // Verify statuses
    const statuses = results.map((r) => r.status);
    expect(statuses).toEqual(['passed', 'failed', 'skipped', 'passed']);
  });

  it('stores duration from report stats', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    const runs = await db.query<{ duration_ms: number }>(
      'SELECT duration_ms FROM qa_runs',
    );
    expect(runs[0]!.duration_ms).toBe(12000);
  });

  it('only stores error_message for failed tests in qa_test_results', async () => {
    const report = parsePlaywrightReport(loadPlaywrightFixture());
    await collectResults(db, report, {
      commitHash: 'abc12345',
      branch: 'main',
      trigger: 'push',
    });

    const withErrors = await db.query<{ error_message: string | null }>(
      'SELECT error_message FROM qa_test_results WHERE error_message IS NOT NULL',
    );
    expect(withErrors).toHaveLength(1);
    expect(withErrors[0]!.error_message).toBe('Timeout waiting for selector');
  });
});
