<p align="center">
  <img src="https://img.shields.io/badge/qastack-v0.1.0-0070F3?style=for-the-badge" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="node" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="typescript" />
</p>

<h1 align="center">qastack</h1>

<p align="center">
  <strong>Full QA stack in a box — from user stories to green light.</strong>
</p>

<p align="center">
  AI-powered, opinionated QA framework that discovers what your app does,<br/>
  generates test cases from user stories, monitors results,<br/>
  and gives you a live dashboard.
</p>

---

## Why qastack?

Most teams struggle with the same QA problems:

- No structured user stories to test against
- Tests exist but nobody tracks health over time
- Regressions slip through because there's no monitoring
- New projects start from zero with no testing methodology

**qastack solves all of this with one CLI tool.**

```
Your Code ──> AI Discovery ──> User Stories ──> Test Skeletons ──> Run & Collect ──> Dashboard
               (scans your       (human          (Playwright,       (Playwright      (health,
                codebase)         validated)       Jest, Pest...)     JSON / JUnit)    regressions,
                                                                                      MTTR, flaky)
```

---

## Quick Start

```bash
# 1. Initialize in your project
npx qastack init

# 2. Discover your codebase (AI generates user stories)
npx qastack discover

# 3. Generate tests from stories (with human approval)
npx qastack generate --approve

# 4. Run tests, then collect results
npx playwright test --reporter=json --output-file=playwright-report/results.json
npx qastack collect

# 5. See your health
npx qastack status

# 6. Launch the dashboard
npx qastack dashboard
```

That's it. You now have AI-generated tests, a SQLite database tracking every run, and a live dashboard showing health trends, regressions, and mean time to fix.

---

## Features

### AI-Powered Discovery

Scans your routes, models, components, and database schema — then uses Claude or GPT to generate structured user stories. Works even on projects with zero documentation.

```bash
npx qastack discover
```

```
# Discovery Report — my-project

## Detected Stack
- Framework: Laravel
- Routes: 47 found
- Models: 12 found

## Modules Found (8)

### users (high confidence)
- US-001 [smoke]: As an admin, I can view the list of all users
- US-002 [smoke]: As an admin, I can view a single user's details
- US-003 [regression]: As an admin, I can create a new user
...
```

### Multi-Framework Test Generation

Generates test skeletons with `TODO: [HUMAN]` markers at every point requiring human input. Supports 5 test runners:

| Runner | Language | Output |
|--------|----------|--------|
| **Playwright** | TypeScript | `.spec.ts` with `page.goto`, heading assertions, tier tags |
| **Jest** | TypeScript | `describe`/`it` blocks with setup/action/assert structure |
| **Pest** | PHP | `describe`/`it` with `$this->get()` and `->group()` tier tagging |
| **Pytest** | Python | Class-based tests with `@pytest.mark` decorators |
| **RSpec** | Ruby | `RSpec.describe` with `type: :feature` |

### Human-in-the-Loop Validation

Every AI output gets human review before it touches your codebase:

```
$ npx qastack generate --approve

  US-001: Admin can view the list of all users
  Module: users | Tier: smoke | File: tests/e2e/users/users-list.spec.ts

  [A]pprove  [E]dit  [S]kip  [R]eject  [Q]uit
  > a
  Written to tests/e2e/users/users-list.spec.ts
```

### Result Collection & Analysis

Parses test results from **Playwright JSON** or **JUnit XML** (works with any runner), then automatically:

- **Categorizes root causes** — infra, timeout, data-issue, ui-bug, assertion, flaky
- **Detects regressions** — tests that passed last run but fail now
- **Tracks MTTR** — mean time to fix for every failure
- **Identifies flaky tests** — tests with inconsistent pass/fail across runs

### Live Dashboard

A 7-tab monitoring dashboard with Vercel-inspired dark/light theme:

| Tab | What it shows |
|-----|---------------|
| **Overview** | Health gauge, trend chart, module summary, release readiness |
| **Modules** | Per-module health bars, stability ranking |
| **Tests** | Individual results, filterable by module/status/search |
| **Regressions** | Active regressions with commit context |
| **Root Causes** | Doughnut breakdown + trend over time |
| **MTTR** | Active failures, resolved count, average fix time |
| **Flaky** | Flaky test leaderboard by occurrence |

### Opinionated Methodology

Ships with battle-tested defaults inspired by **ISTQB CT-TAS** and **TMMi**:

| Tier | Scope | When |
|------|-------|------|
| `smoke` | Critical paths | Every push |
| `regression` | Smoke + known-broken areas | Before merge |
| `uat` | Everything | Before release |

**Alert thresholds** (all configurable):

| Metric | Warning | Critical |
|--------|:-------:|:--------:|
| Pass rate | < 80% | < 70% |
| Flaky rate | > 5% | — |
| Regressions/run | — | > 10 |
| Stale failures | > 10 runs | — |

---

## Commands

| Command | Description |
|---------|-------------|
| `qastack init` | Interactive setup — detects framework, creates config, runs migrations |
| `qastack discover` | Scan codebase and generate user stories using AI |
| `qastack generate` | Generate test skeletons from user stories (`--approve` for interactive) |
| `qastack collect` | Collect results into DB (`--format playwright\|junit`) |
| `qastack status` | Quick CLI health summary |
| `qastack dashboard` | Launch monitoring dashboard (`--port 8080`) |
| `qastack catalog` | Generate/update test catalog from spec files |
| `qastack migrate` | Run database migrations |

