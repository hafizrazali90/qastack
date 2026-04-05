import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/root-causes
 *
 * Root cause breakdown from the latest run, plus trend over last 10 runs.
 */
export async function handleRootCauses(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  // Latest run root cause breakdown
  const breakdown = await db.query(
    `SELECT root_cause, COUNT(*) AS count
     FROM qa_test_failures
     WHERE run_id = (SELECT MAX(id) FROM qa_runs)
     GROUP BY root_cause
     ORDER BY count DESC`,
  );

  // Trend: root cause counts per run for last 10 runs
  const runIdRows = await db.query<{ id: number }>(
    'SELECT id FROM qa_runs ORDER BY id DESC LIMIT 10',
  );

  let trend: Record<string, unknown>[] = [];
  if (runIdRows.length > 0) {
    const runIds = runIdRows.map((r) => r.id);
    const placeholders = runIds.map(() => '?').join(',');

    trend = await db.query(
      `SELECT f.run_id, r.created_at, f.root_cause, COUNT(*) AS count
       FROM qa_test_failures f
       JOIN qa_runs r ON r.id = f.run_id
       WHERE f.run_id IN (${placeholders})
       GROUP BY f.run_id, r.created_at, f.root_cause
       ORDER BY f.run_id ASC, count DESC`,
      runIds,
    );
  }

  jsonSuccess(res, { breakdown, trend });
}
