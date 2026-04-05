# qastack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `qastack` — an AI-powered, framework-agnostic QA framework as an npm CLI tool. Users run `npx qastack init` to set up, `discover` to scan codebases, `generate` to create tests from user stories, `collect` to track results, and `dashboard` to monitor health.

**Architecture:** pnpm monorepo with 8 packages (`cli`, `core`, `collector`, `analyzer`, `discovery`, `generator`, `api`, `dashboard`) + a plugin system for framework-specific logic. Core ported from battle-tested SIMS QA system. New: AI-powered discovery/generation with human-in-the-loop validation.

**Tech Stack:** Node.js 20+, TypeScript (strict), pnpm workspaces, better-sqlite3 (default DB), mysql2 (optional), Anthropic/OpenAI SDK (AI), Chart.js (dashboard), Vitest (testing), tsup (bundling).

**Source reference:** SIMS QA system at `C:\Users\Hafiz Razali\Documents\Projects\Sifututor\sifu-tutor\scripts\qa\` — files to port: `collect-results.cjs` (530 LOC), `api.cjs` (1289 LOC), `dashboard/index.html` (2306 LOC), `migrations/001-qa-monitor-v2.sql` (77 LOC), `generate-catalog.cjs`, `smoke-test.cjs`.

---

## Phase 1: Foundation (Tasks 1-4)

### Task 1: Scaffold Monorepo

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json` (root)
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `LICENSE`

**Step 1: Initialize pnpm monorepo**

```bash
cd /c/Users/Hafiz\ Razali/Documents/Projects/qastack
pnpm init
```

Edit `package.json`:
```json
{
  "name": "qastack",
  "version": "0.1.0",
  "private": true,
  "description": "Full QA stack in a box — from user stories to green light",
  "license": "MIT",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "clean": "pnpm -r run clean"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Create workspace config**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'plugins/*'
```

**Step 3: Create TypeScript base config**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Create `tsconfig.json`:
```json
{
  "extends": "./tsconfig.base.json",
  "references": [
    { "path": "packages/core" },
    { "path": "packages/collector" },
    { "path": "packages/analyzer" },
    { "path": "packages/discovery" },
    { "path": "packages/generator" },
    { "path": "packages/api" },
    { "path": "packages/dashboard" },
    { "path": "packages/cli" }
  ]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.db
.qastack/
coverage/
*.tsbuildinfo
```

**Step 5: Create .npmrc**

```
auto-install-peers=true
strict-peer-dependencies=false
```

**Step 6: Create LICENSE (MIT)**

Standard MIT license with `Hafiz Razali` as author.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with TypeScript"
```

---

### Task 2: Core Package — Types & Config Loader

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/config.ts`
- Test: `packages/core/src/__tests__/config.test.ts`

**Step 1: Write the failing test for config loader**

Create `packages/core/src/__tests__/config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig, defaultConfig } from '../config';

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
    // Defaults still present
    expect(config.methodology.tiers).toEqual(['smoke', 'regression', 'uat']);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run --reporter=verbose
```

Expected: FAIL — module not found.

**Step 3: Create package.json + tsconfig**

`packages/core/package.json`:
```json
{
  "name": "@qastack/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 4: Implement types**

Create `packages/core/src/types.ts`:
```typescript
// ── Config ──────────────────────────────────────────────────────────────

export interface QastackConfig {
  project: string;
  ai: AiConfig;
  db: DbConfig;
  test: TestConfig;
  discovery: DiscoveryConfig;
  methodology: MethodologyConfig;
  dashboard: DashboardConfig;
  plugins: string[];
}

export interface AiConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey?: string;
}

export interface DbConfig {
  driver: 'sqlite' | 'mysql' | 'postgres';
  path?: string;          // SQLite
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export interface TestConfig {
  runner: string;
  dir: string;
  resultPath: string;
  resultFormat: 'playwright-json' | 'junit-xml' | 'jest-json' | string;
}

export interface DiscoveryConfig {
  framework: 'auto' | 'laravel' | 'nextjs' | 'express' | 'django' | 'rails' | 'generic';
  moduleFromFile?: ((filePath: string) => string) | null;
}

export interface MethodologyConfig {
  tiers: string[];
  rootCauseCategories: string[];
  thresholds: {
    passRate: { warning: number; critical: number };
    flakyRate: { warning: number };
    regressionCount: { critical: number };
    staleFailureRuns: { warning: number };
  };
}

export interface DashboardConfig {
  port: number;
  auth: { user: string; pass: string };
}

// ── Plugin ──────────────────────────────────────────────────────────────

export interface Route {
  method: string;
  path: string;
  name?: string;
  controller?: string;
  middleware?: string[];
}

export interface Model {
  name: string;
  table?: string;
  fields: Field[];
  relationships: Relationship[];
}

export interface Field {
  name: string;
  type: string;
  nullable: boolean;
}

export interface Relationship {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany' | string;
  related: string;
  foreignKey?: string;
}

export interface Component {
  name: string;
  filePath: string;
  type: 'page' | 'component' | 'layout';
  props?: string[];
}

export interface DatabaseSchema {
  tables: SchemaTable[];
}

export interface SchemaTable {
  name: string;
  fields: Field[];
}

export interface UserStory {
  id: string;
  module: string;
  persona: string;
  action: string;
  expectedResult: string;
  confidence: 'high' | 'medium' | 'low';
  tier: 'smoke' | 'regression' | 'uat';
  source: 'discovery' | 'manual' | 'document';
}

export interface TestResult {
  module: string;
  file: string;
  testTitle: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  duration: number;
  errorMessage?: string | null;
  isFlaky: boolean;
}

export interface QastackPlugin {
  name: string;
  detect(projectRoot: string): boolean;

  // Discovery
  scanRoutes(projectRoot: string): Promise<Route[]>;
  scanModels(projectRoot: string): Promise<Model[]>;
  scanComponents(projectRoot: string): Promise<Component[]>;
  scanSchema(projectRoot: string): Promise<DatabaseSchema>;

  // Test generation
  testRunner(): string;
  testTemplate(story: UserStory): string;
  testDir(): string;

