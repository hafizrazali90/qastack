import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '@qastack/core';
import type { Database } from '@qastack/core';
import { detectRootCause, categorizeRootCauses } from '../root-cause.js';

// ---------------------------------------------------------------------------
// detectRootCause — unit tests
// ---------------------------------------------------------------------------

describe('detectRootCause', () => {
  describe('flaky', () => {
    it('returns flaky when isFlaky=true regardless of message', () => {
      expect(detectRootCause('some error', true)).toBe('flaky');
      expect(detectRootCause(null, true)).toBe('flaky');
      expect(detectRootCause('Timeout exceeded', true)).toBe('flaky');
    });
  });

  describe('infra', () => {
    it.each([
      'ECONNREFUSED 127.0.0.1:3000',
      'ECONNRESET socket hang up',
      'net::ERR_CONNECTION_REFUSED',
      'ERR_CONNECTION_TIMED_OUT',
      'Browser has crashed',
      'browser disconnected',
    ])('detects "%s" as infra', (msg) => {
      expect(detectRootCause(msg, false)).toBe('infra');
    });
  });

  describe('timeout', () => {
    it.each([
      'Timeout 30000ms exceeded',
      'Test timeout exceeded',
      'waiting for selector .btn',
      'Exceeded navigation timeout',
    ])('detects "%s" as timeout', (msg) => {
      expect(detectRootCause(msg, false)).toBe('timeout');
    });
  });

  describe('data-issue', () => {
    it.each([
      'Cannot read properties of null',
      'undefined is not an object',
      'Page not found',
      'HTTP 404 response',
      'no rows returned from query',
      'Seed data missing for user',
    ])('detects "%s" as data-issue', (msg) => {
      expect(detectRootCause(msg, false)).toBe('data-issue');
    });
  });

  describe('ui-bug', () => {
    it.each([
      'locator.click: Target closed',
      'selector #submit did not match any elements',
      'Element is not visible',
      'Failed to click at coordinates',
      'element is detached from DOM',
      'getByRole("button") found 0 matches',
    ])('detects "%s" as ui-bug', (msg) => {
      expect(detectRootCause(msg, false)).toBe('ui-bug');
    });
  });

  describe('assertion', () => {
    it.each([
      'expect(received).toEqual(expected)',
      'expect(value).toBe(42)',
      'expect(elem).toHaveText("hello")',
      'assert.strictEqual(a, b)',
      'Expected 5 to equal 10',
    ])('detects "%s" as assertion', (msg) => {
      expect(detectRootCause(msg, false)).toBe('assertion');
    });
  });

  describe('unknown', () => {
    it('returns unknown for unrecognized messages', () => {
      expect(detectRootCause('Something weird happened', false)).toBe(
        'unknown',
      );
    });

    it('returns unknown for null message', () => {
      expect(detectRootCause(null, false)).toBe('unknown');
    });

    it('returns unknown for undefined message', () => {
      expect(detectRootCause(undefined, false)).toBe('unknown');
    });

    it('returns unknown for empty string', () => {
      expect(detectRootCause('', false)).toBe('unknown');
    });
  });
});

// ---------------------------------------------------------------------------
// categorizeRootCauses — integration tests
// ---------------------------------------------------------------------------

describe('categorizeRootCauses', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();

    // Insert a run
    await db.execute(
      `INSERT INTO qa_runs (commit_hash, branch, trigger_type, total_tests, passed, failed)
       VALUES ('abc123', 'main', 'push', 10, 7, 3)`,
    );

    // Insert failure records (root_cause initially NULL)
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, is_flaky)
       VALUES (1, 'users', 'tests/users.spec.ts', 'can login', 'Timeout 30000ms exceeded', 0)`,
    );
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, is_flaky)
       VALUES (1, 'orders', 'tests/orders.spec.ts', 'can create order', 'ECONNREFUSED 127.0.0.1:3000', 0)`,
    );
    await db.execute(
      `INSERT INTO qa_test_failures (run_id, module, file_path, test_title, error_message, is_flaky)
       VALUES (1, 'classes', 'tests/classes.spec.ts', 'can view class', null, 1)`,
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns correct root cause counts', async () => {
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
      {
        module: 'classes',
        testTitle: 'can view class',
        errorMessage: null,
        isFlaky: true,
      },
    ];

    const counts = await categorizeRootCauses(db, 1, failures);

    expect(counts.timeout).toBe(1);
    expect(counts.infra).toBe(1);
    expect(counts.flaky).toBe(1);
  });

  it('updates root_cause in qa_test_failures', async () => {
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
      {
        module: 'classes',
        testTitle: 'can view class',
        errorMessage: null,
        isFlaky: true,
      },
    ];

    await categorizeRootCauses(db, 1, failures);

    const rows = await db.query<{ module: string; root_cause: string }>(
      'SELECT module, root_cause FROM qa_test_failures ORDER BY module',
    );

    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.module === 'users')!.root_cause).toBe('timeout');
    expect(rows.find((r) => r.module === 'orders')!.root_cause).toBe('infra');
    expect(rows.find((r) => r.module === 'classes')!.root_cause).toBe('flaky');
  });
});
