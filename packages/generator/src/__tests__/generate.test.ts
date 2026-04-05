import { describe, it, expect } from 'vitest';
import { generateTests, getExtension } from '../generate.js';
import type { UserStory, Route } from '@qastack/core';

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: 'US-001',
    module: 'users',
    persona: 'admin',
    action: 'view user list',
    expectedResult: 'Table of users is shown',
    confidence: 'high',
    tier: 'smoke',
    source: 'discovery',
    ...overrides,
  };
}

describe('generateTests', () => {
  describe('runner-specific generation', () => {
    const runners = ['playwright', 'jest', 'pest', 'pytest', 'rspec'] as const;

    for (const runner of runners) {
      it(`generates tests for ${runner} runner`, () => {
        const results = generateTests({
          stories: [makeStory()],
          testRunner: runner,
          testDir: 'tests',
        });

        expect(results).toHaveLength(1);
        expect(results[0]!.code).toBeTruthy();
        expect(results[0]!.code.length).toBeGreaterThan(50);
        expect(results[0]!.story.id).toBe('US-001');
      });
    }

    it('generates playwright syntax for playwright runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'playwright',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain("import { test, expect } from '@playwright/test'");
      expect(results[0]!.code).toContain('test.describe(');
    });

    it('generates jest syntax for jest runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'jest',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain('describe(');
      expect(results[0]!.code).toContain('it(');
    });

    it('generates pest syntax for pest runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'pest',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain('<?php');
      expect(results[0]!.code).toContain('describe(');
      expect(results[0]!.code).toContain('$this->get(');
    });

    it('generates pytest syntax for pytest runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'pytest',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain('import pytest');
      expect(results[0]!.code).toContain('class Test');
      expect(results[0]!.code).toContain('@pytest.mark.');
    });

    it('generates rspec syntax for rspec runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'rspec',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain('RSpec.describe');
      expect(results[0]!.code).toContain("type: :feature");
    });

    it('falls back to playwright for unknown runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'unknown-runner',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain("import { test, expect } from '@playwright/test'");
    });
  });

  describe('route matching', () => {
    it('matches stories to routes for URL', () => {
      const routes: Route[] = [
        { method: 'GET', path: '/admin/users', name: 'users.index' },
        { method: 'POST', path: '/admin/users', name: 'users.store' },
        { method: 'GET', path: '/admin/invoices', name: 'invoices.index' },
      ];

      const results = generateTests({
        stories: [makeStory({ module: 'users' })],
        testRunner: 'playwright',
        testDir: 'tests',
        routes,
      });

      expect(results[0]!.code).toContain("page.goto('/admin/users'");
    });

    it('handles stories without matching routes (uses "/")', () => {
      const routes: Route[] = [
        { method: 'GET', path: '/admin/invoices', name: 'invoices.index' },
      ];

      const results = generateTests({
        stories: [makeStory({ module: 'users' })],
        testRunner: 'playwright',
        testDir: 'tests',
        routes,
      });

      expect(results[0]!.code).toContain("page.goto('/'");
    });

    it('handles undefined routes', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'playwright',
        testDir: 'tests',
      });

      expect(results[0]!.code).toContain("page.goto('/'");
    });

    it('only matches GET routes', () => {
      const routes: Route[] = [
        { method: 'POST', path: '/admin/users', name: 'users.store' },
        { method: 'DELETE', path: '/admin/users/1', name: 'users.destroy' },
      ];

      const results = generateTests({
        stories: [makeStory({ module: 'users' })],
        testRunner: 'playwright',
        testDir: 'tests',
        routes,
      });

      // No GET route matches, so should fall back to '/'
      expect(results[0]!.code).toContain("page.goto('/'");
    });
  });

  describe('file path generation', () => {
    it('generates correct file paths (testDir/module/file.spec.ext)', () => {
      const results = generateTests({
        stories: [makeStory({ module: 'users', action: 'view user list' })],
        testRunner: 'playwright',
        testDir: 'tests/e2e',
      });

      expect(results[0]!.filePath).toBe(
        'tests/e2e/users/users-view-user-list.spec.ts',
      );
    });

    it('generates .php extension for pest runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'pest',
        testDir: 'tests',
      });

      expect(results[0]!.filePath).toMatch(/\.spec\.php$/);
    });

    it('generates .py extension for pytest runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'pytest',
        testDir: 'tests',
      });

      expect(results[0]!.filePath).toMatch(/\.spec\.py$/);
    });

    it('generates .rb extension for rspec runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'rspec',
        testDir: 'tests',
      });

      expect(results[0]!.filePath).toMatch(/\.spec\.rb$/);
    });

    it('generates .ts extension for jest runner', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'jest',
        testDir: 'tests',
      });

      expect(results[0]!.filePath).toMatch(/\.spec\.ts$/);
    });

    it('slugifies the action in the file name', () => {
      const results = generateTests({
        stories: [makeStory({ action: 'Create New User & Assign Role' })],
        testRunner: 'playwright',
        testDir: 'tests',
      });

      expect(results[0]!.filePath).toContain('create-new-user-assign-role');
    });
  });

  describe('module merging', () => {
    it('merges multiple stories per module into one file', () => {
      const stories: UserStory[] = [
        makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
        makeStory({ id: 'US-002', module: 'users', action: 'create new user' }),
      ];

      const results = generateTests({
        stories,
        testRunner: 'playwright',
        testDir: 'tests/e2e',
      });

      // Should produce 1 merged file instead of 2
      expect(results).toHaveLength(1);
      expect(results[0]!.filePath).toContain('users/users.spec.ts');
    });

    it('merged file contains all story test cases', () => {
      const stories: UserStory[] = [
        makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
        makeStory({ id: 'US-002', module: 'users', action: 'create new user' }),
      ];

      const results = generateTests({
        stories,
        testRunner: 'playwright',
        testDir: 'tests/e2e',
      });

      expect(results[0]!.code).toContain('US-001');
      expect(results[0]!.code).toContain('US-002');
      expect(results[0]!.code).toContain('view user list');
      expect(results[0]!.code).toContain('create new user');
    });

    it('keeps separate files for different modules', () => {
      const stories: UserStory[] = [
        makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
        makeStory({ id: 'US-002', module: 'invoices', action: 'view invoice list' }),
      ];

      const results = generateTests({
        stories,
        testRunner: 'playwright',
        testDir: 'tests/e2e',
      });

      expect(results).toHaveLength(2);
      const modules = results.map((r) => r.story.module);
      expect(modules).toContain('users');
      expect(modules).toContain('invoices');
    });

    it('does not merge when only one story per module', () => {
      const results = generateTests({
        stories: [makeStory()],
        testRunner: 'playwright',
        testDir: 'tests/e2e',
      });

      expect(results).toHaveLength(1);
      // Should keep the action-specific file name
      expect(results[0]!.filePath).toContain('users-view-user-list');
    });

    it('merges pest tests into one describe block', () => {
      const stories: UserStory[] = [
        makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
        makeStory({ id: 'US-002', module: 'users', action: 'create new user' }),
      ];

      const results = generateTests({
        stories,
        testRunner: 'pest',
        testDir: 'tests',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toContain('<?php');
      expect(results[0]!.code).toContain('US-001');
      expect(results[0]!.code).toContain('US-002');
    });

    it('merges pytest tests into one class', () => {
      const stories: UserStory[] = [
        makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
        makeStory({ id: 'US-002', module: 'users', action: 'create new user' }),
      ];

      const results = generateTests({
        stories,
        testRunner: 'pytest',
        testDir: 'tests',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toContain('class TestUsers');
      expect(results[0]!.code).toContain('test_us_001');
      expect(results[0]!.code).toContain('test_us_002');
    });

    it('merges rspec tests into one describe block', () => {
      const stories: UserStory[] = [
        makeStory({ id: 'US-001', module: 'users', action: 'view user list' }),
        makeStory({ id: 'US-002', module: 'users', action: 'create new user' }),
      ];

      const results = generateTests({
        stories,
        testRunner: 'rspec',
        testDir: 'tests',
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toContain('RSpec.describe');
      expect(results[0]!.code).toContain('US-001');
      expect(results[0]!.code).toContain('US-002');
    });
  });

  describe('empty input', () => {
    it('returns empty array for empty stories', () => {
      const results = generateTests({
        stories: [],
        testRunner: 'playwright',
        testDir: 'tests',
      });

      expect(results).toEqual([]);
    });
  });
});

describe('getExtension', () => {
  it('returns ts for playwright', () => expect(getExtension('playwright')).toBe('ts'));
  it('returns ts for jest', () => expect(getExtension('jest')).toBe('ts'));
  it('returns php for pest', () => expect(getExtension('pest')).toBe('php'));
  it('returns py for pytest', () => expect(getExtension('pytest')).toBe('py'));
  it('returns rb for rspec', () => expect(getExtension('rspec')).toBe('rb'));
  it('returns ts for unknown', () => expect(getExtension('unknown')).toBe('ts'));
});
