import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/regressions
 *
 * Active regressions with commit hashes, per-module count, and total.
 */
export async function handleRegressions(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  // Active regressions with commit hashes from the linked runs
  const active = await db.query(
    `SELECT r.id, r.test_signature, r.module, r.test_title,
            r.previous_pass_run_id, r.regression_run_id, r.is_active,
            qr1.commit_hash AS pass_commit, qr2.commit_hash AS fail_commit
     FROM qa_regressions r
     JOIN qa_runs qr1 ON r.previous_pass_run_id = qr1.id
     JOIN qa_runs qr2 ON r.regression_run_id = qr2.id
     WHERE r.is_active = 1
     ORDER BY r.id DESC`,
  );

  // Count of regressions per module
  const perModule = await db.query(
    `SELECT module, COUNT(*) AS count
     FROM qa_regressions
     WHERE is_active = 1
     GROUP BY module
     ORDER BY count DESC`,
  );

  // Total active regression count
  const totalRows = await db.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM qa_regressions WHERE is_active = 1`,
  );
  const total = totalRows[0]?.total ?? 0;

  jsonSuccess(res, { active, per_module: perModule, total });
}
