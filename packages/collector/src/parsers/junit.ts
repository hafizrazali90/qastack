/**
 * JUnit XML report parser.
 * Parses standard JUnit XML format into the same ParsedReport structure
 * used by the Playwright parser.
 */

import { XMLParser } from 'fast-xml-parser';
import type { TestResult } from '@qastack/core';
import type {
  FailureEntry,
  ModuleStats,
  ParsedReport,
} from './playwright.js';

// ---------------------------------------------------------------------------
// JUnit XML shape (after fast-xml-parser)
// ---------------------------------------------------------------------------

interface JunitTestSuites {
  testsuites?: {
    testsuite?: JunitTestSuite | JunitTestSuite[];
    '@_tests'?: string;
    '@_failures'?: string;
    '@_errors'?: string;
    '@_time'?: string;
  };
}

interface JunitTestSuite {
  testcase?: JunitTestCase | JunitTestCase[];
  '@_name'?: string;
  '@_tests'?: string;
  '@_failures'?: string;
  '@_time'?: string;
}

interface JunitTestCase {
  failure?: JunitFailure | string;
  skipped?: unknown;
  '@_name'?: string;
  '@_classname'?: string;
  '@_time'?: string;
}

interface JunitFailure {
  '#text'?: string;
  '@_message'?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function parseTime(time: string | undefined): number {
  if (!time) return 0;
  const parsed = parseFloat(time);
  return isNaN(parsed) ? 0 : Math.round(parsed * 1000); // seconds -> ms
}

function extractFailureMessage(
  failure: JunitFailure | string | undefined,
): string | null {
  if (failure == null) return null;
  if (typeof failure === 'string') return failure || null;
  // Object form: { '#text': 'full error', '@_message': 'short msg' }
  return failure['@_message'] || failure['#text'] || null;
}

function extractFailureFullText(
  failure: JunitFailure | string | undefined,
): string | null {
  if (failure == null) return null;
  if (typeof failure === 'string') return failure || null;
  return failure['#text'] || failure['@_message'] || null;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a JUnit XML string into a ParsedReport.
 */
export function parseJunitReport(xml: string): ParsedReport {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => name === 'testsuite' || name === 'testcase',
  });

  const parsed = parser.parse(xml) as JunitTestSuites;
  const testsuites = parsed.testsuites;

  if (!testsuites) {
    return {
      modules: {},
      failures: [],
      passedTests: [],
      allResults: [],
      stats: {},
    };
  }

  const suites = toArray(testsuites.testsuite);

  const modules: Record<string, ModuleStats> = {};
  const failures: FailureEntry[] = [];
  const passedTests: Array<{ module: string; testTitle: string }> = [];
  const allResults: TestResult[] = [];
  let totalDuration = 0;

  for (const suite of suites) {
    const moduleName = suite['@_name'] || 'unknown';
    const suiteDuration = parseTime(suite['@_time']);
    totalDuration += suiteDuration;

    if (!modules[moduleName]) {
      modules[moduleName] = {
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        total: 0,
        duration: 0,
      };
    }

    const moduleStats = modules[moduleName]!;
    const testcases = toArray(suite.testcase);

    for (const tc of testcases) {
      moduleStats.total++;
      const testTitle = tc['@_name'] || 'unnamed';
      const classname = tc['@_classname'] || '';
      const duration = parseTime(tc['@_time']);
      moduleStats.duration += duration;

      const hasFailed = tc.failure != null;
      const hasSkipped = tc.skipped != null;

      let status: TestResult['status'];
      let errorMessage: string | null = null;

      if (hasFailed) {
        status = 'failed';
        errorMessage = extractFailureMessage(tc.failure as JunitFailure | string);
        moduleStats.failed++;
        failures.push({
          module: moduleName,
          file: classname,
          testTitle,
          errorMessage,
          duration,
          isFlaky: false,
        });
      } else if (hasSkipped) {
        status = 'skipped';
        moduleStats.skipped++;
      } else {
        status = 'passed';
        moduleStats.passed++;
        passedTests.push({ module: moduleName, testTitle });
      }

      allResults.push({
        module: moduleName,
        file: classname,
        testTitle,
        status,
        duration,
        errorMessage,
        isFlaky: false,
      });
    }
  }

  // Compute overall duration from suites-level attribute or sum of suite times
  const overallTime = parseTime(testsuites['@_time']);
  const statsDuration = overallTime > 0 ? overallTime : totalDuration;

  return {
    modules,
    failures,
    passedTests,
    allResults,
    stats: { duration: statsDuration },
  };
}
