import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { QastackConfig } from './types.js';

const require = createRequire(import.meta.url);

export const defaultConfig: QastackConfig = {
  project: 'my-project',
  ai: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  db: { driver: 'sqlite', path: './qastack.db' },
  test: {
    runner: 'playwright',
    dir: 'tests/e2e',
    resultPath: 'playwright-report/results.json',
    resultFormat: 'playwright-json',
  },
  discovery: { framework: 'auto', moduleFromFile: null },
  methodology: {
    tiers: ['smoke', 'regression', 'uat'],
    rootCauseCategories: [
      'infra',
      'timeout',
      'data-issue',
      'ui-bug',
      'assertion',
      'flaky',
      'unknown',
    ],
    thresholds: {
      passRate: { warning: 80, critical: 70 },
      flakyRate: { warning: 5 },
      regressionCount: { critical: 10 },
      staleFailureRuns: { warning: 10 },
    },
  },
  dashboard: { port: 3847, auth: { user: 'admin', pass: 'qastack' } },
  plugins: [],
};

/**
 * Deep merge function that handles nested objects.
 * Arrays and primitives from source replace target values.
 * Objects are recursively merged.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }

  return result;
}

/**
 * Load qastack config from project root.
 * Looks for `qastack.config.js` in projectRoot, merges with defaults,
 * then applies any explicit overrides on top.
 */
export function loadConfig(
  projectRoot: string,
  overrides?: Partial<QastackConfig>,
): QastackConfig {
  let fileConfig: Partial<QastackConfig> = {};

  const configPath = resolve(projectRoot, 'qastack.config.js');
  if (existsSync(configPath)) {
    try {
      // Use createRequire for synchronous config loading in ESM
      const loaded = require(configPath) as
        | Partial<QastackConfig>
        | { default: Partial<QastackConfig> };
      fileConfig =
        'default' in loaded
          ? (loaded.default as Partial<QastackConfig>)
          : loaded;
    } catch {
      // If config file fails to load, proceed with defaults
    }
  }

  let config = deepMerge(
    defaultConfig as unknown as Record<string, unknown>,
    fileConfig as unknown as Record<string, unknown>,
  ) as unknown as QastackConfig;

  if (overrides) {
    config = deepMerge(
      config as unknown as Record<string, unknown>,
      overrides as unknown as Record<string, unknown>,
    ) as unknown as QastackConfig;
  }

  return config;
}
