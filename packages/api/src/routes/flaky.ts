import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/flaky
 *
 * Tests that appeared as flaky across the last 20 runs.
 */
export async function handleFlaky(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  // Get the last 20 run IDs
  const runIdRows = await db.query<{ id: number }>(
    'SELECT id FROM qa_runs ORDER BY id DESC LIMIT 20',
  );

  if (runIdRows.length === 0) {
    jsonSuccess(res, []);
    return;
  }

  const runIds = runIdRows.map((r) => r.id);
  const placeholders = runIds.map(() => '?').join(',');

  const rows = await db.query(
    `SELECT test_title, module,
            COUNT(*) AS flaky_count,
            MAX(r.created_at) AS last_seen
     FROM qa_test_failures f
     JOIN qa_runs r ON r.id = f.run_id
     WHERE f.is_flaky = 1 AND f.run_id IN (${placeholders})
     GROUP BY test_title, module
     ORDER BY flaky_count DESC`,
    runIds,
  );

  jsonSuccess(res, rows);
}
