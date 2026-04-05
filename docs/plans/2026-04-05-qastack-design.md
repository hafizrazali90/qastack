# qastack — Design Document

> **Full QA stack in a box — from user stories to green light.**
>
> AI-powered, opinionated QA framework. Discovers what your app does, generates test cases from user stories, monitors results, and gives you a live dashboard.
>
> **Date:** 2026-04-05
> **Status:** Approved
> **Author:** Hafiz Razali + Claude

---

## 1. Problem

Most projects lack:
- Structured user stories to test against
- A consistent testing methodology
- Visibility into test health over time (regressions, flaky tests, MTTR)
- A way to generate meaningful tests without writing everything from scratch

Teams either skip QA or cobble together fragmented tools. There's no single tool that goes from "I have code" to "I have a monitored, methodology-driven test suite."

## 2. Solution

`qastack` is a CLI tool that any team installs into their existing project. It:

1. **Discovers** what the app does (routes, models, components, schema)
2. **Generates** user stories from the discovery (AI-powered, human-validated)
3. **Generates** test skeletons from user stories (AI-powered, human-validated)
4. **Collects** test results into a database after each run
5. **Analyzes** results: root cause detection, regression detection, failure tracking, MTTR
6. **Monitors** via a live dashboard with health trends, module risk, and alert thresholds

## 3. Architecture

### 3.1 Monorepo Structure

```
qastack/
├── packages/
│   ├── cli/              # npx qastack — main entry point
│   ├── core/             # Shared: DB adapter, config loader, types
│   ├── collector/        # Parses test results (Playwright JSON, JUnit XML, etc.)
│   ├── analyzer/         # Root cause, regression, MTTR, flaky detection
│   ├── discovery/        # AI-powered codebase scanner → user stories
│   ├── generator/        # AI-powered user stories → test skeletons
│   ├── api/              # Dashboard API server
│   └── dashboard/        # Single-page HTML dashboard (vanilla JS + Chart.js)
├── plugins/
│   ├── laravel/          # Laravel scanner + Pest/Playwright templates
│   ├── nextjs/           # Next.js scanner + Playwright templates
│   ├── express/          # Express scanner + Jest templates
│   ├── django/           # Django scanner + Pytest templates
│   ├── rails/            # Rails scanner + RSpec templates
│   └── generic/          # Fallback: git + README + existing tests
├── templates/
│   ├── ci/               # GitHub Actions, GitLab CI templates
│   └── config/           # qastack.config.js templates
├── migrations/
│   ├── sqlite/
│   └── mysql/
└── qastack.config.js     # Generated per-project config
```

### 3.2 Technology

- **Runtime:** Node.js (TypeScript)
- **Package manager:** pnpm workspaces (monorepo)
- **Database:** SQLite (default, zero-config) / MySQL / PostgreSQL (optional)
- **AI:** Anthropic Claude API or OpenAI API (configurable, required)
- **Dashboard:** Vanilla HTML + JS + Chart.js (no build step, single file)
- **CI:** GitHub Actions + GitLab CI templates included

## 4. CLI Commands

```bash
# Setup
npx qastack init                           # Interactive setup

# Discovery (for projects with poor/no docs)
npx qastack discover                       # Full codebase scan → user stories
npx qastack discover --routes              # Only scan routes/endpoints
npx qastack discover --schema              # Only scan DB schema/models

# Test Generation (AI-powered, human-validated)
npx qastack generate                       # From discovered user stories
npx qastack generate --from stories.md     # From existing user story doc
npx qastack generate --approve             # Interactive approve/edit/reject

# Running & Collecting
npx qastack run                            # Run tests + collect results
npx qastack collect                        # Collect results only
npx qastack collect --format junit         # From JUnit XML
npx qastack collect --format playwright    # From Playwright JSON (default)

# Monitoring
npx qastack dashboard                      # Launch dashboard on port 3847
npx qastack dashboard --port 8080          # Custom port
npx qastack status                         # Quick CLI summary

# Maintenance
npx qastack catalog                        # Generate/update test catalog
npx qastack migrate                        # Run DB migrations (upgrades)
```

## 5. Two Workflows

### Workflow A — Project WITH Documentation

```
user-stories.md → AI generates test skeletons → Human reviews (approve/edit/reject) → Tests written to disk
```

Single human checkpoint.

### Workflow B — Project WITHOUT Documentation

```
Codebase scan → AI generates user stories → Human reviews stories → AI generates test skeletons → Human reviews tests → Tests written to disk
```

Two human checkpoints.

## 6. Discovery Engine

### 6.1 Framework Detection

The discovery engine auto-detects the project framework and uses the appropriate scanner plugin.

