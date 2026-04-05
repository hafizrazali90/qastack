import type { Model, Field, Relationship } from '@qastack/core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Match a `model ModelName { ... }` block in a Prisma schema.
 * Uses non-greedy matching on the body.
 */
const MODEL_REGEX = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;

/**
 * Prisma scalar types that map to database columns.
 */
const PRISMA_SCALAR_TYPES = new Set([
  'String',
  'Int',
  'Float',
  'Boolean',
  'DateTime',
  'BigInt',
  'Decimal',
  'Json',
  'Bytes',
]);

/**
 * Parse a single field line from a Prisma model body.
 *
 * Field lines look like:
 *   id        Int      @id @default(autoincrement())
 *   email     String   @unique
 *   name      String?
 *   posts     Post[]
 *   role      Role     @relation(fields: [roleId], references: [id])
 *   createdAt DateTime @default(now())
 */
interface ParsedField {
  field?: Field;
  relationship?: Relationship;
}

function parseFieldLine(line: string): ParsedField | null {
  const trimmed = line.trim();

  // Skip empty lines, comments, and block attributes (@@)
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
    return null;
  }

  // Split into tokens: fieldName Type modifiers...
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null;

  const fieldName = tokens[0] ?? '';
  const rawType = tokens[1] ?? '';

  // Skip if field name looks like a directive
  if (fieldName.startsWith('@') || fieldName.startsWith('@@')) return null;

  // Check if the type is nullable (ends with ?)
  const nullable = rawType.endsWith('?');
  // Check if the type is an array (ends with [])
  const isArray = rawType.endsWith('[]');
  // Clean the type: remove ? and []
  const cleanType = rawType.replace(/\?$/, '').replace(/\[\]$/, '');

  // If it's a scalar type, it's a field
  if (PRISMA_SCALAR_TYPES.has(cleanType)) {
    return {
      field: {
        name: fieldName,
        type: cleanType,
        nullable,
      },
    };
  }

  // If it's an array type (Post[]), it's a hasMany relationship
  if (isArray) {
    return {
      relationship: {
        type: 'hasMany',
        related: cleanType,
      },
    };
  }

  // If the line contains @relation, it's a belongsTo relationship
  if (trimmed.includes('@relation')) {
    // Extract foreignKey from @relation(fields: [fieldName], ...)
    const relationMatch = /@relation\(\s*fields:\s*\[(\w+)\]/.exec(trimmed);
    const foreignKey = relationMatch?.[1];

    return {
      relationship: {
        type: 'belongsTo',
        related: cleanType,
        foreignKey,
      },
    };
  }

  // If it's a non-scalar, non-array type without @relation, it's a hasOne
  // (e.g., profile Profile?)
  if (!PRISMA_SCALAR_TYPES.has(cleanType) && /^[A-Z]/.test(cleanType)) {
    return {
      relationship: {
        type: 'hasOne',
        related: cleanType,
      },
    };
  }

  return null;
}

/**
 * Parse a Prisma model block body and return fields and relationships.
 */
function parseModelBody(body: string): {
  fields: Field[];
  relationships: Relationship[];
} {
  const fields: Field[] = [];
  const relationships: Relationship[] = [];

  const lines = body.split('\n');
  for (const line of lines) {
    const parsed = parseFieldLine(line);
    if (!parsed) continue;
    if (parsed.field) fields.push(parsed.field);
    if (parsed.relationship) relationships.push(parsed.relationship);
  }

  return { fields, relationships };
}

/**
 * Parse a Prisma schema string and extract all models.
 */
export function parsePrismaSchema(content: string): Model[] {
  const models: Model[] = [];

  MODEL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MODEL_REGEX.exec(content)) !== null) {
    const modelName = match[1] ?? '';
    const body = match[2] ?? '';
    if (!modelName) continue;

    const { fields, relationships } = parseModelBody(body);

    models.push({
      name: modelName,
      // Prisma convention: table name = model name (not pluralized by default)
      // but Prisma's @@map can override. We use lowercase + 's' as a common convention.
      table: modelName.charAt(0).toLowerCase() + modelName.slice(1) + 's',
      fields,
      relationships,
    });
  }

  return models;
}

/**
 * Scan a Next.js project for Prisma schema and extract models.
 * Looks for prisma/schema.prisma.
 */
export function scanPrismaSchema(projectRoot: string): Model[] {
  const schemaPath = join(projectRoot, 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) return [];

  const content = readFileSync(schemaPath, 'utf-8');
  return parsePrismaSchema(content);
}
