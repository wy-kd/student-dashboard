import { saveBackup, restoreBackup } from '../lib/backup';
import { readFileSync } from 'node:fs';
import { db } from '../lib/db';
try {
  const file = process.argv[2];
  if (file) {
    if (!process.argv.includes('--confirm'))
      throw new Error('Restore replaces academic data. Use npm run db:backup -- FILE --confirm');
    await restoreBackup(JSON.parse(readFileSync(file, 'utf8')));
    console.log('Backup restored. Previous data saved in backups/.');
  } else console.log('Backup saved:', await saveBackup());
} finally {
  await db.$disconnect();
}
