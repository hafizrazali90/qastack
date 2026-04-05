import { describe, it, expect } from 'vitest';
import { buildDiscoveryPrompt, type DiscoveryContext } from '../prompts.js';

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

describe('buildDiscoveryPrompt', () => {
  it('includes project name and framework', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({ projectName: 'my-app', framework: 'nextjs' }),
    );
    expect(prompt).toContain('nextjs');
    expect(prompt).toContain('"my-app"');
  });

  it('includes routes in the prompt', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({
        routes: [
          { method: 'GET', path: '/users', name: 'users.index', controller: 'UserController@index' },
          { method: 'POST', path: '/users', name: 'users.store' },
        ],
      }),
    );
    expect(prompt).toContain('Routes Found (2)');
    expect(prompt).toContain('GET /users');
    expect(prompt).toContain('POST /users');
    expect(prompt).toContain('users.index');
    expect(prompt).toContain('UserController@index');
  });

  it('includes models with fields and relationships', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', type: 'integer', nullable: false },
              { name: 'email', type: 'string', nullable: false },
              { name: 'phone', type: 'string', nullable: true },
            ],
            relationships: [
              { type: 'hasMany', related: 'Post' },
            ],
          },
        ],
      }),
    );
    expect(prompt).toContain('Data Models (1)');
    expect(prompt).toContain('User');
    expect(prompt).toContain('id: integer');
    expect(prompt).toContain('phone: string?');
    expect(prompt).toContain('hasMany(Post)');
  });

  it('includes page components', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({
        components: [
          { name: 'UserList', filePath: 'pages/users/index.tsx', type: 'page' },
          { name: 'Button', filePath: 'components/Button.tsx', type: 'component' },
        ],
      }),
    );
    expect(prompt).toContain('UI Components (2)');
    expect(prompt).toContain('Page: UserList');
    // Should not list non-page components as pages
    expect(prompt).not.toContain('Page: Button');
  });

  it('includes database tables', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({
        schema: {
          tables: [
            {
              name: 'users',
              fields: [
                { name: 'id', type: 'integer', nullable: false },
                { name: 'name', type: 'varchar', nullable: false },
              ],
            },
          ],
        },
      }),
    );
    expect(prompt).toContain('Database Tables (1)');
    expect(prompt).toContain('users (id, name)');
  });

  it('includes existing test count', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({
        existingTests: ['tests/auth.spec.ts', 'tests/users.spec.ts'],
      }),
    );
    expect(prompt).toContain('2 test files already exist');
    expect(prompt).toContain('tests/auth.spec.ts');
  });

  it('includes README content when provided', () => {
    const prompt = buildDiscoveryPrompt(
      makeContext({ readmeContent: '# My App\nA great application.' }),
    );
    expect(prompt).toContain('## README Content');
    expect(prompt).toContain('A great application');
  });

  it('omits README section when not provided', () => {
    const prompt = buildDiscoveryPrompt(makeContext());
    expect(prompt).not.toContain('## README Content');
  });

  it('handles completely empty context gracefully', () => {
    const prompt = buildDiscoveryPrompt(makeContext());
    expect(prompt).toContain('Routes Found (0)');
    expect(prompt).toContain('Data Models (0)');
    expect(prompt).toContain('None found');
    expect(prompt).toContain('No existing tests.');
    // Should still contain instructions
    expect(prompt).toContain('Generate user stories');
  });

  it('limits existing tests display to 20', () => {
    const tests = Array.from({ length: 30 }, (_, i) => `tests/test-${i}.spec.ts`);
    const prompt = buildDiscoveryPrompt(makeContext({ existingTests: tests }));
    expect(prompt).toContain('30 test files already exist');
    // Should show first 20, not all 30
    expect(prompt).toContain('tests/test-0.spec.ts');
    expect(prompt).toContain('tests/test-19.spec.ts');
    expect(prompt).not.toContain('tests/test-20.spec.ts');
  });

  it('includes JSON format instructions', () => {
    const prompt = buildDiscoveryPrompt(makeContext());
    expect(prompt).toContain('"id": "US-001"');
    expect(prompt).toContain('"module"');
    expect(prompt).toContain('"persona"');
    expect(prompt).toContain('"action"');
    expect(prompt).toContain('"expectedResult"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"tier"');
  });
});
