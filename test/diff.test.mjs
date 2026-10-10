import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareTexts, countText, inspectText } from '../src/diff.mjs';

const kinds = (a, b) => compareTexts(a, b).rows.map((row) => row.kind);

const assertComparison = (a, b, message) => {
  const { errors, rows } = compareTexts(a.join('\n'), b.join('\n'));
  assert.deepEqual(errors, { original: '', updated: '' }, message);
  for (const [lines, excluded, key] of [[a, 'added', 'originalLine'], [b, 'removed', 'updatedLine']]) {
    const side = rows.filter((row) => row.kind !== excluded);
    assert.deepEqual(side.map((row) => row.text), lines, message);
    assert.deepEqual(side.map((row) => row[key]), lines.map((_, i) => i + 1), message);
    assert.ok(rows.filter((row) => row.kind === excluded).every((row) => row[key] === null), message);
  }
  return rows;
};

test('empty, identical, insert, delete and replacement', () => {
  assert.deepEqual(compareTexts('', '').rows, []);
  assert.deepEqual(kinds('one\ntwo', 'one\ntwo'), ['unchanged', 'unchanged']);
  assert.deepEqual(kinds('', 'one'), ['added']);
  assert.deepEqual(kinds('one', ''), ['removed']);
  assert.deepEqual(kinds('one\nthree', 'one\ntwo\nthree'), ['unchanged', 'added', 'unchanged']);
  assert.deepEqual(kinds('one\ntwo\nthree', 'one\nthree'), ['unchanged', 'removed', 'unchanged']);
  assert.deepEqual(kinds('before', 'after'), ['removed', 'added']);
  assert.deepEqual(kinds('One ', 'one'), ['removed', 'added']);
});

test('normalize CRLF and CR, preserve blank lines and final newline', () => {
  assert.deepEqual(inspectText(''), { lines: [], lineCount: 0, characterCount: 0 });
  assert.deepEqual(inspectText('a\r\nb\rc\n'), { lines: ['a', 'b', 'c', ''], lineCount: 4, characterCount: 6 });
  assert.deepEqual(kinds('a\r\nb\r', 'a\nb\n'), ['unchanged', 'unchanged', 'unchanged']);
  assert.deepEqual(kinds('a', 'a\n'), ['unchanged', 'added']);
  assert.deepEqual(kinds('a\n', 'a'), ['unchanged', 'removed']);
  assert.deepEqual(kinds('\n', ''), ['removed', 'removed']);
  assert.equal(inspectText('🌱').characterCount, 2);
});

test('counts match normalization for exhaustive short CR, LF and Unicode inputs', () => {
  const alphabet = ['x', '\r', '\n', '日', '🌱', '\u0301', '\u2028', '\ud800'];
  const check = (text, remaining) => {
    const normalized = text.replace(/\r\n?/g, '\n');
    const expected = { lineCount: normalized === '' ? 0 : normalized.split('\n').length, characterCount: normalized.length };
    assert.deepEqual(countText(text), expected);
    const { lineCount, characterCount } = inspectText(text);
    assert.deepEqual({ lineCount, characterCount }, expected);
    if (remaining) for (const token of alphabet) check(text + token, remaining - 1);
  };
  check('', 5);
});

test('normalized character boundaries keep CRLF and UTF-16 semantics', () => {
  const crlf = 'x'.repeat(19_999) + '\r\n';
  assert.deepEqual(countText(crlf), { lineCount: 2, characterCount: 20_000 });
  assert.equal(compareTexts(crlf, '').rows.length, 2);
  const emoji = '🌱'.repeat(10_000);
  assert.deepEqual(countText(emoji), { lineCount: 1, characterCount: 20_000 });
  assert.equal(compareTexts(emoji, '').rows.length, 1);
  assert.deepEqual(compareTexts('', emoji + 'x'), {
    errors: { original: '', updated: '20,000文字以内にしてください（現在20,001文字）。' }, rows: null,
  });
});

