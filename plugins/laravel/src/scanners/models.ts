import type { Model, Field, Relationship } from '@qastack/core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Match "class User extends Model" or "class User extends Authenticatable"
 * (Authenticatable also extends Model in Laravel).
 */
const CLASS_REGEX = /class\s+(\w+)\s+extends\s+\w+/;

/**
 * Match protected $table = 'users';
 */
const TABLE_REGEX = /protected\s+\$table\s*=\s*['"](\w+)['"]/;

/**
 * Match protected $fillable = ['name', 'email', ...];
 * Supports both single-line and multi-line declarations.
 */
const FILLABLE_REGEX = /protected\s+\$fillable\s*=\s*\[([\s\S]*?)\]/;

/**
 * Match relationship methods:
 *   public function posts(): HasMany { return $this->hasMany(Post::class); }
 */
const RELATIONSHIP_REGEX =
  /public\s+function\s+\w+\(\):\s*(HasMany|HasOne|BelongsTo|BelongsToMany)\s*\{[^}]*\$this->(hasMany|hasOne|belongsTo|belongsToMany)\(\s*(\w+)::class/g;

/**
 * Infer the table name from a class name using Laravel's convention:
 * PascalCase -> snake_case + plural.
 * e.g. "UserProfile" -> "user_profiles"
 */
export function inferTableName(className: string): string {
  // Convert PascalCase to snake_case
  const snake = className
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');

  // Simple pluralize: add 's' (handles most common cases)
  // Special cases: ends in 'y' -> 'ies', ends in 's' -> 'ses'
  if (snake.endsWith('y')) {
    return snake.slice(0, -1) + 'ies';
  }
  if (
    snake.endsWith('s') ||
    snake.endsWith('x') ||
    snake.endsWith('ch') ||
    snake.endsWith('sh')
  ) {
    return snake + 'es';
  }
  return snake + 's';
}

/**
 * Parse a single Eloquent model file.
 */
export function parseModelFile(content: string): Model | null {
  const classMatch = CLASS_REGEX.exec(content);
  if (!classMatch) return null;

  const className = classMatch[1] ?? '';
  if (!className) return null;

  // Extract table name or infer from class name
  const tableMatch = TABLE_REGEX.exec(content);
  const table = tableMatch?.[1] ?? inferTableName(className);

  // Extract fillable fields
  const fillableMatch = FILLABLE_REGEX.exec(content);
  const fields: Field[] = [];
  if (fillableMatch?.[1]) {
    const fieldNames = fillableMatch[1]
      .split(',')
      .map((f) => f.trim().replace(/['"]/g, ''))
      .filter(Boolean);
    for (const name of fieldNames) {
      fields.push({ name, type: 'string', nullable: false });
    }
  }

  // Extract relationships
  const relationships: Relationship[] = [];
  RELATIONSHIP_REGEX.lastIndex = 0;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = RELATIONSHIP_REGEX.exec(content)) !== null) {
    const relType = relMatch[2] as Relationship['type'];
    const related = relMatch[3] ?? '';
    if (relType && related) {
      relationships.push({ type: relType, related });
    }
  }

  return {
    name: className,
    table,
    fields,
    relationships,
  };
}

/**
 * Scan a Laravel project for Eloquent model files.
 * Reads app/Models/*.php.
 */
export function scanModels(projectRoot: string): Model[] {
  const modelsDir = join(projectRoot, 'app', 'Models');
  if (!existsSync(modelsDir)) return [];

  const models: Model[] = [];
  const files = readdirSync(modelsDir).filter((f) => f.endsWith('.php'));

  for (const file of files) {
    const filePath = join(modelsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const model = parseModelFile(content);
    if (model) models.push(model);
  }

  return models;
}
