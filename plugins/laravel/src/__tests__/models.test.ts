import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModelFile, inferTableName } from '../scanners/models.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('model scanner', () => {
  const content = loadFixture('User.php');
  const model = parseModelFile(content);

  it('extracts class name', () => {
    expect(model).not.toBeNull();
    expect(model?.name).toBe('User');
  });

  it('extracts table name from $table property', () => {
    expect(model?.table).toBe('users');
  });

  it('extracts fillable fields', () => {
    expect(model?.fields).toHaveLength(4);
    const fieldNames = model?.fields.map((f) => f.name);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('email');
    expect(fieldNames).toContain('password');
    expect(fieldNames).toContain('phone');
  });

  it('extracts hasMany relationship', () => {
    const postsRel = model?.relationships.find((r) => r.related === 'Post');
    expect(postsRel).toBeDefined();
    expect(postsRel?.type).toBe('hasMany');
  });

  it('extracts hasOne relationship', () => {
    const profileRel = model?.relationships.find(
      (r) => r.related === 'Profile',
    );
    expect(profileRel).toBeDefined();
    expect(profileRel?.type).toBe('hasOne');
  });

  it('extracts belongsToMany relationship', () => {
    const rolesRel = model?.relationships.find((r) => r.related === 'Role');
    expect(rolesRel).toBeDefined();
    expect(rolesRel?.type).toBe('belongsToMany');
  });

  it('extracts all three relationships', () => {
    expect(model?.relationships).toHaveLength(3);
  });
});

describe('inferTableName', () => {
  it('converts PascalCase to snake_case plural', () => {
    expect(inferTableName('User')).toBe('users');
  });

  it('handles multi-word class names', () => {
    expect(inferTableName('UserProfile')).toBe('user_profiles');
  });

  it('handles class names ending in y', () => {
    expect(inferTableName('Category')).toBe('categories');
  });

  it('handles class names ending in s', () => {
    expect(inferTableName('Address')).toBe('addresses');
  });

  it('handles simple singular names', () => {
    expect(inferTableName('Post')).toBe('posts');
    expect(inferTableName('Comment')).toBe('comments');
  });
});

describe('model scanner edge cases', () => {
  it('returns null for non-model PHP content', () => {
    const content = '<?php\n$x = 1;\n';
    expect(parseModelFile(content)).toBeNull();
  });

  it('infers table name when $table is not set', () => {
    const content = `<?php
namespace App\\Models;
use Illuminate\\Database\\Eloquent\\Model;

class Product extends Model
{
    protected $fillable = ['name', 'price'];
}`;
    const model = parseModelFile(content);
    expect(model).not.toBeNull();
    expect(model?.name).toBe('Product');
    expect(model?.table).toBe('products');
  });

  it('handles model with no fillable fields', () => {
    const content = `<?php
namespace App\\Models;
use Illuminate\\Database\\Eloquent\\Model;

class Setting extends Model
{
}`;
    const model = parseModelFile(content);
    expect(model).not.toBeNull();
    expect(model?.name).toBe('Setting');
    expect(model?.fields).toEqual([]);
  });

  it('handles model with no relationships', () => {
    const content = `<?php
namespace App\\Models;
use Illuminate\\Database\\Eloquent\\Model;

class Tag extends Model
{
    protected $fillable = ['name'];
}`;
    const model = parseModelFile(content);
    expect(model?.relationships).toEqual([]);
  });
});