---

## Framework Support

| Framework | Discovery | Test Gen | Collection | Plugin |
|-----------|:---------:|:--------:|:----------:|--------|
| **Laravel** | Routes, Models, Migrations | Playwright, Pest | Playwright JSON, JUnit XML | `@qastack/plugin-laravel` |
| **Next.js** | App Router, Prisma, Components | Playwright | Playwright JSON | `@qastack/plugin-nextjs` |
| **Any project** | README, git, existing tests | Playwright | JUnit XML (universal) | `@qastack/plugin-generic` |

Framework detection is automatic — qastack scans for `composer.json`, `package.json`, `manage.py`, `Gemfile` etc.

**JUnit XML is the universal fallback.** Any test runner that outputs JUnit XML works with qastack's collector, analyzer, and dashboard immediately — no plugin needed.

---

## Configuration

`qastack init` generates this for you, or create `qastack.config.js` manually:

```javascript
module.exports = {
  project: 'my-project',

  ai: {
    provider: 'anthropic',        // 'anthropic' | 'openai'
    model: 'claude-sonnet-4-6',
    apiKey: process.env.QASTACK_AI_KEY,
  },

  db: {
    driver: 'sqlite',            // 'sqlite' | 'mysql' | 'postgres'
    path: './qastack.db',
  },

  test: {
    runner: 'playwright',
    dir: 'tests/e2e',
    resultPath: 'playwright-report/results.json',
    resultFormat: 'playwright-json',
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

---

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/qa.yml
name: QA Tests
on: [push, pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --reporter=json --output-file=playwright-report/results.json
      - if: always()
        run: npx qastack collect && npx qastack status
```

### GitLab CI

```yaml
qa:
  image: mcr.microsoft.com/playwright:v1.52.0-noble
  script:
    - npm ci
    - npx playwright test --reporter=json --output-file=playwright-report/results.json
    - npx qastack collect && npx qastack status
  artifacts:
    paths: [playwright-report/]
```

Full templates in [`templates/ci/`](templates/ci/).

---

## Plugin Authoring

Create a plugin by implementing the `QastackPlugin` interface:

```typescript
import type { QastackPlugin } from '@qastack/core';

const myPlugin: QastackPlugin = {
  name: 'my-framework',
  detect: (root) => existsSync(join(root, 'my-config.js')),

  // Discovery — scan your framework's conventions
  scanRoutes:     async (root) => { /* return Route[] */ },
  scanModels:     async (root) => { /* return Model[] */ },
  scanComponents: async (root) => { /* return Component[] */ },
  scanSchema:     async (root) => { /* return DatabaseSchema */ },

  // Generation — produce tests in your runner's syntax
  testRunner:   () => 'playwright',
  testTemplate: (story) => `test('${story.action}', ...)`,
  testDir:      () => 'tests/e2e',

  // Collection — parse your runner's output
  resultFormat: () => 'playwright-json',
  parseResults: (path) => { /* return TestResult[] */ },
};

export default myPlugin;
```

Install community plugins via npm:

```bash
npm install qastack-plugin-flutter
```

```javascript
// qastack.config.js
module.exports = { plugins: ['qastack-plugin-flutter'] };
```

---

## Architecture

```
qastack/
├── packages/
│   ├── core/         Types, config, DB adapters (SQLite + MySQL), plugin loader
│   ├── collector/    Playwright JSON + JUnit XML parsers, result insertion
│   ├── analyzer/     Root cause detection, regression tracking, MTTR
│   ├── api/          HTTP API server for dashboard data
│   ├── dashboard/    Single-file HTML dashboard (Chart.js, dark/light theme)
│   ├── discovery/    AI-powered codebase scanner + user story generation
│   ├── generator/    Multi-framework test skeleton generation
│   └── cli/          Commander-based CLI tying everything together
├── plugins/
│   ├── laravel/      Route, model, migration scanners
│   ├── nextjs/       App Router, Prisma, component scanners
│   └── generic/      Fallback for any project
└── templates/
    ├── ci/           GitHub Actions + GitLab CI templates
    └── config/       Annotated qastack.config.js template
```

**339 tests** across all packages. Zero external runtime dependencies beyond Node.js 20+.

---

## Origin

qastack was extracted from a production QA monitoring system built for [Sifututor](https://sifututor.com), a Malaysian home tuition platform. The core engine (collector, analyzer, dashboard) was battle-tested across **2,000+ E2E tests** and **40+ staging runs** before being generalized into this open-source tool.

The testing methodology is inspired by **ISTQB CT-TAS** (Certified Tester - Test Automation Specialist) and **TMMi** (Test Maturity Model integration) standards.

---

## Contributing

Contributions welcome! Areas that need help:

- **New plugins** — Express, Django, Rails, Flutter, Spring Boot
- **Dashboard improvements** — more charts, better mobile UX
- **AI prompts** — better user story generation for niche frameworks
- **Documentation** — tutorials, video walkthroughs

```bash
git clone https://github.com/hafizrazali90/qastack.git
cd qastack
pnpm install
pnpm test        # 339 tests
pnpm build       # build all packages
```

---

## License

MIT &copy; [Hafiz Razali](https://github.com/hafizrazali90)
