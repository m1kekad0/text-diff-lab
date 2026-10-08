import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { compareTexts } from '../src/diff.mjs';

// Playwright is a separately provisioned local verification tool, not an app dependency.
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleName.startsWith('.') || moduleName.startsWith('/') ? pathToFileURL(resolve(moduleName)).href : moduleName);
const directory = await mkdtemp(join(tmpdir(), 'text-diff-browser-'));
const servers = [];
let browser;
async function serve(source) {
  const server = createStaticServer(source);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const sample = ['小さな庭のメモ\n種をまく\n水をやる\n収穫を待つ', '小さな庭のメモ\n苗を植える\n水をやる\n日当たりを確認する\n収穫を待つ'];
const errorFixture = [Array(101).fill('上限確認用の行').join('\n'), '上限確認用の行'];
const kinds = { added: '+ 追加', removed: '− 削除', unchanged: '= 変更なし' };

try {
  await build(directory);
  const url = await serve(directory);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP' });
  const page = await context.newPage();
  const requests = [];
  const exceptions = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#original-count').textContent.includes('20,000文字'));
  const fill = async (a, b) => {
    await page.locator('#original').fill(a);
    await page.locator('#updated').fill(b);
  };
  const compare = () => page.locator('#compare').click();
  const renderedRows = () => page.locator('#diff-rows tr').evaluateAll((rows) => rows.map((row) => Array.from(row.children, (cell) => cell.textContent)));
  const cases = [
    ['', ''], ['same\nline', 'same\nline'], ['', 'new'], ['old', ''],
    ['a\nc', 'a\nb\nc'], ['a\nb\nc', 'a\nc'], ['old', 'new'],
    ['a\nb\na', 'b\na\nb'], ['a\r\nb\r', 'a\nb\n'], ['a', 'a\n'],
    [Array(100).fill('x').join('\n'), Array(100).fill('x').join('\n')],
    ['x'.repeat(20_000), 'x'.repeat(20_000)],
    ['', '<script>window.__syntheticExecuted=true</script>\n<img src=x onerror="window.__syntheticExecuted=true">\n& < >'],
  ];
  for (const [a, b] of cases) {
    await fill(a, b);
    assert.equal(await page.locator('#diff-rows tr').count(), 0, 'editing removes stale results');
    await compare();
    const expected = compareTexts(a, b).rows.map((row) => [kinds[row.kind], String(row.originalLine ?? '—'), String(row.updatedLine ?? '—'), row.text || '（空行）']);
    assert.deepEqual(await renderedRows(), expected);
    assert.equal(await page.locator('#result-title').evaluate((el) => el === document.activeElement), true);
  }
  assert.equal(await page.locator('#diff-rows script, #diff-rows img').count(), 0);
  assert.equal(await page.evaluate(() => window.__syntheticExecuted), undefined);
  for (const [a, b, invalid] of [
    [errorFixture[0], '', 'original'], ['', errorFixture[0], 'updated'],
    ['x'.repeat(20_001), '', 'original'], ['', 'x'.repeat(20_001), 'updated'],
  ]) {
    await fill(a, b);
    await compare();
    assert.equal(await page.locator(`#${invalid}`).getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator(`#${invalid}-error`).textContent(), /以内にしてください/);
    assert.equal(await page.locator(`#${invalid}`).evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator('#diff-rows tr').count(), 0);
  }
  await fill(errorFixture[0], 'x'.repeat(20_001));
  await compare();
  assert.equal(await page.locator('[aria-invalid="true"]').count(), 2);
  for (let repeat = 0; repeat < 3; repeat++) {
    await page.locator('#sample').click();
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
    assert.equal(await page.locator('#diff-rows tr').count(), 0);
    assert.equal(await page.locator('#original').inputValue(), sample[0]);
    assert.equal(await page.locator('#updated').inputValue(), sample[1]);
    await page.locator('#compare').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#comparison-status').textContent(), '追加 2行 · 削除 1行 · 変更なし 3行');
    await compare();
    assert.equal(await page.locator('#diff-rows tr').count(), 6);
    await page.locator('#original').fill('edited');
    assert.equal(await page.locator('#diff-rows tr').count(), 0);
    assert.match(await page.locator('#comparison-status').textContent(), /更新してください/);
    await page.locator('#clear').click();
    assert.equal(await page.locator('#original').inputValue(), '');
    assert.equal(await page.locator('#updated').inputValue(), '');
    await compare();
    assert.match(await page.locator('#comparison-status').textContent(), /両方の入力が空/);
  }
  assert.deepEqual(exceptions, []);
  assert.ok(requests.every((request) => request.method === 'GET' && request.url.startsWith(`${url}/`) && ['/', '/styles.css', '/app.mjs', '/diff.mjs', '/favicon.ico'].includes(new URL(request.url).pathname)));
  const requestCount = requests.length;
  await page.locator('#sample').click();
  await compare();
  await page.locator('#clear').click();
  assert.equal(requests.length, requestCount, 'input operations make no network requests');
  assert.deepEqual(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length })), { local: 0, session: 0, cookies: '', databases: 0, caches: 0 });
  await page.reload();
  assert.equal(await page.locator('#original').inputValue(), '');
  assert.equal(await page.locator('#updated').inputValue(), '');
  await page.locator('.brand').focus();
  for (const id of ['original', 'updated', 'sample', 'clear', 'compare']) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), id, 'keyboard focus order');
  }
  await context.close();

  // Optional paired captures: the baseline inputs are disabled, so set only synthetic values.
  if (process.env.CAPTURE_DIR && process.env.BASE_SRC) {
    await mkdir(process.env.CAPTURE_DIR, { recursive: true });
    const baseUrl = await serve(process.env.BASE_SRC);
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      for (const [state, fixture] of [['normal', sample], ['error', errorFixture], ['empty', ['', '']]]) {
        for (const [revision, address] of [['before', baseUrl], ['after', url]]) {
          const captureContext = await browser.newContext({ viewport, locale: 'ja-JP' });
          const capturePage = await captureContext.newPage();
          await capturePage.goto(address);
          if (revision === 'before') {
            await capturePage.evaluate(([a, b]) => { document.querySelector('#original').value = a; document.querySelector('#updated').value = b; }, fixture);
          } else {
            await capturePage.locator('#original').fill(fixture[0]);
            await capturePage.locator('#updated').fill(fixture[1]);
            await capturePage.locator('#compare').click();
            assert.equal(await capturePage.locator('#diff-rows tr').count(), state === 'normal' ? 6 : 0);
            if (state === 'error') assert.equal(await capturePage.locator('#original').getAttribute('aria-invalid'), 'true');
            if (state === 'empty') assert.match(await capturePage.locator('#result-placeholder').textContent(), /両方の入力が空/);
            await capturePage.locator('#compare').blur();
            await capturePage.locator(':focus').evaluateAll((elements) => elements.forEach((el) => el.blur()));
          }
          assert.equal(await capturePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
          await capturePage.evaluate(() => window.scrollTo(0, 0));
          await capturePage.locator('textarea').evaluateAll((fields) => fields.forEach((field) => { field.scrollTop = 0; field.scrollLeft = 0; }));
          await capturePage.screenshot({ path: join(process.env.CAPTURE_DIR, `mvp-${name}-${state}-${revision}.png`), fullPage: true });
          await captureContext.close();
        }
      }
    }
  }
  console.log(`Chromium ${browser.version()}: functional checks passed; synthetic disposable contexts only.`);
} finally {
  if (browser) await browser.close();
  for (const server of servers) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
