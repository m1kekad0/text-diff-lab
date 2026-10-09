import { compareTexts, countText } from './diff.mjs';

const original = document.querySelector('#original');
const updated = document.querySelector('#updated');
const status = document.querySelector('#comparison-status');
const placeholder = document.querySelector('#result-placeholder');
const table = document.querySelector('#diff-table');
const body = document.querySelector('#diff-rows');
const labels = { added: '+ 追加', removed: '− 削除', unchanged: '= 変更なし' };

function updateCounts() {
  for (const field of [original, updated]) {
    const input = countText(field.value);
    document.querySelector(`#${field.id}-count`).textContent = `${input.lineCount} / 100行 · ${input.characterCount.toLocaleString('ja-JP')} / 20,000文字`;
  }
}

function resetResults(message) {
  body.replaceChildren();
  table.hidden = true;
  placeholder.hidden = false;
  placeholder.textContent = message;
  status.textContent = message;
  for (const field of [original, updated]) {
    field.removeAttribute('aria-invalid');
    document.querySelector(`#${field.id}-error`).textContent = '';
  }
  updateCounts();
}

for (const field of [original, updated]) {
  field.addEventListener('input', () => resetResults('入力を編集しました。「比較する」で結果を更新してください。'));
}

document.querySelector('#sample').addEventListener('click', () => {
  original.value = '小さな庭のメモ\n種をまく\n水をやる\n収穫を待つ';
  updated.value = '小さな庭のメモ\n苗を植える\n水をやる\n日当たりを確認する\n収穫を待つ';
  resetResults('サンプルを入力しました。「比較する」で違いを確認できます。');
  original.focus();
});

document.querySelector('#clear').addEventListener('click', () => {
  original.value = '';
  updated.value = '';
  resetResults('入力と結果をクリアしました。テキストを入力して比較してください。');
  original.focus();
});

document.querySelector('#compare').addEventListener('click', () => {
  resetResults('');
  const result = compareTexts(original.value, updated.value);
  if (result.rows === null) {
    for (const field of [original, updated]) {
      if (result.errors[field.id]) {
        field.setAttribute('aria-invalid', 'true');
        document.querySelector(`#${field.id}-error`).textContent = result.errors[field.id];
      }
    }
    status.textContent = '比較できません。入力欄の上限エラーを修正してください。';
    placeholder.textContent = '入力の上限を超えているため、結果はありません。';
    (result.errors.original ? original : updated).focus();
    return;
  }

  const counts = { added: 0, removed: 0, unchanged: 0 };
  const fragment = document.createDocumentFragment();
  for (const row of result.rows) {
    counts[row.kind]++;
    const tr = document.createElement('tr');
    tr.className = row.kind;
    for (const value of [labels[row.kind], row.originalLine ?? '—', row.updatedLine ?? '—', row.text]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const textCell = tr.lastElementChild;
    textCell.className = 'line-text';
    textCell.dir = 'auto';
    if (row.text === '') {
      textCell.textContent = '（空行）';
      textCell.classList.add('empty-line');
    }
    fragment.append(tr);
  }
  body.replaceChildren(fragment);
  table.hidden = result.rows.length === 0;
  placeholder.hidden = result.rows.length !== 0;
  placeholder.textContent = '両方の入力が空です。比較する行はありません。';
  const summary = `追加 ${counts.added}行 · 削除 ${counts.removed}行 · 変更なし ${counts.unchanged}行`;
  status.textContent = result.rows.length === 0 ? `両方の入力が空です。${summary}` : summary;
  document.querySelector('#result-title').focus();
});

updateCounts();
