import type { DatabaseSchema, SchemaTable, Field } from '@qastack/core';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Match Schema::create('table_name', function (Blueprint $table) { ... });
 * Captures table name and body.
 */
const SCHEMA_CREATE_REGEX =
  /Schema::create\(\s*['"](\w+)['"].*?function\s*\(Blueprint\s+\$\w+\)\s*\{([\s\S]*?)\}\s*\)/g;

/**
 * Match column definitions like:
 *   $table->string('name');
 *   $table->string('email')->unique();
 *   $table->timestamp('email_verified_at')->nullable();
 *   $table->id();
 *   $table->timestamps();
 *   $table->softDeletes();
 *   $table->foreignId('role_id')->constrained();
 *   $table->boolean('is_active')->default(true);
 */
const COLUMN_REGEX =
  /\$\w+->(id|string|text|integer|bigInteger|smallInteger|tinyInteger|boolean|float|double|decimal|date|datetime|timestamp|time|json|jsonb|uuid|foreignId|unsignedBigInteger|unsignedInteger|enum|binary|char|mediumText|longText)\(\s*(?:['"](\w+)['"])?\s*(?:,\s*[^)]*?)?\)/g;

/**
 * Match ->nullable() modifier on a line
 */
const NULLABLE_REGEX = /->nullable\(\)/;

/**
 * Match $table->timestamps() — expands to created_at and updated_at
 */
const TIMESTAMPS_REGEX = /\$\w+->timestamps\(\)/;

/**
 * Match $table->softDeletes() — expands to deleted_at
 */
const SOFT_DELETES_REGEX = /\$\w+->softDeletes\(\)/;

/**
 * Map Laravel column types to simplified type names.
 */
function mapColumnType(laravelType: string): string {
  const typeMap: Record<string, string> = {
    id: 'bigInteger',
    string: 'string',
    text: 'text',
    mediumText: 'text',
    longText: 'text',
    integer: 'integer',
    bigInteger: 'bigInteger',
    smallInteger: 'integer',
    tinyInteger: 'integer',
    boolean: 'boolean',
    float: 'float',
    double: 'double',
    decimal: 'decimal',
    date: 'date',
    datetime: 'datetime',
    timestamp: 'timestamp',
    time: 'time',
    json: 'json',
    jsonb: 'json',
    uuid: 'uuid',
    foreignId: 'bigInteger',
    unsignedBigInteger: 'bigInteger',
    unsignedInteger: 'integer',
    enum: 'enum',
    binary: 'binary',
    char: 'string',
  };
  return typeMap[laravelType] ?? laravelType;
}

/**
 * Parse a single migration file body (the Schema::create block body).
 */
function parseSchemaBody(body: string): Field[] {
  const fields: Field[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    // Check for timestamps()
    if (TIMESTAMPS_REGEX.test(line)) {
      fields.push(
        { name: 'created_at', type: 'timestamp', nullable: true },
        { name: 'updated_at', type: 'timestamp', nullable: true },
      );
      continue;
    }

    // Check for softDeletes()
    if (SOFT_DELETES_REGEX.test(line)) {
      fields.push({ name: 'deleted_at', type: 'timestamp', nullable: true });
      continue;
    }

    // Check for column definitions
    COLUMN_REGEX.lastIndex = 0;
    const colMatch = COLUMN_REGEX.exec(line);
    if (colMatch) {
      const laravelType = colMatch[1] ?? '';
      const columnName = colMatch[2];
      const nullable = NULLABLE_REGEX.test(line);

      if (laravelType === 'id') {
        // $table->id() creates an auto-incrementing 'id' column
        fields.push({ name: 'id', type: 'bigInteger', nullable: false });
      } else if (columnName) {
        fields.push({
          name: columnName,
          type: mapColumnType(laravelType),
          nullable,
        });
      }
    }
  }

  return fields;
}

/**
 * Parse a migration file and return table schemas found.
 */
export function parseMigrationFile(content: string): SchemaTable[] {
  const tables: SchemaTable[] = [];

  SCHEMA_CREATE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCHEMA_CREATE_REGEX.exec(content)) !== null) {
    const tableName = match[1] ?? '';
    const body = match[2] ?? '';
    if (tableName) {
      tables.push({
        name: tableName,
        fields: parseSchemaBody(body),
      });
    }
  }

  return tables;
}

/**
 * Scan a Laravel project for migration files.
 * Reads database/migrations/*.php.
 */
export function scanMigrations(projectRoot: string): DatabaseSchema {
  const migrationsDir = join(projectRoot, 'database', 'migrations');
  if (!existsSync(migrationsDir)) return { tables: [] };

  const tables: SchemaTable[] = [];
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.php'))
    .sort(); // Sort by filename (timestamp-prefixed) for ordering

  for (const file of files) {
    const filePath = join(migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    tables.push(...parseMigrationFile(content));
  }

  return { tables };
}
