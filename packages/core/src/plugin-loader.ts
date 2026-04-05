import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { QastackPlugin } from './types.js';

/**
 * Attempt to dynamically import a module from a resolved path.
 * Returns the default export (the plugin object).
 */
async function tryImport(modulePath: string): Promise<QastackPlugin | null> {
  try {
    // Convert Windows paths to file:// URLs for dynamic import
    const importPath = modulePath.startsWith('file://')
      ? modulePath
      : `file:///${modulePath.replace(/\\/g, '/')}`;
    const mod = (await import(importPath)) as
      | { default: QastackPlugin }
      | QastackPlugin;
    return 'default' in mod
      ? (mod.default as QastackPlugin)
      : (mod as QastackPlugin);
  } catch {
    return null;
  }
}

/**
 * Load a qastack plugin by name.
 *
 * Resolution order:
 * 1. Local plugins/ directory (monorepo built-in plugins)
 * 2. node_modules/@qastack/plugin-{name}
 * 3. node_modules/qastack-plugin-{name} (community plugins)
 * 4. Throw if not found
 */
export async function loadPlugin(
  name: string,
  projectRoot: string,
): Promise<QastackPlugin> {
  // 1. Try monorepo plugins/ directory (two levels up from packages/core/src)
  const monorepoPluginPath = resolve(
    projectRoot,
    'plugins',
    name,
    'dist',
    'index.js',
  );
  if (existsSync(monorepoPluginPath)) {
    const plugin = await tryImport(monorepoPluginPath);
    if (plugin) return plugin;
  }

  // 2. Try @qastack/plugin-{name} in node_modules
  const scopedPath = resolve(
    projectRoot,
    'node_modules',
    '@qastack',
    `plugin-${name}`,
    'dist',
    'index.js',
  );
  if (existsSync(scopedPath)) {
    const plugin = await tryImport(scopedPath);
    if (plugin) return plugin;
  }

  // 3. Try qastack-plugin-{name} (community) in node_modules
  const communityPath = resolve(
    projectRoot,
    'node_modules',
    `qastack-plugin-${name}`,
    'dist',
    'index.js',
  );
  if (existsSync(communityPath)) {
    const plugin = await tryImport(communityPath);
    if (plugin) return plugin;
  }

  throw new Error(
    `Plugin "${name}" not found. Searched:\n` +
      `  - ${monorepoPluginPath}\n` +
      `  - ${scopedPath}\n` +
      `  - ${communityPath}`,
  );
}

/**
 * Detect the framework used in a project by checking for common indicators.
 *
 * Resolution order:
 * 1. composer.json with laravel/framework -> 'laravel'
 * 2. package.json with 'next' -> 'nextjs'
 * 3. package.json with 'express' -> 'express'
 * 4. manage.py -> 'django'
 * 5. Gemfile with 'rails' -> 'rails'
 * 6. fallback -> 'generic'
 */
export async function detectFramework(projectRoot: string): Promise<string> {
  // 1. Check composer.json for Laravel
  const composerPath = resolve(projectRoot, 'composer.json');
  if (existsSync(composerPath)) {
    try {
      const composer = JSON.parse(
        readFileSync(composerPath, 'utf-8'),
      ) as Record<string, unknown>;
      const require = composer['require'] as Record<string, string> | undefined;
      if (require && 'laravel/framework' in require) {
        return 'laravel';
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  // 2-3. Check package.json for Next.js or Express
  const pkgPath = resolve(projectRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const deps = {
        ...(pkg['dependencies'] as Record<string, string> | undefined),
        ...(pkg['devDependencies'] as Record<string, string> | undefined),
      };

      if ('next' in deps) return 'nextjs';
      if ('express' in deps) return 'express';
    } catch {
      // Malformed JSON — skip
    }
  }

  // 4. Check for manage.py (Django)
  const managePyPath = resolve(projectRoot, 'manage.py');
  if (existsSync(managePyPath)) {
    return 'django';
  }

  // 5. Check Gemfile for Rails
  const gemfilePath = resolve(projectRoot, 'Gemfile');
  if (existsSync(gemfilePath)) {
    try {
      const gemfile = readFileSync(gemfilePath, 'utf-8');
      if (gemfile.includes('rails')) {
        return 'rails';
      }
    } catch {
      // Unreadable — skip
    }
  }

  // 6. Fallback
  return 'generic';
}

/**
 * Detect the framework for a project and load the corresponding plugin.
 * An explicit framework override skips detection.
 */
export async function loadPluginForProject(
  projectRoot: string,
  frameworkOverride?: string,
): Promise<QastackPlugin> {
  const framework = frameworkOverride ?? (await detectFramework(projectRoot));
  return loadPlugin(framework, projectRoot);
}
