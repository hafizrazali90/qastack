// Config types
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
  path?: string;
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
  framework:
    | 'auto'
    | 'laravel'
    | 'nextjs'
    | 'express'
    | 'django'
    | 'rails'
    | 'generic';
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

// Plugin types
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
  scanRoutes(projectRoot: string): Promise<Route[]>;
  scanModels(projectRoot: string): Promise<Model[]>;
  scanComponents(projectRoot: string): Promise<Component[]>;
  scanSchema(projectRoot: string): Promise<DatabaseSchema>;
  testRunner(): string;
  testTemplate(story: UserStory): string;
  testDir(): string;
  resultFormat(): string;
  parseResults(reportPath: string): TestResult[];
}

export type RootCause =
  | 'infra'
  | 'timeout'
  | 'data-issue'
  | 'ui-bug'
  | 'assertion'
  | 'flaky'
  | 'unknown';

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
