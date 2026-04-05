/**
 * Root cause detection and categorization.
 * Canonical implementation ported from SIMS detectRootCause().
 * The collector package also has a copy — this is the authoritative version.
 */

import type { Database, RootCause } from '@qastack/core';

/**
 * Detect the root cause category from an error message.
 * Order matters: most specific patterns first.
 */
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

/**
 * Categorize root causes for all failures in a run and update the DB.
 * Returns a count map of each root cause category.
 */
export async function categorizeRootCauses(
  db: Database,
  runId: number,
  failures: Array<{
    module: string;
    testTitle: string;
    errorMessage: string | null;
    isFlaky: boolean;
  }>,
): Promise<Record<RootCause, number>> {
  const counts: Record<string, number> = {};

  for (const f of failures) {
    const cause = detectRootCause(f.errorMessage, f.isFlaky);
    counts[cause] = (counts[cause] || 0) + 1;

    await db.execute(
      'UPDATE qa_test_failures SET root_cause = ? WHERE run_id = ? AND module = ? AND test_title = ?',
      [cause, runId, f.module, f.testTitle],
    );
  }

  return counts as Record<RootCause, number>;
}
