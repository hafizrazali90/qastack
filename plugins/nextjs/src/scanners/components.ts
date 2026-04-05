import type { Component } from '@qastack/core';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

/**
 * File extensions that are React component files.
 */
const COMPONENT_EXTENSIONS = new Set(['.tsx', '.jsx']);

/**
 * Page file names in the App Router.
 */
const PAGE_FILES = new Set(['page.tsx', 'page.jsx', 'page.ts', 'page.js']);

/**
 * Layout file names in the App Router.
 */
const LAYOUT_FILES = new Set([
  'layout.tsx',
  'layout.jsx',
  'layout.ts',
  'layout.js',
]);

/**
 * Files to skip entirely — not components.
 */
const SKIP_FILES = new Set([
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
  'route.tsx',
  'route.jsx',
  'route.ts',
  'route.js',
]);

/**
 * Derive a human-readable component name from a file path relative to the project root.
 *
 * For pages: uses the directory path to form the name, e.g., "users/[id]/page.tsx" -> "UsersIdPage"
 * For layouts: similar, e.g., "app/layout.tsx" -> "RootLayout"
 * For components: uses the file name, e.g., "Button.tsx" -> "Button"
 */
function deriveComponentName(
  filePath: string,
  type: Component['type'],
): string {
  const base = basename(filePath, extname(filePath));

  if (type === 'component') {
    return base;
  }

  // For pages and layouts, use directory segments
  const dir = filePath.replace(/[/\\][^/\\]+$/, '');
  const segments = dir
    .split(/[/\\]/)
    .filter(Boolean)
    // Remove app/ prefix
    .filter((s) => s !== 'app' && s !== 'src');

  if (segments.length === 0) {
    return type === 'page' ? 'RootPage' : 'RootLayout';
  }

  const nameFromSegments = segments
    .map((seg) => {
      // Strip route groups: (auth) -> ""
      if (seg.startsWith('(') && seg.endsWith(')')) return '';
      // Strip dynamic brackets: [id] -> Id
      if (seg.startsWith('[') && seg.endsWith(']')) {
        const inner = seg.slice(1, -1).replace('...', '');
        return inner.charAt(0).toUpperCase() + inner.slice(1);
      }
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .filter(Boolean)
    .join('');

  const suffix = type === 'page' ? 'Page' : 'Layout';
  return (nameFromSegments || 'Root') + suffix;
}

/**
 * Recursively walk the app/ directory to find pages and layouts.
 */
function walkAppForComponents(
  dir: string,
  appRoot: string,
  projectRoot: string,
  components: Component[],
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
      walkAppForComponents(fullPath, appRoot, projectRoot, components);
      continue;
    }

    if (!stat.isFile()) continue;
    const fileName = basename(fullPath);
    if (SKIP_FILES.has(fileName)) continue;

    const relPath = relative(projectRoot, fullPath).replace(/\\/g, '/');

    if (PAGE_FILES.has(fileName)) {
      components.push({
        name: deriveComponentName(relative(projectRoot, fullPath), 'page'),
        filePath: relPath,
        type: 'page',
      });
    } else if (LAYOUT_FILES.has(fileName)) {
      components.push({
        name: deriveComponentName(relative(projectRoot, fullPath), 'layout'),
        filePath: relPath,
        type: 'layout',
      });
    }
  }
}

/**
 * Recursively walk a components directory to find component files.
 */
function walkComponentsDir(
  dir: string,
  projectRoot: string,
  components: Component[],
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
      walkComponentsDir(fullPath, projectRoot, components);
      continue;
    }

    if (!stat.isFile()) continue;

    const ext = extname(fullPath);
    if (!COMPONENT_EXTENSIONS.has(ext)) continue;

    const relPath = relative(projectRoot, fullPath).replace(/\\/g, '/');
    const name = basename(fullPath, ext);

    components.push({
      name,
      filePath: relPath,
      type: 'component',
    });
  }
}

/**
 * Scan a Next.js project for React components.
 * Classifies them as page, layout, or component.
 */
export function scanComponents(projectRoot: string): Component[] {
  const components: Component[] = [];

  // Scan app/ directory for pages and layouts
  const appDir = join(projectRoot, 'app');
  const srcAppDir = join(projectRoot, 'src', 'app');

  if (existsSync(appDir)) {
    walkAppForComponents(appDir, appDir, projectRoot, components);
  } else if (existsSync(srcAppDir)) {
    walkAppForComponents(srcAppDir, srcAppDir, projectRoot, components);
  }

  // Scan components directories
  const componentsDirs = [
    join(projectRoot, 'components'),
    join(projectRoot, 'src', 'components'),
  ];

  for (const dir of componentsDirs) {
    if (existsSync(dir)) {
      walkComponentsDir(dir, projectRoot, components);
    }
  }

  return components;
}
