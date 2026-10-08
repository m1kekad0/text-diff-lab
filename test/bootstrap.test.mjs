import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { build, sourceDirectory } from '../scripts/build.mjs';
import { createStaticServer } from '../scripts/serve.mjs';

test('bootstrap: build and serve only the intended static assets', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'text-diff-bootstrap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await build(directory);
  assert.deepEqual((await readdir(directory)).sort(), ['index.html', 'styles.css']);
  for (const asset of ['index.html', 'styles.css']) {
    assert.deepEqual(await readFile(join(directory, asset)), await readFile(join(sourceDirectory, asset)));
  }

  const server = createStaticServer(directory);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;

  await t.test('HTML and CSS arrive intact with correct content types', async () => {
    for (const [path, asset, type] of [['/', 'index.html', 'text/html'], ['/styles.css', 'styles.css', 'text/css']]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(type));
      assert.equal(await response.text(), await readFile(join(directory, asset), 'utf8'));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('content-security-policy').includes("default-src 'none'"));
    }
  });

  await t.test('HEAD supplies asset headers without a body', async () => {
    const response = await fetch(`${url}/index.html?preview=1`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(Number(response.headers.get('content-length')), (await readFile(join(directory, 'index.html'))).length);
    assert.equal(await response.text(), '');
  });

  await t.test('unlisted files and encoded traversal requests are not served', async () => {
    for (const path of ['/package.json', '/.env', '/scripts/serve.mjs', '/missing', '/%2e%2e%2fscripts/serve.mjs']) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 404);
      assert.equal(await response.text(), '');
    }
  });

  await t.test('requests cannot submit text or mutate files', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await fetch(`${url}/`, { method, body: 'synthetic example' });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
      assert.equal(await response.text(), '');
    }
  });

  await t.test('missing built assets fail visibly', async () => {
    await rm(join(directory, 'styles.css'));
    const response = await fetch(`${url}/styles.css`);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), '');
  });
});
