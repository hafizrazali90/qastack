import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePlaywrightReport,
  moduleFromFile,
  collectSpecs,
  detectRootCause,
} from '../parsers/playwright.js';
import type { PlaywrightReport } from '../parsers/playwright.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadFixture(): PlaywrightReport {
  const raw = readFileSync(
    resolve(__dirname, 'fixtures/playwright-report.json'),
    'utf-8',
  );
  return JSON.parse(raw) as PlaywrightReport;
}

describe('moduleFromFile', () => {
  it('extracts module from full path', () => {
    expect(
      moduleFromFile('tests/e2e/users/users-list.spec.ts'),
    ).toBe('users');
  });

  it('extracts module from a different directory', () => {
    expect(
      moduleFromFile('tests/e2e/orders/orders-list.spec.ts'),
    ).toBe('orders');
  });

  it('handles relative path (no testDir prefix)', () => {
    expect(moduleFromFile('classes/classes-index.spec.ts')).toBe('classes');
  });

  it('returns unknown for null/undefined', () => {
    expect(moduleFromFile(null)).toBe('unknown');
    expect(moduleFromFile(undefined)).toBe('unknown');
  });

  it('supports custom testDir', () => {
    expect(
      moduleFromFile('spec/integration/billing/invoice.spec.ts', 'spec/integration'),
    ).toBe('billing');
  });

  it('handles backslash paths', () => {
    expect(
      moduleFromFile('tests\\e2e\\auth\\login.spec.ts'),
    ).toBe('auth');
  });
});

describe('collectSpecs', () => {
  it('collects specs from nested suites', () => {
    const fixture = loadFixture();
    const firstSuite = fixture.suites![0]!;
    const specs = collectSpecs(firstSuite, null);

    // 2 direct specs + 1 nested spec = 3
    expect(specs).toHaveLength(3);
    expect(specs[0]!.spec.title).toBe('US-001: user can view user list');
    expect(specs[2]!.spec.title).toBe('US-003: user can create user');
  });

  it('inherits file from parent suite', () => {
    const fixture = loadFixture();
    const firstSuite = fixture.suites![0]!;
    const specs = collectSpecs(firstSuite, null);

    // Nested suite has no file -- should inherit parent's file
    expect(specs[2]!.file).toBe('tests/e2e/users/users-list.spec.ts');
  });
});

describe('detectRootCause', () => {
  it('detects timeout', () => {
    expect(detectRootCause('Timeout waiting for selector', false)).toBe('timeout');
  });

  it('detects infra', () => {
    expect(detectRootCause('ECONNREFUSED 127.0.0.1:3000', false)).toBe('infra');
  });

  it('detects data-issue', () => {
    expect(detectRootCause('Cannot read property of null', false)).toBe('data-issue');
  });

  it('detects ui-bug', () => {
    expect(detectRootCause('locator.click: Target closed', false)).toBe('ui-bug');
  });

  it('detects assertion', () => {
    expect(detectRootCause('Expected 5 to toBe 10', false)).toBe('assertion');
  });

  it('returns flaky for flaky tests', () => {
    expect(detectRootCause('some error', true)).toBe('flaky');
  });

  it('returns unknown for empty message', () => {
    expect(detectRootCause(null, false)).toBe('unknown');
  });
});

describe('parsePlaywrightReport', () => {
  it('extracts correct modules', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    const moduleNames = Object.keys(parsed.modules).sort();
    expect(moduleNames).toEqual(['orders', 'users']);
  });

  it('counts pass/fail/skip correctly for users module', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    const users = parsed.modules['users']!;
    expect(users.passed).toBe(1);
    expect(users.failed).toBe(1);
    expect(users.skipped).toBe(1);
    expect(users.flaky).toBe(0);
    expect(users.total).toBe(3);
  });

  it('counts pass correctly for orders module', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    const orders = parsed.modules['orders']!;
    expect(orders.passed).toBe(1);
    expect(orders.failed).toBe(0);
    expect(orders.skipped).toBe(0);
    expect(orders.total).toBe(1);
  });

  it('has correct failures array', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0]!.module).toBe('users');
    expect(parsed.failures[0]!.testTitle).toBe('US-002: user can search users');
    expect(parsed.failures[0]!.errorMessage).toBe('Timeout waiting for selector');
  });

  it('has all 4 results in allResults', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    expect(parsed.allResults).toHaveLength(4);
  });

  it('has 2 entries in passedTests', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    expect(parsed.passedTests).toHaveLength(2);
    const titles = parsed.passedTests.map((p) => p.testTitle).sort();
    expect(titles).toEqual([
      'US-001: user can view user list',
      'US-010: user can view orders',
    ]);
  });

  it('preserves stats duration', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    expect(parsed.stats.duration).toBe(12000);
  });

  it('maps status correctly in allResults', () => {
    const report = loadFixture();
    const parsed = parsePlaywrightReport(report);

    const statuses = parsed.allResults.map((r) => r.status);
    expect(statuses).toEqual(['passed', 'failed', 'skipped', 'passed']);
  });
});
