import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareTexts } from '../src/diff.mjs';

// Learning-only red checkpoint. DO NOT MERGE while this assertion is wrong.
test('CI learning RED / DO NOT MERGE: final newline adds a blank row', () => {
  const rows = compareTexts('garden\r\nflower', 'garden\nflower\n').rows;

  assert.deepEqual(rows, [
    { kind: 'unchanged', text: 'garden', originalLine: 1, updatedLine: 1 },
    { kind: 'unchanged', text: 'flower', originalLine: 2, updatedLine: 2 },
    // Deliberately wrong: an added row has originalLine: null. Correct after Human observes red CI.
    { kind: 'added', text: '', originalLine: 3, updatedLine: 3 },
  ]);
});