  // Result collection
  resultFormat(): string;
  parseResults(reportPath: string): TestResult[];
}

// ── Analysis ────────────────────────────────────────────────────────────

export type RootCause = 'infra' | 'timeout' | 'data-issue' | 'ui-bug' | 'assertion' | 'flaky' | 'unknown';

export interface RunSummary {
  runId: number;
  commitHash: string;
  branch: string;
  trigger: 'push' | 'manual' | 'schedule';
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  healthPct: number;
  durationMs: number;
  createdAt: string;
}

export interface ModuleResult {
  module: string;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  healthPct: number;
  durationMs: number;
}
```

**Step 5: Implement config loader**

Create `packages/core/src/config.ts`:
```typescript
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { QastackConfig } from './types.js';

export const defaultConfig: QastackConfig = {
  project: 'my-project',
  ai: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
  },
  db: {
    driver: 'sqlite',
    path: './qastack.db',
  },
  test: {
    runner: 'playwright',
    dir: 'tests/e2e',
    resultPath: 'playwright-report/results.json',
    resultFormat: 'playwright-json',
  },
  discovery: {
    framework: 'auto',
    moduleFromFile: null,
  },
  methodology: {
    tiers: ['smoke', 'regression', 'uat'],
    rootCauseCategories: ['infra', 'timeout', 'data-issue', 'ui-bug', 'assertion', 'flaky', 'unknown'],
    thresholds: {
      passRate: { warning: 80, critical: 70 },
      flakyRate: { warning: 5 },
      regressionCount: { critical: 10 },
      staleFailureRuns: { warning: 10 },
    },
  },
  dashboard: {
    port: 3847,
    auth: { user: 'admin', pass: 'qastack' },
  },
  plugins: [],
};

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
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

export function loadConfig(
  projectRoot: string,
  overrides?: Partial<QastackConfig>,
): QastackConfig {
  let fileConfig: Partial<QastackConfig> = {};

  const configPath = resolve(projectRoot, 'qastack.config.js');
  if (existsSync(configPath)) {
    // Dynamic import would be async; for sync loading, read and eval
    // In the real CLI we use async loadConfig with dynamic import
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const raw = require(configPath);
      fileConfig = raw.default ?? raw;
    } catch {
      // Config file exists but failed to load — use defaults
    }
  }

  let config = deepMerge(defaultConfig, fileConfig);
  if (overrides) {
    config = deepMerge(config, overrides);
  }
  return config;
}
```

Create `packages/core/src/index.ts`:
```typescript
export * from './types.js';
export { loadConfig, defaultConfig } from './config.js';
```

**Step 6: Run test to verify it passes**

```bash
cd packages/core && pnpm install && npx vitest run
```

Expected: PASS

**Step 7: Commit**

```bash
git add packages/core/
git commit -m "feat(core): types, config loader with deep merge + defaults"
```

---

### Task 3: Core Package — Database Adapter

**Files:**
- Create: `packages/core/src/db.ts`
- Create: `packages/core/src/db-sqlite.ts`
- Create: `packages/core/src/db-mysql.ts`
- Create: `packages/core/src/__tests__/db.test.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Write the failing test**

Create `packages/core/src/__tests__/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db';
import type { DbConfig } from '../types';

describe('SQLite database adapter', () => {
  let db: Awaited<ReturnType<typeof createDatabase>>;

  beforeEach(async () => {
    db = await createDatabase({ driver: 'sqlite', path: ':memory:' });
    await db.migrate();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates all required tables', async () => {
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('qa_runs');
    expect(names).toContain('qa_module_results');
    expect(names).toContain('qa_test_results');
    expect(names).toContain('qa_test_failures');
    expect(names).toContain('qa_failure_tracking');
    expect(names).toContain('qa_regressions');
    expect(names).toContain('qa_test_catalog');
    expect(names).toContain('qa_alert_thresholds');
  });

  it('inserts and queries a run', async () => {
    await db.execute(
      `INSERT INTO qa_runs (commit_hash, branch, trigger_type, total_tests, passed, failed, skipped, flaky, health_pct, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['abc123', 'main', 'push', 10, 8, 1, 1, 0, 80, 5000]
    );
    const runs = await db.query<{ id: number; health_pct: number }>('SELECT id, health_pct FROM qa_runs');
    expect(runs).toHaveLength(1);
    expect(runs[0].health_pct).toBe(80);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run
```

Expected: FAIL — db module not found.

**Step 3: Implement DB interface + SQLite adapter**

Create `packages/core/src/db.ts`:
```typescript
import type { DbConfig } from './types.js';

export interface Database {
  migrate(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<{ insertId: number; affectedRows: number }>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function createDatabase(config: DbConfig): Promise<Database> {
  if (config.driver === 'sqlite') {
    const { createSqliteDatabase } = await import('./db-sqlite.js');
    return createSqliteDatabase(config.path ?? './qastack.db');
  }
  if (config.driver === 'mysql') {
    const { createMysqlDatabase } = await import('./db-mysql.js');
    return createMysqlDatabase(config);
  }
  throw new Error(`Unsupported database driver: ${config.driver}`);
}
```

Create `packages/core/src/db-sqlite.ts`:
```typescript
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from './db.js';
import { MIGRATIONS_SQL } from './migrations.js';

export function createSqliteDatabase(dbPath: string): Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return {
    async migrate() {
      db.exec(MIGRATIONS_SQL);
    },

    async execute(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return {
        insertId: Number(result.lastInsertRowid),
        affectedRows: result.changes,
      };
    },

    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      return stmt.all(...params) as T[];
    },

    async close() {
      db.close();
    },
  };
}
```

Create `packages/core/src/db-mysql.ts`:
```typescript
import type { Database } from './db.js';
import type { DbConfig } from './types.js';
import { MIGRATIONS_SQL_MYSQL } from './migrations.js';

