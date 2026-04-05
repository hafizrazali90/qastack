import { Command } from 'commander';

const program = new Command()
  .name('qastack')
  .description('Full QA stack in a box — from user stories to green light')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize qastack in current project')
  .action(async () => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand();
  });

program
  .command('discover')
  .description('Scan codebase and generate user stories')
  .option('--routes', 'Only scan routes')
  .option('--schema', 'Only scan database schema')
  .action(async (opts) => {
    const { discoverCommand } = await import('./commands/discover.js');
    await discoverCommand(opts);
  });

program
  .command('generate')
  .description('Generate test skeletons from user stories')
  .option('--from <file>', 'Path to user stories file')
  .option('--approve', 'Interactive approve/edit/reject')
  .action(async (opts) => {
    const { generateCommand } = await import('./commands/generate.js');
    await generateCommand(opts);
  });

program
  .command('collect')
  .description('Collect test results into database')
  .option('--format <format>', 'Result format: playwright, junit', 'playwright')
  .option('--json <path>', 'Path to results file')
  .action(async (opts) => {
    const { collectCommand } = await import('./commands/collect.js');
    await collectCommand(opts);
  });

program
  .command('dashboard')
  .description('Launch QA monitoring dashboard')
  .option('--port <port>', 'Port number', '3847')
  .action(async (opts) => {
    const { dashboardCommand } = await import('./commands/dashboard.js');
    await dashboardCommand(opts);
  });

program
  .command('status')
  .description('Show quick QA health summary')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand();
  });

program
  .command('catalog')
  .description('Generate/update test catalog')
  .action(async () => {
    const { catalogCommand } = await import('./commands/catalog.js');
    await catalogCommand();
  });

program
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    const { migrateCommand } = await import('./commands/migrate.js');
    await migrateCommand();
  });

program.parse();
