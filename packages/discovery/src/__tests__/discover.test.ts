import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseStoriesFromAi, findExistingTests, readReadme } from '../discover.js';

describe('parseStoriesFromAi', () => {
  it('parses a clean JSON array', () => {
    const json = JSON.stringify([
      {
        id: 'US-001',
        module: 'users',
        persona: 'admin',
        action: 'view user list',
        expectedResult: 'Table of users is shown',
        confidence: 'high',
        tier: 'smoke',
      },
    ]);

    const stories = parseStoriesFromAi(json);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({
      id: 'US-001',
      module: 'users',
      persona: 'admin',
      action: 'view user list',
      expectedResult: 'Table of users is shown',
      confidence: 'high',
      tier: 'smoke',
      source: 'discovery',
    });
  });

  it('extracts JSON from markdown code fences', () => {
    const response = `Here are the user stories:

\`\`\`json
[
  {
    "id": "US-001",
    "module": "posts",
    "persona": "user",
    "action": "create a new post",
    "expectedResult": "Post is saved and visible in the list",
    "confidence": "medium",
    "tier": "regression"
  }
]
\`\`\`

These stories cover the main CRUD operations.`;

    const stories = parseStoriesFromAi(response);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.module).toBe('posts');
    expect(stories[0]!.source).toBe('discovery');
  });

  it('extracts JSON from code fences without language tag', () => {
    const response = `\`\`\`
[{"id":"US-001","module":"auth","persona":"guest","action":"log in","expectedResult":"Redirected to dashboard","confidence":"high","tier":"smoke"}]
\`\`\``;

    const stories = parseStoriesFromAi(response);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.module).toBe('auth');
  });

  it('returns empty array for empty response', () => {
    expect(parseStoriesFromAi('')).toEqual([]);
    expect(parseStoriesFromAi('  ')).toEqual([]);
  });

  it('returns empty array for non-JSON response', () => {
    expect(parseStoriesFromAi('I cannot generate stories.')).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseStoriesFromAi('{"key": "value"}')).toEqual([]);
  });

  it('adds source: "discovery" to every story', () => {
    const json = JSON.stringify([
      {
        id: 'US-001',
        module: 'users',
        persona: 'admin',
        action: 'view users',
        expectedResult: 'Users shown',
        confidence: 'high',
        tier: 'smoke',
      },
      {
        id: 'US-002',
        module: 'users',
        persona: 'admin',
        action: 'create user',
        expectedResult: 'User created',
        confidence: 'medium',
        tier: 'regression',
      },
    ]);

    const stories = parseStoriesFromAi(json);
    expect(stories).toHaveLength(2);
    expect(stories.every((s) => s.source === 'discovery')).toBe(true);
  });

  it('filters out items missing required fields', () => {
    const json = JSON.stringify([
      {
        id: 'US-001',
        module: 'users',
        persona: 'admin',
        action: 'view users',
        expectedResult: 'Users shown',
        confidence: 'high',
        tier: 'smoke',
      },
      {
        id: 'US-002',
        // missing module
        persona: 'admin',
        action: 'do something',
        expectedResult: 'Something happens',
      },
      {
        id: 'US-003',
        module: 'users',
        persona: 'admin',
        action: '', // empty action
        expectedResult: 'Nothing',
      },
    ]);

    const stories = parseStoriesFromAi(json);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.id).toBe('US-001');
  });

  it('defaults confidence to "medium" for invalid values', () => {
    const json = JSON.stringify([
      {
        id: 'US-001',
        module: 'users',
        persona: 'admin',
        action: 'view users',
        expectedResult: 'Users shown',
        confidence: 'very-high',
        tier: 'smoke',
      },
    ]);

    const stories = parseStoriesFromAi(json);
    expect(stories[0]!.confidence).toBe('medium');
  });

  it('defaults tier to "regression" for invalid values', () => {
    const json = JSON.stringify([
      {
        id: 'US-001',
        module: 'users',
        persona: 'admin',
        action: 'view users',
        expectedResult: 'Users shown',
        confidence: 'high',
        tier: 'integration',
      },
    ]);

    const stories = parseStoriesFromAi(json);
    expect(stories[0]!.tier).toBe('regression');
  });

  it('handles JSON array embedded in prose text', () => {
    const response = `Sure, here are the stories: [{"id":"US-001","module":"auth","persona":"guest","action":"register","expectedResult":"Account created","confidence":"high","tier":"regression"}] Hope that helps!`;

    const stories = parseStoriesFromAi(response);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.action).toBe('register');
  });
});

describe('findExistingTests', () => {
  const tempDir = join(tmpdir(), `qastack-test-${Date.now()}`);
  const testDirName = 'tests';
  const testDirPath = join(tempDir, testDirName);

  beforeEach(() => {
    mkdirSync(testDirPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('finds .spec.ts and .test.ts files', () => {
    writeFileSync(join(testDirPath, 'auth.spec.ts'), '');
    writeFileSync(join(testDirPath, 'users.test.ts'), '');
    writeFileSync(join(testDirPath, 'not-a-test.ts'), '');

    const results = findExistingTests(tempDir, testDirName);
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.includes('auth.spec.ts'))).toBe(true);
    expect(results.some((r) => r.includes('users.test.ts'))).toBe(true);
  });

  it('finds tests in subdirectories', () => {
    const subDir = join(testDirPath, 'e2e');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'login.spec.ts'), '');

    const results = findExistingTests(tempDir, testDirName);
    expect(results).toHaveLength(1);
    expect(results[0]).toContain('login.spec.ts');
  });

  it('skips node_modules directories', () => {
    const nmDir = join(testDirPath, 'node_modules', 'pkg');
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, 'internal.test.ts'), '');
    writeFileSync(join(testDirPath, 'real.test.ts'), '');

    const results = findExistingTests(tempDir, testDirName);
    expect(results).toHaveLength(1);
    expect(results[0]).toContain('real.test.ts');
  });

  it('returns empty array when directory does not exist', () => {
    const results = findExistingTests(tempDir, 'nonexistent');
    expect(results).toEqual([]);
  });

  it('finds .spec.js and .test.js files', () => {
    writeFileSync(join(testDirPath, 'legacy.spec.js'), '');
    writeFileSync(join(testDirPath, 'compat.test.js'), '');

    const results = findExistingTests(tempDir, testDirName);
    expect(results).toHaveLength(2);
  });

  it('returns sorted paths', () => {
    writeFileSync(join(testDirPath, 'z-last.test.ts'), '');
    writeFileSync(join(testDirPath, 'a-first.test.ts'), '');

    const results = findExistingTests(tempDir, testDirName);
    expect(results[0]).toContain('a-first.test.ts');
    expect(results[1]).toContain('z-last.test.ts');
  });
});

describe('readReadme', () => {
  const tempDir = join(tmpdir(), `qastack-readme-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reads README.md', () => {
    writeFileSync(join(tempDir, 'README.md'), '# My Project\nDescription here.');
    const content = readReadme(tempDir);
    expect(content).toBe('# My Project\nDescription here.');
  });

  it('reads readme.md (lowercase)', () => {
    writeFileSync(join(tempDir, 'readme.md'), '# lowercase');
    const content = readReadme(tempDir);
    expect(content).toBe('# lowercase');
  });

  it('returns undefined when no README exists', () => {
    const content = readReadme(tempDir);
    expect(content).toBeUndefined();
  });
});
