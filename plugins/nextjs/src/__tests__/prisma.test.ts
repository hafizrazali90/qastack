import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePrismaSchema } from '../scanners/prisma.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('Prisma schema scanner', () => {
  const content = loadFixture('schema.prisma');
  const models = parsePrismaSchema(content);

  it('extracts all model names', () => {
    const names = models.map((m) => m.name);
    expect(names).toContain('User');
    expect(names).toContain('Post');
    expect(names).toContain('Profile');
    expect(models).toHaveLength(3);
  });

  it('extracts fields with correct types', () => {
    const user = models.find((m) => m.name === 'User');
    expect(user).toBeDefined();

    const emailField = user?.fields.find((f) => f.name === 'email');
    expect(emailField).toBeDefined();
    expect(emailField?.type).toBe('String');
    expect(emailField?.nullable).toBe(false);

    const idField = user?.fields.find((f) => f.name === 'id');
    expect(idField).toBeDefined();
    expect(idField?.type).toBe('Int');
  });

  it('detects nullable fields (String?)', () => {
    const user = models.find((m) => m.name === 'User');
    const nameField = user?.fields.find((f) => f.name === 'name');
    expect(nameField).toBeDefined();
    expect(nameField?.type).toBe('String');
    expect(nameField?.nullable).toBe(true);
  });

  it('detects non-nullable fields', () => {
    const user = models.find((m) => m.name === 'User');
    const emailField = user?.fields.find((f) => f.name === 'email');
    expect(emailField?.nullable).toBe(false);
  });

  it('extracts hasMany relationships (Post[])', () => {
    const user = models.find((m) => m.name === 'User');
    const postsRel = user?.relationships.find((r) => r.related === 'Post');
    expect(postsRel).toBeDefined();
    expect(postsRel?.type).toBe('hasMany');
  });

  it('extracts hasOne relationships (Profile?)', () => {
    const user = models.find((m) => m.name === 'User');
    const profileRel = user?.relationships.find(
      (r) => r.related === 'Profile',
    );
    expect(profileRel).toBeDefined();
    expect(profileRel?.type).toBe('hasOne');
  });

  it('extracts belongsTo relationships (@relation)', () => {
    const user = models.find((m) => m.name === 'User');
    const roleRel = user?.relationships.find((r) => r.related === 'Role');
    expect(roleRel).toBeDefined();
    expect(roleRel?.type).toBe('belongsTo');
    expect(roleRel?.foreignKey).toBe('roleId');
  });

  it('extracts belongsTo with foreign key from Post model', () => {
    const post = models.find((m) => m.name === 'Post');
    const authorRel = post?.relationships.find((r) => r.related === 'User');
    expect(authorRel).toBeDefined();
    expect(authorRel?.type).toBe('belongsTo');
    expect(authorRel?.foreignKey).toBe('authorId');
  });

  it('generates table name from model name', () => {
    const user = models.find((m) => m.name === 'User');
    expect(user?.table).toBe('users');

    const post = models.find((m) => m.name === 'Post');
    expect(post?.table).toBe('posts');
  });

  it('extracts DateTime fields', () => {
    const user = models.find((m) => m.name === 'User');
    const createdAt = user?.fields.find((f) => f.name === 'createdAt');
    expect(createdAt).toBeDefined();
    expect(createdAt?.type).toBe('DateTime');
  });

  it('extracts Boolean fields', () => {
    const post = models.find((m) => m.name === 'Post');
    const published = post?.fields.find((f) => f.name === 'published');
    expect(published).toBeDefined();
    expect(published?.type).toBe('Boolean');
    expect(published?.nullable).toBe(false);
  });

  it('handles multiple models correctly', () => {
    const profile = models.find((m) => m.name === 'Profile');
    expect(profile).toBeDefined();
    expect(profile?.fields.length).toBeGreaterThanOrEqual(2);

    const bioField = profile?.fields.find((f) => f.name === 'bio');
    expect(bioField?.nullable).toBe(true);
  });
});

describe('Prisma scanner edge cases', () => {
  it('returns empty array for empty content', () => {
    expect(parsePrismaSchema('')).toEqual([]);
  });

  it('returns empty array for schema with no models', () => {
    const content = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;
    expect(parsePrismaSchema(content)).toEqual([]);
  });

  it('handles model with only an id field', () => {
    const content = `
model Tag {
  id   Int    @id @default(autoincrement())
  name String
}
`;
    const models = parsePrismaSchema(content);
    expect(models).toHaveLength(1);
    expect(models[0]?.name).toBe('Tag');
    expect(models[0]?.fields).toHaveLength(2);
    expect(models[0]?.relationships).toHaveLength(0);
  });

  it('handles enum references as relationships', () => {
    const content = `
model User {
  id    Int    @id @default(autoincrement())
  email String
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  title    String
  author   User @relation(fields: [authorId], references: [id])
  authorId Int
}
`;
    const models = parsePrismaSchema(content);
    const user = models.find((m) => m.name === 'User');
    const post = models.find((m) => m.name === 'Post');

    expect(user?.relationships).toHaveLength(1);
    expect(user?.relationships[0]?.type).toBe('hasMany');
    expect(user?.relationships[0]?.related).toBe('Post');

    expect(post?.relationships).toHaveLength(1);
    expect(post?.relationships[0]?.type).toBe('belongsTo');
    expect(post?.relationships[0]?.related).toBe('User');
  });
});
