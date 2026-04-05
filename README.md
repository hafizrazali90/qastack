# qastack

> Full QA stack in a box — from user stories to green light.

AI-powered, opinionated QA framework. Discovers what your app does, generates test cases from user stories, monitors results, and gives you a live dashboard.

## Quick Start

```bash
# 1. Install
npm install -g qastack

# 2. Initialize in your project
npx qastack init

# 3. Discover your codebase and generate user stories
npx qastack discover

# 4. Generate test skeletons
npx qastack generate

# 5. Run your tests, then collect results
npx playwright test --reporter=json --output-file=playwright-report/results.json
npx qastack collect

# 6. Launch the dashboard
npx qastack dashboard
```

## Features

- **AI-powered codebase discovery** -- scans routes, models, components, and schema to generate user stories from your actual code
- **Multi-framework test generation** -- produces test skeletons for Playwright, Jest, Pest, Pytest, and RSpec
- **Result collection and analysis** -- parses Playwright JSON and JUnit XML reports, detects root causes, tracks regressions, calculates MTTR
- **Live monitoring dashboard** -- 7-tab dashboard with health trends, module breakdown, flaky test tracking, and alert thresholds
- **Plugin system** -- built-in support for Laravel, Next.js, and generic projects; extensible for Express, Django, and Rails
- **ISTQB-inspired methodology** -- tiered testing (smoke, regression, UAT) with configurable quality thresholds

## Commands

| Command | Description |
|---------|-------------|
| `qastack init` | Interactive project setup -- detects framework, creates config, runs migrations |
| `qastack discover` | Scan codebase and generate user stories using AI |
| `qastack generate` | Generate test skeletons from discovered user stories |
| `qastack collect` | Collect test results into database (Playwright JSON or JUnit XML) |
| `qastack status` | Print quick QA health summary (health %, regressions, MTTR) |
| `qastack dashboard` | Launch live monitoring dashboard with API server |
| `qastack catalog` | Generate or update test catalog from existing tests |
| `qastack migrate` | Run database migrations (creates all required tables) |

## Framework Support

| Framework | Plugin | Routes | Models | Schema | Components | Test Runner |
|-----------|--------|--------|--------|--------|------------|-------------|
| Laravel | `@qastack/plugin-laravel` | Yes | Yes | Yes (migrations) | -- | Pest |
| Next.js | `@qastack/plugin-nextjs` | Yes (App Router) | Yes (Prisma) | Yes (Prisma) | Yes | Playwright |
| Generic | `@qastack/plugin-generic` | -- | -- | -- | -- | Playwright |

Framework detection is automatic. qastack scans your project root for `artisan`, `next.config.*`, `package.json`, etc. and loads the appropriate plugin.

## Configuration

Create `qastack.config.js` in your project root (or run `qastack init`):

```javascript
/** @type {import('qastack').QastackConfig} */
module.exports = {
  project: 'my-project',

  ai: {
    provider: 'anthropic',       // 'anthropic' | 'openai'
    model: 'claude-sonnet-4-6',  // or 'gpt-4o'
    apiKey: process.env.QASTACK_AI_KEY,
  },

  db: {
    driver: 'sqlite',           // 'sqlite' | 'mysql' | 'postgres'
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
  },

  methodology: {
    tiers: ['smoke', 'regression', 'uat'],
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
};
```

See `templates/config/qastack.config.js` for a fully commented template.

## Dashboard

The monitoring dashboard (`qastack dashboard`) provides 7 tabs:

- **Overview** -- health badge, trend sparkline, readiness gate, active regressions
- **Runs** -- paginated run history with commit, branch, and health for each run
- **Modules** -- per-module health breakdown, worst modules highlighted
- **Tests** -- individual test results with filtering by module and status
- **Flaky** -- flaky test frequency tracking across runs
- **Root Causes** -- automated categorization (infra, timeout, data-issue, ui-bug, assertion, flaky)
- **MTTR** -- mean time to resolution tracking for active and resolved failures

## CI Integration

Copy the appropriate template into your project:

- **GitHub Actions**: `templates/ci/github-actions.yml` -> `.github/workflows/qa.yml`
- **GitLab CI**: `templates/ci/gitlab-ci.yml` -> `.gitlab-ci.yml`

Both templates run tests, collect results into qastack, and print a status summary.

## Plugin Authoring

A qastack plugin implements the `QastackPlugin` interface:

```typescript
import type { QastackPlugin } from '@qastack/core';

const myPlugin: QastackPlugin = {
  name: 'my-framework',
  detect: (projectRoot) => existsSync(join(projectRoot, 'my-config.js')),
  scanRoutes: async (projectRoot) => { /* return Route[] */ },
  scanModels: async (projectRoot) => { /* return Model[] */ },
  scanComponents: async (projectRoot) => { /* return Component[] */ },
  scanSchema: async (projectRoot) => { /* return DatabaseSchema */ },
  testRunner: () => 'playwright',
  testTemplate: (story) => `test('${story.action}', ...)`,
  testDir: () => 'tests/e2e',
  resultFormat: () => 'playwright-json',
  parseResults: (reportPath) => { /* return TestResult[] */ },
};

export default myPlugin;
```

Plugins are loaded via the `plugins` array in `qastack.config.js` or auto-detected from your project structure.

## Architecture

qastack is a pnpm monorepo with 8 packages:

```
packages/
  core/        -- types, config loader, database adapters (SQLite + MySQL), plugin loader
  collector/   -- Playwright JSON + JUnit XML parsers, result insertion
  analyzer/    -- root cause detection, regression tracking, MTTR calculation
  api/         -- HTTP API server (all dashboard endpoints)
  dashboard/   -- single-file HTML dashboard (Vercel-inspired dark theme)
  discovery/   -- AI-powered codebase scanner, user story generation
  generator/   -- multi-framework test skeleton generation
  cli/         -- commander-based CLI wrapping all packages
plugins/
  laravel/     -- Laravel route, model, migration scanners
  nextjs/      -- Next.js App Router, Prisma, component scanners
  generic/     -- fallback plugin for any project
```

## Built With

- Ported from a battle-tested QA system (2000+ E2E tests, 40+ staging runs)
- Inspired by ISTQB CT-TAS and TMMi standards

## License

MIT
