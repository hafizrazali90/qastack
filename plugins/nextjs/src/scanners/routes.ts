import type { Route } from '@qastack/core';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

/**
 * Files that represent page routes in Next.js App Router.
 */
const PAGE_FILES = new Set([
  'page.tsx',
  'page.jsx',
  'page.ts',
  'page.js',
]);

/**
 * Files that represent API routes in Next.js App Router.
 */
const API_FILES = new Set([
  'route.tsx',
  'route.jsx',
  'route.ts',
  'route.js',
]);

/**
 * Files that are NOT routes — layouts, loading states, error boundaries, etc.
 */
const SKIP_FILES = new Set([
  'layout.tsx',
  'layout.jsx',
  'layout.ts',
  'layout.js',
  'loading.tsx',
  'loading.jsx',
  'loading.ts',
  'loading.js',
  'error.tsx',
  'error.jsx',
  'error.ts',
  'error.js',
  'not-found.tsx',
  'not-found.jsx',
  'not-found.ts',
  'not-found.js',
  'template.tsx',
  'template.jsx',
  'template.ts',
  'template.js',
  'default.tsx',
  'default.jsx',
  'default.ts',
  'default.js',
]);

/**
 * Convert a directory path relative to app/ into a URL path.
 *
 * Rules:
 * - `[param]` segments become `:param`
 * - `(group)` segments are excluded from the URL
 * - `@parallel` slots are excluded
 */
function dirPathToUrlPath(dirPath: string): string {
  if (!dirPath || dirPath === '.') return '/';

  const segments = dirPath.split(/[/\\]/).filter(Boolean);
  const urlSegments: string[] = [];

  for (const segment of segments) {
    // Skip route groups like (auth)
    if (segment.startsWith('(') && segment.endsWith(')')) {
      continue;
    }
    // Skip parallel route slots like @modal
    if (segment.startsWith('@')) {
      continue;
    }
    // Convert dynamic segments: [id] -> :id, [...slug] -> :slug*, [[...slug]] -> :slug*
    if (segment.startsWith('[[') && segment.endsWith(']]')) {
      // Optional catch-all: [[...slug]]
      const inner = segment.slice(2, -2);
      const paramName = inner.startsWith('...') ? inner.slice(3) : inner;
      urlSegments.push(`:${paramName}*`);
    } else if (segment.startsWith('[') && segment.endsWith(']')) {
      const inner = segment.slice(1, -1);
      if (inner.startsWith('...')) {
        // Catch-all: [...slug]
        urlSegments.push(`:${inner.slice(3)}*`);
      } else {
        urlSegments.push(`:${inner}`);
      }
    } else {
      urlSegments.push(segment);
    }
  }

  return '/' + urlSegments.join('/');
}

/**
 * Recursively walk the app/ directory and discover routes.
 */
function walkAppDirectory(
  dir: string,
  appRoot: string,
  routes: Route[],
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Skip parallel slots (not routes)
      if (entry.startsWith('@')) continue;
      // Skip private folders (convention: _folder)
      if (entry.startsWith('_')) continue;

      walkAppDirectory(fullPath, appRoot, routes);
      continue;
    }

    if (!stat.isFile()) continue;

    const fileName = basename(fullPath);

    // Skip non-route files
    if (SKIP_FILES.has(fileName)) continue;

    // Get the relative directory path from app root
    const relDir = relative(appRoot, dir);
    const urlPath = dirPathToUrlPath(relDir);

    if (PAGE_FILES.has(fileName)) {
      routes.push({
        method: 'GET',
        path: urlPath,
      });
    } else if (API_FILES.has(fileName)) {
      // API routes support multiple methods — we mark as API
      routes.push({
        method: 'API',
        path: urlPath,
      });
    }
  }
}

/**
 * Scan a Next.js App Router project for routes.
 * Walks the `app/` directory and derives routes from page.tsx and route.ts files.
 */
export function scanAppRoutes(projectRoot: string): Route[] {
  // Check both possible locations: app/ and src/app/
  const appDir = join(projectRoot, 'app');
  const srcAppDir = join(projectRoot, 'src', 'app');

  const routes: Route[] = [];

  if (existsSync(appDir)) {
    walkAppDirectory(appDir, appDir, routes);
  } else if (existsSync(srcAppDir)) {
    walkAppDirectory(srcAppDir, srcAppDir, routes);
  }

  return routes;
}
