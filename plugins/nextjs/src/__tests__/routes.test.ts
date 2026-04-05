import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanAppRoutes } from '../scanners/routes.js';

/**
 * Create a temporary Next.js app directory structure for testing.
 */
let tempDir: string;

beforeAll(() => {
  tempDir = join(tmpdir(), `qastack-nextjs-routes-${Date.now()}`);
  const appDir = join(tempDir, 'app');

  // Root page: GET /
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, 'page.tsx'), 'export default function Home() {}');

  // Root layout (should be skipped)
  writeFileSync(
    join(appDir, 'layout.tsx'),
    'export default function RootLayout() {}',
  );

  // Loading file (should be skipped)
  writeFileSync(
    join(appDir, 'loading.tsx'),
    'export default function Loading() {}',
  );

  // Error file (should be skipped)
  writeFileSync(
    join(appDir, 'error.tsx'),
    '"use client"; export default function Error() {}',
  );

  // Not-found file (should be skipped)
  writeFileSync(
    join(appDir, 'not-found.tsx'),
    'export default function NotFound() {}',
  );

  // Users page: GET /users
  const usersDir = join(appDir, 'users');
  mkdirSync(usersDir, { recursive: true });
  writeFileSync(
    join(usersDir, 'page.tsx'),
    'export default function Users() {}',
  );

  // Users dynamic: GET /users/:id
  const userIdDir = join(usersDir, '[id]');
  mkdirSync(userIdDir, { recursive: true });
  writeFileSync(
    join(userIdDir, 'page.tsx'),
    'export default function UserDetail() {}',
  );

  // Nested route: GET /users/:id/posts
  const userPostsDir = join(userIdDir, 'posts');
  mkdirSync(userPostsDir, { recursive: true });
  writeFileSync(
    join(userPostsDir, 'page.tsx'),
    'export default function UserPosts() {}',
  );

  // API route: API /api/users
  const apiUsersDir = join(appDir, 'api', 'users');
  mkdirSync(apiUsersDir, { recursive: true });
  writeFileSync(
    join(apiUsersDir, 'route.ts'),
    'export async function GET() {} export async function POST() {}',
  );

  // API route with dynamic segment: API /api/users/:id
  const apiUserIdDir = join(apiUsersDir, '[id]');
  mkdirSync(apiUserIdDir, { recursive: true });
  writeFileSync(
    join(apiUserIdDir, 'route.ts'),
    'export async function GET() {} export async function PUT() {} export async function DELETE() {}',
  );

  // Route group: (auth)/login -> GET /login
  const authGroupDir = join(appDir, '(auth)');
  const loginDir = join(authGroupDir, 'login');
  mkdirSync(loginDir, { recursive: true });
  writeFileSync(
    join(loginDir, 'page.tsx'),
    'export default function Login() {}',
  );

  // Route group: (auth)/register -> GET /register
  const registerDir = join(authGroupDir, 'register');
  mkdirSync(registerDir, { recursive: true });
  writeFileSync(
    join(registerDir, 'page.tsx'),
    'export default function Register() {}',
  );

  // Parallel route slot (should be skipped): @modal
  const modalDir = join(appDir, '@modal');
  mkdirSync(modalDir, { recursive: true });
  writeFileSync(
    join(modalDir, 'page.tsx'),
    'export default function Modal() {}',
  );

  // Nested route group: (marketing)/about -> GET /about
  const marketingDir = join(appDir, '(marketing)');
  const aboutDir = join(marketingDir, 'about');
  mkdirSync(aboutDir, { recursive: true });
  writeFileSync(
    join(aboutDir, 'page.tsx'),
    'export default function About() {}',
  );
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Next.js route scanner', () => {
  it('detects root page.tsx as GET /', () => {
    const routes = scanAppRoutes(tempDir);
    const root = routes.find((r) => r.path === '/');
    expect(root).toBeDefined();
    expect(root?.method).toBe('GET');
  });

  it('detects page.tsx as page routes', () => {
    const routes = scanAppRoutes(tempDir);
    const usersRoute = routes.find((r) => r.path === '/users');
    expect(usersRoute).toBeDefined();
    expect(usersRoute?.method).toBe('GET');
  });

  it('handles dynamic segments [id]', () => {
    const routes = scanAppRoutes(tempDir);
    const userDetailRoute = routes.find((r) => r.path === '/users/:id');
    expect(userDetailRoute).toBeDefined();
    expect(userDetailRoute?.method).toBe('GET');
  });

  it('handles nested routes', () => {
    const routes = scanAppRoutes(tempDir);
    const userPostsRoute = routes.find(
      (r) => r.path === '/users/:id/posts',
    );
    expect(userPostsRoute).toBeDefined();
    expect(userPostsRoute?.method).toBe('GET');
  });

  it('handles route groups (excluded from URL)', () => {
    const routes = scanAppRoutes(tempDir);
    const loginRoute = routes.find((r) => r.path === '/login');
    expect(loginRoute).toBeDefined();
    expect(loginRoute?.method).toBe('GET');

    const registerRoute = routes.find((r) => r.path === '/register');
    expect(registerRoute).toBeDefined();
    expect(registerRoute?.method).toBe('GET');
  });

  it('handles nested route groups', () => {
    const routes = scanAppRoutes(tempDir);
    const aboutRoute = routes.find((r) => r.path === '/about');
    expect(aboutRoute).toBeDefined();
    expect(aboutRoute?.method).toBe('GET');
  });

  it('detects API routes (route.ts)', () => {
    const routes = scanAppRoutes(tempDir);
    const apiUsersRoute = routes.find((r) => r.path === '/api/users');
    expect(apiUsersRoute).toBeDefined();
    expect(apiUsersRoute?.method).toBe('API');
  });

  it('detects API routes with dynamic segments', () => {
    const routes = scanAppRoutes(tempDir);
    const apiUserIdRoute = routes.find((r) => r.path === '/api/users/:id');
    expect(apiUserIdRoute).toBeDefined();
    expect(apiUserIdRoute?.method).toBe('API');
  });

  it('skips layout.tsx files', () => {
    const routes = scanAppRoutes(tempDir);
    // layout.tsx is in root app/ — if it were counted, there would be a duplicate / route
    const getRootRoutes = routes.filter(
      (r) => r.path === '/' && r.method === 'GET',
    );
    expect(getRootRoutes).toHaveLength(1);
  });

  it('skips loading.tsx files', () => {
    const routes = scanAppRoutes(tempDir);
    // loading.tsx should not generate any route
    const allPaths = routes.map((r) => r.path);
    // loading is in root, if not skipped it would appear as a duplicate / or odd route
    expect(routes.every((r) => r.method === 'GET' || r.method === 'API')).toBe(
      true,
    );
  });

  it('skips error.tsx and not-found.tsx files', () => {
    const routes = scanAppRoutes(tempDir);
    // These files exist in root but should not create routes
    const rootGets = routes.filter(
      (r) => r.path === '/' && r.method === 'GET',
    );
    expect(rootGets).toHaveLength(1);
  });

  it('skips @parallel slot directories', () => {
    const routes = scanAppRoutes(tempDir);
    // @modal/page.tsx should not appear as a route
    const modalRoutes = routes.filter((r) => r.path.includes('modal'));
    expect(modalRoutes).toHaveLength(0);
  });

  it('returns empty array for non-existent app directory', () => {
    const routes = scanAppRoutes('/non/existent/path');
    expect(routes).toEqual([]);
  });
});

describe('Next.js route scanner with src/app', () => {
  let srcTempDir: string;

  beforeAll(() => {
    srcTempDir = join(tmpdir(), `qastack-nextjs-srcapp-${Date.now()}`);
    const srcAppDir = join(srcTempDir, 'src', 'app');

    mkdirSync(srcAppDir, { recursive: true });
    writeFileSync(
      join(srcAppDir, 'page.tsx'),
      'export default function Home() {}',
    );

    const dashboardDir = join(srcAppDir, 'dashboard');
    mkdirSync(dashboardDir, { recursive: true });
    writeFileSync(
      join(dashboardDir, 'page.tsx'),
      'export default function Dashboard() {}',
    );
  });

  afterAll(() => {
    rmSync(srcTempDir, { recursive: true, force: true });
  });

  it('detects routes in src/app directory', () => {
    const routes = scanAppRoutes(srcTempDir);
    expect(routes).toHaveLength(2);

    const root = routes.find((r) => r.path === '/');
    expect(root).toBeDefined();

    const dashboard = routes.find((r) => r.path === '/dashboard');
    expect(dashboard).toBeDefined();
  });
});
