import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJunitReport } from '../parsers/junit.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadFixture(): string {
  return readFileSync(
    resolve(__dirname, 'fixtures/junit-report.xml'),
    'utf-8',
  );
}

describe('parseJunitReport', () => {
  it('extracts modules from testsuite name', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    const moduleNames = Object.keys(parsed.modules).sort();
    expect(moduleNames).toEqual(['orders', 'users']);
  });

  it('counts pass/fail correctly for users module', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    const users = parsed.modules['users']!;
    expect(users.passed).toBe(1);
    expect(users.failed).toBe(1);
    expect(users.skipped).toBe(0);
    expect(users.total).toBe(2);
  });

  it('counts pass correctly for orders module', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    const orders = parsed.modules['orders']!;
    expect(orders.passed).toBe(1);
    expect(orders.failed).toBe(0);
    expect(orders.total).toBe(1);
  });

  it('extracts failures with error message', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0]!.module).toBe('users');
    expect(parsed.failures[0]!.testTitle).toBe('can search users');
    expect(parsed.failures[0]!.errorMessage).toBe('Expected 5 but got 0');
  });

  it('has 3 results in allResults', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    expect(parsed.allResults).toHaveLength(3);
  });

  it('has 2 entries in passedTests', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    expect(parsed.passedTests).toHaveLength(2);
    const titles = parsed.passedTests.map((p) => p.testTitle).sort();
    expect(titles).toEqual(['can view order list', 'can view user list']);
  });

  it('converts time from seconds to milliseconds', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    const users = parsed.modules['users']!;
    // 2.0s + 3.0s = 5000ms
    expect(users.duration).toBe(5000);
  });

  it('extracts classname as file path', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    const failedResult = parsed.allResults.find(
      (r) => r.status === 'failed',
    )!;
    expect(failedResult.file).toBe('tests.e2e.users.UserSearchTest');
  });

  it('computes overall stats duration from testsuites time', () => {
    const xml = loadFixture();
    const parsed = parseJunitReport(xml);

    // testsuites time="8.5" -> 8500ms
    expect(parsed.stats.duration).toBe(8500);
  });

  it('handles empty XML gracefully', () => {
    const parsed = parseJunitReport('<testsuites></testsuites>');
    expect(parsed.modules).toEqual({});
    expect(parsed.allResults).toHaveLength(0);
  });

  it('handles missing testsuites element', () => {
    const parsed = parseJunitReport('<root></root>');
    expect(parsed.modules).toEqual({});
    expect(parsed.allResults).toHaveLength(0);
  });

  it('handles skipped tests', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="1" failures="0">
  <testsuite name="auth" tests="1" failures="0">
    <testcase name="login test" classname="auth.LoginTest" time="0.0">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;
    const parsed = parseJunitReport(xml);

    expect(parsed.modules['auth']!.skipped).toBe(1);
    expect(parsed.modules['auth']!.passed).toBe(0);
    expect(parsed.allResults[0]!.status).toBe('skipped');
  });
});
