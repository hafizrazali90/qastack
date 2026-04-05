import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRouteFile } from '../scanners/routes.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('route scanner', () => {
  const content = loadFixture('routes-web.php');
  const routes = parseRouteFile(content);

  it('parses basic GET routes', () => {
    const homeRoute = routes.find((r) => r.name === 'home');
    expect(homeRoute).toBeDefined();
    expect(homeRoute?.method).toBe('GET');
    expect(homeRoute?.path).toBe('/');
  });

  it('parses POST routes', () => {
    const storeRoute = routes.find((r) => r.name === 'users.store');
    expect(storeRoute).toBeDefined();
    expect(storeRoute?.method).toBe('POST');
    expect(storeRoute?.path).toBe('/users');
  });

  it('parses PUT routes', () => {
    const updateRoute = routes.find((r) => r.name === 'users.update');
    expect(updateRoute).toBeDefined();
    expect(updateRoute?.method).toBe('PUT');
    expect(updateRoute?.path).toBe('/users/{user}');
  });

  it('parses DELETE routes', () => {
    const deleteRoute = routes.find((r) => r.name === 'users.destroy');
    expect(deleteRoute).toBeDefined();
    expect(deleteRoute?.method).toBe('DELETE');
    expect(deleteRoute?.path).toBe('/users/{user}');
  });

  it('extracts controller class and method', () => {
    const indexRoute = routes.find((r) => r.name === 'users.index');
    expect(indexRoute).toBeDefined();
    expect(indexRoute?.controller).toBe('UserController@index');
  });

  it('extracts route names', () => {
    const namedRoutes = routes.filter((r) => r.name);
    expect(namedRoutes.length).toBeGreaterThanOrEqual(6);

    const routeNames = namedRoutes.map((r) => r.name);
    expect(routeNames).toContain('home');
    expect(routeNames).toContain('users.index');
    expect(routeNames).toContain('users.store');
    expect(routeNames).toContain('users.show');
    expect(routeNames).toContain('users.update');
    expect(routeNames).toContain('users.destroy');
  });

  it('handles route parameters ({user})', () => {
    const showRoute = routes.find((r) => r.name === 'users.show');
    expect(showRoute).toBeDefined();
    expect(showRoute?.path).toBe('/users/{user}');
    expect(showRoute?.path).toContain('{user}');
  });

  it('expands resource routes to 5 CRUD routes', () => {
    const postRoutes = routes.filter(
      (r) => r.name?.startsWith('posts.'),
    );
    expect(postRoutes).toHaveLength(5);

    const postRouteNames = postRoutes.map((r) => r.name);
    expect(postRouteNames).toContain('posts.index');
    expect(postRouteNames).toContain('posts.show');
    expect(postRouteNames).toContain('posts.store');
    expect(postRouteNames).toContain('posts.update');
    expect(postRouteNames).toContain('posts.destroy');

    // Verify methods
    expect(postRoutes.find((r) => r.name === 'posts.index')?.method).toBe('GET');
    expect(postRoutes.find((r) => r.name === 'posts.show')?.method).toBe('GET');
    expect(postRoutes.find((r) => r.name === 'posts.store')?.method).toBe('POST');
    expect(postRoutes.find((r) => r.name === 'posts.update')?.method).toBe('PUT');
    expect(postRoutes.find((r) => r.name === 'posts.destroy')?.method).toBe('DELETE');
  });

  it('expands resource routes with correct paths', () => {
    const postIndex = routes.find((r) => r.name === 'posts.index');
    const postShow = routes.find((r) => r.name === 'posts.show');

    expect(postIndex?.path).toBe('/posts');
    expect(postShow?.path).toBe('/posts/{post}');
  });

  it('handles grouped/prefixed routes', () => {
    const dashboardRoute = routes.find((r) => r.name === 'admin.dashboard');
    expect(dashboardRoute).toBeDefined();
    expect(dashboardRoute?.path).toBe('/admin/dashboard');
    expect(dashboardRoute?.controller).toBe('AdminController@index');
  });

  it('handles middleware on grouped routes', () => {
    const dashboardRoute = routes.find((r) => r.name === 'admin.dashboard');
    expect(dashboardRoute?.middleware).toEqual(['auth']);
  });

  it('parses closure routes without controller', () => {
    const homeRoute = routes.find((r) => r.name === 'home');
    expect(homeRoute).toBeDefined();
    // Closure routes should not have a controller
    expect(homeRoute?.controller).toBeUndefined();
  });
});

describe('route scanner edge cases', () => {
  it('returns empty array for empty content', () => {
    expect(parseRouteFile('')).toEqual([]);
  });

  it('returns empty array for non-route PHP content', () => {
    const content = '<?php\n// just a comment\n$x = 1;\n';
    expect(parseRouteFile(content)).toEqual([]);
  });

  it('handles route without name', () => {
    const content = `Route::get('/health', [HealthController::class, 'check']);`;
    const routes = parseRouteFile(content);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.name).toBeUndefined();
    expect(routes[0]?.path).toBe('/health');
  });
});
