import type { Route } from '@qastack/core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parse a single route definition line.
 * Matches patterns like:
 *   Route::get('/users', [UserController::class, 'index'])->name('users.index');
 *   Route::get('/', function () { ... })->name('home');
 */
const ROUTE_REGEX =
  /Route::(\w+)\(\s*['"]([^'"]+)['"]\s*,\s*(?:\[([A-Za-z\\]+)::class\s*,\s*'(\w+)'\]|function\s*\()/g;

/**
 * Extract ->name('...') from a route line.
 */
const NAME_REGEX = /->name\(\s*['"]([^'"]+)['"]\s*\)/;

/**
 * Match Route::resource('path', Controller::class) lines.
 */
const RESOURCE_REGEX =
  /Route::resource\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z\\]+)::class\s*\)/g;

/**
 * Match group definitions: Route::prefix('admin')->group(...)
 * or Route::middleware([...])->prefix('admin')->group(...)
 * or Route::middleware([...])->group(...)
 */
const GROUP_START_REGEX =
  /Route::(?:middleware\(\s*\[([^\]]*)\]\s*\)\s*->\s*)?(?:prefix\(\s*['"]([^'"]+)['"]\s*\)\s*->\s*)?(?:middleware\(\s*\[([^\]]*)\]\s*\)\s*->\s*)?group\s*\(/;

/**
 * Expand a resource route into 5 CRUD routes.
 */
function expandResource(
  resourcePath: string,
  controllerClass: string,
  prefix: string,
  middleware: string[],
): Route[] {
  const baseName = resourcePath.replace(/\//g, '.');
  const singular = resourcePath.endsWith('s')
    ? resourcePath.slice(0, -1)
    : resourcePath;
  const fullPath = prefix ? `/${prefix}/${resourcePath}` : `/${resourcePath}`;

  return [
    {
      method: 'GET',
      path: fullPath,
      name: `${baseName}.index`,
      controller: `${controllerClass}@index`,
      middleware: middleware.length > 0 ? middleware : undefined,
    },
    {
      method: 'GET',
      path: `${fullPath}/{${singular}}`,
      name: `${baseName}.show`,
      controller: `${controllerClass}@show`,
      middleware: middleware.length > 0 ? middleware : undefined,
    },
    {
      method: 'POST',
      path: fullPath,
      name: `${baseName}.store`,
      controller: `${controllerClass}@store`,
      middleware: middleware.length > 0 ? middleware : undefined,
    },
    {
      method: 'PUT',
      path: `${fullPath}/{${singular}}`,
      name: `${baseName}.update`,
      controller: `${controllerClass}@update`,
      middleware: middleware.length > 0 ? middleware : undefined,
    },
    {
      method: 'DELETE',
      path: `${fullPath}/{${singular}}`,
      name: `${baseName}.destroy`,
      controller: `${controllerClass}@destroy`,
      middleware: middleware.length > 0 ? middleware : undefined,
    },
  ];
}

/**
 * Extract the short class name from a possibly-namespaced controller reference.
 * e.g. "App\\Http\\Controllers\\UserController" -> "UserController"
 */
function shortClassName(fqcn: string): string {
  const parts = fqcn.split('\\');
  return parts[parts.length - 1] ?? fqcn;
}

/**
 * Parse a PHP route file and return discovered routes.
 * Handles basic routes, resource routes, and group prefixes (one level deep).
 */
export function parseRouteFile(content: string): Route[] {
  const routes: Route[] = [];
  const lines = content.split('\n');

  // Track group context (prefix + middleware) using brace counting
  interface GroupContext {
    prefix: string;
    middleware: string[];
  }
  const groupStack: GroupContext[] = [];
  let braceDepth = 0;
  const groupBraceStarts: number[] = [];

  for (const line of lines) {
    // Check for group start
    const groupMatch = GROUP_START_REGEX.exec(line);
    if (groupMatch) {
      const mw1 = groupMatch[1]?.trim();
      const prefix = groupMatch[2]?.trim() ?? '';
      const mw2 = groupMatch[3]?.trim();

      const middlewareStr = mw1 ?? mw2 ?? '';
      const middleware = middlewareStr
        ? middlewareStr
            .split(',')
            .map((m) => m.trim().replace(/['"]/g, ''))
            .filter(Boolean)
        : [];

      // Combine with parent context
      const parentCtx = groupStack[groupStack.length - 1];
      const fullPrefix = parentCtx?.prefix
        ? prefix
          ? `${parentCtx.prefix}/${prefix}`
          : parentCtx.prefix
        : prefix;
      const fullMiddleware = [
        ...(parentCtx?.middleware ?? []),
        ...middleware,
      ];

      groupStack.push({ prefix: fullPrefix, middleware: fullMiddleware });
      // Count braces on this line to find the group opening
      const openBraces = (line.match(/{/g) ?? []).length;
      const closeBraces = (line.match(/}/g) ?? []).length;
      braceDepth += openBraces - closeBraces;
      groupBraceStarts.push(braceDepth);
      continue;
    }

    // Count braces for group tracking
    const openBraces = (line.match(/{/g) ?? []).length;
    const closeBraces = (line.match(/}/g) ?? []).length;
    braceDepth += openBraces - closeBraces;

    // Check if we're closing a group
    while (
      groupBraceStarts.length > 0 &&
      braceDepth <
        (groupBraceStarts[groupBraceStarts.length - 1] ?? Infinity)
    ) {
      groupBraceStarts.pop();
      groupStack.pop();
    }

    const currentCtx = groupStack[groupStack.length - 1];
    const currentPrefix = currentCtx?.prefix ?? '';
    const currentMiddleware = currentCtx?.middleware ?? [];

    // Check for resource routes
    RESOURCE_REGEX.lastIndex = 0;
    const resourceMatch = RESOURCE_REGEX.exec(line);
    if (resourceMatch) {
      const resourcePath = resourceMatch[1] ?? '';
      const controllerFqcn = resourceMatch[2] ?? '';
      const controllerName = shortClassName(controllerFqcn);
      routes.push(
        ...expandResource(
          resourcePath,
          controllerName,
          currentPrefix,
          currentMiddleware,
        ),
      );
      continue;
    }

    // Check for basic routes
    ROUTE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROUTE_REGEX.exec(line)) !== null) {
      const method = (match[1] ?? 'GET').toUpperCase();
      const path = match[2] ?? '/';
      const controllerFqcn = match[3];
      const controllerMethod = match[4];

      const nameMatch = NAME_REGEX.exec(line);
      const name = nameMatch?.[1];

      const fullPath = currentPrefix
        ? `/${currentPrefix}${path.startsWith('/') ? path : `/${path}`}`
        : path.startsWith('/')
          ? path
          : `/${path}`;

      const route: Route = {
        method,
        path: fullPath,
      };

      if (name) route.name = name;
      if (controllerFqcn && controllerMethod) {
        route.controller = `${shortClassName(controllerFqcn)}@${controllerMethod}`;
      }
      if (currentMiddleware.length > 0) {
        route.middleware = [...currentMiddleware];
      }

      routes.push(route);
    }
  }

  return routes;
}

/**
 * Scan a Laravel project for route definitions.
 * Reads routes/web.php and routes/api.php.
 */
export function scanRoutes(projectRoot: string): Route[] {
  const routes: Route[] = [];

  const webPath = join(projectRoot, 'routes', 'web.php');
  const apiPath = join(projectRoot, 'routes', 'api.php');

  if (existsSync(webPath)) {
    const content = readFileSync(webPath, 'utf-8');
    routes.push(...parseRouteFile(content));
  }

  if (existsSync(apiPath)) {
    const content = readFileSync(apiPath, 'utf-8');
    // API routes typically have an /api prefix
    const apiRoutes = parseRouteFile(content).map((r) => ({
      ...r,
      path: r.path.startsWith('/api') ? r.path : `/api${r.path}`,
    }));
    routes.push(...apiRoutes);
  }

  return routes;
}
