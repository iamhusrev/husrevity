import { dataSource } from './data-source';

const cmd = process.argv[2];

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    if (cmd === 'run') {
      const applied = await dataSource.runMigrations();
      console.log(`Applied ${applied.length} migration(s):`);
      applied.forEach((m) => console.log(`  - ${m.name}`));
    } else if (cmd === 'revert') {
      await dataSource.undoLastMigration();
      console.log('Reverted last migration');
    } else if (cmd === 'show') {
      const pending = await dataSource.showMigrations();
      console.log(pending ? 'Pending migrations exist' : 'Up to date');
    } else {
      console.error('Usage: bun src/db/migrate.ts {run|revert|show}');
      process.exit(2);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
