import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/thresholds
 *
 * Alert threshold configuration.
 */
export async function handleThresholds(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  const rows = await db.query(
    'SELECT * FROM qa_alert_thresholds ORDER BY id',
  );
  jsonSuccess(res, rows);
}
