/**
 * Failure tracking and MTTR (Mean Time To Resolve) calculation.
 * Ported from SIMS processPhase2() section 2.
 *
 * Tracks the lifecycle of each failing test: first seen -> recurring -> resolved.
 * MTTR is computed from resolved failures with timestamps.
 */

import type { Database } from '@qastack/core';

export interface TrackingResult {
  newFailures: number;
  recurring: number;
  resolved: number;
}

export interface MttrStats {
  activeFailures: number;
  avgMttrHours: number | null;
  resolvedCount: number;
}

/**
 * Track failure lifecycle for a run.
 *
 * For each failure:
 *   - If already tracked and active: increment occurrences (recurring)
 *   - If new: insert a tracking record (newFailure)
 *
 * For each passed test:
 *   - If tracked and active: mark resolved with current timestamp
 */
export async function trackFailures(
  db: Database,
  runId: number,
  failures: Array<{ module: string; testTitle: string }>,
  passedTests: Array<{ module: string; testTitle: string }>,
): Promise<TrackingResult> {
  let newFailures = 0;
  let recurring = 0;
  let resolved = 0;

  // For each failure: upsert into qa_failure_tracking
  for (const f of failures) {
    const testSignature = `${f.module}::${f.testTitle}`;

    const existing = await db.query<{ id: number }>(
      'SELECT id FROM qa_failure_tracking WHERE test_signature = ? AND is_active = 1 LIMIT 1',
      [testSignature],
    );

    if (existing.length > 0) {
      await db.execute(
        'UPDATE qa_failure_tracking SET occurrences = occurrences + 1 WHERE id = ?',
        [existing[0]!.id],
      );
      recurring++;
    } else {
      await db.execute(
        `INSERT INTO qa_failure_tracking
           (test_signature, module, test_title, first_seen_run_id, occurrences, is_active)
         VALUES (?, ?, ?, ?, 1, 1)`,
        [testSignature, f.module, f.testTitle, runId],
      );
      newFailures++;
    }
  }

  // Resolve tracking records for passed tests
  for (const p of passedTests) {
    const testSignature = `${p.module}::${p.testTitle}`;

    const result = await db.execute(
      `UPDATE qa_failure_tracking
       SET is_active = 0, resolved_run_id = ?, resolved_at = datetime('now')
       WHERE test_signature = ? AND is_active = 1`,
      [runId, testSignature],
    );
    resolved += result.affectedRows;
  }

  return { newFailures, recurring, resolved };
}

/**
 * Get aggregate MTTR statistics across all tracked failures.
 */
export async function getMttrStats(db: Database): Promise<MttrStats> {
  const activeRows = await db.query<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM qa_failure_tracking WHERE is_active = 1',
  );
  const activeFailures = activeRows[0]?.cnt ?? 0;

  const resolvedRows = await db.query<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM qa_failure_tracking WHERE is_active = 0 AND resolved_at IS NOT NULL',
  );
  const resolvedCount = resolvedRows[0]?.cnt ?? 0;

  const avgRows = await db.query<{ avg: number | null }>(
    `SELECT AVG((julianday(resolved_at) - julianday(first_seen_at)) * 24) as avg
     FROM qa_failure_tracking WHERE is_active = 0 AND resolved_at IS NOT NULL`,
  );
  const avg = avgRows[0]?.avg ?? null;

  return {
    activeFailures,
    avgMttrHours: avg ? Math.round(avg * 10) / 10 : null,
    resolvedCount,
  };
}
