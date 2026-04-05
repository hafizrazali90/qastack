import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFramework, loadPlugin } from '../plugin-loader.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'qastack-test-'));
}

describe('detectFramework', () => {
  it('returns "generic" for empty directory', async () => {
    const dir = makeTempDir();
    try {
      const result = await detectFramework(dir);
      expect(result).toBe('generic');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "laravel" when composer.json has laravel/framework', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'composer.json'),
        JSON.stringify({
          require: { 'laravel/framework': '^11.0' },
        }),
      );
      const result = await detectFramework(dir);
      expect(result).toBe('laravel');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "nextjs" when package.json has next', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
        }),
      );
      const result = await detectFramework(dir);
      expect(result).toBe('nextjs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "express" when package.json has express', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          dependencies: { express: '^4.18.0' },
        }),
      );
      const result = await detectFramework(dir);
      expect(result).toBe('express');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "django" when manage.py exists', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'manage.py'), '#!/usr/bin/env python');
      const result = await detectFramework(dir);
      expect(result).toBe('django');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "rails" when Gemfile contains rails', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'Gemfile'),
        "source 'https://rubygems.org'\ngem 'rails', '~> 7.0'\n",
      );
      const result = await detectFramework(dir);
      expect(result).toBe('rails');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prioritizes laravel over nextjs when both exist', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'composer.json'),
        JSON.stringify({
          require: { 'laravel/framework': '^11.0' },
        }),
      );
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          dependencies: { next: '^14.0.0' },
        }),
      );
      const result = await detectFramework(dir);
      expect(result).toBe('laravel');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('loadPlugin', () => {
  it('throws for unknown plugin name', async () => {
    const dir = makeTempDir();
    try {
      await expect(
        loadPlugin('nonexistent-framework-xyz', dir),
      ).rejects.toThrow('Plugin "nonexistent-framework-xyz" not found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