| Framework | Detection Signal | What It Scans |
|-----------|-----------------|---------------|
| Laravel | `composer.json` has `laravel/framework` | routes/web.php, routes/api.php, app/Models/, migrations |
| Next.js | `package.json` has `next` | app/ or pages/ dir, API routes, Prisma schema |
| Express | `package.json` has `express` | Route files, middleware, Sequelize/Mongoose models |
| Django | `manage.py` exists | urls.py, models.py, views.py |
| Rails | `Gemfile` has `rails` | config/routes.rb, app/models/, db/migrate/ |
| Generic | Fallback | README, markdown files, existing tests, git log |

### 6.2 Discovery Output

A structured discovery report in markdown:

```markdown
# Discovery Report — [Project Name]
Generated: [date]

## Detected Stack
- Framework: [detected]
- Database: [detected]
- Auth: [detected]
- Test runner: [detected]

## Modules Found ([count])
### 1. [Module Name] ([confidence])
- Routes: [list]
- Model: [name] ([fields])
- Relationships: [list]
- Existing tests: [count]

#### Generated User Stories:
- US-001: As a [persona], I can [action]
- US-002: ...
```

### 6.3 AI Prompt Strategy

- Discovery sends scanned code context (routes, models, components) to the AI
- AI produces user stories in strict format: ID, persona, action, expected result
- Each story gets a confidence score (high/medium/low) based on scanner evidence
- Low-confidence stories flagged for extra human attention

## 7. Test Generation Engine

### 7.1 What AI Decides (from code context)

- URL paths (from routes)
- Page heading text (from components if available)
- Tier assignment (CRUD list = smoke, edge cases = regression)
- Module tagging
- Test ID linked to user story ID

### 7.2 What Human Fills In (marked `TODO: [HUMAN]`)

- Exact selectors for data-specific elements
- Business logic assertions
- Test data requirements

### 7.3 Generated Test Example (Playwright)

```typescript
// Generated by qastack from US-001
// Module: users | Tier: smoke | Status: NEEDS_REVIEW

test.describe('Users — List Page @users', () => {
  test('US-001: user can view the list of all users @users @smoke @e2e', async ({ page }) => {
    // 1. Navigate
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // 2. Verify page loaded
    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();

    // 3. Verify data displayed
    // TODO: [HUMAN] Verify table/list renders with expected columns
    // TODO: [HUMAN] Verify at least one row of data exists

    // 4. Verify key interactions
    // TODO: [HUMAN] Verify search/filter works
    // TODO: [HUMAN] Verify pagination if applicable
  });
});
```

### 7.4 Interactive Approval Flow

```
$ npx qastack generate --approve

  US-001: User can view the list of all users
  Module: users | Tier: smoke | File: tests/e2e/users/users-list.spec.ts

  [A]pprove  [E]dit  [S]kip  [R]eject  [Q]uit
  > a
  Written to tests/e2e/users/users-list.spec.ts
```

## 8. Plugin System

### 8.1 Plugin Interface

```typescript
interface QastackPlugin {
  name: string;
  detect(projectRoot: string): boolean;

  // Discovery
  scanRoutes(): Route[];
  scanModels(): Model[];
  scanComponents(): Component[];
  scanSchema(): DatabaseSchema;

  // Test generation
  testRunner(): string;
  testTemplate(story: UserStory): string;
  testDir(): string;

  // Result collection
  resultFormat(): string;
  parseResults(reportPath: string): TestResult[];
}
```

### 8.2 Day-One Plugins

| Plugin | Discovery | Test Generation | Result Collection |
|--------|:---------:|:---------------:|:-----------------:|
| Laravel + Playwright | Full | Playwright TS | Playwright JSON |
| Laravel + Pest | Full | Pest PHP | JUnit XML |
| Next.js + Playwright | Full | Playwright TS | Playwright JSON |
| Express + Jest | Partial | Jest TS | Jest JSON |
| Django + Pytest | Partial | Pytest | JUnit XML |
| Rails + RSpec | Partial | RSpec | JUnit XML |
| Generic | Git + README only | Playwright TS | JUnit XML |

### 8.3 Community Plugins

```bash
npm install qastack-plugin-flutter
```

```javascript
// qastack.config.js
module.exports = { plugins: ['qastack-plugin-flutter'] };
```

### 8.4 Universal Fallback

JUnit XML is the lingua franca. Any test runner that outputs JUnit XML works with qastack's collector, analyzer, and dashboard immediately — no plugin needed.

## 9. Result Collection & Analysis

Ported from battle-tested SIMS QA system (validated across 2000+ E2E tests, 40+ staging runs).

### 9.1 Database Schema

