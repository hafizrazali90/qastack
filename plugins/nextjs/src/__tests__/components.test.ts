import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanComponents } from '../scanners/components.js';

let tempDir: string;

beforeAll(() => {
  tempDir = join(tmpdir(), `qastack-nextjs-components-${Date.now()}`);
  const appDir = join(tempDir, 'app');

  // Root page and layout
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, 'page.tsx'), 'export default function Home() {}');
  writeFileSync(
    join(appDir, 'layout.tsx'),
    'export default function RootLayout() {}',
  );

  // Loading/error (should be skipped)
  writeFileSync(
    join(appDir, 'loading.tsx'),
    'export default function Loading() {}',
  );
  writeFileSync(
    join(appDir, 'error.tsx'),
    'export default function Error() {}',
  );

  // Nested page
  const usersDir = join(appDir, 'users');
  mkdirSync(usersDir, { recursive: true });
  writeFileSync(
    join(usersDir, 'page.tsx'),
    'export default function Users() {}',
  );

  // Dynamic segment page
  const userIdDir = join(usersDir, '[id]');
  mkdirSync(userIdDir, { recursive: true });
  writeFileSync(
    join(userIdDir, 'page.tsx'),
    'export default function UserDetail() {}',
  );

  // Route group page
  const authGroup = join(appDir, '(auth)');
  const loginDir = join(authGroup, 'login');
  mkdirSync(loginDir, { recursive: true });
  writeFileSync(
    join(loginDir, 'page.tsx'),
    'export default function Login() {}',
  );

  // Layout in route group
  writeFileSync(
    join(authGroup, 'layout.tsx'),
    'export default function AuthLayout() {}',
  );

  // Components directory
  const componentsDir = join(tempDir, 'components');
  mkdirSync(componentsDir, { recursive: true });
  writeFileSync(
    join(componentsDir, 'Button.tsx'),
    'export default function Button() {}',
  );
  writeFileSync(
    join(componentsDir, 'Card.tsx'),
    'export default function Card() {}',
  );

  // Nested components
  const uiDir = join(componentsDir, 'ui');
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(
    join(uiDir, 'Dialog.tsx'),
    'export default function Dialog() {}',
  );

  // Non-component file (should be skipped)
  writeFileSync(join(componentsDir, 'utils.ts'), 'export function cn() {}');

  // API route file (should be skipped in components scan)
  const apiDir = join(appDir, 'api', 'health');
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(
    join(apiDir, 'route.ts'),
    'export async function GET() { return Response.json({ ok: true }); }',
  );
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('Next.js component scanner', () => {
  it('classifies page.tsx as page type', () => {
    const components = scanComponents(tempDir);
    const pages = components.filter((c) => c.type === 'page');
    expect(pages.length).toBeGreaterThanOrEqual(1);

    const rootPage = pages.find((c) => c.filePath.endsWith('app/page.tsx'));
    expect(rootPage).toBeDefined();
    expect(rootPage?.type).toBe('page');
  });

  it('classifies layout.tsx as layout type', () => {
    const components = scanComponents(tempDir);
    const layouts = components.filter((c) => c.type === 'layout');
    expect(layouts.length).toBeGreaterThanOrEqual(1);

    const rootLayout = layouts.find((c) =>
      c.filePath.endsWith('app/layout.tsx'),
    );
    expect(rootLayout).toBeDefined();
    expect(rootLayout?.type).toBe('layout');
  });

  it('finds components in components/ directory', () => {
    const components = scanComponents(tempDir);
    const comps = components.filter((c) => c.type === 'component');
    expect(comps.length).toBeGreaterThanOrEqual(2);

    const button = comps.find((c) => c.name === 'Button');
    expect(button).toBeDefined();
    expect(button?.type).toBe('component');

    const card = comps.find((c) => c.name === 'Card');
    expect(card).toBeDefined();
  });

  it('finds nested components', () => {
    const components = scanComponents(tempDir);
    const dialog = components.find((c) => c.name === 'Dialog');
    expect(dialog).toBeDefined();
    expect(dialog?.type).toBe('component');
  });

  it('skips non-component files (*.ts without tsx/jsx)', () => {
    const components = scanComponents(tempDir);
    const utils = components.find((c) => c.name === 'utils');
    expect(utils).toBeUndefined();
  });

  it('skips API route files', () => {
    const components = scanComponents(tempDir);
    const route = components.find((c) => c.filePath.includes('route.ts'));
    expect(route).toBeUndefined();
  });

  it('skips loading.tsx and error.tsx', () => {
    const components = scanComponents(tempDir);
    const loading = components.find((c) =>
      c.filePath.endsWith('loading.tsx'),
    );
    const error = components.find((c) => c.filePath.endsWith('error.tsx'));
    expect(loading).toBeUndefined();
    expect(error).toBeUndefined();
  });

  it('detects pages in nested directories', () => {
    const components = scanComponents(tempDir);
    const pages = components.filter((c) => c.type === 'page');
    const usersPage = pages.find((c) =>
      c.filePath.includes('users/page.tsx'),
    );
    expect(usersPage).toBeDefined();
  });

  it('detects pages inside route groups', () => {
    const components = scanComponents(tempDir);
    const pages = components.filter((c) => c.type === 'page');
    const loginPage = pages.find((c) =>
      c.filePath.includes('login/page.tsx'),
    );
    expect(loginPage).toBeDefined();
  });

  it('detects layouts inside route groups', () => {
    const components = scanComponents(tempDir);
    const layouts = components.filter((c) => c.type === 'layout');
    const authLayout = layouts.find((c) =>
      c.filePath.includes('(auth)/layout.tsx'),
    );
    expect(authLayout).toBeDefined();
  });

  it('sets correct filePath relative to projectRoot', () => {
    const components = scanComponents(tempDir);
    for (const comp of components) {
      // All paths should be relative (not absolute)
      expect(comp.filePath).not.toMatch(/^[A-Z]:/);
      expect(comp.filePath).not.toMatch(/^\//);
      // Should use forward slashes
      expect(comp.filePath).not.toContain('\\');
    }
  });

  it('returns empty for non-existent project', () => {
    const components = scanComponents('/non/existent/path');
    expect(components).toEqual([]);
  });
});

describe('Next.js component scanner with src/components', () => {
  let srcTempDir: string;

  beforeAll(() => {
    srcTempDir = join(tmpdir(), `qastack-nextjs-srccomp-${Date.now()}`);
    const srcAppDir = join(srcTempDir, 'src', 'app');
    const srcComponentsDir = join(srcTempDir, 'src', 'components');

    mkdirSync(srcAppDir, { recursive: true });
    writeFileSync(
      join(srcAppDir, 'page.tsx'),
      'export default function Home() {}',
    );

    mkdirSync(srcComponentsDir, { recursive: true });
    writeFileSync(
      join(srcComponentsDir, 'Header.tsx'),
      'export default function Header() {}',
    );
    writeFileSync(
      join(srcComponentsDir, 'Footer.jsx'),
      'export default function Footer() {}',
    );
  });

  afterAll(() => {
    rmSync(srcTempDir, { recursive: true, force: true });
  });

  it('detects pages in src/app', () => {
    const components = scanComponents(srcTempDir);
    const pages = components.filter((c) => c.type === 'page');
    expect(pages).toHaveLength(1);
  });

  it('detects components in src/components', () => {
    const components = scanComponents(srcTempDir);
    const comps = components.filter((c) => c.type === 'component');
    expect(comps).toHaveLength(2);

    const header = comps.find((c) => c.name === 'Header');
    expect(header).toBeDefined();

    const footer = comps.find((c) => c.name === 'Footer');
    expect(footer).toBeDefined();
  });
});
