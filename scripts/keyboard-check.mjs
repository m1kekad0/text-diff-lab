import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { assets, build } from './build.mjs';
import { createStaticServer } from './serve.mjs';

// Use the locked devDependency; browser installation is an explicit setup step.
const directory = await mkdtemp(join(tmpdir(), 'text-diff-keyboard-'));
const pagesCheck = process.env.PAGES_CHECK === '1';
const prefix = pagesCheck ? '/text-diff-lab/' : '/';
const mode = pagesCheck ? 'pages' : 'root';
const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const records = [];
const sample = ['小さな庭のメモ\n種をまく\n水をやる\n収穫を待つ', '小さな庭のメモ\n苗を植える\n水をやる\n日当たりを確認する\n収穫を待つ'];
const messages = {
  initial: 'テキストを入力して「比較する」を押してください。',
  edited: '入力を編集しました。「比較する」で結果を更新してください。',
  sample: 'サンプルを入力しました。「比較する」で違いを確認できます。',
  cleared: '入力と結果をクリアしました。テキストを入力して比較してください。',
  invalid: '比較できません。入力欄の上限エラーを修正してください。',
};
let browser;
let server;
let activeCase = 'setup';

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
  browser = await chromium.launch({ headless: true });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['narrow', { width: 390, height: 844 }]]) {
    activeCase = `${mode}/${name}`;
    const context = await browser.newContext({ viewport, locale: 'ja-JP' });
    try {
      const externalRequests = [];
      await context.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== new URL(url).origin) {
          externalRequests.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5_000);
      const requests = [];
      const exceptions = [];
      page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
      page.on('pageerror', (error) => exceptions.push(error.message));
      const response = await page.goto(url);
      assert.equal(response.status(), 200);
      if (pagesCheck) assert.equal(response.headers()['content-security-policy'], undefined);
      await page.waitForFunction(() => document.querySelector('#original-count').textContent.includes('20,000文字'));
      const requestCount = requests.length;
      assert.equal(await page.evaluate(() => document.activeElement === document.body), true, 'fresh page starts without scripted focus');
      const focusRecords = [];
      // Observation only: DOM evaluation never changes focus, values, scroll or state.
      const focused = async (id) => {
        const state = await page.evaluate(() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            id: element.id || (element.matches('.brand') ? 'brand' : element.tagName.toLowerCase()),
            focusVisible: element.matches(':focus-visible'),
            outline: style.outlineStyle,
            width: parseFloat(style.outlineWidth),
            color: style.outlineColor,
            offset: parseFloat(style.outlineOffset),
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            viewport: { width: innerWidth, height: innerHeight },
            noOverflow: document.documentElement.scrollWidth <= innerWidth,
          };
        });
        assert.equal(state.id, id, 'keyboard focus destination');
        assert.equal(state.focusVisible, true, `${id}: :focus-visible`);
        assert.equal(state.outline, 'solid', `${id}: focus outline`);
        assert.ok(state.width >= 3 && state.color !== 'rgba(0, 0, 0, 0)', `${id}: visible outline style`);
        const edge = state.width + state.offset;
        assert.ok(state.rect.left >= edge && state.rect.right <= state.viewport.width - edge, `${id}: full horizontal outline within viewport`);
        const visibleHeight = Math.min(state.rect.bottom, state.viewport.height) - Math.max(state.rect.top, 0);
        assert.ok(visibleHeight >= Math.min(state.rect.bottom - state.rect.top, 44), `${id}: focused control visible in viewport`);
        assert.ok((state.rect.top >= edge && state.rect.top <= state.viewport.height - edge) || (state.rect.bottom >= edge && state.rect.bottom <= state.viewport.height - edge), `${id}: complete top or bottom focus edge visible`);
        assert.equal(state.noOverflow, true, `${id}: no page horizontal overflow`);
        focusRecords.push(id);
      };
      const move = async (id, backwards = false) => {
        await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
        await focused(id);
      };
      const capture = async (state) => {
        if (!process.env.CAPTURE_DIR) return;
        await mkdir(process.env.CAPTURE_DIR, { recursive: true });
        await page.screenshot({ path: join(process.env.CAPTURE_DIR, `keyboard-${mode}-${name}-${state}.png`) });
      };
      const inputs = async (values) => {
        assert.deepEqual(await page.locator('textarea').evaluateAll((fields) => fields.map((field) => ({
          value: field.value,
          count: document.querySelector(`#${field.id}-count`).textContent,
        }))), values.map((value) => ({ value, count: `${value === '' ? 0 : value.split('\n').length} / 100行 · ${value.length.toLocaleString('ja-JP')} / 20,000文字` })));
      };
      const noResults = async (message, placeholder = message) => {
        assert.equal(await page.locator('#diff-rows tr').count(), 0);
        assert.equal(await page.locator('#diff-table').isVisible(), false);
        assert.equal(await page.locator('#result-placeholder').isVisible(), true);
        assert.equal(await page.locator('#result-placeholder').textContent(), placeholder);
        assert.equal(await page.locator('#comparison-status').textContent(), message);
      };
      const noErrors = async () => {
        for (const id of ['original', 'updated']) {
          assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), null);
          assert.equal(await page.locator(`#${id}-error`).textContent(), '');
        }
      };
      const reset = async (values, message) => {
        await inputs(values);
        await noResults(message);
        await noErrors();
      };
      const replace = async (id, value, bulk = false) => {
        await focused(id);
        await page.keyboard.press(selectAll);
        await page.keyboard.press('Backspace');
        // insertText is a browser-engine insertion, not OS clipboard or a paste event.
        if (bulk) await page.keyboard.insertText(value);
        else await page.keyboard.type(value);
        await focused(id);
      };
      const toCompareFromOriginal = async () => {
        for (const id of ['updated', 'sample', 'clear', 'compare']) await move(id);
      };
      const activate = async (id, key, destination) => {
        await focused(id);
        await page.keyboard.press(key);
        await focused(destination);
      };
      const compared = async (rows, summary) => {
        assert.deepEqual(await page.locator('#diff-rows tr').evaluateAll((elements) => elements.map((row) => Array.from(row.children, (cell) => cell.textContent))), rows);
        assert.equal(await page.locator('#diff-table').isVisible(), rows.length > 0);
        assert.equal(await page.locator('#result-placeholder').isVisible(), rows.length === 0);
        assert.equal(await page.locator('#comparison-status').textContent(), summary);
        await noErrors();
      };
      const sampleRows = [
        ['= 変更なし', '1', '1', '小さな庭のメモ'], ['− 削除', '2', '—', '種をまく'],
        ['+ 追加', '—', '2', '苗を植える'], ['= 変更なし', '3', '3', '水をやる'],
        ['+ 追加', '—', '4', '日当たりを確認する'], ['= 変更なし', '4', '5', '収穫を待つ'],
      ];
      await inputs(['', '']);
      await noResults(messages.initial, 'ここに行ごとの結果を表示します。');
      // First Tab comes from the fresh document, including home and rules in both directions.
      for (const id of ['brand', 'original', 'updated', 'sample', 'clear', 'compare', 'summary']) await move(id);
      for (const id of ['compare', 'clear', 'sample', 'updated', 'original', 'brand']) await move(id, true);
      await move('original');
      await capture('original-focus');
      await page.keyboard.type('庭\n花');
      await focused('original');
      await move('updated');
      await page.keyboard.type('庭\n木');
      await reset(['庭\n花', '庭\n木'], messages.edited);
      for (const id of ['sample', 'clear', 'compare']) await move(id);
      await capture('compare-focus');
      await activate('compare', 'Enter', 'result-title');
      await compared([['= 変更なし', '1', '1', '庭'], ['− 削除', '2', '—', '花'], ['+ 追加', '—', '2', '木']], '追加 1行 · 削除 1行 · 変更なし 1行');
      await capture('result-focus');
      await move('summary');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('details').getAttribute('open'), '');
      await focused('summary');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('details').getAttribute('open'), null);
      await move('compare', true);
      await activate('compare', 'Space', 'result-title');
      await move('compare', true);
      await move('clear', true);
      await activate('clear', 'Enter', 'original');
      await reset(['', ''], messages.cleared);
      await move('updated');
      await move('sample');
      await activate('sample', 'Space', 'original');
      await reset(sample, messages.sample);
      await toCompareFromOriginal();
      await activate('compare', 'Enter', 'result-title');
      await compared(sampleRows, '追加 2行 · 削除 1行 · 変更なし 3行');
      // Return from results through the actual reverse sequence, then edit either input.
      for (const [id, value] of [['updated', '編集右'], ['original', '編集左']]) {
        for (const target of ['compare', 'clear', 'sample', 'updated', ...(id === 'original' ? ['original'] : [])]) await move(target, true);
        await replace(id, value);
        const values = id === 'updated' ? [sample[0], value] : [value, '編集右'];
        await reset(values, messages.edited);
        if (id === 'original') await move('updated');
        for (const target of ['sample', 'clear', 'compare']) await move(target);
        await activate('compare', 'Space', 'result-title');
        await inputs(values);
        const rows = id === 'updated'
          ? [...sample[0].split('\n').map((text, index) => ['− 削除', String(index + 1), '—', text]), ['+ 追加', '—', '1', value]]
          : [['− 削除', '1', '—', value], ['+ 追加', '—', '1', '編集右']];
        await compared(rows, id === 'updated' ? '追加 1行 · 削除 4行 · 変更なし 0行' : '追加 1行 · 削除 1行 · 変更なし 0行');
      }
      // Each limit on both sides, followed by repairing the field that received focus.
      for (const [id, limit, oversized, error] of ['original', 'updated'].flatMap((id) => [
        [id, 'lines', Array(101).fill('x').join('\n'), '100行以内にしてください（現在101行）。'],
        [id, 'characters', 'x'.repeat(20_001), '20,000文字以内にしてください（現在20,001文字）。'],
      ])) {
        await move('compare', true);
        await move('clear', true);
        await activate('clear', 'Space', 'original');
        await reset(['', ''], messages.cleared);
        if (id === 'updated') await move('updated');
        await replace(id, oversized, true);
        await inputs(id === 'original' ? [oversized, ''] : ['', oversized]);
        if (id === 'original') await move('updated');
        for (const target of ['sample', 'clear', 'compare']) await move(target);
        await activate('compare', 'Enter', id);
        await noResults(messages.invalid, '入力の上限を超えているため、結果はありません。');
        for (const field of ['original', 'updated']) {
          assert.equal(await page.locator(`#${field}`).getAttribute('aria-invalid'), field === id ? 'true' : null);
          assert.equal(await page.locator(`#${field}-error`).textContent(), field === id ? error : '');
        }
        await capture(`${id}-${limit}-error-focus`);
        await replace(id, '修正済み');
        await reset(id === 'original' ? ['修正済み', ''] : ['', '修正済み'], messages.edited);
        if (id === 'original') await move('updated');
        for (const target of ['sample', 'clear', 'compare']) await move(target);
        await activate('compare', 'Space', 'result-title');
        await compared([[id === 'original' ? '− 削除' : '+ 追加', id === 'original' ? '1' : '—', id === 'updated' ? '1' : '—', '修正済み']], id === 'original' ? '追加 0行 · 削除 1行 · 変更なし 0行' : '追加 1行 · 削除 0行 · 変更なし 0行');
      }
      // Repetition covers Enter and Space on all three buttons and empty comparisons.
      for (const key of ['Enter', 'Space']) {
        await move('compare', true);
        await move('clear', true);
        await move('sample', true);
        await activate('sample', key, 'original');
        await reset(sample, messages.sample);
        await toCompareFromOriginal();
        await activate('compare', key, 'result-title');
        await compared(sampleRows, '追加 2行 · 削除 1行 · 変更なし 3行');
        await move('compare', true);
        await activate('compare', key, 'result-title');
        await compared(sampleRows, '追加 2行 · 削除 1行 · 変更なし 3行');
        await move('compare', true);
        await move('clear', true);
        await activate('clear', key, 'original');
        await reset(['', ''], messages.cleared);
        await toCompareFromOriginal();
        await activate('compare', key, 'result-title');
        await compared([], '両方の入力が空です。追加 0行 · 削除 0行 · 変更なし 0行');
      }
      assert.equal(requests.length, requestCount, 'keyboard input/actions make no additional requests');
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(exceptions, []);
      assert.deepEqual(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie, databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length })), { local: 0, session: 0, cookies: '', databases: 0, caches: 0 });
      records.push({ case: activeCase, result: 'passed', focusChecks: focusRecords.length });
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify({ browser: browser.version(), mode, result: 'passed', records, input: 'keyboard.type for small text; keyboard.insertText for bounded limit fixtures, no clipboard/paste' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ mode, failed: activeCase, records, remaining: 'not-run' }));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