test('bounded oversized newline inputs report full counts and both errors without rows', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const text = newline.repeat(100_000);
    assert.deepEqual(countText(text), { lineCount: 100_001, characterCount: 100_000 });
    assert.deepEqual(compareTexts(text, text), {
      errors: {
        original: '100行以内にしてください（現在100001行）。 20,000文字以内にしてください（現在100,000文字）。',
        updated: '100行以内にしてください（現在100001行）。 20,000文字以内にしてください（現在100,000文字）。',
      }, rows: null,
    });
  }
});

test('rejected comparisons do not normalize or split either input', () => {
  const replace = String.prototype.replace;
  const split = String.prototype.split;
  let materializations = 0;
  try {
    String.prototype.replace = function (...args) { materializations++; return replace.apply(this, args); };
    String.prototype.split = function (...args) { materializations++; return split.apply(this, args); };
    assert.equal(compareTexts('ok\r\n', '\n'.repeat(100)).rows, null);
    assert.equal(compareTexts('x'.repeat(20_001), 'ok\r\n').rows, null);
  } finally {
    String.prototype.replace = replace;
    String.prototype.split = split;
  }
  assert.equal(materializations, 0);
});

test('repeated blank lines reconstruct both normalized inputs and line numbers', () => {
  const inputs = ['', '\n', '\n\n', '\r\n\r\n', 'a\n\n\nb\n', '\r\ra\r\nb\r'];
  for (const original of inputs) {
    for (const updated of inputs) {
      const rows = compareTexts(original, updated).rows;
      for (const [text, excluded, key] of [[original, 'added', 'originalLine'], [updated, 'removed', 'updatedLine']]) {
        const side = rows.filter((row) => row.kind !== excluded);
        assert.deepEqual(side.map((row) => row.text), inspectText(text).lines);
        assert.deepEqual(side.map((row) => row[key]), side.map((_, i) => i + 1));
      }
    }
  }
});

test('repeated lines have stable alignment, line numbers and deletion-first ties', () => {
  assert.deepEqual(compareTexts('a\nb\na', 'b\na\nb').rows, [
    { kind: 'removed', text: 'a', originalLine: 1, updatedLine: null },
    { kind: 'unchanged', text: 'b', originalLine: 2, updatedLine: 1 },
    { kind: 'unchanged', text: 'a', originalLine: 3, updatedLine: 2 },
    { kind: 'added', text: 'b', originalLine: null, updatedLine: 3 },
  ]);
  assert.deepEqual(kinds('x\nx', 'x'), ['unchanged', 'removed']);
});

test('limits accept exact boundaries and return all side errors before diffing', () => {
  const lines100 = Array(100).fill('x').join('\n');
  const lines101 = `${lines100}\n`;
  assert.equal(compareTexts(lines100, lines100).rows.length, 100);
  assert.equal(compareTexts(lines101, '').rows, null);
  assert.match(compareTexts(lines101, '').errors.original, /現在101行/);
  assert.equal(compareTexts('x'.repeat(20_000), '').rows.length, 1);
  assert.equal(compareTexts('🌱'.repeat(10_000), '').rows.length, 1);
  assert.equal(compareTexts('', 'x'.repeat(20_001)).rows, null);
  assert.match(compareTexts('', 'x'.repeat(20_001)).errors.updated, /20,001文字/);
  const both = compareTexts(`${'x'.repeat(20_000)}${'\n'.repeat(100)}`, lines101);
  assert.equal(both.rows, null);
  assert.match(both.errors.original, /100行以内.*20,000文字以内/);
  assert.match(both.errors.updated, /100行以内/);
  assert.equal(inspectText('x\r\n'.repeat(99) + 'x').lineCount, 100);
});

test('hostile-looking text remains literal input', () => {
  const text = '<script>throw "synthetic"</script>\n<img src=x onerror=alert(1)>\n& < > "';
  assert.deepEqual(compareTexts('', text).rows.map((row) => row.text), text.split('\n'));
});