export async function createMysqlDatabase(config: DbConfig): Promise<Database> {
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: config.host ?? '127.0.0.1',
    port: config.port ?? 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
  });

  return {
    async migrate() {
      const statements = MIGRATIONS_SQL_MYSQL.split(';').filter((s) => s.trim());
      for (const stmt of statements) {
        await pool.execute(stmt);
      }
    },

    async execute(sql: string, params: unknown[] = []) {
      const [result] = await pool.execute(sql, params) as [{ insertId: number; affectedRows: number }];
      return { insertId: result.insertId, affectedRows: result.affectedRows };
    },

    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const [rows] = await pool.execute(sql, params);
      return rows as T[];
    },

    async close() {
      await pool.end();
    },
  };
}
```

**Step 4: Implement migrations**

Create `packages/core/src/migrations.ts`:
```typescript
/**
 * SQLite migrations (adapted from SIMS 001-qa-monitor-v2.sql).
 * SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT instead of AUTO_INCREMENT.
 * SQLite doesn't have ENUM — use TEXT with CHECK constraints.
 */
export const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS qa_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_hash TEXT NOT NULL,
    branch TEXT NOT NULL,
    trigger_type TEXT CHECK(trigger_type IN ('push', 'manual', 'schedule')) NOT NULL DEFAULT 'push',
    total_tests INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    flaky INTEGER NOT NULL DEFAULT 0,
    health_pct INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_module_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES qa_runs(id),
    module TEXT NOT NULL,
    total_tests INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    flaky INTEGER NOT NULL DEFAULT 0,
    health_pct INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qmr_run_id ON qa_module_results(run_id);

CREATE TABLE IF NOT EXISTS qa_test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES qa_runs(id),
    module TEXT NOT NULL,
    test_signature TEXT NOT NULL,
    test_title TEXT NOT NULL,
    file_path TEXT,
    status TEXT CHECK(status IN ('passed', 'failed', 'skipped', 'flaky')) NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    error_message TEXT,
    root_cause TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qtr_run_id ON qa_test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_qtr_module ON qa_test_results(module);
CREATE INDEX IF NOT EXISTS idx_qtr_status ON qa_test_results(status);
CREATE INDEX IF NOT EXISTS idx_qtr_signature ON qa_test_results(test_signature);

CREATE TABLE IF NOT EXISTS qa_test_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES qa_runs(id),
    module TEXT NOT NULL,
    file_path TEXT,
    test_title TEXT NOT NULL,
    error_message TEXT,
    duration_ms INTEGER DEFAULT 0,
    root_cause TEXT,
    is_flaky INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qtf_run_id ON qa_test_failures(run_id);

CREATE TABLE IF NOT EXISTS qa_failure_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_signature TEXT NOT NULL,
    module TEXT NOT NULL,
    test_title TEXT NOT NULL,
    first_seen_run_id INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_run_id INTEGER,
    resolved_at TEXT,
    occurrences INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_qft_signature ON qa_failure_tracking(test_signature);
CREATE INDEX IF NOT EXISTS idx_qft_active ON qa_failure_tracking(is_active);

CREATE TABLE IF NOT EXISTS qa_regressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_signature TEXT NOT NULL,
    module TEXT NOT NULL,
    test_title TEXT NOT NULL,
    previous_pass_run_id INTEGER NOT NULL,
    regression_run_id INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_qr_active ON qa_regressions(is_active);

CREATE TABLE IF NOT EXISTS qa_test_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_signature TEXT NOT NULL UNIQUE,
    friendly_title TEXT,
    description TEXT,
    module TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_alert_thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric TEXT NOT NULL,
    operator TEXT CHECK(operator IN ('below', 'above')) NOT NULL,
    threshold REAL NOT NULL,
    severity TEXT CHECK(severity IN ('warning', 'critical')) NOT NULL,
    message TEXT,
    guidance TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- Seed default thresholds
INSERT OR IGNORE INTO qa_alert_thresholds (id, metric, operator, threshold, severity, message, guidance)
VALUES
  (1, 'pass_rate', 'below', 70.00, 'critical',
   'Pass rate dropped below the 70% safety threshold.',
   'More than 30% of tests are failing. Check the Tests tab for what broke between runs.'),
  (2, 'pass_rate', 'below', 80.00, 'warning',
   'Pass rate is below 80%.',
   'Tests are passing but not reliably. Check the Modules tab for which areas need attention.'),
  (3, 'flaky_rate', 'above', 5.00, 'warning',
   'More than 5% of tests are flaky.',
   'Flaky tests pass sometimes and fail sometimes. Stabilise them by fixing timing issues.'),
  (4, 'regression_count', 'above', 10.00, 'critical',
   'More than 10 tests broke in a single run.',
   'A large number of previously working tests failed. Consider reverting the last change.'),
  (5, 'stale_failure_runs', 'above', 10.00, 'warning',
   'Some tests have been failing for more than 10 runs.',
   'These tests are either real bugs being ignored or tests that need updating.');
