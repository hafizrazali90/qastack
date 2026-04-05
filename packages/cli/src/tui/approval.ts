/**
 * Interactive TUI for reviewing and approving stories and tests.
 *
 * Used by `qastack discover` and `qastack generate --approve`.
 */

import { select, input } from '@inquirer/prompts';
import type { UserStory } from '@qastack/core';
import type { GeneratedTest } from '@qastack/generator';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Story approval
// ---------------------------------------------------------------------------

/**
 * Walk through each user story, allowing approve/edit/skip/reject.
 * Returns only the approved (possibly edited) stories.
 */
export async function approveStories(
  stories: UserStory[],
): Promise<UserStory[]> {
  const approved: UserStory[] = [];

  console.log(
    chalk.bold(`\n  Reviewing ${stories.length} user stories\n`) +
      chalk.dim('  Approve, edit, skip, or reject each story.\n'),
  );

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i]!;

    console.log(
      chalk.bold(`\n  [${i + 1}/${stories.length}] ${story.id}`),
    );
    console.log(`  ${chalk.cyan(story.persona)} can ${story.action}`);
    console.log(
      `  Module: ${chalk.dim(story.module)}  |  Tier: ${chalk.dim(story.tier)}  |  Confidence: ${chalk.dim(story.confidence)}`,
    );
    console.log(`  Expected: ${chalk.dim(story.expectedResult)}`);

    const choice = await select({
      message: 'Action:',
      choices: [
        { value: 'approve', name: 'Approve' },
        { value: 'edit', name: 'Edit' },
        { value: 'skip', name: 'Skip' },
        { value: 'reject', name: 'Reject' },
        {
          value: 'quit',
          name: 'Quit (approve all remaining)',
        },
      ],
    });

    if (choice === 'approve') {
      approved.push(story);
    } else if (choice === 'edit') {
      const newAction = await input({
        message: 'Action:',
        default: story.action,
      });
      const newExpected = await input({
        message: 'Expected result:',
        default: story.expectedResult,
      });
      approved.push({
        ...story,
        action: newAction,
        expectedResult: newExpected,
      });
    } else if (choice === 'skip' || choice === 'reject') {
      // Not added to approved list
      continue;
    } else if (choice === 'quit') {
      // Approve this story and all remaining
      approved.push(...stories.slice(i));
      break;
    }
  }

  console.log(
    chalk.bold(
      `\n  ${approved.length} of ${stories.length} stories approved\n`,
    ),
  );

  return approved;
}

// ---------------------------------------------------------------------------
// Test approval
// ---------------------------------------------------------------------------

/**
 * Walk through each generated test, showing the code and allowing
 * approve/skip/reject.
 * Returns only the approved tests.
 */
export async function approveTests(
  tests: GeneratedTest[],
): Promise<GeneratedTest[]> {
  const approved: GeneratedTest[] = [];

  console.log(
    chalk.bold(`\n  Reviewing ${tests.length} generated test(s)\n`) +
      chalk.dim('  Approve, skip, or reject each test file.\n'),
  );

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i]!;

    console.log(
      chalk.bold(`\n  [${i + 1}/${tests.length}] ${test.filePath}`),
    );
    console.log(
      `  Story: ${chalk.cyan(test.story.id)} — ${test.story.persona} can ${test.story.action}`,
    );
    console.log(chalk.dim('  ─'.repeat(30)));

    // Show code preview (first 30 lines)
    const lines = test.code.split('\n');
    const preview = lines.slice(0, 30);
    for (const line of preview) {
      console.log(chalk.dim(`  │ ${line}`));
    }
    if (lines.length > 30) {
      console.log(
        chalk.dim(`  │ ... (${lines.length - 30} more lines)`),
      );
    }

    const choice = await select({
      message: 'Action:',
      choices: [
        { value: 'approve', name: 'Approve — write to disk' },
        { value: 'skip', name: 'Skip — do not write' },
        { value: 'reject', name: 'Reject — do not write' },
        {
          value: 'quit',
          name: 'Quit (approve all remaining)',
        },
      ],
    });

    if (choice === 'approve') {
      approved.push(test);
    } else if (choice === 'skip' || choice === 'reject') {
      continue;
    } else if (choice === 'quit') {
      approved.push(...tests.slice(i));
      break;
    }
  }

  console.log(
    chalk.bold(
      `\n  ${approved.length} of ${tests.length} test(s) approved\n`,
    ),
  );

  return approved;
}
