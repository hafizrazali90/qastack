import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess, jsonError } from '../helpers.js';

/**
 * GET /api/runs?page=1&limit=20
 *
 * Paginated run history.
 */
export async function handleRuns(
  db: Database,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const page = Math.max(
    1,
    parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
  );
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20),
  );
  const offset = (page - 1) * limit;

  const rows = await db.query(
    `SELECT id, commit_hash, branch, trigger_type, created_at, duration_ms,
            total_tests, passed, failed, skipped, flaky, health_pct
     FROM qa_runs ORDER BY id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );

  const cntRows = await db.query<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM qa_runs',
  );
  const total = cntRows[0]?.cnt ?? 0;

  jsonSuccess(res, {
    runs: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * GET /api/runs/:id
 *
 * Single run detail with module results and test failures.
 */
export async function handleRunDetail(
  db: Database,
  res: ServerResponse,
  path: string,
): Promise<void> {
  const match = path.match(/^\/api\/runs\/(\d+)$/);
  if (!match?.[1]) {
    jsonError(res, 404, 'Run not found');
    return;
  }
  const runId = parseInt(match[1], 10);

  const runRows = await db.query(
    `SELECT id, commit_hash, branch, trigger_type, created_at, duration_ms,
            total_tests, passed, failed, skipped, flaky, health_pct
     FROM qa_runs WHERE id = ?`,
    [runId],
  );

  if (runRows.length === 0) {
    jsonError(res, 404, 'Run not found');
    return;
  }

  const run = runRows[0];

  const modules = await db.query(
    `SELECT module, passed, failed, skipped, flaky, health_pct
     FROM qa_module_results WHERE run_id = ? ORDER BY failed DESC`,
    [runId],
  );

  const failures = await db.query(
    `SELECT module, test_title, file_path, error_message, is_flaky
     FROM qa_test_failures WHERE run_id = ? ORDER BY module, test_title`,
    [runId],
  );

  jsonSuccess(res, { run, modules, failures });
}