test('exhaustive small inputs reconstruct both sides with a minimal edit count', () => {
  const sequences = [[]];
  for (let length = 1; length <= 3; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) {
      sequences.push(Array.from({ length }, (_, i) => mask & (1 << i) ? 'a' : 'b'));
    }
  }
  // Independent oracle: enumerate subsequences rather than reuse the LCS recurrence.
  const subsequences = (lines) => Array.from({ length: 2 ** lines.length }, (_, mask) => lines.filter((_, i) => mask & (1 << i)).join('\n'));
  for (const a of sequences) {
    for (const b of sequences) {
      const rows = compareTexts(a.join('\n'), b.join('\n')).rows;
      assert.deepEqual(rows.filter((row) => row.kind !== 'added').map((row) => row.text), a);
      assert.deepEqual(rows.filter((row) => row.kind !== 'removed').map((row) => row.text), b);
      const common = subsequences(a).filter((text) => subsequences(b).includes(text));
      const longest = Math.max(...common.map((text) => text === '' ? 0 : text.split('\n').length));
      assert.equal(rows.filter((row) => row.kind !== 'unchanged').length, a.length + b.length - 2 * longest);
      assert.deepEqual(rows.filter((row) => row.originalLine !== null).map((row) => row.originalLine), a.map((_, i) => i + 1));
      assert.deepEqual(rows.filter((row) => row.updatedLine !== null).map((row) => row.updatedLine), b.map((_, i) => i + 1));
    }
  }
});

test('100 entirely different lines produce 200 rows with deletion-first ordering', () => {
  const a = Array.from({ length: 100 }, (_, i) => `original-${i}`);
  const b = Array.from({ length: 100 }, (_, i) => `updated-${i}`);
  const rows = assertComparison(a, b);
  assert.deepEqual(rows, [
    ...a.map((text, i) => ({ kind: 'removed', text, originalLine: i + 1, updatedLine: null })),
    ...b.map((text, i) => ({ kind: 'added', text, originalLine: null, updatedLine: i + 1 })),
  ]);
});

test('long repeated runs and alternating lines remain minimal at 100 lines per side', () => {
  const cases = [
    [Array(50).fill('a').concat(Array(50).fill('b')), Array(50).fill('b').concat(Array(50).fill('a')), 100],
    [Array.from({ length: 100 }, (_, i) => i % 2 ? 'b' : 'a'), Array.from({ length: 100 }, (_, i) => i % 2 ? 'a' : 'b'), 2],
  ];
  for (const [a, b, edits] of cases) {
    const rows = assertComparison(a, b);
    assert.equal(rows.filter((row) => row.kind !== 'unchanged').length, edits);
    assert.deepEqual(rows[0], { kind: 'removed', text: 'a', originalLine: 1, updatedLine: null });
  }
});

test('seeded 96–100 line inputs reconstruct both sides with a minimal edit count', () => {
  // Independent oracle: edit distance with replacement cost 2, using prefix costs.
  const minimumEdits = (a, b) => {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 0; i < a.length; i++) {
      const current = [i + 1];
      for (let j = 0; j < b.length; j++) {
        current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 2)));
      }
      previous = current;
    }
    return previous[b.length];
  };
  const seed = 0x5eed;
  let state = seed;
  const lines = (length) => Array.from({ length }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return ['a', 'b', 'c', 'd'][state >>> 30];
  });
  for (let left = 96; left <= 100; left++) {
    for (let right = 96; right <= 100; right++) {
      const a = lines(left);
      const b = lines(right);
      const message = `seed=${seed}, lengths=${left}/${right}`;
      const rows = assertComparison(a, b, message);
      assert.equal(rows.filter((row) => row.kind !== 'unchanged').length, minimumEdits(a, b), message);
    }
  }
});
