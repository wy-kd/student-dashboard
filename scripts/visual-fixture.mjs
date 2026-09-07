// Generate an isolated visual harness from fictional records, then remove it after QA.
import { build } from 'esbuild';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
await build({
  entryPoints: ['tests/visual-fixture.tsx'],
  outfile: 'public/v2-fixture.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const dir = '.next/static/chunks';
writeFileSync(
  'public/v2-fixture.css',
  readdirSync(dir)
    .filter((x) => x.endsWith('.css'))
    .map((x) => readFileSync(dir + '/' + x, 'utf8'))
    .join('\n') +
    '\n' +
    readFileSync('app/globals.css', 'utf8').split('/* V2:')[1].split('*/').slice(1).join('*/'),
);
const css = '<link rel="stylesheet" href="/v2-fixture.css">';
writeFileSync(
  'public/v2-fixture.html',
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Disposable V2 visual fixture</title>${css}<style>.fixture-nav{display:flex;gap:1rem;padding:1rem;flex-wrap:wrap;background:var(--surface)}.fixture-nav label{display:flex;align-items:center;gap:.5rem}</style><div id="fixture"></div><script type="module" src="/v2-fixture.js"></script></html>`,
);
const frame = readFileSync('public/v2-fixture.html', 'utf8')
  .replaceAll('&', '&amp;')
  .replaceAll('\"', '&quot;');
writeFileSync(
  'public/v2-sizes.html',
  `<!doctype html><html><title>Responsive V2 fixtures</title><style>body{margin:0}iframe{display:block;border:0;height:1800px}</style><h1>Phone · 390px</h1><iframe title="Phone" srcdoc="${frame}" width="390"></iframe><h1>Tablet · 820px</h1><iframe title="Tablet" srcdoc="${frame}" width="820"></iframe></html>`,
);
