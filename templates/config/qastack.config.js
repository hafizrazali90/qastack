/** @type {import('qastack').QastackConfig} */
module.exports = {
  // Project name (shown in dashboard)
  project: 'my-project',

  // AI provider for discovery and test generation
  ai: {
    provider: 'anthropic',       // 'anthropic' | 'openai'
    model: 'claude-sonnet-4-6',  // or 'gpt-4o' for OpenAI
    apiKey: process.env.QASTACK_AI_KEY,
  },

  // Database for storing test results
  db: {
    driver: 'sqlite',           // 'sqlite' | 'mysql' | 'postgres'
    path: './qastack.db',       // SQLite file path
    // For MySQL/Postgres:
    // host: 'localhost',
    // port: 3306,
    // user: 'qastack',
    // password: process.env.DB_PASSWORD,
    // database: 'qastack',
  },

  // Test configuration
  test: {
    runner: 'playwright',
    dir: 'tests/e2e',
    resultPath: 'playwright-report/results.json',
    resultFormat: 'playwright-json',  // or 'junit-xml'
  },

  // Discovery settings
  discovery: {
    framework: 'auto',          // auto-detect or force
  },

  // Methodology (opinionated defaults — override as needed)
  methodology: {
    tiers: ['smoke', 'regression', 'uat'],
    thresholds: {
      passRate: { warning: 80, critical: 70 },
      flakyRate: { warning: 5 },
      regressionCount: { critical: 10 },
      staleFailureRuns: { warning: 10 },
    },
  },

  // Dashboard settings
  dashboard: {
    port: 3847,
    auth: { user: 'admin', pass: 'qastack' },
  },
};
