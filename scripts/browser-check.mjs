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
  const prefix = pagesCheck ? subpath : '/';
  assert.ok(requests.every((request) => request.method === 'GET' && new URL(request.url).origin === new URL(url).origin && [prefix, ...['styles.css', 'app.mjs', 'diff.mjs'].map((asset) => `${prefix}${asset}`), '/favicon.ico'].includes(new URL(request.url).pathname)));
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
  console.log(`Chromium ${browser.version()}: functional checks passed; synthetic disposable contexts only.`);
} finally {
  if (browser) await browser.close();
  for (const server of servers) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
