import type {
  Route,
  Model,
  Component,
  DatabaseSchema,
} from '@qastack/core';

export interface DiscoveryContext {
  projectName: string;
  framework: string;
  routes: Route[];
  models: Model[];
  components: Component[];
  schema: DatabaseSchema;
  existingTests: string[];
  readmeContent?: string;
}

export function buildDiscoveryPrompt(context: DiscoveryContext): string {
  return `You are a QA analyst reviewing a ${context.framework} application called "${context.projectName}".

Based on the following codebase analysis, generate user stories for E2E testing.

## Routes Found (${context.routes.length})
${
  context.routes
    .map(
      (r) =>
        `- ${r.method} ${r.path}${r.name ? ` (${r.name})` : ''}${r.controller ? ` \u2192 ${r.controller}` : ''}`,
    )
    .join('\n') || 'None found'
}

## Data Models (${context.models.length})
${
  context.models
    .map((m) => {
      const fields = m.fields
        .map((f) => `${f.name}: ${f.type}${f.nullable ? '?' : ''}`)
        .join(', ');
      const rels = m.relationships
        .map((r) => `${r.type}(${r.related})`)
        .join(', ');
      return `- ${m.name} { ${fields} }${rels ? ` [${rels}]` : ''}`;
    })
    .join('\n') || 'None found'
}

## UI Components (${context.components.length})
${
  context.components
    .filter((c) => c.type === 'page')
    .map((c) => `- Page: ${c.name} (${c.filePath})`)
    .join('\n') || 'None found'
}

## Database Tables (${context.schema.tables.length})
${
  context.schema.tables
    .map((t) => `- ${t.name} (${t.fields.map((f) => f.name).join(', ')})`)
    .join('\n') || 'None found'
}

## Existing Test Coverage
${context.existingTests.length} test files already exist.
${context.existingTests.length > 0 ? context.existingTests.slice(0, 20).map((t) => `- ${t}`).join('\n') : 'No existing tests.'}

${context.readmeContent ? `## README Content\n${context.readmeContent.substring(0, 2000)}` : ''}

## Instructions

Generate user stories for E2E testing in this EXACT JSON array format:

\`\`\`json
[
  {
    "id": "US-001",
    "module": "users",
    "persona": "admin",
    "action": "view the list of all users",
    "expectedResult": "A paginated table of users is displayed with name, email, and role columns",
    "confidence": "high",
    "tier": "smoke"
  }
]
\`\`\`

Rules:
- One story per testable user action (not per route -- group related routes into meaningful actions)
- Module = derive from route prefix or model name (e.g. /users/* = "users", /api/posts/* = "posts")
- Persona = the user role performing the action (admin, user, guest, etc.)
- Tier assignment: list/view pages = "smoke", create/edit/delete = "regression", edge cases = "uat"
- Confidence: "high" if route + model + component all exist, "medium" if only route, "low" if inferred
- Generate 3-8 stories per module (cover CRUD + key workflows)
- Include the expected result describing what the user should see
- Use IDs in format US-001, US-002, etc.
- Do NOT generate stories for routes that already have test coverage
- Output ONLY the JSON array, no other text`;
}
