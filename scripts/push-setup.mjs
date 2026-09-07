import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run push:setup -- your-email@example.com');
  process.exit(1);
}
if (!existsSync(resolve(root, 'data/student.db'))) {
  console.error('Install the application first.');
  process.exit(1);
}
const path = resolve(root, 'data/vapid.json');
if (existsSync(path)) {
  console.error('Push keys already exist. Back them up before any deliberate replacement.');
  process.exit(1);
}
writeFileSync(
  path,
  JSON.stringify({ ...webpush.generateVAPIDKeys(), subject: 'mailto:' + email }),
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Push keys saved to data/vapid.json. Back up this file privately. No keys have been printed.',
);
