import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import type { QastackPlugin, QastackConfig, UserStory } from '@qastack/core';
import { loadPluginForProject } from '@qastack/core';
import { callAi } from './ai.js';
import {
  buildDiscoveryPrompt,
  type DiscoveryContext,
} from './prompts.js';
import { generateReport } from './report.js';

export interface DiscoveryResult {
  framework: string;
  context: DiscoveryContext;
  stories: UserStory[];
  report: string;
}

/**
 * Run the full discovery pipeline:
 * 1. Load the framework plugin
 * 2. Scan routes, models, components, schema
 * 3. Find existing test files
 * 4. Build prompt and call AI
 * 5. Parse user stories from response
 * 6. Generate markdown report
 */
export async function discover(
  projectRoot: string,
  config: QastackConfig,
): Promise<DiscoveryResult> {
  // 1. Load plugin for this project
  const plugin = await loadPluginForProject(
    projectRoot,
    config.discovery.framework !== 'auto'
      ? config.discovery.framework
      : undefined,
  );

  // 2. Run all scanners
  const routes = await plugin.scanRoutes(projectRoot);
  const models = await plugin.scanModels(projectRoot);
  const components = await plugin.scanComponents(projectRoot);
  const schema = await plugin.scanSchema(projectRoot);

  // 3. Find existing test files
  const existingTests = findExistingTests(projectRoot, config.test.dir);

  // 4. Read README if it exists
  const readmeContent = readReadme(projectRoot);

  // 5. Build context
  const context: DiscoveryContext = {
    projectName: config.project,
    framework: plugin.name,
    routes,
    models,
    components,
    schema,
    existingTests,
    readmeContent,
  };

  // 6. Call AI to generate user stories
  const prompt = buildDiscoveryPrompt(context);
  const aiResponse = await callAi(config.ai, prompt);

  // 7. Parse AI response into UserStory[]
  const stories = parseStoriesFromAi(aiResponse);

  // 8. Generate report
  const report = generateReport(context, stories);

  return { framework: plugin.name, context, stories, report };
}

/**
 * Walk a directory recursively and find test files
 * (.spec.ts, .test.ts, .spec.js, .test.js).
 * Returns paths relative to projectRoot.
 */
export function findExistingTests(
  projectRoot: string,
  testDir: string,
): string[] {
  const testPattern = /\.(spec|test)\.(ts|js|tsx|jsx)$/;
  const absoluteDir = resolve(projectRoot, testDir);

  if (!existsSync(absoluteDir)) return [];

  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry !== 'node_modules' && !entry.startsWith('.')) {
            walk(fullPath);
          }
        } else if (testPattern.test(entry)) {
          results.push(relative(projectRoot, fullPath));
        }
      } catch {
        // Permission errors or broken symlinks -- skip
      }
    }
  }

  walk(absoluteDir);
  return results.sort();
}

/**
 * Try to read a README file from the project root.
 * Attempts: README.md, readme.md, README, README.txt
 */
export function readReadme(projectRoot: string): string | undefined {
  const candidates = ['README.md', 'readme.md', 'README', 'README.txt'];

  for (const name of candidates) {
    const filePath = resolve(projectRoot, name);
    if (existsSync(filePath)) {
      try {
        return readFileSync(filePath, 'utf-8');
      } catch {
        // Unreadable -- try next
      }
    }
  }

  return undefined;
}

/**
 * Parse user stories from an AI response string.
 * Handles both raw JSON arrays and JSON embedded in markdown code fences.
 * Adds source: 'discovery' to each story.
 */
export function parseStoriesFromAi(response: string): UserStory[] {
  if (!response || response.trim().length === 0) return [];

  // Try to extract JSON from markdown code fences first
  const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonStr = fenceMatch ? fenceMatch[1]!.trim() : response.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to find a JSON array anywhere in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const requiredFields = [
    'id',
    'module',
    'persona',
    'action',
    'expectedResult',
  ] as const;

  return parsed
    .filter((item: unknown): item is Record<string, unknown> => {
      if (typeof item !== 'object' || item === null) return false;
      const obj = item as Record<string, unknown>;
      return requiredFields.every(
        (f) => typeof obj[f] === 'string' && (obj[f] as string).length > 0,
      );
    })
    .map(
      (item): UserStory => ({
        id: item['id'] as string,
        module: item['module'] as string,
        persona: item['persona'] as string,
        action: item['action'] as string,
        expectedResult: item['expectedResult'] as string,
        confidence: validateConfidence(item['confidence']),
        tier: validateTier(item['tier']),
        source: 'discovery',
      }),
    );
}

function validateConfidence(
  value: unknown,
): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low')
    return value;
  return 'medium';
}

function validateTier(
  value: unknown,
): 'smoke' | 'regression' | 'uat' {
  if (value === 'smoke' || value === 'regression' || value === 'uat')
    return value;
  return 'regression';
}
