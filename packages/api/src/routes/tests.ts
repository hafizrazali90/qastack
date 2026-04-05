import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/tests?run=&status=&module=&search=&page=1&limit=50
 *
 * Individual test results from a run, with filtering and pagination.
 */
export async function handleTests(
  db: Database,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const runIdParam = url.searchParams.get('run');
  const status = url.searchParams.get('status');
  const module = url.searchParams.get('module');
  const search = url.searchParams.get('search');
  const page = Math.max(
    1,
    parseInt(url.searchParams.get('page') ?? '1', 10) || 1,
  );
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50),
  );
  const offset = (page - 1) * limit;

  // Determine target run
  let targetRunId: number | null = runIdParam
    ? parseInt(runIdParam, 10)
    : null;

  if (targetRunId == null) {
    const latestRows = await db.query<{ id: number }>(
      'SELECT MAX(id) AS id FROM qa_runs',
    );
    targetRunId = latestRows[0]?.id ?? null;
  }

  if (targetRunId == null) {
    jsonSuccess(res, {
      tests: [],
      modules: [],
      run_id: null,
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
    return;
  }

  const conditions: string[] = ['tr.run_id = ?'];
  const params: unknown[] = [targetRunId];

  if (status) {
    conditions.push('tr.status = ?');
    params.push(status);
  }
  if (module) {
    conditions.push('tr.module = ?');
    params.push(module);
  }
  if (search) {
    conditions.push('(tr.test_title LIKE ?)');
    params.push(`%${search}%`);
  }

  const where = conditions.join(' AND ');

  // Count
  const cntRows = await db.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM qa_test_results tr WHERE ${where}`,
    params,
  );
  const total = cntRows[0]?.total ?? 0;

  // Results -- order by status priority, then module, then title
  // SQLite doesn't have FIELD(); use CASE instead
  const tests = await db.query(
    `SELECT tr.id, tr.run_id, tr.module, tr.test_signature, tr.test_title,
            tr.file_path, tr.status, tr.duration_ms, tr.error_message, tr.root_cause
     FROM qa_test_results tr
     WHERE ${where}
     ORDER BY
       CASE tr.status
         WHEN 'failed' THEN 0
         WHEN 'flaky' THEN 1
         WHEN 'skipped' THEN 2
         WHEN 'passed' THEN 3
         ELSE 4
       END,
       tr.module, tr.test_title
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  // Distinct modules in this run (for filter dropdowns)
  const moduleList = await db.query<{ module: string }>(
    `SELECT DISTINCT module FROM qa_test_results WHERE run_id = ? ORDER BY module`,
    [targetRunId],
  );

  jsonSuccess(res, {
    tests,
    modules: moduleList.map((m) => m.module),
    run_id: targetRunId,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