`;

/**
 * MySQL migrations (direct port from SIMS).
 */
export const MIGRATIONS_SQL_MYSQL = `
CREATE TABLE IF NOT EXISTS qa_runs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    commit_hash VARCHAR(50) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    trigger_type ENUM('push', 'manual', 'schedule') NOT NULL DEFAULT 'push',
    total_tests INT UNSIGNED NOT NULL DEFAULT 0,
    passed INT UNSIGNED NOT NULL DEFAULT 0,
    failed INT UNSIGNED NOT NULL DEFAULT 0,
    skipped INT UNSIGNED NOT NULL DEFAULT 0,
    flaky INT UNSIGNED NOT NULL DEFAULT 0,
    health_pct INT UNSIGNED NOT NULL DEFAULT 0,
    duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_module_results (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id INT UNSIGNED NOT NULL,
    module VARCHAR(100) NOT NULL,
    total_tests INT UNSIGNED NOT NULL DEFAULT 0,
    passed INT UNSIGNED NOT NULL DEFAULT 0,
    failed INT UNSIGNED NOT NULL DEFAULT 0,
    skipped INT UNSIGNED NOT NULL DEFAULT 0,
    flaky INT UNSIGNED NOT NULL DEFAULT 0,
    health_pct INT UNSIGNED NOT NULL DEFAULT 0,
    duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
    INDEX idx_qmr_run_id (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_test_results (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id INT UNSIGNED NOT NULL,
    module VARCHAR(100) NOT NULL,
    test_signature VARCHAR(500) NOT NULL,
    test_title VARCHAR(500) NOT NULL,
    file_path VARCHAR(500),
    status ENUM('passed', 'failed', 'skipped', 'flaky') NOT NULL,
    duration_ms INT UNSIGNED DEFAULT 0,
    error_message TEXT NULL,
    root_cause VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qtr_run_id (run_id),
    INDEX idx_qtr_module (module),
    INDEX idx_qtr_status (status),
    INDEX idx_qtr_signature (test_signature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_test_failures (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id INT UNSIGNED NOT NULL,
    module VARCHAR(100) NOT NULL,
    file_path VARCHAR(500),
    test_title VARCHAR(500) NOT NULL,
    error_message TEXT,
    duration_ms INT UNSIGNED DEFAULT 0,
    root_cause VARCHAR(50),
    is_flaky TINYINT(1) DEFAULT 0,
    INDEX idx_qtf_run_id (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_failure_tracking (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    test_signature VARCHAR(500) NOT NULL,
    module VARCHAR(100) NOT NULL,
    test_title VARCHAR(500) NOT NULL,
    first_seen_run_id INT UNSIGNED NOT NULL,
    first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_run_id INT UNSIGNED,
    resolved_at TIMESTAMP NULL,
    occurrences INT UNSIGNED NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX idx_qft_signature (test_signature),
    INDEX idx_qft_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_regressions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    test_signature VARCHAR(500) NOT NULL,
    module VARCHAR(100) NOT NULL,
    test_title VARCHAR(500) NOT NULL,
    previous_pass_run_id INT UNSIGNED NOT NULL,
    regression_run_id INT UNSIGNED NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX idx_qr_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_test_catalog (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    test_signature VARCHAR(500) NOT NULL UNIQUE,
    friendly_title VARCHAR(200),
    description TEXT,
    module VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_alert_thresholds (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    metric VARCHAR(50) NOT NULL,
    operator ENUM('below', 'above') NOT NULL,
    threshold DECIMAL(8,2) NOT NULL,
    severity ENUM('warning', 'critical') NOT NULL,
    message TEXT,
    guidance TEXT,
    is_active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance)
SELECT 'pass_rate', 'below', 70.00, 'critical',
 'Pass rate dropped below the 70% safety threshold.',
 'More than 30% of tests are failing. Check the Tests tab for what broke between runs.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds LIMIT 1);

INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance)
SELECT 'pass_rate', 'below', 80.00, 'warning',
 'Pass rate is below 80%.',
 'Tests are passing but not reliably. Check the Modules tab for which areas need attention.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'pass_rate' AND threshold = 80.00);

INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance)
SELECT 'flaky_rate', 'above', 5.00, 'warning',
 'More than 5% of tests are flaky.',
 'Flaky tests pass sometimes and fail sometimes. Stabilise them by fixing timing issues.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'flaky_rate');

INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance)
SELECT 'regression_count', 'above', 10.00, 'critical',
 'More than 10 tests broke in a single run.',
 'A large number of previously working tests failed. Consider reverting the last change.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'regression_count');

INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance)
SELECT 'stale_failure_runs', 'above', 10.00, 'warning',
 'Some tests have been failing for more than 10 runs.',
 'These tests are either real bugs being ignored or tests that need updating.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'stale_failure_runs');
`;
```

**Step 5: Update index.ts exports**

Add to `packages/core/src/index.ts`:
```typescript
export { createDatabase } from './db.js';
export type { Database } from './db.js';
```

**Step 6: Install dependencies and run tests**

```bash
cd packages/core && pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3
npx vitest run
```

Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/core/
git commit -m "feat(core): database adapter — SQLite + MySQL with migrations"
```

---

### Task 4: Collector Package (Port from SIMS)

**Files:**
- Create: `packages/collector/package.json`
- Create: `packages/collector/tsconfig.json`
- Create: `packages/collector/src/index.ts`
- Create: `packages/collector/src/parsers/playwright.ts`
- Create: `packages/collector/src/parsers/junit.ts`
- Create: `packages/collector/src/collector.ts`
- Create: `packages/collector/src/__tests__/playwright-parser.test.ts`
- Create: `packages/collector/src/__tests__/junit-parser.test.ts`
- Create: `packages/collector/src/__tests__/fixtures/playwright-report.json`
- Create: `packages/collector/src/__tests__/fixtures/junit-report.xml`

**Port from:** `sifu-tutor/scripts/qa/collect-results.cjs` — functions `collectSpecs()`, `moduleFromFile()`, `parseReport()`, `detectRootCause()`, `insertResults()`, `processPhase2()`.

**Step 1: Write failing test for Playwright parser**

Create `packages/collector/src/__tests__/fixtures/playwright-report.json`:
```json
{
  "stats": { "duration": 12000 },
  "suites": [
    {
      "file": "tests/e2e/users/users-list.spec.ts",
      "specs": [
        {
          "title": "US-001: user can view user list",
          "tests": [{ "status": "expected", "results": [{ "status": "passed", "duration": 3000 }] }]
        },
        {
          "title": "US-002: user can search users",
          "tests": [{ "status": "unexpected", "results": [{ "status": "failed", "duration": 5000, "error": { "message": "Timeout waiting for selector" } }] }]
        }
      ],
      "suites": [
        {
          "specs": [
            {
              "title": "US-003: user can create user",
              "tests": [{ "status": "skipped", "results": [{ "status": "skipped", "duration": 0 }] }]
            }
          ]
        }
      ]
    }
  ]
}
```

Create `packages/collector/src/__tests__/playwright-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePlaywrightReport } from '../parsers/playwright';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/playwright-report.json'), 'utf-8')
);

describe('Playwright parser', () => {
  it('parses modules, failures, and all results', () => {
    const result = parsePlaywrightReport(fixture);
    expect(Object.keys(result.modules)).toContain('users');
    expect(result.modules['users'].passed).toBe(1);
    expect(result.modules['users'].failed).toBe(1);
    expect(result.modules['users'].skipped).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testTitle).toBe('US-002: user can search users');
    expect(result.allResults).toHaveLength(3);
    expect(result.passedTests).toHaveLength(1);
  });

  it('extracts module name from file path', () => {
    const result = parsePlaywrightReport(fixture);
    expect(result.allResults[0].module).toBe('users');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/collector && npx vitest run
```

Expected: FAIL

**Step 3: Implement Playwright parser**

Port logic from `sifu-tutor/scripts/qa/collect-results.cjs` lines 66-198.

Create `packages/collector/src/parsers/playwright.ts`:
```typescript
import type { TestResult } from '@qastack/core';

interface PlaywrightSpec {
  title: string;
  tests: Array<{
    status: string;
    results: Array<{ status: string; duration?: number; error?: { message: string } }>;
  }>;
}

interface PlaywrightSuite {
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  stats?: { duration?: number };
  suites: PlaywrightSuite[];
}

interface ModuleStats {
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
  duration: number;
}

export interface ParsedReport {
  modules: Record<string, ModuleStats>;
  failures: TestResult[];
  passedTests: Array<{ module: string; testTitle: string }>;
  allResults: TestResult[];
  stats: { duration?: number };
}

function collectSpecs(
  suite: PlaywrightSuite,
  file?: string,
): Array<{ file?: string; spec: PlaywrightSpec }> {
  const results: Array<{ file?: string; spec: PlaywrightSpec }> = [];
  const currentFile = suite.file ?? file;

  for (const spec of suite.specs ?? []) {
    results.push({ file: currentFile, spec });
  }

  for (const child of suite.suites ?? []) {
    results.push(...collectSpecs(child, currentFile));
  }

  return results;
}

export function moduleFromFile(filePath: string | undefined, testDir = 'tests/e2e'): string {
  if (!filePath) return 'unknown';
  const normalised = filePath.replace(/\\/g, '/');
  // Try: tests/e2e/<module>/...
  const pattern = new RegExp(`${testDir.replace(/\//g, '\\/')}/([^/]+)`);
  const match = normalised.match(pattern);
  if (match) return match[1];
  // Fallback: first path segment
  const parts = normalised.split('/');
  if (parts.length >= 2) return parts[0];
  return 'unknown';
}

export function parsePlaywrightReport(
  report: PlaywrightReport,
  testDir = 'tests/e2e',
): ParsedReport {
  const allSpecs: Array<{ file?: string; spec: PlaywrightSpec }> = [];
  for (const suite of report.suites ?? []) {
    allSpecs.push(...collectSpecs(suite));
  }

  const modules: Record<string, ModuleStats> = {};
  const failures: TestResult[] = [];
  const passedTests: Array<{ module: string; testTitle: string }> = [];
  const allResults: TestResult[] = [];

  for (const { file, spec } of allSpecs) {
    const mod = moduleFromFile(file, testDir);

    if (!modules[mod]) {
      modules[mod] = { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0, duration: 0 };
    }

    for (const test of spec.tests ?? []) {
      modules[mod].total++;

      const lastResult = test.results?.[test.results.length - 1];
      const duration = lastResult?.duration ?? 0;
      modules[mod].duration += duration;

      const isFlaky =
        test.status === 'flaky' ||
        (test.results &&
          test.results.length > 1 &&
          test.results.some((r) => r.status === 'passed') &&
          test.results.some((r) => r.status === 'failed'));

      let status: TestResult['status'];
      switch (test.status) {
        case 'expected': status = 'passed'; break;
        case 'unexpected': status = isFlaky ? 'flaky' : 'failed'; break;
        case 'skipped': status = 'skipped'; break;
        case 'flaky': status = 'flaky'; break;
        default: status = 'failed'; break;
      }

      allResults.push({
        module: mod,
        file: file ?? 'unknown',
        testTitle: spec.title,
        status,
        duration,
        errorMessage: lastResult?.error?.message ?? null,
        isFlaky: !!isFlaky,
      });

      switch (test.status) {
        case 'expected':
          modules[mod].passed++;
          passedTests.push({ module: mod, testTitle: spec.title });
          break;
        case 'unexpected':
          modules[mod].failed++;
          failures.push({
            module: mod,
            file: file ?? 'unknown',
            testTitle: spec.title,
            status: 'failed',
            duration,
            errorMessage: lastResult?.error?.message ?? null,
            isFlaky: !!isFlaky,
          });
          break;
        case 'skipped':
          modules[mod].skipped++;
          break;
        case 'flaky':
          modules[mod].flaky++;
          break;
        default:
          modules[mod].failed++;
          break;
      }
    }
  }

  return { modules, failures, passedTests, allResults, stats: report.stats ?? {} };
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/collector && npx vitest run
```

Expected: ALL PASS

**Step 5: Write failing test for JUnit XML parser**

Create `packages/collector/src/__tests__/fixtures/junit-report.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="3" failures="1" errors="0" time="8.5">
  <testsuite name="users" tests="2" failures="1" time="5.0">
    <testcase name="can view user list" classname="tests.e2e.users.UserListTest" time="2.0"/>
    <testcase name="can search users" classname="tests.e2e.users.UserSearchTest" time="3.0">
      <failure message="Expected 5 but got 0">AssertionError: Expected 5 but got 0</failure>
    </testcase>
  </testsuite>
  <testsuite name="orders" tests="1" failures="0" time="3.5">
    <testcase name="can view order list" classname="tests.e2e.orders.OrderListTest" time="3.5"/>
  </testsuite>
</testsuites>
```

Create `packages/collector/src/__tests__/junit-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJunitReport } from '../parsers/junit';

const fixture = readFileSync(
  resolve(__dirname, 'fixtures/junit-report.xml'),
  'utf-8',
);

describe('JUnit XML parser', () => {
  it('parses modules from testsuites', () => {
    const result = parseJunitReport(fixture);
    expect(Object.keys(result.modules)).toContain('users');
    expect(Object.keys(result.modules)).toContain('orders');
  });

  it('counts passed and failed', () => {
    const result = parseJunitReport(fixture);
    expect(result.modules['users'].passed).toBe(1);
    expect(result.modules['users'].failed).toBe(1);
    expect(result.modules['orders'].passed).toBe(1);
  });

  it('extracts failures', () => {
    const result = parseJunitReport(fixture);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].errorMessage).toContain('Expected 5 but got 0');
  });
});
```

**Step 6: Implement JUnit XML parser**

Create `packages/collector/src/parsers/junit.ts` — use a lightweight XML parser (`fast-xml-parser`).

**Step 7: Implement collector orchestrator**

Create `packages/collector/src/collector.ts` — ported from SIMS `insertResults()` + `processPhase2()`. Takes parsed results + Database adapter, inserts runs/modules/failures/regressions.

**Step 8: Run all tests, commit**

```bash
npx vitest run && git add packages/collector/ && git commit -m "feat(collector): Playwright JSON + JUnit XML parsers with DB insertion"
```

---

## Phase 2: Analysis Engine (Tasks 5-6)

### Task 5: Analyzer Package (Port from SIMS)

**Files:**
- Create: `packages/analyzer/package.json`
- Create: `packages/analyzer/tsconfig.json`
- Create: `packages/analyzer/src/index.ts`
- Create: `packages/analyzer/src/root-cause.ts`
- Create: `packages/analyzer/src/regression.ts`
- Create: `packages/analyzer/src/mttr.ts`
- Create: `packages/analyzer/src/__tests__/root-cause.test.ts`
- Create: `packages/analyzer/src/__tests__/regression.test.ts`

**Port from:** `sifu-tutor/scripts/qa/collect-results.cjs` — functions `detectRootCause()`, `processPhase2()` sections 1-3.

**Step 1: Write failing test for root cause detection**

```typescript
import { describe, it, expect } from 'vitest';
import { detectRootCause } from '../root-cause';

describe('root cause detection', () => {
  it('detects infra issues', () => {
    expect(detectRootCause('ECONNREFUSED 127.0.0.1:3000', false)).toBe('infra');
    expect(detectRootCause('net::ERR_CONNECTION_REFUSED', false)).toBe('infra');
  });

  it('detects timeouts', () => {
    expect(detectRootCause('Timeout 30000ms exceeded waiting for selector', false)).toBe('timeout');
  });

  it('detects data issues', () => {
    expect(detectRootCause('Cannot read properties of null', false)).toBe('data-issue');
    expect(detectRootCause('404 Not Found', false)).toBe('data-issue');
  });

  it('detects UI bugs', () => {
    expect(detectRootCause('locator.click: Target element is not visible', false)).toBe('ui-bug');
  });

  it('detects assertion failures', () => {
    expect(detectRootCause('expect(received).toEqual(expected)', false)).toBe('assertion');
  });

  it('detects flaky', () => {
    expect(detectRootCause('some error', true)).toBe('flaky');
  });

  it('returns unknown for unrecognized errors', () => {
    expect(detectRootCause('something weird happened', false)).toBe('unknown');
  });
});
```

**Step 2: Implement root cause, regression detection, MTTR — direct port from SIMS.**

**Step 3: Run tests, commit.**

```bash
git commit -m "feat(analyzer): root cause detection, regression tracking, MTTR calculation"
```

---

### Task 6: API Package (Port from SIMS)

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/src/index.ts`
- Create: `packages/api/src/server.ts`
- Create: `packages/api/src/routes/overview.ts`
- Create: `packages/api/src/routes/runs.ts`
- Create: `packages/api/src/routes/modules.ts`
- Create: `packages/api/src/routes/tests.ts`
- Create: `packages/api/src/routes/regressions.ts`
- Create: `packages/api/src/routes/root-causes.ts`
- Create: `packages/api/src/routes/mttr.ts`
- Create: `packages/api/src/routes/flaky.ts`
- Create: `packages/api/src/__tests__/server.test.ts`

**Port from:** `sifu-tutor/scripts/qa/api.cjs` — all route handlers. Convert from raw `http` + MySQL pool to TypeScript + Database adapter interface.

**Key changes from SIMS version:**
- Replace `mysql2/promise` pool with `Database` adapter from `@qastack/core`
- Replace `?` placeholders with adapter-agnostic params (SQLite uses `?` too, so minimal change)
- Keep same endpoint structure: `/api/overview`, `/api/runs`, `/api/modules`, `/api/tests`, `/api/flaky`, `/api/root-causes`, `/api/mttr`, `/api/regressions`
- Port auth (simple token-based) from SIMS

**Step 1: Write failing test for server startup + overview endpoint.**

**Step 2: Implement server with all routes.**

**Step 3: Run tests, commit.**

```bash
git commit -m "feat(api): dashboard API server — all endpoints ported from SIMS"
```

---

## Phase 3: Dashboard (Task 7)

### Task 7: Dashboard Package (Port from SIMS)

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/index.html`

**Port from:** `sifu-tutor/scripts/qa/dashboard/index.html` (2306 LOC).

**Key changes from SIMS version:**
- Replace "SIMS QA Monitor" with "qastack" branding
- Make API base URL configurable (currently hardcoded to staging VPS)
- Keep all tabs: Overview, Modules, Tests, Regressions, Root Causes, MTTR, Flaky
- Keep Vercel light/dark theme
- Keep Chart.js for trend charts

**Step 1: Copy SIMS dashboard HTML.**

**Step 2: Replace branding, make API URL configurable.**

**Step 3: Test by launching API + dashboard locally.**

```bash
git commit -m "feat(dashboard): QA monitoring dashboard — ported from SIMS with qastack branding"
```

---

## Phase 4: Plugin System (Tasks 8-10)

### Task 8: Plugin Loader + Generic Plugin

**Files:**
- Create: `packages/core/src/plugin-loader.ts`
- Create: `plugins/generic/package.json`
- Create: `plugins/generic/src/index.ts`
- Create: `plugins/generic/src/__tests__/generic-plugin.test.ts`

**Step 1: Write failing test for plugin loading.**

**Step 2: Implement plugin loader** — resolves plugins by name from `node_modules` or local `plugins/` dir. Each plugin exports a `QastackPlugin` object.

**Step 3: Implement generic plugin** — scans README, existing test files, git log. Uses file-path based module detection. Outputs Playwright test templates.

**Step 4: Run tests, commit.**

```bash
git commit -m "feat(core): plugin loader + generic fallback plugin"
```

---

### Task 9: Laravel Plugin

**Files:**
- Create: `plugins/laravel/package.json`
- Create: `plugins/laravel/src/index.ts`
- Create: `plugins/laravel/src/scanners/routes.ts`
- Create: `plugins/laravel/src/scanners/models.ts`
- Create: `plugins/laravel/src/scanners/migrations.ts`
- Create: `plugins/laravel/src/__tests__/route-scanner.test.ts`
- Create: `plugins/laravel/src/__tests__/fixtures/` (sample routes/web.php, Model file, migration)

**Step 1: Write failing test for Laravel route scanner.**

Test with a sample `routes/web.php`:
```php
Route::get('/users', [UserController::class, 'index'])->name('users.index');
Route::post('/users', [UserController::class, 'store'])->name('users.store');
Route::get('/users/{user}', [UserController::class, 'show'])->name('users.show');
```

Expected output: array of `Route` objects with method, path, name, controller.

**Step 2: Implement route scanner** — regex-based PHP route parsing.

**Step 3: Implement model scanner** — regex-based Eloquent model parsing (class name, fillable, relationships).

**Step 4: Implement migration scanner** — regex-based migration parsing (table name, columns).

**Step 5: Wire up as QastackPlugin, run tests, commit.**

```bash
git commit -m "feat(plugin-laravel): route, model, and migration scanners"
```

---

### Task 10: Next.js Plugin

**Files:**
- Create: `plugins/nextjs/package.json`
- Create: `plugins/nextjs/src/index.ts`
- Create: `plugins/nextjs/src/scanners/routes.ts`
- Create: `plugins/nextjs/src/scanners/prisma.ts`
- Create: `plugins/nextjs/src/scanners/components.ts`
- Create: `plugins/nextjs/src/__tests__/route-scanner.test.ts`

**Step 1: Write failing test** — scan `app/` directory structure to derive routes.

**Step 2: Implement route scanner** — walks `app/` dir, maps `page.tsx` files to routes.

**Step 3: Implement Prisma scanner** — parses `prisma/schema.prisma` for models/fields/relations.

**Step 4: Implement component scanner** — finds React components, extracts page vs layout.

**Step 5: Run tests, commit.**

```bash
git commit -m "feat(plugin-nextjs): App Router, Prisma, and component scanners"
```

---

## Phase 5: AI-Powered Discovery & Generation (Tasks 11-13)

### Task 11: Discovery Package

**Files:**
- Create: `packages/discovery/package.json`
- Create: `packages/discovery/tsconfig.json`
- Create: `packages/discovery/src/index.ts`
- Create: `packages/discovery/src/discover.ts`
- Create: `packages/discovery/src/prompts.ts`
- Create: `packages/discovery/src/report.ts`
- Create: `packages/discovery/src/__tests__/discover.test.ts`

**Step 1: Write failing test** — given scanner output (routes + models), generate discovery report markdown.

**Step 2: Implement discovery orchestrator:**
1. Auto-detect framework (check files: `composer.json`, `package.json`, `manage.py`, `Gemfile`)
2. Load appropriate plugin
3. Run all scanners (`scanRoutes`, `scanModels`, `scanComponents`, `scanSchema`)
4. Build context payload for AI
5. Call AI API with structured prompt
6. Parse AI response into `UserStory[]`
7. Generate discovery report markdown

**Step 3: Implement AI prompts**

Create `packages/discovery/src/prompts.ts`:
```typescript
export function buildDiscoveryPrompt(context: {
  framework: string;
  routes: Route[];
  models: Model[];
  components: Component[];
  schema: DatabaseSchema;
  existingTests: string[];
  readmeContent?: string;
}): string {
  return `You are a QA analyst reviewing a ${context.framework} application.

Based on the following codebase analysis, generate user stories for testing.

## Routes
${context.routes.map(r => `- ${r.method} ${r.path} → ${r.controller ?? 'unknown'}`).join('\n')}

## Models
${context.models.map(m => `- ${m.name} (${m.fields.map(f => f.name).join(', ')})`).join('\n')}

## Existing Tests
${context.existingTests.length} tests already exist.

## Instructions
For each module, generate user stories in this exact JSON format:
[
  {
    "id": "US-001",
    "module": "users",
    "persona": "admin",
    "action": "view the list of all users",
    "expectedResult": "A paginated table of users is displayed with name, email, and role columns",
    "confidence": "high",
    "tier": "smoke"
  }
]

Rules:
- One story per testable user action
- Assign tiers: CRUD list/detail = smoke, create/edit/delete = regression, edge cases = uat
- Confidence: high if route + model exist, medium if only route, low if inferred from README
- Group by module (derive from route prefix)
`;
}
```

**Step 4: Implement AI provider abstraction**

Create `packages/discovery/src/ai.ts`:
```typescript
import type { AiConfig } from '@qastack/core';

export async function callAi(config: AiConfig, prompt: string): Promise<string> {
  if (config.provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.apiKey });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  if (config.provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.apiKey });
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  throw new Error(`Unsupported AI provider: ${config.provider}`);
}
```

**Step 5: Run tests, commit.**

```bash
git commit -m "feat(discovery): AI-powered codebase scanner with framework detection"
```

---

### Task 12: Generator Package

**Files:**
- Create: `packages/generator/package.json`
- Create: `packages/generator/tsconfig.json`
- Create: `packages/generator/src/index.ts`
- Create: `packages/generator/src/generate.ts`
- Create: `packages/generator/src/templates/playwright.ts`
- Create: `packages/generator/src/templates/jest.ts`
- Create: `packages/generator/src/templates/pest.ts`
- Create: `packages/generator/src/templates/pytest.ts`
- Create: `packages/generator/src/templates/rspec.ts`
- Create: `packages/generator/src/__tests__/playwright-template.test.ts`

**Step 1: Write failing test** — given a `UserStory`, generate Playwright test skeleton.

```typescript
import { describe, it, expect } from 'vitest';
import { generatePlaywrightTest } from '../templates/playwright';

describe('Playwright template', () => {
  it('generates test skeleton from user story', () => {
    const story = {
      id: 'US-001',
      module: 'users',
      persona: 'admin',
      action: 'view the list of all users',
      expectedResult: 'A paginated table of users is displayed',
      confidence: 'high' as const,
      tier: 'smoke' as const,
      source: 'discovery' as const,
    };

    const code = generatePlaywrightTest(story, '/users');
    expect(code).toContain("test('US-001:");
    expect(code).toContain('@users');
    expect(code).toContain('@smoke');
    expect(code).toContain("page.goto('/users'");
    expect(code).toContain('TODO: [HUMAN]');
  });
});
```

**Step 2: Implement test templates for each framework.**

**Step 3: Implement generator orchestrator** — takes user stories + plugin, calls AI to enhance templates with page-specific selectors, outputs files grouped by module.

**Step 4: Run tests, commit.**

```bash
git commit -m "feat(generator): AI-powered test skeleton generation with multi-framework templates"
```

---

### Task 13: Interactive TUI for Human Validation

**Files:**
- Create: `packages/cli/src/tui/approval.ts`
- Create: `packages/cli/src/tui/story-editor.ts`

**Dependencies:** `@inquirer/prompts` (lightweight, no heavy curses library).

**Step 1: Implement story approval flow** — shows each generated user story, lets user Approve/Edit/Skip/Reject.

**Step 2: Implement test approval flow** — shows each generated test skeleton, lets user Approve/Edit/Skip/Reject.

**Step 3: Implement markdown file output** — approved stories saved to `qastack-stories.md`, approved tests written to test dir.

**Step 4: Manual test, commit.**

```bash
git commit -m "feat(cli): interactive TUI for story and test approval"
```

---

## Phase 6: CLI (Tasks 14-15)

### Task 14: CLI Package — Core Commands

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/discover.ts`
- Create: `packages/cli/src/commands/generate.ts`
- Create: `packages/cli/src/commands/collect.ts`
- Create: `packages/cli/src/commands/run.ts`
- Create: `packages/cli/src/commands/dashboard.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/commands/catalog.ts`
- Create: `packages/cli/src/commands/migrate.ts`

**Dependencies:** `commander` (CLI framework), `chalk` (colors), `ora` (spinners).

**Step 1: Scaffold CLI entry point with commander**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command()
  .name('qastack')
  .description('Full QA stack in a box — from user stories to green light')
  .version('0.1.0');

program.command('init').description('Initialize qastack in current project').action(initCommand);
program.command('discover').description('Scan codebase and generate user stories').action(discoverCommand);
program.command('generate').description('Generate test skeletons from user stories').action(generateCommand);
program.command('collect').description('Collect test results into database').action(collectCommand);
program.command('run').description('Run tests and collect results').action(runCommand);
program.command('dashboard').description('Launch QA monitoring dashboard').action(dashboardCommand);
program.command('status').description('Show quick QA health summary').action(statusCommand);
program.command('catalog').description('Generate/update test catalog').action(catalogCommand);
program.command('migrate').description('Run database migrations').action(migrateCommand);

program.parse();
```

**Step 2: Implement `init` command** — interactive setup:
1. Detect framework
2. Detect existing test runner
3. Ask for AI provider + API key
4. Ask for project name
5. Generate `qastack.config.js`
6. Run migrations (create SQLite DB)
7. Print success message

**Step 3: Implement each command** — wire up to the appropriate package.

**Step 4: Add bin entry to package.json:**
```json
{ "bin": { "qastack": "./dist/index.js" } }
```

**Step 5: Test locally with `npx .`, commit.**

```bash
git commit -m "feat(cli): all commands — init, discover, generate, collect, run, dashboard, status"
```

---

### Task 15: CI Templates

**Files:**
- Create: `templates/ci/github-actions.yml`
- Create: `templates/ci/gitlab-ci.yml`

**Step 1: Create GitHub Actions template**

Port from `sifu-tutor/.github/workflows/staging-e2e.yml`, make generic:
```yaml
name: QA Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx qastack run
      - run: npx qastack collect
      - run: npx qastack status
```

**Step 2: Create GitLab CI template.**

**Step 3: Wire into `init` command** — offer to copy CI template during setup.

**Step 4: Commit.**

```bash
git commit -m "feat: CI templates for GitHub Actions and GitLab CI"
```

---

## Phase 7: Polish & Publish (Tasks 16-18)

### Task 16: README

**Files:**
- Create: `README.md`

Write comprehensive README with:
- Hero section with tagline
- Quick start (`npx qastack init`)
- Feature overview with screenshots
- Command reference
- Configuration reference
- Plugin authoring guide
- Contributing guide

```bash
git commit -m "docs: comprehensive README with quick start and plugin guide"
```

---

### Task 17: Integration Test — Full Workflow

**Files:**
- Create: `tests/integration/full-workflow.test.ts`

End-to-end test of the entire flow:
1. `init` with SQLite in temp dir
2. `collect` a fixture Playwright report
3. Verify DB has correct data
4. Start `dashboard` API, hit `/api/overview`
5. Verify response shape

```bash
git commit -m "test: integration test — full init → collect → dashboard workflow"
```

---

### Task 18: npm Publish Setup

**Files:**
- Modify: `packages/cli/package.json` — set `name: "qastack"`, `publishConfig`
- Create: `.github/workflows/publish.yml` — publish on tag

**Step 1: Configure package for npm publishing.**

**Step 2: Create publish workflow.**

**Step 3: Tag v0.1.0 and publish.**

```bash
git commit -m "chore: npm publish setup + GitHub release workflow"
git tag v0.1.0
```

---

## Dependency Graph

```
Task 1 (scaffold) ─┬─► Task 2 (core types) ─► Task 3 (core DB) ─┬─► Task 4 (collector)
                    │                                               ├─► Task 5 (analyzer)
                    │                                               ├─► Task 6 (API)
                    │                                               │    └─► Task 7 (dashboard)
                    │                                               └─► Task 8 (plugin loader)
                    │                                                    ├─► Task 9 (Laravel plugin)
                    │                                                    └─► Task 10 (Next.js plugin)
                    │
                    └─► Task 11 (discovery) ─► Task 12 (generator) ─► Task 13 (TUI)
                                                                        └─► Task 14 (CLI)
                                                                             ├─► Task 15 (CI templates)
                                                                             ├─► Task 16 (README)
                                                                             ├─► Task 17 (integration test)
                                                                             └─► Task 18 (publish)
```

**Parallelizable:** Tasks 4+5+8 can run in parallel after Task 3. Tasks 9+10 can run in parallel after Task 8. Tasks 11-12 can run in parallel with Tasks 4-10 (different packages).

---

## Estimated Commits: 18
## Packages: 8 + 3 plugins = 11
