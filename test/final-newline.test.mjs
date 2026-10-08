import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareTexts } from '../src/diff.mjs';

test('final newline adds a blank row with only an updated line number', () => {
  const rows = compareTexts('garden\r\nflower', 'garden\nflower\n').rows;

  assert.deepEqual(rows, [
    { kind: 'unchanged', text: 'garden', originalLine: 1, updatedLine: 1 },
    { kind: 'unchanged', text: 'flower', originalLine: 2, updatedLine: 2 },
    { kind: 'added', text: '', originalLine: null, updatedLine: 3 },
  ]);
});
