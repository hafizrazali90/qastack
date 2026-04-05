import { describe, it, expect } from 'vitest';
import { loadConfig, defaultConfig } from '../config.js';

describe('config loader', () => {
  it('returns default config when no file exists', () => {
    const config = loadConfig('/nonexistent/path');
    expect(config.project).toBe('my-project');
    expect(config.db.driver).toBe('sqlite');
    expect(config.methodology.tiers).toEqual(['smoke', 'regression', 'uat']);
  });

  it('merges user config over defaults', () => {
    const config = loadConfig('/nonexistent/path', {
      project: 'kicu',
      db: { driver: 'mysql', host: 'localhost' },
    });
    expect(config.project).toBe('kicu');
    expect(config.db.driver).toBe('mysql');
    expect(config.db.host).toBe('localhost');
    // Default values preserved for keys not in override
    expect(config.methodology.tiers).toEqual(['smoke', 'regression', 'uat']);
  });

  it('deep merges nested objects', () => {
    const config = loadConfig('/nonexistent/path', {
      methodology: {
        tiers: ['smoke', 'e2e'],
        rootCauseCategories: defaultConfig.methodology.rootCauseCategories,
        thresholds: {
          passRate: { warning: 90, critical: 80 },
          flakyRate: { warning: 3 },
          regressionCount: { critical: 5 },
          staleFailureRuns: { warning: 7 },
        },
      },
    });
    expect(config.methodology.tiers).toEqual(['smoke', 'e2e']);
    expect(config.methodology.thresholds.passRate.warning).toBe(90);
    expect(config.methodology.thresholds.flakyRate.warning).toBe(3);
  });

  it('preserves default dashboard config when not overridden', () => {
    const config = loadConfig('/nonexistent/path');
    expect(config.dashboard.port).toBe(3847);
    expect(config.dashboard.auth.user).toBe('admin');
    expect(config.dashboard.auth.pass).toBe('qastack');
  });

  it('preserves default AI config when not overridden', () => {
    const config = loadConfig('/nonexistent/path');
    expect(config.ai.provider).toBe('anthropic');
    expect(config.ai.model).toBe('claude-sonnet-4-6');
  });

  it('overrides array values entirely (no merge)', () => {
    const config = loadConfig('/nonexistent/path', {
      plugins: ['@qastack/laravel'],
    });
    expect(config.plugins).toEqual(['@qastack/laravel']);
  });
});
