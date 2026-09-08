import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Runs after next build, against emitted assets (never a raw CSS fixture overlay).
test('production CSS contains current navigation, timer and recurring editor layouts', () => {
  const directory = join(process.cwd(), '.next/static/chunks');
  const css = readdirSync(directory)
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(directory, file), 'utf8'))
    .join('\n');
  assert.match(css, /\.sidebar-collapsed \.sidebar\{[^}]*width:76px/);
  assert.match(css, /\.sidebar-collapsed \.main-shell\{[^}]*margin-left:76px/);
  assert.match(css, /\.mini-timer-clock\{[^}]*display:flex/);
  assert.match(css, /\.mini-timer-status\{[^}]*padding:3px 8px/);
  assert.match(css, /\.recurring-card\{[^}]*display:grid/);
  assert.match(css, /\.recurring-editor-actions\{[^}]*gap:12px/);
  assert.match(css, /\.ordinary-tasks\{[^}]*padding-top:28px/);
  assert.doesNotMatch(css, /fullscreen-controls|fullscreen-enter|distraction-free/);
});
