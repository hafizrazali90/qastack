import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/overview
 *
 * Returns latest run, trend (last 20), module summary, release readiness,
 * active regressions, failure tracking, avg MTTR, and root cause summary.
 */
export async function handleOverview(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  // Latest run
  const latestRows = await db.query<{
    id: number;
    commit_hash: string;
    branch: string;
    health_pct: number;
    passed: number;
    failed: number;
    skipped: number;
    created_at: string;
  }>(
    `SELECT id, commit_hash, branch, health_pct, passed, failed, skipped, created_at
     FROM qa_runs ORDER BY id DESC LIMIT 1`,
  );
  const latest = latestRows[0] ?? null;

  // Trend: last 20 runs
  const trend = await db.query(
    `SELECT id, health_pct, passed, failed, created_at, commit_hash
     FROM qa_runs ORDER BY id DESC LIMIT 20`,
  );

  // Module summary from latest run
  let modules: Record<string, unknown>[] = [];
  if (latest) {
    modules = await db.query(
      `SELECT module, passed, failed, skipped, health_pct
       FROM qa_module_results
       WHERE run_id = ?
       ORDER BY failed DESC`,
      [latest.id],
    );
  }

  // Release readiness
  let readiness = 'NOT_READY';
  if (latest) {
    if (latest.health_pct >= 95) readiness = 'READY';
    else if (latest.health_pct >= 80) readiness = 'CONDITIONAL';
  }

  // Active regressions count
  const regRows = await db.query<{ active_regressions: number }>(
    `SELECT COUNT(*) AS active_regressions FROM qa_regressions WHERE is_active = 1`,
  );
  const active_regressions = regRows[0]?.active_regressions ?? 0;

  // Active failure tracking count
  const ftRows = await db.query<{ active_failures_tracking: number }>(
    `SELECT COUNT(*) AS active_failures_tracking FROM qa_failure_tracking WHERE is_active = 1`,
  );
  const active_failures_tracking = ftRows[0]?.active_failures_tracking ?? 0;

  // Average MTTR hours (SQLite-compatible: julianday math)
  const mttrRows = await db.query<{ avg_mttr_hours: number | null }>(
    `SELECT AVG((julianday(resolved_at) - julianday(first_seen_at)) * 24) AS avg_mttr_hours
     FROM qa_failure_tracking
     WHERE is_active = 0 AND resolved_at IS NOT NULL`,
  );
  const rawMttr = mttrRows[0]?.avg_mttr_hours;
  const avg_mttr_hours =
    rawMttr != null ? Math.round(rawMttr * 10) / 10 : null;

  // Root cause summary from latest run
  let root_cause_summary: Record<string, unknown>[] = [];
  if (latest) {
    root_cause_summary = await db.query(
      `SELECT root_cause, COUNT(*) AS count
       FROM qa_test_failures
       WHERE run_id = ?
       GROUP BY root_cause
       ORDER BY count DESC`,
      [latest.id],
    );
  }

  jsonSuccess(res, {
    latest,
    trend,
    modules,
    readiness,
    active_regressions,
    active_failures_tracking,
    avg_mttr_hours,
    root_cause_summary,
  });
}
