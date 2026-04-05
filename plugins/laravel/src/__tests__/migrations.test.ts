import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMigrationFile } from '../scanners/migrations.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('migration scanner', () => {
  const content = loadFixture('2024_01_01_create_users_table.php');
  const tables = parseMigrationFile(content);

  it('extracts table name from Schema::create', () => {
    expect(tables).toHaveLength(1);
    expect(tables[0]?.name).toBe('users');
  });

  it('extracts the id column', () => {
    const idField = tables[0]?.fields.find((f) => f.name === 'id');
    expect(idField).toBeDefined();
    expect(idField?.type).toBe('bigInteger');
    expect(idField?.nullable).toBe(false);
  });

  it('extracts string columns', () => {
    const nameField = tables[0]?.fields.find((f) => f.name === 'name');
    expect(nameField).toBeDefined();
    expect(nameField?.type).toBe('string');
    expect(nameField?.nullable).toBe(false);

    const emailField = tables[0]?.fields.find((f) => f.name === 'email');
    expect(emailField).toBeDefined();
    expect(emailField?.type).toBe('string');
  });

  it('detects nullable columns', () => {
    const verifiedAt = tables[0]?.fields.find(
      (f) => f.name === 'email_verified_at',
    );
    expect(verifiedAt).toBeDefined();
    expect(verifiedAt?.nullable).toBe(true);
    expect(verifiedAt?.type).toBe('timestamp');
  });

  it('extracts foreignId columns', () => {
    const roleId = tables[0]?.fields.find((f) => f.name === 'role_id');
    expect(roleId).toBeDefined();
    expect(roleId?.type).toBe('bigInteger');
    expect(roleId?.nullable).toBe(false);
  });

  it('extracts boolean columns', () => {
    const isActive = tables[0]?.fields.find((f) => f.name === 'is_active');
    expect(isActive).toBeDefined();
    expect(isActive?.type).toBe('boolean');
    expect(isActive?.nullable).toBe(false);
  });

  it('handles timestamps() expansion', () => {
    const createdAt = tables[0]?.fields.find((f) => f.name === 'created_at');
    const updatedAt = tables[0]?.fields.find((f) => f.name === 'updated_at');
    expect(createdAt).toBeDefined();
    expect(createdAt?.type).toBe('timestamp');
    expect(createdAt?.nullable).toBe(true);
    expect(updatedAt).toBeDefined();
    expect(updatedAt?.type).toBe('timestamp');
    expect(updatedAt?.nullable).toBe(true);
  });

  it('handles softDeletes() expansion', () => {
    const deletedAt = tables[0]?.fields.find((f) => f.name === 'deleted_at');
    expect(deletedAt).toBeDefined();
    expect(deletedAt?.type).toBe('timestamp');
    expect(deletedAt?.nullable).toBe(true);
  });

  it('extracts all expected columns', () => {
    const fieldNames = tables[0]?.fields.map((f) => f.name) ?? [];
    expect(fieldNames).toContain('id');
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('email');
    expect(fieldNames).toContain('email_verified_at');
    expect(fieldNames).toContain('password');
    expect(fieldNames).toContain('role_id');
    expect(fieldNames).toContain('is_active');
    expect(fieldNames).toContain('created_at');
    expect(fieldNames).toContain('updated_at');
    expect(fieldNames).toContain('deleted_at');
  });

  it('handles common column types: id, string, timestamp, foreignId, boolean', () => {
    const fields = tables[0]?.fields ?? [];
    const types = new Set(fields.map((f) => f.type));
    expect(types).toContain('bigInteger'); // id, foreignId
    expect(types).toContain('string'); // name, email, password
    expect(types).toContain('timestamp'); // email_verified_at, timestamps, softDeletes
    expect(types).toContain('boolean'); // is_active
  });
});

describe('migration scanner edge cases', () => {
  it('returns empty array for non-migration content', () => {
    const content = '<?php\n// not a migration\n';
    expect(parseMigrationFile(content)).toEqual([]);
  });

  it('handles migration with text and integer columns', () => {
    const content = `<?php
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('articles', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('body');
            $table->integer('view_count');
            $table->timestamps();
        });
    }
};`;
    const tables = parseMigrationFile(content);
    expect(tables).toHaveLength(1);
    expect(tables[0]?.name).toBe('articles');

    const body = tables[0]?.fields.find((f) => f.name === 'body');
    expect(body?.type).toBe('text');

    const viewCount = tables[0]?.fields.find((f) => f.name === 'view_count');
    expect(viewCount?.type).toBe('integer');
  });

  it('handles multiple Schema::create in one file', () => {
    const content = `<?php
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->string('name');
        });

        Schema::create('taggables', function (Blueprint $table) {
            $table->foreignId('tag_id');
            $table->foreignId('taggable_id');
            $table->string('taggable_type');
        });
    }
};`;
    const tables = parseMigrationFile(content);
    expect(tables).toHaveLength(2);
    expect(tables[0]?.name).toBe('tags');
    expect(tables[1]?.name).toBe('taggables');
  });
});
