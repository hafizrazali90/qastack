import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/mttr
 *
 * Mean time to resolution: active failures, recently resolved, and average MTTR hours.
 * Uses julianday() math for SQLite compatibility (no TIMESTAMPDIFF).
 */
export async function handleMttr(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  // Active failures
  const active = await db.query(
    `SELECT * FROM qa_failure_tracking
     WHERE is_active = 1
     ORDER BY first_seen_at ASC`,
  );

  // Recently resolved (with hours to fix via julianday math)
  const resolved = await db.query(
    `SELECT *,
            CAST((julianday(resolved_at) - julianday(first_seen_at)) * 24 AS REAL) AS hours_to_fix
     FROM qa_failure_tracking
     WHERE is_active = 0
     ORDER BY resolved_at DESC
     LIMIT 20`,
  );

  // Average MTTR
  const avgRows = await db.query<{ avg_hours: number | null }>(
    `SELECT AVG((julianday(resolved_at) - julianday(first_seen_at)) * 24) AS avg_hours
     FROM qa_failure_tracking
     WHERE is_active = 0 AND resolved_at IS NOT NULL`,
  );
  const rawAvg = avgRows[0]?.avg_hours;

  jsonSuccess(res, {
    active,
    resolved,
    avg_mttr_hours: rawAvg != null ? Math.round(rawAvg * 10) / 10 : null,
  });
}
