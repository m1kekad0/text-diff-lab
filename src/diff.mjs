export const MAX_LINES = 100;
export const MAX_CHARACTERS = 20_000;

export function inspectText(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized === '' ? [] : normalized.split('\n');
  return { lines, lineCount: lines.length, characterCount: normalized.length };
}

export function inputError(input) {
  const errors = [];
  if (input.lineCount > MAX_LINES) errors.push(`100行以内にしてください（現在${input.lineCount}行）。`);
  if (input.characterCount > MAX_CHARACTERS) errors.push(`20,000文字以内にしてください（現在${input.characterCount.toLocaleString('ja-JP')}文字）。`);
  return errors.join(' ');
}

// Longest common subsequence. On a tie, remove from the left first.
export function compareTexts(original, updated) {
  const left = inspectText(original);
  const right = inspectText(updated);
  const errors = { original: inputError(left), updated: inputError(right) };
  if (errors.original || errors.updated) return { errors, rows: null };

  const a = left.lines;
  const b = right.lines;
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? 1 + lengths[i + 1][j + 1] : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: 'unchanged', text: a[i], originalLine: ++i, updatedLine: ++j });
    } else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1])) {
      rows.push({ kind: 'removed', text: a[i], originalLine: ++i, updatedLine: null });
    } else {
      rows.push({ kind: 'added', text: b[j], originalLine: null, updatedLine: ++j });
    }
  }
  return { errors, rows };
}
