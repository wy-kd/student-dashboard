import { db } from '../lib/db';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
if (!process.argv.includes('--confirm')) {
  console.log(
    'Stop the server, then run npm run password:reset -- --confirm. Academic data is preserved.',
  );
  process.exit(1);
}
await db.user.deleteMany();
writeFileSync('data/setup-token', randomBytes(18).toString('hex'), { mode: 0o600 });
await db.$disconnect();
console.log('Password reset. Start the server and use the new setup token.');
