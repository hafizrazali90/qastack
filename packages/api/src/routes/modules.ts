import type { Database } from '@qastack/core';
import type { ServerResponse } from 'node:http';
import { jsonSuccess } from '../helpers.js';

/**
 * GET /api/modules
 *
 * Module averages across last 10 runs, with trend (last 5 vs previous 5).
 */
export async function handleModules(
  db: Database,
  res: ServerResponse,
): Promise<void> {
  // Get the last 10 run IDs
  const runIdRows = await db.query<{ id: number }>(
    'SELECT id FROM qa_runs ORDER BY id DESC LIMIT 10',
  );

  if (runIdRows.length === 0) {
    jsonSuccess(res, []);
    return;
  }

  const runIds = runIdRows.map((r) => r.id);
  const placeholders = runIds.map(() => '?').join(',');

  // Module averages across those runs
  const moduleRows = await db.query<{
    module: string;
    avg_health: number;
    total_failures: number;
    run_count: number;
  }>(
    `SELECT module,
            ROUND(AVG(health_pct), 1) AS avg_health,
            SUM(failed) AS total_failures,
            COUNT(*) AS run_count
     FROM qa_module_results
     WHERE run_id IN (${placeholders})
     GROUP BY module
     ORDER BY total_failures DESC`,
    runIds,
  );

  // For trend: compare last 5 vs previous 5 runs
  const recentIds = runIds.slice(0, Math.min(5, runIds.length));
  const olderIds = runIds.slice(5);

  const trendMap: Record<string, string> = {};
  if (olderIds.length > 0) {
    const recentPlaceholders = recentIds.map(() => '?').join(',');
    const olderPlaceholders = olderIds.map(() => '?').join(',');

    const recentAvg = await db.query<{ module: string; avg_health: number }>(
      `SELECT module, AVG(health_pct) AS avg_health
       FROM qa_module_results WHERE run_id IN (${recentPlaceholders}) GROUP BY module`,
      recentIds,
    );

    const olderAvg = await db.query<{ module: string; avg_health: number }>(
      `SELECT module, AVG(health_pct) AS avg_health
       FROM qa_module_results WHERE run_id IN (${olderPlaceholders}) GROUP BY module`,
      olderIds,
    );

    const olderMap: Record<string, number> = {};
    for (const row of olderAvg) {
      olderMap[row.module] = row.avg_health;
    }
    for (const row of recentAvg) {
      const older = olderMap[row.module];
      if (older != null) {
        const diff = row.avg_health - older;
        if (diff > 3) trendMap[row.module] = 'improving';
        else if (diff < -3) trendMap[row.module] = 'degrading';
        else trendMap[row.module] = 'stable';
      } else {
        trendMap[row.module] = 'stable';
      }
    }
  }

  const modules = moduleRows.map((row) => ({
    module: row.module,
    avg_health: row.avg_health,
    total_failures: row.total_failures,
    run_count: row.run_count,
    trend: trendMap[row.module] ?? 'stable',
  }));

  jsonSuccess(res, modules);
}
