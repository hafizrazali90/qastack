/**
 * `qastack dashboard` — launch QA monitoring dashboard.
 *
 * Starts the API server and serves the dashboard HTML on the same port.
 * GET / serves the dashboard, /api/* routes are handled by the API server.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import chalk from 'chalk';
import ora from 'ora';
import { createApiServer } from '@qastack/api';
import { getConfig, getDb, success, info, withErrorHandler } from '../helpers.js';

interface DashboardOpts {
  port: string;
}

export async function dashboardCommand(
  opts: DashboardOpts,
): Promise<void> {
  await withErrorHandler(async () => {
    const config = getConfig();
    const port = parseInt(opts.port, 10) || config.dashboard.port;

    console.log(
      chalk.bold('\n  qastack dashboard\n') +
        chalk.dim('  Launching QA monitoring dashboard...\n'),
    );

    // 1. Create DB connection
    const spinner = ora('Connecting to database...').start();
    const db = await getDb(config);
    spinner.succeed('Database connected');

    // 2. Load dashboard HTML
    let dashboardHtml: string;
    try {
      const require = createRequire(import.meta.url);
      const dashboardPath = require.resolve(
        '@qastack/dashboard/index.html',
      );
      dashboardHtml = readFileSync(dashboardPath, 'utf-8');
    } catch {
      // Fallback: minimal HTML that points to the API
      dashboardHtml = `<!DOCTYPE html>
<html><head><title>qastack dashboard</title></head>
<body>
  <h1>qastack dashboard</h1>
  <p>Dashboard HTML not found. API is running at <a href="/api/overview">/api/overview</a></p>
</body></html>`;
    }

    // 3. Start API server on an internal port
    const apiServer = createApiServer({
      db,
      port: 0, // OS-assigned port
      auth: config.dashboard.auth,
    });
    await apiServer.start();
    const apiPort = apiServer.port;

    // 4. Create front server that serves HTML at / and proxies /api/* to API
    const frontServer = http.createServer(async (req, res) => {
      const url = req.url ?? '/';

      // Serve dashboard HTML at root
      if (url === '/' || url === '/index.html') {
        // Inject API base URL so the dashboard JS can find it
        const html = dashboardHtml.replace(
          /API_BASE\s*=\s*['"][^'"]*['"]/g,
          `API_BASE = 'http://localhost:${port}'`,
        );
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // Proxy /api/* requests to the API server
      if (url.startsWith('/api/')) {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: apiPort,
            path: url,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'API server unavailable' }));
        });

        req.pipe(proxyReq);
        return;
      }

      // 404 for anything else
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => {
      frontServer.listen(port, () => resolve());
    });

    success(`Dashboard running at ${chalk.bold(`http://localhost:${port}`)}`);
    info(`API proxied from internal port ${apiPort}`);

    if (config.dashboard.auth) {
      info(
        `Auth: ${chalk.dim(config.dashboard.auth.user)}:${chalk.dim(config.dashboard.auth.pass)}`,
      );
    }

    console.log(chalk.dim('\n  Press Ctrl+C to stop\n'));

    // Keep running until Ctrl+C
    const shutdown = async (): Promise<void> => {
      console.log(chalk.dim('\n  Shutting down...'));
      frontServer.close();
      await apiServer.stop();
      await db.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
  });
}
