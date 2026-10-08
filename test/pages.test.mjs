import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assets } from '../scripts/build.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('static HTML applies supported CSP before resources and keeps project-relative URLs', async () => {
  const html = await read('src/index.html');
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta);
  assert.match(html, /<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy"/);
  assert.equal(meta[1], "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'");
  assert.ok(html.indexOf(meta[0]) < html.indexOf('<link'));
  assert.ok(html.indexOf(meta[0]) < html.indexOf('<script'));
  assert.deepEqual(assets, ['index.html', 'styles.css', 'app.mjs', 'diff.mjs']);
  const base = new URL('https://example.invalid/text-diff-lab/');
  for (const reference of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.ok(reference[1].startsWith('./'));
    assert.ok(new URL(reference[1], base).pathname.startsWith(base.pathname));
  }
  assert.match(await read('src/app.mjs'), /import .* from '\.\/diff\.mjs';/);
});

test('Pages workflow is manual, main-only and deploys only after read-only verified build', async () => {
  const workflow = await read('.github/workflows/pages.yml');
  assert.equal(workflow.match(/^on:\n([\s\S]*?)\npermissions:/m)[1].trim(), 'workflow_dispatch:');
  assert.equal(workflow.match(/^permissions:\n([\s\S]*?)\nconcurrency:/m)[1].trim(), 'contents: read');
  const [build, deploy] = workflow.split(/^  build:\n|^  deploy:\n/m).slice(1);
  for (const job of [build, deploy]) {
    assert.match(job, /^    if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'$/m);
    assert.doesNotMatch(job, /always\(|continue-on-error/);
  }
  assert.equal(build.match(/    permissions:\n([\s\S]*?)    steps:/)[1].trim(), 'contents: read');
  assert.match(build, /ref: \$\{\{ github\.sha \}\}\n          persist-credentials: false/);
  assert.match(build, /node-version: '24'/);
  assert.deepEqual([...build.matchAll(/run: (.+)/g)].map((match) => match[1]), ['npm ci --ignore-scripts --no-audit --no-fund', 'npm run lint', 'npm test', 'npm run build']);
  assert.match(build, /path: dist\n          name: github-pages\n          retention-days: 1/);
  assert.match(deploy, /^    needs: build$/m);
  assert.equal(deploy.match(/    permissions:\n([\s\S]*?)    environment:/)[1].trim(), 'pages: write\n      id-token: write');
  assert.match(deploy, /name: github-pages\n      url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(deploy, /artifact_name: github-pages/);
  assert.doesNotMatch(deploy, /checkout|run:/);
  assert.deepEqual([...workflow.matchAll(/uses: (\S+)/g)].map((match) => match[1]), [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
    'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
    'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e',
  ]);
});
