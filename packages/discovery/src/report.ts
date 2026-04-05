import type { UserStory } from '@qastack/core';
import type { DiscoveryContext } from './prompts.js';

/**
 * Generate a markdown discovery report summarizing the scan results and user stories.
 */
export function generateReport(
  context: DiscoveryContext,
  stories: UserStory[],
): string {
  const modules = [...new Set(stories.map((s) => s.module))];

  let report = `# Discovery Report \u2014 ${context.projectName}\n`;
  report += `Generated: ${new Date().toISOString().split('T')[0]}\n\n`;
  report += `## Detected Stack\n`;
  report += `- Framework: ${context.framework}\n`;
  report += `- Routes: ${context.routes.length} found\n`;
  report += `- Models: ${context.models.length} found\n`;
  report += `- Components: ${context.components.length} found\n`;
  report += `- Existing tests: ${context.existingTests.length} files\n\n`;

  report += `## Summary\n`;
  report += `- Total stories: ${stories.length}\n`;
  report += `- Modules: ${modules.length}\n`;
  report += `- High confidence: ${stories.filter((s) => s.confidence === 'high').length}\n`;
  report += `- Medium confidence: ${stories.filter((s) => s.confidence === 'medium').length}\n`;
  report += `- Low confidence: ${stories.filter((s) => s.confidence === 'low').length}\n\n`;

  report += `## Modules Found (${modules.length})\n\n`;

  for (const mod of modules) {
    const moduleStories = stories.filter((s) => s.module === mod);
    const moduleRoutes = context.routes.filter((r) =>
      r.path.includes(`/${mod}`),
    );

    report += `### ${mod}\n`;
    report += `- Routes: ${moduleRoutes.map((r) => `${r.method} ${r.path}`).join(', ') || 'inferred'}\n`;
    report += `\n#### User Stories (${moduleStories.length})\n`;
    for (const s of moduleStories) {
      report += `- **${s.id}** [${s.confidence}] [${s.tier}]: As a ${s.persona}, I can ${s.action}\n`;
      report += `  - Expected: ${s.expectedResult}\n`;
    }
    report += `\n`;
  }

  return report;
}
