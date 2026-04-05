import { describe, it, expect } from 'vitest';
import type { UserStory } from '@qastack/core';
import { generateReport } from '../report.js';
import type { DiscoveryContext } from '../prompts.js';

function makeContext(
  overrides: Partial<DiscoveryContext> = {},
): DiscoveryContext {
  return {
    projectName: 'test-app',
    framework: 'laravel',
    routes: [],
    models: [],
    components: [],
    schema: { tables: [] },
    existingTests: [],
    ...overrides,
  };
}

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: 'US-001',
    module: 'users',
    persona: 'admin',
    action: 'view user list',
    expectedResult: 'Table of users is displayed',
    confidence: 'high',
    tier: 'smoke',
    source: 'discovery',
    ...overrides,
  };
}

describe('generateReport', () => {
  it('generates valid markdown with title', () => {
    const report = generateReport(makeContext(), []);
    expect(report).toContain('# Discovery Report');
    expect(report).toContain('test-app');
  });

  it('includes the generation date', () => {
    const report = generateReport(makeContext(), []);
    const today = new Date().toISOString().split('T')[0];
    expect(report).toContain(`Generated: ${today}`);
  });

  it('includes detected stack info', () => {
    const context = makeContext({
      framework: 'nextjs',
      routes: [
        { method: 'GET', path: '/api/users' },
        { method: 'POST', path: '/api/users' },
      ],
      models: [
        { name: 'User', fields: [], relationships: [] },
      ],
      components: [
        { name: 'UserList', filePath: 'pages/users.tsx', type: 'page' },
        { name: 'Button', filePath: 'components/Button.tsx', type: 'component' },
      ],
      existingTests: ['tests/auth.spec.ts'],
    });

    const report = generateReport(context, []);
    expect(report).toContain('Framework: nextjs');
    expect(report).toContain('Routes: 2 found');
    expect(report).toContain('Models: 1 found');
    expect(report).toContain('Components: 2 found');
    expect(report).toContain('Existing tests: 1 files');
  });

  it('groups stories by module', () => {
    const stories: UserStory[] = [
      makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
      makeStory({ id: 'US-002', module: 'users', action: 'create a new user' }),
      makeStory({ id: 'US-003', module: 'posts', action: 'view all posts' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('### users');
    expect(report).toContain('### posts');
    expect(report).toContain('User Stories (2)');
    expect(report).toContain('User Stories (1)');
  });

  it('shows confidence and tier badges', () => {
    const stories: UserStory[] = [
      makeStory({ confidence: 'high', tier: 'smoke' }),
      makeStory({ id: 'US-002', module: 'auth', confidence: 'low', tier: 'uat' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('[high]');
    expect(report).toContain('[smoke]');
    expect(report).toContain('[low]');
    expect(report).toContain('[uat]');
  });

  it('shows persona and action in story text', () => {
    const stories: UserStory[] = [
      makeStory({ persona: 'guest', action: 'register a new account' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('As a guest, I can register a new account');
  });

  it('includes expected result for each story', () => {
    const stories: UserStory[] = [
      makeStory({ expectedResult: 'Dashboard shows welcome message' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('Expected: Dashboard shows welcome message');
  });

  it('includes summary statistics', () => {
    const stories: UserStory[] = [
      makeStory({ id: 'US-001', confidence: 'high' }),
      makeStory({ id: 'US-002', confidence: 'medium' }),
      makeStory({ id: 'US-003', confidence: 'low' }),
      makeStory({ id: 'US-004', confidence: 'high' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('Total stories: 4');
    expect(report).toContain('High confidence: 2');
    expect(report).toContain('Medium confidence: 1');
    expect(report).toContain('Low confidence: 1');
  });

  it('shows module routes when available', () => {
    const context = makeContext({
      routes: [
        { method: 'GET', path: '/users' },
        { method: 'POST', path: '/users' },
        { method: 'GET', path: '/posts' },
      ],
    });
    const stories: UserStory[] = [
      makeStory({ module: 'users' }),
    ];

    const report = generateReport(context, stories);
    expect(report).toContain('GET /users');
    expect(report).toContain('POST /users');
  });

  it('shows "inferred" when module has no matching routes', () => {
    const stories: UserStory[] = [
      makeStory({ module: 'settings' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('Routes: inferred');
  });

  it('handles empty stories array', () => {
    const report = generateReport(makeContext(), []);
    expect(report).toContain('Modules Found (0)');
    expect(report).toContain('Total stories: 0');
  });

  it('shows module count in header', () => {
    const stories: UserStory[] = [
      makeStory({ module: 'users' }),
      makeStory({ id: 'US-002', module: 'posts' }),
      makeStory({ id: 'US-003', module: 'auth' }),
    ];

    const report = generateReport(makeContext(), stories);
    expect(report).toContain('Modules Found (3)');
  });
});