**Core tables:**
- `qa_runs` — One row per test run (commit, branch, trigger, totals, health %)
- `qa_module_results` — Per-module breakdown per run
- `qa_test_results` — Every individual test, every run (passed/failed/skipped/flaky)
- `qa_test_failures` — Failed tests with error messages

**Analysis tables:**
- `qa_failure_tracking` — First seen, occurrences, resolved date (for MTTR)
- `qa_regressions` — Tests that went from pass → fail between runs
- `qa_test_catalog` — Friendly titles and descriptions for tests
- `qa_alert_thresholds` — Configurable quality gates

### 9.2 Root Cause Auto-Detection

Six categories, pattern-matched from error messages:

| Category | Pattern |
|----------|---------|
| `infra` | ECONNREFUSED, browser crash, net:: errors |
| `timeout` | timeout, exceeded, waiting for |
| `data-issue` | null, undefined, not found, 404, seed |
| `ui-bug` | locator, selector, visible, click, element |
| `assertion` | expect, toEqual, toBe, assert |
| `flaky` | Multiple results with mixed pass/fail |

### 9.3 Regression Detection

Compares consecutive runs: if a test passed in run N-1 but fails in run N, it's flagged as a regression. Auto-resolves when the test passes again.

### 9.4 MTTR (Mean Time to Fix)

Tracks `first_seen_at` → `resolved_at` for every failure. Dashboard shows active failures, average resolution time, and stale failures (broken for 10+ runs).

## 10. Dashboard

Single-page HTML app (no build step) with Vercel-inspired light/dark theme.

**Tabs:**
- **Overview** — Health gauge, trend chart, module summary, release readiness
- **Modules** — Per-module health, stability ranking, risk quadrant
- **Tests** — Individual test results, filterable by module/status/tier
- **Regressions** — Active regressions, per-module count
- **Root Causes** — Breakdown chart, trend over time
- **MTTR** — Active failures, resolved, average time to fix
- **Flaky** — Flaky test leaderboard

**API endpoints:**
- `GET /api/overview` — Latest run, trend, module summary, readiness
- `GET /api/runs` — Paginated run history
- `GET /api/runs/:id` — Single run detail
- `GET /api/modules` — Module stability
- `GET /api/tests` — Individual test results (filterable)
- `GET /api/flaky` — Flaky tests
- `GET /api/root-causes` — Root cause breakdown + trend
- `GET /api/mttr` — Mean time to fix
- `GET /api/regressions` — Active regressions
- `GET /api/progress` — Quality gates + release readiness

## 11. Methodology (Opinionated Defaults)

Inspired by ISTQB CT-TAS and TMMi, validated in production.

### 11.1 Test Tiers

| Tier | Scope | When to Run |
|------|-------|-------------|
| `smoke` | Critical paths only | Every push |
| `regression` | Smoke + known-broken areas | Before merge |
| `uat` | Everything | Before release |

### 11.2 Alert Thresholds (TMMi-Inspired)

| Metric | Warning | Critical |
|--------|:-------:|:--------:|
| Pass rate | < 80% | < 70% |
| Flaky rate | > 5% | — |
| Regressions per run | — | > 10 |
| Stale failure runs | > 10 | — |

All configurable via `qastack.config.js` and via the dashboard UI.

## 12. Configuration

```javascript
// qastack.config.js
module.exports = {
  project: 'my-project',

  ai: {
    provider: 'anthropic',          // 'anthropic' | 'openai'
    model: 'claude-sonnet-4-6',
    apiKey: process.env.QASTACK_AI_KEY,
  },

  db: {
    driver: 'sqlite',              // 'sqlite' | 'mysql' | 'postgres'
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
};
```

## 13. What Ships From SIMS (Battle-Tested)

- Result collector + Playwright JSON parser
- Root cause auto-detection (6 categories)
- Regression detection + failure tracking + MTTR
- Alert thresholds (TMMi-inspired defaults)
- Dashboard (Vercel-themed, light/dark mode, all tabs)
- API server (all endpoints)
- Test catalog generator
- Smoke test for API endpoints

## 14. What's New (Built for qastack)

- Discovery engine (codebase scan → user stories)
- AI-powered test generation with human-in-the-loop
- Plugin system for multi-framework support
- SQLite database adapter
- Interactive TUI for approve/edit/reject flow
- CI templates (GitHub Actions, GitLab CI)
- `npx qastack init` scaffolding
- Framework auto-detection

## 15. Project Setup

- **Repo:** `C:\Users\Hafiz Razali\Documents\Projects\qastack\`
- **GitHub:** TBD (public repo)
- **License:** MIT
- **Package name:** `qastack` (npm)
