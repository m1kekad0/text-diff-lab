import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { assets, build } from './build.mjs';
import { createStaticServer } from './serve.mjs';

// Separately provisioned Playwright/Chromium only; never install browsers here.
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleName.startsWith('.') || moduleName.startsWith('/') ? pathToFileURL(resolve(moduleName)).href : moduleName);
const directory = await mkdtemp(join(tmpdir(), 'text-diff-input-'));
const pagesCheck = process.env.PAGES_CHECK === '1';
const prefix = pagesCheck ? '/text-diff-lab/' : '/';
const deadlineMs = 2_000;
const stopWallMs = 1_000;
const stopSyncMs = 200;
const records = [];
let server;
let browserServer;
let activeCase = 'setup';

// A deadline stops this run and kills only the browser launched by this script.
async function bounded(operation) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${activeCase}: ${deadlineMs}ms deadline; remaining cases not run`));
          void browserServer?.kill().catch(() => {});
        }, deadlineMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Increasing raw UTF-16 sizes; at most 1,000 newlines and 100,000 code units.
const fixtures = [
  ['100-lines', Array(100).fill('x').join('\n')],
  ['101-lines', Array(101).fill('x').join('\n')],
  ['19999', 'x'.repeat(19_999)],
  ['20000', 'x'.repeat(20_000)],
  ['CR-trailing', 'x'.repeat(19_999) + '\r'],
  ['emoji-20000', '🌱'.repeat(10_000)],
  ['20001', 'x'.repeat(20_001)],
  ['CRLF-trailing', 'x'.repeat(19_999) + '\r\n'],
  ['LF-21000', 'x'.repeat(20_000) + '\n'.repeat(1_000)],
  ['single-50000', 'x'.repeat(50_000)],
  ['LF-50000', 'x'.repeat(49_000) + '\n'.repeat(1_000)],
  ['single-100000', 'x'.repeat(100_000)],
  ['LF-100000', 'x'.repeat(99_000) + '\n'.repeat(1_000)],
];
assert.ok(fixtures.every(([, value]) => value.length <= 100_000));
const ids = ['original', 'updated'];
const edited = '入力を編集しました。「比較する」で結果を更新してください。';
const cleared = '入力と結果をクリアしました。テキストを入力して比較してください。';
const invalid = '比較できません。入力欄の上限エラーを修正してください。';

function expected(value) {
  const normalized = value.replace(/\r\n?/g, '\n');
  const lines = normalized === '' ? 0 : normalized.split('\n').length;
  const errors = [];
  if (lines > 100) errors.push(`100行以内にしてください（現在${lines}行）。`);
  if (normalized.length > 20_000) errors.push(`20,000文字以内にしてください（現在${normalized.length.toLocaleString('ja-JP')}文字）。`);
  return { value: normalized, count: `${lines} / 100行 · ${normalized.length.toLocaleString('ja-JP')} / 20,000文字`, error: errors.join(' '), lines };
}

try {
  await build(directory);
  server = pagesCheck ? createServer(async (request, response) => {
    const asset = request.url === prefix ? 'index.html' : request.url.slice(prefix.length);
    if (!request.url.startsWith(prefix) || !assets.includes(asset) || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript' };
    response.writeHead(200, { 'Content-Type': types[asset.split('.').pop()] });
    response.end(await readFile(join(directory, asset)));
  }) : createStaticServer(directory);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}${prefix}`;
  browserServer = await chromium.launchServer({ headless: true, timeout: deadlineMs });
  const browser = await chromium.connect(browserServer.wsEndpoint(), { timeout: deadlineMs });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP', serviceWorkers: 'block' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(deadlineMs);
  page.setDefaultNavigationTimeout(deadlineMs);
  const exceptions = [];
  const requests = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  page.on('request', (request) => requests.push(request.method()));
  // Observation only: capture before app listeners, then bubble after them.
  await page.addInitScript(() => {
    window.__inputMeasures = [];
    const starts = new WeakMap();
    for (const type of ['input', 'click']) {
      document.addEventListener(type, (event) => starts.set(event, performance.now()), true);
      document.addEventListener(type, (event) => {
        const record = { type, id: event.target.id, trusted: event.isTrusted, inputType: event.inputType ?? null, syncMs: performance.now() - starts.get(event), framesMs: null };
        window.__inputMeasures.push(record);
        requestAnimationFrame(() => requestAnimationFrame(() => { record.framesMs = performance.now() - starts.get(event); }));
      });
    }
  });
  await bounded(() => page.goto(url));
  await bounded(() => page.waitForFunction(() => document.querySelector('#original-count').textContent.includes('20,000文字')));
  const requestCount = requests.length;
  const state = () => bounded(() => page.evaluate(() => ({
    inputs: ['original', 'updated'].map((id) => ({ value: document.querySelector(`#${id}`).value, count: document.querySelector(`#${id}-count`).textContent, error: document.querySelector(`#${id}-error`).textContent, invalid: document.querySelector(`#${id}`).getAttribute('aria-invalid') })),
    rows: document.querySelector('#diff-rows').children.length,
    tableHidden: document.querySelector('#diff-table').hidden,
    status: document.querySelector('#comparison-status').textContent,
  })));
  const assertState = async (values, status, compared = false) => {
    const actual = await state();
    const wanted = values.map(expected);
    assert.deepEqual(actual.inputs, wanted.map((item) => ({ value: item.value, count: item.count, error: compared ? item.error : '', invalid: compared && item.error ? 'true' : null })));
    if (status) assert.equal(actual.status, status);
    if (!compared || wanted.some((item) => item.error)) {
      assert.equal(actual.rows, 0);
      assert.equal(actual.tableHidden, true);
    } else {
      assert.ok(actual.rows > 0);
      assert.equal(actual.tableHidden, false);
    }
  };
  const measure = async (label, type, id, operation) => {
    activeCase = label;
    await bounded(() => page.evaluate(() => { window.__inputMeasures = []; }));
    const start = performance.now();
    await bounded(operation);
    const wallMs = performance.now() - start;
    await bounded(() => page.waitForFunction(() => window.__inputMeasures.length > 0 && window.__inputMeasures.every((record) => record.framesMs !== null)));
    const events = await bounded(() => page.evaluate(() => window.__inputMeasures));
    assert.ok(events.some((event) => event.type === type && event.id === id));
    const syncMaxMs = Math.max(...events.map((event) => event.syncMs));
    const syncTotalMs = events.reduce((sum, event) => sum + event.syncMs, 0);
    const framesMaxMs = Math.max(...events.map((event) => event.framesMs));
    assert.ok(wallMs < stopWallMs && framesMaxMs < stopWallMs && syncTotalMs < stopSyncMs, `${label}: stop threshold; remaining cases not run`);
    return {
      wallMs: +wallMs.toFixed(2), eventCount: events.length,
      eventKinds: [...new Set(events.map((event) => `${event.type}/${event.trusted}/${event.inputType}`))],
      syncMaxMs: +syncMaxMs.toFixed(2), syncTotalMs: +syncTotalMs.toFixed(2), framesMaxMs: +framesMaxMs.toFixed(2),
    };
  };
  const insert = async (method, id, value) => {
    if (method === 'fill') return page.locator(`#${id}`).fill(value);
    if (method === 'insertText') return page.keyboard.insertText(value);
    return page.evaluate(({ id, value }) => {
      const field = document.querySelector(`#${id}`);
      field.value = value;
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }, { id, value });
  };
  // Size is the outer loop, so no method reaches a larger fixture after a failure.
  for (const [name, value] of fixtures) {
    for (const method of ['fill', 'dom-input', 'insertText']) {
      for (const [index, id] of ids.entries()) {
        const label = `${name}/${method}/${id}`;
        activeCase = `${label}/prepare`;
        await bounded(() => page.locator('#clear').click());
        const other = ids[1 - index];
        await bounded(() => page.locator(`#${other}`).fill('合成の相手'));
        // Start from visible results; typing must remove them.
        await bounded(() => page.locator('#compare').click());
        await bounded(() => page.locator(`#${id}`).focus());
        const values = ['', ''].with(index, value).with(1 - index, '合成の相手');
        const input = await measure(`${label}/input`, 'input', id, () => insert(method, id, value));
        await assertState(values, edited);
        const compare = await measure(`${label}/compare`, 'click', 'compare', () => page.locator('#compare').click());
        await assertState(values, expected(value).error ? invalid : null, true);
        // Edit the other input while the tested input remains intact, then revalidate.
        await bounded(() => page.locator(`#${other}`).fill('相手を再編集'));
        values[1 - index] = '相手を再編集';
        await assertState(values, edited);
        await bounded(() => page.locator('#compare').click());
        await assertState(values, expected(value).error ? invalid : null, true);
        const clear = await measure(`${label}/clear`, 'click', 'clear', () => page.locator('#clear').click());
        await assertState(['', ''], cleared);
        await bounded(() => page.locator('#sample').click());
        await bounded(() => page.locator('#compare').click());
        assert.ok((await state()).rows > 0, 'clear recovers to sample comparison');
        records.push({ name, method, id, rawUnits: value.length, normalizedUnits: expected(value).value.length, lines: expected(value).lines, result: 'passed', input, compare, clear });
      }
    }
    console.log(JSON.stringify({ fixture: name, rawUnits: value.length, result: 'passed', trials: 6 }));
  }
  // Six back-to-back replacements at the already verified maximum; no frame wait.
  for (const method of ['fill', 'dom-input', 'insertText']) {
    activeCase = `burst/${method}`;
    await bounded(() => page.locator('#clear').click());
    await bounded(() => page.locator('#original').focus());
    const burst = await measure(activeCase, 'input', 'original', async () => {
      for (let index = 0; index < 6; index++) {
        if (method === 'insertText' && index > 0) {
          await page.locator('#original').selectText();
        }
        await insert(method, 'original', `${index % 2 ? 'y' : 'x'}`.repeat(100_000));
      }
    });
    assert.equal(burst.eventCount, 6);
    await assertState(['y'.repeat(100_000), ''], edited);
    await bounded(() => page.locator('#compare').click());
    await assertState(['y'.repeat(100_000), ''], invalid, true);
    await bounded(() => page.locator('#clear').click());
    await assertState(['', ''], cleared);
    records.push({ name: 'burst-6x100000', method, result: 'passed', input: burst });
  }
  assert.deepEqual(exceptions, []);
  assert.equal(requests.length, requestCount, 'input operations add no requests');
  assert.deepEqual(await bounded(() => page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length }))), { local: 0, session: 0, cookies: '', databases: 0, caches: 0 });
  console.log(JSON.stringify({ result: 'passed', mode: pagesCheck ? 'pages-subpath' : 'normal', chromium: browser.version(), deadlineMs, stopWallMs, stopSyncMs, viewport: '1440x1000', records, realPaste: 'not-run; no OS clipboard access' }));
} catch (error) {
  console.error(JSON.stringify({ result: 'failed', activeCase, completedTrials: records.length, remaining: 'not-run', message: error.message }));
  process.exitCode = 1;
} finally {
  // kill() owns only this launchServer process and its temporary profile.
  if (browserServer) await browserServer.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
