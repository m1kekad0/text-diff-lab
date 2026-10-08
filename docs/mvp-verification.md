# 行単位MVPの検証記録

2026-10-08にMacで確認。baseは `b996d3c8a4eda311ccade73de6376ea207220ec9`。最終head、独立レビューの対象SHA、GitHub Actionsの結果はDraft PR本文に記録します。

## 実施した確認

- Node.js 24.14.0 / npm 11.9.0。`npm ci --ignore-scripts --no-audit --no-fund` 成功、依存0。
- `npm run lint` 成功。JavaScript構文、LF、末尾空白を確認。
- `npm test` の12テスト成功。空・同一・挿入・削除・置換・繰り返し行・CRLF/CR・末尾改行・UTF-16文字数・上限・HTML風文字列、build・配信を確認。小さな入力225組は独立した部分列列挙を使い、最小編集数と両入力の再構築・行番号を検証。
- `npm run build` 成功。HTML/CSS/JavaScriptの4ファイルだけを出力。
- ローカルで用意済みのPlaywright 1.62.1、Chromium 151.0.7922.34を使用。個人profileを使わない使い捨てcontextを作り、終了時に閉じた。Firefox/WebKitは使用していない。
- build済みページで空・同一・片側空・挿入・削除・置換・繰り返し行・CRLF・末尾改行・100行・20,000文字と、左右それぞれ101行・20,001文字のエラーを確認。
- サンプル→比較→再比較→編集→クリア→空比較を3回繰り返し、古い結果・エラーが消えること、Enterで比較できること、Tab順序、結果見出しとエラー入力へのfocusを確認。
- HTML風の合成入力が文字のまま表示され、script/img要素や実行フラグを生成しないことを確認。runtime例外0。
- 観測した要求はローカルの静的assetのみ。サンプル・比較・クリア操作で新しい要求0。localStorage、sessionStorage、cookie、IndexedDB、Cache Storageは空。再読込後の空入力も観測したが、当時のスクリプトは再読込前にクリアしていたため、非空入力が再読込で消えることは証明していなかった。[reload/reset回帰チェックの検証と訂正](browser-reset-verification.md)を参照。
- desktop 1440×1000 / mobile 390×844で通常・エラー・空入力を操作し、横にはみ出さないことを確認。

ローカル検証は `scripts/browser-check.mjs` で再実行できます。PlaywrightとChromiumは別途用意する検証ツールで、アプリ・CIには追加していません。

```sh
# Playwrightを別ディレクトリに用意した場合の例
PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/browser-check.mjs
```

実ブラウザのアクセシビリティ属性・keyboard操作は確認しましたが、実機のscreen readerでの読み上げは未確認です。Chromium以外のブラウザも未検証です。

## Before / Afterの画像

各組は同じviewport・同じ合成入力でページ全体を撮影。通常は庭のメモ、エラーは左101行の「上限確認用の行」と右1行、空入力は左右とも空です。Afterは比較ボタンを押した結果です。baseには入力機能がないため、Beforeは撮影スクリプトがdisabledなtextareaに合成値だけを設定しています。baseに比較機能があることを示す画像ではありません。

| 条件 | Before | After |
| --- | --- | --- |
| Desktop / 通常 | [画像](images/mvp-desktop-normal-before.png) | [画像](images/mvp-desktop-normal-after.png) |
| Desktop / エラー | [画像](images/mvp-desktop-error-before.png) | [画像](images/mvp-desktop-error-after.png) |
| Desktop / 空入力 | [画像](images/mvp-desktop-empty-before.png) | [画像](images/mvp-desktop-empty-after.png) |
| Mobile / 通常 | [画像](images/mvp-mobile-normal-before.png) | [画像](images/mvp-mobile-normal-after.png) |
| Mobile / エラー | [画像](images/mvp-mobile-error-before.png) | [画像](images/mvp-mobile-error-after.png) |
| Mobile / 空入力 | [画像](images/mvp-mobile-empty-before.png) | [画像](images/mvp-mobile-empty-after.png) |

画像の内容とPNGメタデータを点検しました。自作UI・合成入力のみで、個人profile、実入力、ローカルパス、秘密情報を含みません。Afterの配信元はこのPRの `src/` と同一内容です。撮影したソースのSHA-256は次のとおりです。

```text
a6964944cc7b975c00bdebbe0f377f9d48c46b4c258fd29fcd4ed1313ce93504  src/index.html
73440676986b8bb943911fe58d334f597be2f8d1f797dc9dc2cfa4c915e8e6b1  src/styles.css
c7871f301deb0fe75d50089528ed13e6e2b4b6efc254ed2ecb619a55e0143c64  src/app.mjs
565e63eba6c4875a91d25e87d562b9f60d1c07decad705312dee6d8f1ca818cf  src/diff.mjs
```

## 公開前の点検と実用的な学び

コード・文書・テスト・合成fixtureはこの公開プロジェクト用の新規自作です。既存の公開scaffoldとNode標準機能を使い、他のリポジトリのファイル・履歴・ルールを流用していません。新しいnpm依存、第三者素材、ブラウザ実行ファイルは含めません。ローカル検証のPlaywrightはApache-2.0、既存の公式GitHub ActionsはMITです。検証ログは成功件数と公開可能な要約だけを記録します。

- 空文字・空行・末尾改行を先に決めると、100行の境界と表示が一致する。
- ブラウザ用moduleを追加したら、buildへのコピー・配信route・CSPも一緒に確認する。
- 入力編集後は前回結果を消すと、どの入力の結果か迷わない。
- 比較画像は同じfixtureとviewportを使い、固定コミットのコード・レビュー・CIと対応させる。

PRはDraftのまま提示し、Readyへの変更・merge・デプロイは行いません。
