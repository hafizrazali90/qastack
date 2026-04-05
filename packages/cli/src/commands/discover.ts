/**
 * `qastack discover` — scan codebase and generate user stories.
 *
 * 1. Loads config
 * 2. Calls discover() from @qastack/discovery
 * 3. Shows spinner during AI call
 * 4. Saves stories to qastack-stories.json
 * 5. Optionally runs TUI approval
 * 6. Prints discovery report
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { discover } from '@qastack/discovery';
import { getConfig, success, info, warn, withErrorHandler } from '../helpers.js';

interface DiscoverOpts {
  routes?: boolean;
  schema?: boolean;
}

export async function discoverCommand(opts: DiscoverOpts): Promise<void> {
  await withErrorHandler(async () => {
    const cwd = process.cwd();
    const config = getConfig();

    console.log(
      chalk.bold('\n  qastack discover\n') +
        chalk.dim('  Scanning codebase and generating user stories...\n'),
    );

    if (opts.routes) {
      info('Scope: routes only');
    } else if (opts.schema) {
      info('Scope: database schema only');
    }

    // Run discovery with spinner
    const spinner = ora('Running AI-powered discovery...').start();

    let result;
    try {
      result = await discover(cwd, config);
      spinner.succeed(
        `Discovery complete — ${chalk.bold(String(result.stories.length))} user stories generated`,
      );
    } catch (err) {
      spinner.fail('Discovery failed');
      throw err;
    }

    // Print framework
    info(`Framework detected: ${chalk.bold(result.framework)}`);
    info(
      `Routes: ${result.context.routes.length}, ` +
        `Models: ${result.context.models.length}, ` +
        `Components: ${result.context.components.length}`,
    );

    // Print stories summary by module
    const modules = new Map<string, number>();
    for (const story of result.stories) {
      modules.set(story.module, (modules.get(story.module) ?? 0) + 1);
    }

    if (modules.size > 0) {
      console.log(chalk.bold('\n  Stories by module:'));
      for (const [mod, count] of [...modules.entries()].sort()) {
        console.log(`    ${chalk.cyan(mod)}: ${count}`);
      }
    }

    // Print tier breakdown
    const tiers = { smoke: 0, regression: 0, uat: 0 };
    for (const story of result.stories) {
      tiers[story.tier]++;
    }
    console.log(chalk.bold('\n  By tier:'));
    console.log(
      `    smoke: ${tiers.smoke}  regression: ${tiers.regression}  uat: ${tiers.uat}`,
    );

    // Save stories to JSON
    const storiesPath = resolve(cwd, 'qastack-stories.json');
    writeFileSync(
      storiesPath,
      JSON.stringify(result.stories, null, 2),
      'utf-8',
    );
    info(`Stories saved to ${chalk.bold('qastack-stories.json')}`);

    // Save full report
    const reportPath = resolve(cwd, 'qastack-discovery-report.md');
    writeFileSync(reportPath, result.report, 'utf-8');
    info(`Report saved to ${chalk.bold('qastack-discovery-report.md')}`);

    // Warn about stories that need review
    const lowConfidence = result.stories.filter(
      (s) => s.confidence === 'low',
    );
    if (lowConfidence.length > 0) {
      warn(
        `${lowConfidence.length} stories have low confidence — review recommended`,
      );
    }

    success('Discovery complete!');
    console.log(
      chalk.dim(
        '  Next: run `qastack generate` to create test skeletons\n' +
          '  Or: run `qastack generate --approve` for interactive review\n',
      ),
    );
  });
}
