/**
 * Playwright JSON report parser.
 * Ported from SIMS collect-results.cjs lines 66-198.
 */

import type { RootCause, TestResult } from '@qastack/core';

// ---------------------------------------------------------------------------
// Playwright report shape (subset we care about)
// ---------------------------------------------------------------------------

export interface PlaywrightReport {
  stats?: { duration?: number };
  suites?: PlaywrightSuite[];
}

export interface PlaywrightSuite {
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightSpec {
  title: string;
  tests?: PlaywrightTest[];
}

export interface PlaywrightTest {
  status: 'expected' | 'unexpected' | 'skipped' | 'flaky' | string;
  results?: PlaywrightTestResult[];
}

export interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | string;
  duration?: number;
  error?: { message?: string };
}

// ---------------------------------------------------------------------------
// Parsed output (shared by all parsers)
// ---------------------------------------------------------------------------

export interface ModuleStats {
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
  duration: number;
}

export interface FailureEntry {
  module: string;
  file: string;
  testTitle: string;
  errorMessage: string | null;
  duration: number;
  isFlaky: boolean;
}

export interface ParsedReport {
  modules: Record<string, ModuleStats>;
  failures: FailureEntry[];
  passedTests: Array<{ module: string; testTitle: string }>;
  allResults: TestResult[];
  stats: { duration?: number };
}

// ---------------------------------------------------------------------------
// Root cause detection (ported from SIMS detectRootCause)
// ---------------------------------------------------------------------------

export function detectRootCause(
  errorMessage: string | null | undefined,
  isFlaky: boolean,
): RootCause {
  if (isFlaky) return 'flaky';
  if (!errorMessage) return 'unknown';

  const msg = errorMessage;

  // Infra issues (most specific -- check first)
  if (/ECONNREFUSED|ECONNRESET|net::|ERR_|crashed|browser/i.test(msg))
    return 'infra';

  // Timeout
  if (/timeout|exceeded|waiting for/i.test(msg)) return 'timeout';

  // Data issues
  if (/\bnull\b|\bundefined\b|not found|404|no rows|seed/i.test(msg))
    return 'data-issue';

  // UI bugs (locator / element interaction)
  if (/locator|selector|visible|click|element|getByRole/i.test(msg))
    return 'ui-bug';

  // Assertion failures
  if (/expect|toEqual|toBe|toHave|assert|Expected/i.test(msg))
    return 'assertion';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Suite walking
// ---------------------------------------------------------------------------

interface CollectedSpec {
  file: string;
  spec: PlaywrightSpec;
}

/**
 * Recursively walk suites to collect every spec with its originating file.
 * The `file` field lives on the top-level suite; nested suites inherit it.
 */
export function collectSpecs(
  suite: PlaywrightSuite,
  file: string | null,
): CollectedSpec[] {
  const results: CollectedSpec[] = [];
  const currentFile = suite.file ?? file ?? 'unknown';

  if (suite.specs) {
    for (const spec of suite.specs) {
      results.push({ file: currentFile, spec });
    }
  }

  if (suite.suites) {
    for (const child of suite.suites) {
      results.push(...collectSpecs(child, currentFile));
    }
  }

  return results;
}

/**
 * Derive module name from test file path.
 * e.g. "tests/e2e/classes/classes-index.spec.ts" -> "classes"
 *
 * @param filePath - file path from Playwright report
 * @param testDir  - test directory prefix (default "tests/e2e")
 */
export function moduleFromFile(
  filePath: string | null | undefined,
  testDir: string = 'tests/e2e',
): string {
  if (!filePath) return 'unknown';

  // Normalise separators
  const normalised = filePath.replace(/\\/g, '/');

  // Normalise testDir (strip trailing slash)
  const normDir = testDir.replace(/\\/g, '/').replace(/\/$/, '');

  // Try full path first: <testDir>/<module>/...
  const regex = new RegExp(`${normDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)`);
  const match = normalised.match(regex);
  if (match?.[1]) return match[1];

  // Playwright JSON uses paths relative to testDir, so: <module>/file.spec.ts
  const parts = normalised.split('/');
  if (parts.length >= 2 && parts[0]) return parts[0];

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse the Playwright JSON report into per-module stats and failure details.
 */
export function parsePlaywrightReport(
  report: PlaywrightReport,
  testDir: string = 'tests/e2e',
): ParsedReport {
  const allSpecs: CollectedSpec[] = [];
  for (const suite of report.suites ?? []) {
    allSpecs.push(...collectSpecs(suite, null));
  }

  // Per-module aggregation
  const modules: Record<string, ModuleStats> = {};

  // Failures list
  const failures: FailureEntry[] = [];

  // Passed tests for regression detection
  const passedTests: Array<{ module: string; testTitle: string }> = [];

  // ALL individual test results
  const allResults: TestResult[] = [];

  for (const { file, spec } of allSpecs) {
    const mod = moduleFromFile(file, testDir);

    if (!modules[mod]) {
      modules[mod] = {
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        total: 0,
        duration: 0,
      };
    }

    const moduleStats = modules[mod]!;

    for (const test of spec.tests ?? []) {
      moduleStats.total++;

      const lastResult =
        test.results && test.results.length > 0
          ? test.results[test.results.length - 1]
          : undefined;
      const duration = lastResult?.duration ?? 0;
      moduleStats.duration += duration;

      // Detect flakiness: multiple results with mixed pass/fail outcomes
      const isFlaky =
        test.status === 'flaky' ||
        (test.results != null &&
          test.results.length > 1 &&
          test.results.some((r) => r.status === 'passed') &&
          test.results.some((r) => r.status === 'failed'));

      // Map Playwright status to our status enum
      let resultStatus: TestResult['status'];
      switch (test.status) {
        case 'expected':
          resultStatus = 'passed';
          break;
        case 'unexpected':
          resultStatus = isFlaky ? 'flaky' : 'failed';
          break;
        case 'skipped':
          resultStatus = 'skipped';
          break;
        case 'flaky':
          resultStatus = 'flaky';
          break;
        default:
          resultStatus = 'failed';
          break;
      }

      const errorMessage =
        lastResult?.error?.message ?? null;

      allResults.push({
        module: mod,
        file: file || 'unknown',
        testTitle: spec.title,
        status: resultStatus,
        duration,
        errorMessage,
        isFlaky,
      });

      switch (test.status) {
        case 'expected':
          moduleStats.passed++;
          passedTests.push({ module: mod, testTitle: spec.title });
          break;
        case 'unexpected':
          moduleStats.failed++;
          failures.push({
            module: mod,
            file: file || 'unknown',
            testTitle: spec.title,
            errorMessage,
            duration,
            isFlaky,
          });
          break;
        case 'skipped':
          moduleStats.skipped++;
          break;
        case 'flaky':
          moduleStats.flaky++;
          break;
        default:
          moduleStats.failed++;
          break;
      }
    }
  }

  return {
    modules,
    failures,
    passedTests,
    allResults,
    stats: report.stats ?? {},
  };
}
