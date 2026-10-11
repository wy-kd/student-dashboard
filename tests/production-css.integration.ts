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
  assert.match(css, /\.timer-float\{[^}]*position:fixed/);
  assert.match(css, /\.widget-size-fields\{[^}]*gap:16px/);
  assert.match(css, /\.semester-break-editor\{[^}]*gap:22px/);
  assert.match(css, /\.calendar\.day \.day-label b[^}]*width:auto/);
  assert.match(css, /\.semester-summary\{[^}]*font-weight:700/);
  assert.match(css, /\.todo-add-line\{[^}]*gap:10px/);
  assert.match(css, /\.sidebar nav\{[^}]*scrollbar-width:none/);
  assert.match(css, /\.sidebar nav\{[^}]*overflow-y:auto/);
  assert.match(css, /\.sidebar nav::?-webkit-scrollbar\{[^}]*display:none/);
  assert.match(css, /\.timer-float\{[^}]*timer-sidebar-width/);
  assert.match(css, /\.timer-float\{[^}]*timer-keyboard-inset/);
  assert.match(css, /\.timer-float \.mini-timer\{[^}]*max-height:inherit/);
  assert.match(css, /\.study-duration-fields\{[^}]*grid-template-columns:repeat\(2/);
  assert.match(css, /\.dashboard-context\{[^}]*margin:0 0 8px/);
  assert.doesNotMatch(css, /timer-drag|timer-safe-area|data-movable|data-dragging/);
  assert.match(css, /\.breakdown-row\{[^}]*padding:16px/);
  assert.match(css, /\.breakdown-methods[^}]*flex-wrap:wrap/);
  assert.match(css, /\.assignment-form-group legend\{[^}]*font-weight:700/);
  assert.match(css, /\.semester-summary\{[^}]*line-height:1\.5/);
  assert.match(css, /container:taskspace\/inline-size/);
  assert.match(css, /grid-template-columns:minmax\(0,1\.6fr\) minmax\(0,1fr\)/);
  assert.match(css, /\.assignment-dialog-body\{[^}]*overflow-y:auto/);
  assert.match(css, /\.assignment-dialog-footer\{[^}]*flex-shrink:0/);
  assert.match(css, /\.quick-editor-grid\{[^}]*display:grid/);
  assert.match(css, /\.workspace-row-actions \.icon-button\{[^}]*min-width:44px/);
  assert.match(css, /\.tasks-workspace-grid\{[^}]*align-items:stretch/);
  assert.match(css, /min-height:clamp\(26rem,52dvh,34rem\)/);
  assert.match(css, /min-height:clamp\(14rem,34dvh,20rem\)/);
  assert.match(css, /\.availability-sections\{[^}]*container:availability\/inline-size/);
  assert.match(
    css,
    /\.availability-week-row\{[^}]*grid-template-columns:100px minmax\(0,1fr\) auto auto/,
  );
  assert.match(css, /\.planning-preview-list\{[^}]*display:grid/);
  assert.match(css, /\.planned-work-actions\{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.planned-work-actions button\{[^}]*min-height:44px/);
  assert.match(css, /\.planned-work-editor>form\{[^}]*min-height:0/);
  assert.match(css, /\.planned-work-editor \.assignment-dialog-body\{[^}]*overflow-y:auto/);
  assert.match(
    css,
    /\.planning-suggestion \.form-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)/,
  );
  assert.match(css, /\.record-editor>form\{[^}]*min-height:0/);
  assert.match(css, /\.record-editor \.record-editor-body\{[^}]*overflow-y:auto/);
  assert.match(css, /\.record-editor \.dialog-actions\{[^}]*flex-shrink:0/);
  assert.match(css, /\.quick-add-dialog\{[^}]*max-height:calc\(100dvh/);
  assert.match(css, /\.quick-add-actions\{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.planning-summary\{[^}]*flex-wrap:wrap/);
  assert.match(css, /container:planning\/inline-size/);
  assert.match(css, /\.sidebar nav\{[^}]*overflow-anchor:none/);
  assert.match(css, /\.inbox-summary\{[^}]*flex-wrap:wrap/);
  assert.doesNotMatch(css, /mini-timer-cancel/);
  assert.doesNotMatch(css, /fullscreen-controls|fullscreen-enter|distraction-free/);
});
