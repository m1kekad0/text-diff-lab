import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assets, build } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { compareTexts } from '../src/diff.mjs';

// Playwright is a separately provisioned local verification tool, not an app dependency.
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleName.startsWith('.') || moduleName.startsWith('/') ? pathToFileURL(resolve(moduleName)).href : moduleName);
const directory = await mkdtemp(join(tmpdir(), 'text-diff-browser-'));
const servers = [];
const pagesCheck = process.env.PAGES_CHECK === '1';
const subpath = '/text-diff-lab/';
const servedRequests = [];
let browser;
async function serve(source) {
  // Pages QA deliberately omits every custom response header from serve.mjs.
  const server = pagesCheck ? createServer(async (request, response) => {
    servedRequests.push({ path: request.url, method: request.method });
    const asset = request.url === subpath ? 'index.html' : request.url.slice(subpath.length);
    if (!request.url.startsWith(subpath) || !assets.includes(asset) || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript' };
    response.writeHead(200, { 'Content-Type': types[asset.split('.').pop()] });
    response.end(await readFile(join(source, asset)));
  }) : createStaticServer(source);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}${pagesCheck ? subpath : ''}`;
}

const sample = ['小さな庭のメモ\n種をまく\n水をやる\n収穫を待つ', '小さな庭のメモ\n苗を植える\n水をやる\n日当たりを確認する\n収穫を待つ'];
const errorFixture = [Array(101).fill('上限確認用の行').join('\n'), '上限確認用の行'];
const kinds = { added: '+ 追加', removed: '− 削除', unchanged: '= 変更なし' };
const messages = {
  initialStatus: 'テキストを入力して「比較する」を押してください。',
  initialPlaceholder: 'ここに行ごとの結果を表示します。',
  edited: '入力を編集しました。「比較する」で結果を更新してください。',
  sample: 'サンプルを入力しました。「比較する」で違いを確認できます。',
  cleared: '入力と結果をクリアしました。テキストを入力して比較してください。',
  invalidStatus: '比較できません。入力欄の上限エラーを修正してください。',
  invalidPlaceholder: '入力の上限を超えているため、結果はありません。',
  emptyPlaceholder: '両方の入力が空です。比較する行はありません。',
};

try {
  await build(directory);
  const url = await serve(directory);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP' });
  const externalRoutes = [];
  if (pagesCheck) await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== new URL(url).origin) {
      externalRoutes.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const requests = [];
  const assetResponses = [];
  const exceptions = [];
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  page.on('response', (response) => assetResponses.push({ path: new URL(response.url()).pathname, status: response.status(), type: response.headers()['content-type'] }));
  page.on('pageerror', (error) => exceptions.push(error.message));
  const response = await page.goto(url);
  if (pagesCheck) assert.equal(response.headers()['content-security-policy'], undefined);
  await page.waitForFunction(() => document.querySelector('#original-count').textContent.includes('20,000文字'));
  const fill = async (a, b) => {
    await page.locator('#original').fill(a);
    await page.locator('#updated').fill(b);
  };
  const compare = () => page.locator('#compare').click();
  const renderedRows = () => page.locator('#diff-rows tr').evaluateAll((rows) => rows.map((row) => Array.from(row.children, (cell) => cell.textContent)));
  const ids = ['original', 'updated'];
  const assertInputs = async (values) => {
    const expected = values.map((value, index) => {
      const normalized = value.replace(/\r\n?/g, '\n');
      return { id: ids[index], value: normalized, count: `${normalized === '' ? 0 : normalized.split('\n').length} / 100行 · ${normalized.length.toLocaleString('ja-JP')} / 20,000文字` };
    });
    assert.deepEqual(await page.locator('textarea').evaluateAll((fields) => fields.map((field) => ({ id: field.id, value: field.value, count: document.querySelector(`#${field.id}-count`).textContent }))), expected, 'input values and counters');
  };
  const assertNoErrors = async () => {
    for (const id of ids) {
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), null, `${id}: no stale invalid attribute`);
      assert.equal(await page.locator(`#${id}-error`).textContent(), '', `${id}: no stale error text`);
    }
  };
  const assertNoResults = async (status, placeholder = status) => {
    assert.deepEqual(await renderedRows(), [], 'no stale result rows');
    assert.equal(await page.locator('#diff-table').evaluate((el) => el.hidden), true);
    assert.equal(await page.locator('#diff-table').isVisible(), false);
    assert.equal(await page.locator('#result-placeholder').isVisible(), true);
    assert.equal(await page.locator('#result-placeholder').textContent(), placeholder);
    assert.equal(await page.locator('#comparison-status').textContent(), status);
  };
  const assertReset = async (values, status, placeholder = status) => {
    await assertInputs(values);
    await assertNoErrors();
    await assertNoResults(status, placeholder);
  };
  const assertComparison = async (values) => {
    await assertInputs(values);
    await assertNoErrors();
    const expected = compareTexts(...values).rows;
    assert.deepEqual(await renderedRows(), expected.map((row) => [kinds[row.kind], String(row.originalLine ?? '—'), String(row.updatedLine ?? '—'), row.text || '（空行）']));
    const counts = { added: 0, removed: 0, unchanged: 0 };
    for (const row of expected) counts[row.kind]++;
    const summary = `追加 ${counts.added}行 · 削除 ${counts.removed}行 · 変更なし ${counts.unchanged}行`;
    assert.equal(await page.locator('#comparison-status').textContent(), expected.length ? summary : `両方の入力が空です。${summary}`);
    assert.equal(await page.locator('#diff-table').isVisible(), expected.length > 0);
    assert.equal(await page.locator('#result-placeholder').isVisible(), expected.length === 0);
    assert.equal(await page.locator('#result-placeholder').textContent(), messages.emptyPlaceholder);
    assert.equal(await page.locator('#result-title').evaluate((el) => el === document.activeElement), true);
  };
  const assertInvalid = async (values, invalid) => {
    await assertInputs(values);
    for (const id of ids) {
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), invalid.includes(id) ? 'true' : null);
      const error = await page.locator(`#${id}-error`).textContent();
      if (invalid.includes(id)) assert.match(error, /以内にしてください/);
      else assert.equal(error, '');
    }
    await assertNoResults(messages.invalidStatus, messages.invalidPlaceholder);
    assert.equal(await page.locator(`#${invalid[0]}`).evaluate((el) => el === document.activeElement), true);
  };
  const activate = async (id, key) => {
    if (!key) return page.locator(`#${id}`).click();
    await page.locator(`#${id}`).focus();
    await page.keyboard.press(key);
  };
  await assertReset(['', ''], messages.initialStatus, messages.initialPlaceholder);
  // Seed actual edits so even the first empty fixture exercises the input handlers.
  await fill('合成の準備左', '合成の準備右');
  const cases = [
    ['', ''], ['same\nline', 'same\nline'], ['', 'new'], ['old', ''],
    ['a\nc', 'a\nb\nc'], ['a\nb\nc', 'a\nc'], ['old', 'new'],
    ['a\nb\na', 'b\na\nb'], ['a\r\nb\r', 'a\nb\n'], ['a', 'a\n'],
    ['a\n\n\nb\n', '\n\na\n\nb\n'],
    [Array(100).fill('x').join('\n'), Array(100).fill('x').join('\n')],
    ['x'.repeat(20_000), 'x'.repeat(20_000)],
    ['x'.repeat(19_999) + '\r\n', 'x'.repeat(19_999) + '\n'],
    ['🌱'.repeat(10_000), '🌱'.repeat(10_000)],
    ['', '<script>window.__syntheticExecuted=true</script>\n<img src=x onerror="window.__syntheticExecuted=true">\n& < >'],
  ];
  for (const [a, b] of cases) {
    await fill(a, b);
    await assertReset([a, b], messages.edited);
    await compare();
    await assertComparison([a, b]);
  }
  assert.equal(await page.locator('#diff-rows script, #diff-rows img').count(), 0);
  assert.equal(await page.evaluate(() => window.__syntheticExecuted), undefined);
  for (const [a, b, invalid] of [
    [errorFixture[0], '', 'original'], ['', errorFixture[0], 'updated'],
    ['x'.repeat(20_001), '', 'original'], ['', 'x'.repeat(20_001), 'updated'],
    ['', '🌱'.repeat(10_000) + 'x', 'updated'],
  ]) {
    await fill(a, b);
    await compare();
    await assertInvalid([a, b], [invalid]);
  }
  // Bounded oversized synthetic values: recover while the untouched field is invalid.
  for (const [index, oversized] of [[0, 'x'.repeat(20_000) + '\n'.repeat(1_000)], [1, 'x'.repeat(20_000) + '\r\n'.repeat(1_000)]]) {
    const values = ['合成左', '合成右'].with(index, oversized);
    await fill(...values);
    await compare();
    await assertInvalid(values, [ids[index]]);
    assert.equal(await page.locator(`#${ids[index]}-error`).textContent(), '100行以内にしてください（現在1001行）。 20,000文字以内にしてください（現在21,000文字）。');
    const edited = values.with(1 - index, 'もう一方を編集');
    await page.locator(`#${ids[1 - index]}`).fill(edited[1 - index]);
    await assertReset(edited, messages.edited);
    await compare();
    await assertInvalid(edited, [ids[index]]);
    await page.locator('#clear').click();
    await assertReset(['', ''], messages.cleared);
    await page.locator('#sample').click();
    await assertReset(sample, messages.sample);
    await compare();
    await assertComparison(sample);
  }
  const bothInvalid = [errorFixture[0], 'x'.repeat(20_001)];
  // Editing either field clears both old errors; compare revalidates the untouched invalid field.
  for (const [index, id] of ids.entries()) {
    await fill(...bothInvalid);
    await compare();
    await assertInvalid(bothInvalid, ids);
    const edited = bothInvalid.with(index, `合成の編集 ${id}`);
    await page.locator(`#${id}`).fill(edited[index]);
    await assertReset(edited, messages.edited);
    await compare();
    await assertInvalid(edited, [ids[1 - index]]);
  }
  for (const [action, values, message] of [['clear', ['', ''], messages.cleared], ['sample', sample, messages.sample]]) {
    await fill(...bothInvalid);
    await compare();
    await assertInvalid(bothInvalid, ids);
    await activate(action, 'Enter');
    await assertReset(values, message);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'original');
    await compare();
    await assertComparison(values);
  }
  for (const [index, id] of ids.entries()) {
    await page.locator('#sample').click();
    await compare();
    await assertComparison(sample);
    const edited = sample.with(index, `合成の再編集 ${id}`);
    await page.locator(`#${id}`).fill(edited[index]);
    await assertReset(edited, messages.edited);
    await compare();
    await assertComparison(edited);
  }
  // Consecutive actions without added waits, covering mouse, Enter and Space activation.
  for (const key of [undefined, 'Enter', 'Space']) {
    await activate('sample', key);
    await assertReset(sample, messages.sample);
    await activate('compare', key);
    await assertComparison(sample);
    await activate('compare', key);
    await assertComparison(sample);
    await activate('sample', key);
    await assertReset(sample, messages.sample);
    await activate('compare', key);
    await assertComparison(sample);
    await activate('clear', key);
    await assertReset(['', ''], messages.cleared);
    await activate('compare', key);
    await assertComparison(['', '']);
    await activate('clear', key);
    await assertReset(['', ''], messages.cleared);
  }
  // Dispatch each burst in one browser turn; the last action determines the entire state.
  for (const [actions, values, message] of [
    [['compare', 'sample', 'compare', 'clear'], ['', ''], messages.cleared],
    [['compare', 'clear', 'compare', 'sample'], sample, messages.sample],
    [['clear', 'sample', 'clear', 'compare'], ['', ''], null],
    [['compare', 'clear', 'sample', 'compare'], sample, null],
  ]) {
    await fill(...bothInvalid);
    await compare();
    await assertInvalid(bothInvalid, ids);
    await page.evaluate((actions) => actions.forEach((id) => document.querySelector(`#${id}`).click()), actions);
    if (message) await assertReset(values, message);
    else await assertComparison(values);
  }
  assert.deepEqual(exceptions, []);
  const prefix = pagesCheck ? subpath : '/';
  assert.ok(requests.every((request) => request.method === 'GET' && new URL(request.url).origin === new URL(url).origin && [prefix, ...['styles.css', 'app.mjs', 'diff.mjs'].map((asset) => `${prefix}${asset}`), '/favicon.ico'].includes(new URL(request.url).pathname)));
  const requestCount = requests.length;
  await page.locator('#sample').click();
  await compare();
  await page.locator('#clear').click();
  // Leave distinct nonempty inputs and visible rows immediately before reload.
  const reloadFixture = ['再読込前の合成左\n共通行', '再読込前の合成右\n共通行\n追加行'];
  await fill(...reloadFixture);
  await compare();
  assert.equal(requests.length, requestCount, 'input operations make no network requests');
  assert.deepEqual(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length })), { local: 0, session: 0, cookies: '', databases: 0, caches: 0 });
  await assertComparison(reloadFixture);
  assert.ok((await renderedRows()).length > 0, 'reload starts from rendered results');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#original-count').textContent.includes('20,000文字'));
  await assertReset(['', ''], messages.initialStatus, messages.initialPlaceholder);
  assert.deepEqual(exceptions, []);
  await page.locator('.brand').focus();
  for (const id of ['original', 'updated', 'sample', 'clear', 'compare']) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), id, 'keyboard focus order');
  }
  if (pagesCheck) {
    assert.equal(await page.locator('label[for="original"]').count(), 1);
    assert.equal(await page.locator('label[for="updated"]').count(), 1);
    assert.equal(await page.locator('#comparison-status').getAttribute('role'), 'status');
    for (const [asset, type] of [['', 'text/html'], ['styles.css', 'text/css'], ['app.mjs', 'text/javascript'], ['diff.mjs', 'text/javascript']]) {
      assert.ok(assetResponses.some((response) => response.path === `${subpath}${asset}` && response.status === 200 && response.type.startsWith(type)), 'project assets load with correct types');
    }
    const beforeProbes = servedRequests.length;
    await page.evaluate(async () => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(event.effectiveDirective));
      // Synthetic probes exercise the parsed meta policy, not Playwright's privileged evaluation.
      const script = document.createElement('script');
      script.textContent = 'window.__cspInlineExecuted = true';
      document.head.append(script);
      const external = document.createElement('script');
      external.src = 'https://example.invalid/csp-script.js';
      document.head.append(external);
      const style = document.createElement('style');
      style.textContent = 'body { display: none; }';
      document.head.append(style);
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://example.invalid/csp-style.css';
      document.head.append(css);
      const image = document.createElement('img');
      image.src = 'https://example.invalid/csp-image.png';
      document.body.append(image);
      const base = document.createElement('base');
      base.href = 'https://example.invalid/';
      document.head.append(base);
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/csp-form-probe';
      document.body.append(form);
      form.submit();
      await Promise.all(['/csp-fetch-probe', 'https://example.invalid/csp-fetch-probe'].map((target) => fetch(target, { method: 'POST', body: 'synthetic-csp-probe' }).catch(() => {})));
      await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onerror = resolve;
        xhr.onload = resolve;
        xhr.open('POST', '/csp-xhr-probe');
        xhr.send('synthetic-csp-probe');
      });
      navigator.sendBeacon('/csp-beacon-probe', 'synthetic-csp-probe');
      await new Promise((resolve) => {
        const socket = new WebSocket(location.origin.replace('http:', 'ws:') + '/csp-ws-probe');
        socket.onerror = resolve;
      });
      for (const element of [script, external, style, css, image, base, form]) element.remove();
    });
    await page.waitForFunction(() => ['script-src-elem', 'style-src-elem', 'img-src', 'base-uri', 'form-action', 'connect-src'].every((directive) => window.__violations.includes(directive)));
    assert.equal(await page.evaluate(() => window.__cspInlineExecuted), undefined);
    assert.equal(await page.evaluate(() => document.baseURI), url);
    assert.equal(await page.locator('body').isVisible(), true);
    assert.equal(servedRequests.length, beforeProbes, 'CSP probes never reached the static server');
    assert.deepEqual(externalRoutes, [], 'CSP blocked external probes before network interception');
    assert.deepEqual(exceptions, []);
    console.log('Pages subpath: headerless assets, operations, memory reset, keyboard/labels and meta CSP probes passed; no input requests reached the server.');
  }
  await context.close();

  // Optional paired captures: the baseline inputs are disabled, so set only synthetic values.
  if (process.env.CAPTURE_DIR && process.env.BASE_SRC) {
    await mkdir(process.env.CAPTURE_DIR, { recursive: true });
    const baseUrl = await serve(process.env.BASE_SRC);
    let baselineScreenshot;
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      for (const [state, fixture] of [['normal', sample], ['error', errorFixture], ['empty', ['', '']]]) {
        for (const [revision, address] of [['before', baseUrl], ['after', url]]) {
          const captureContext = await browser.newContext({ viewport, locale: 'ja-JP' });
          const capturePage = await captureContext.newPage();
          await capturePage.goto(address);
          if (revision === 'before' && !pagesCheck) {
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
          const screenshot = await capturePage.screenshot({ path: join(process.env.CAPTURE_DIR, `${pagesCheck ? 'pages' : 'mvp'}-${name}-${state}-${revision}.png`), fullPage: true });
          if (pagesCheck && revision === 'before') baselineScreenshot = screenshot;
          if (pagesCheck && revision === 'after') assert.deepEqual(screenshot, baselineScreenshot, 'same-condition before/after pixels unchanged');
          await captureContext.close();
        }
      }
    }
  }
  console.log(`Chromium ${browser.version()}: functional checks, validation/result resets and nonempty reload reset passed; synthetic disposable contexts only.`);
} finally {
  if (browser) await browser.close();
  for (const server of servers) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
