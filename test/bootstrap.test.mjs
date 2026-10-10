import assert from 'node:assert/strict';
import { test } from 'node:test';
import { link, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { assets, build, sourceDirectory } from '../scripts/build.mjs';
import { createStaticServer } from '../scripts/serve.mjs';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'text-diff-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('rebuild overwrites only regular assets and leaves exactly the public allowlist', async (t) => {
  const parent = await temporaryDirectory(t);
  const directory = join(parent, 'output');
  await build(directory);
  for (const asset of assets) await writeFile(join(directory, asset), 'outdated synthetic asset');
  await build(join(directory, '.', '..', 'output'));
  assert.deepEqual((await readdir(directory)).sort(), [...assets].sort());
  for (const asset of assets) {
    assert.deepEqual(await readFile(join(directory, asset)), await readFile(join(sourceDirectory, asset)));
  }
});

test('rebuild rejects unlisted files and directories before changing existing output', async (t) => {
  const directory = await temporaryDirectory(t);
  await build(directory);
  await writeFile(join(directory, 'index.html'), 'previous synthetic output');
  await writeFile(join(directory, '.env'), 'SYNTHETIC_EXAMPLE=1\n');
  await mkdir(join(directory, 'old-output'));
  await writeFile(join(directory, 'old-output', 'note.txt'), 'synthetic nested data');
  await assert.rejects(build(directory), /unlisted entries/);
  assert.deepEqual((await readdir(directory)).sort(), [...assets, '.env', 'old-output'].sort());
  assert.equal(await readFile(join(directory, 'index.html'), 'utf8'), 'previous synthetic output');
  assert.equal(await readFile(join(directory, '.env'), 'utf8'), 'SYNTHETIC_EXAMPLE=1\n');
  assert.equal(await readFile(join(directory, 'old-output', 'note.txt'), 'utf8'), 'synthetic nested data');
  for (const asset of assets.filter((name) => name !== 'index.html')) {
    assert.deepEqual(await readFile(join(directory, asset)), await readFile(join(sourceDirectory, asset)));
  }
});

test('build rejects linked or non-directory destinations without following or removing them', async (t) => {
  const parent = await temporaryDirectory(t);
  const target = join(parent, 'target');
  await mkdir(target);
  await writeFile(join(target, 'note.txt'), 'synthetic target data');
  const alias = join(parent, 'alias');
  await symlink(target, alias, 'dir');
  await assert.rejects(build(alias), /not a file or symlink/);
  assert.equal(await readlink(alias), target);
  assert.deepEqual(await readdir(target), ['note.txt']);
  assert.equal(await readFile(join(target, 'note.txt'), 'utf8'), 'synthetic target data');

  const missing = join(parent, 'missing');
  const dangling = join(parent, 'dangling');
  await symlink(missing, dangling, 'dir');
  await assert.rejects(build(dangling), /not a file or symlink/);
  assert.equal(await readlink(dangling), missing);
  await assert.rejects(lstat(missing), { code: 'ENOENT' });

  const file = join(parent, 'file');
  await writeFile(file, 'synthetic file data');
  await assert.rejects(build(file), /not a file or symlink/);
  assert.equal(await readFile(file, 'utf8'), 'synthetic file data');
});

test('build rejects symlinks, hard links and directories at asset paths before any overwrite', async (t) => {
  for (const kind of ['symlink', 'dangling symlink', 'hard link', 'directory']) {
    await t.test(kind, async (t) => {
      const parent = await temporaryDirectory(t);
      const directory = join(parent, 'output');
      const target = join(parent, 'target');
      await mkdir(directory);
      await writeFile(join(directory, 'index.html'), 'previous synthetic output');
      if (kind !== 'dangling symlink') await writeFile(target, 'synthetic target data');
      const asset = join(directory, 'styles.css');
      if (kind.includes('symlink')) await symlink(target, asset);
      else if (kind === 'hard link') await link(target, asset);
      else {
        await mkdir(asset);
        await writeFile(join(asset, 'note.txt'), 'synthetic nested data');
      }
      await assert.rejects(build(directory), /regular files without symlinks or hard links/);
      assert.equal(await readFile(join(directory, 'index.html'), 'utf8'), 'previous synthetic output');
      assert.deepEqual((await readdir(directory)).sort(), ['index.html', 'styles.css']);
      if (kind.includes('symlink')) assert.equal(await readlink(asset), target);
      if (kind === 'dangling symlink') await assert.rejects(lstat(target), { code: 'ENOENT' });
      else assert.equal(await readFile(target, 'utf8'), 'synthetic target data');
      if (kind === 'directory') assert.equal(await readFile(join(asset, 'note.txt'), 'utf8'), 'synthetic nested data');
      if (kind === 'hard link') assert.equal((await lstat(asset)).nlink, 2);
    });
  }
});

test('build rejects project paths and ancestors, including aliases, before creating output', async (t) => {
  const parent = await temporaryDirectory(t);
  const project = resolve(sourceDirectory, '..');
  const original = await readFile(join(sourceDirectory, 'index.html'));
  for (const directory of [sourceDirectory, project, dirname(project), join(project, 'test'), join(sourceDirectory, 'build-output')]) {
    await assert.rejects(build(directory), /dedicated directory outside the project/);
  }
  const alias = join(parent, 'project-alias');
  await symlink(project, alias, 'dir');
  await assert.rejects(build(join(alias, 'src', 'build-output')), /dedicated directory outside the project/);
  await assert.rejects(lstat(resolve(sourceDirectory, 'build-output')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(sourceDirectory, 'index.html')), original);
  assert.equal(await readlink(alias), project);
});

test('build and serve only the intended static assets', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'text-diff-bootstrap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await build(directory);
  assert.deepEqual((await readdir(directory)).sort(), [...assets].sort());
  for (const asset of assets) {
    assert.deepEqual(await readFile(join(directory, asset)), await readFile(join(sourceDirectory, asset)));
  }

  const server = createStaticServer(directory);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;

  await t.test('HTML, CSS and browser modules arrive intact with correct content types', async () => {
    for (const [path, asset, type] of [['/', 'index.html', 'text/html'], ['/styles.css', 'styles.css', 'text/css'], ['/app.mjs', 'app.mjs', 'text/javascript'], ['/diff.mjs', 'diff.mjs', 'text/javascript']]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(type));
      assert.equal(await response.text(), await readFile(join(directory, asset), 'utf8'));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('content-security-policy').includes("default-src 'none'"));
      assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
      assert.ok(response.headers.get('content-security-policy').includes("connect-src 'none'"));
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
