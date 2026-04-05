import http from 'node:http';
import { URL } from 'node:url';
import type { Database } from '@qastack/core';
import { jsonError } from './helpers.js';
import { handleOverview } from './routes/overview.js';
import { handleRuns, handleRunDetail } from './routes/runs.js';
import { handleModules } from './routes/modules.js';
import { handleTests } from './routes/tests.js';
import { handleFlaky } from './routes/flaky.js';
import { handleRootCauses } from './routes/root-causes.js';
import { handleMttr } from './routes/mttr.js';
import { handleRegressions } from './routes/regressions.js';
import { handleThresholds } from './routes/thresholds.js';

export interface ApiServerOptions {
  db: Database;
  port: number;
  auth?: { user: string; pass: string };
}

export interface ApiServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly port: number;
}

/**
 * Create a lightweight HTTP API server backed by the qastack Database adapter.
 *
 * When `port` is 0, the OS assigns a random available port.
 * After `start()` resolves, `server.port` reflects the actual bound port.
 */
export function createApiServer(options: ApiServerOptions): ApiServer {
  const { db, auth } = options;

  // Simple token auth (same as SIMS)
  const _authToken = auth
    ? Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')
    : null;

  // Mutable so we can update after listen when port=0
  let actualPort = options.port;

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers on every response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${actualPort}`);
    const path = url.pathname;

    try {
      // Auth check (optional)
      if (_authToken && path !== '/api/login') {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Basic ${_authToken}`) {
          jsonError(res, 401, 'Unauthorized');
          return;
        }
      }

      // Route matching — order matters (specific before general)
      if (path === '/api/overview') {
        await handleOverview(db, res);
        return;
      }

      // /api/runs/:id must be checked before /api/runs
      if (/^\/api\/runs\/\d+$/.test(path)) {
        await handleRunDetail(db, res, path);
        return;
      }

      if (path === '/api/runs') {
        await handleRuns(db, res, url);
        return;
      }

      if (path === '/api/modules') {
        await handleModules(db, res);
        return;
      }

      if (path === '/api/tests') {
        await handleTests(db, res, url);
        return;
      }

      if (path === '/api/flaky') {
        await handleFlaky(db, res);
        return;
      }

      if (path === '/api/root-causes') {
        await handleRootCauses(db, res);
        return;
      }

      if (path === '/api/mttr') {
        await handleMttr(db, res);
        return;
      }

      if (path === '/api/regressions') {
        await handleRegressions(db, res);
        return;
      }

      if (path === '/api/thresholds') {
        await handleThresholds(db, res);
        return;
      }

      // 404
      jsonError(res, 404, 'Not found');
    } catch (_err) {
      jsonError(res, 500, 'Internal server error');
    }
  });

  return {
    async start(): Promise<void> {
      return new Promise((resolve) => {
        httpServer.listen(options.port, () => {
          const addr = httpServer.address();
          if (addr && typeof addr === 'object') {
            actualPort = addr.port;
          }
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
    },

    get port(): number {
      return actualPort;
    },
  };
}
