import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareTexts, inspectText } from '../src/diff.mjs';

const kinds = (a, b) => compareTexts(a, b).rows.map((row) => row.kind);

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
