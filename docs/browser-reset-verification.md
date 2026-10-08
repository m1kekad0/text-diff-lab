# reload/reset回帰チェックの検証と訂正

2026-10-08 UTC、Mac上で合成入力のみを使用。baseは `74dd1449195da93595373495e33a2fa87ee117a6`。対象は `scripts/browser-check.mjs` と直接関連する検証記録だけです。最終HEADで再実行した結果、固定SHAの独立レビュー、PRのHEADとCI runはDraft PR本文に記録します。

## 過去のreload検証の訂正

baseのスクリプトはサンプル→比較→クリア→reloadの順で操作し、reload後の空入力を確認していました。reload直前から入力が空だったため、「非空入力がreloadで消える」ことの根拠にはなりません。[MVP検証記録](mvp-verification.md)の記述を訂正しました。今回の成功を過去の実行で証明済みだったとは扱いません。

今回のチェックは、左 `再読込前の合成左\n共通行`、右 `再読込前の合成右\n共通行\n追加行`（`\n` はLF）を入れて比較します。reload直前に両入力の非空値、カウンター、描画行、表示中の結果テーブルをassertします。reload直後には両入力が空、両エラー文と `aria-invalid` なし、描画行0、テーブル非表示、placeholderとstatusがそれぞれ初期文言、両カウンターが0行・0文字であることをassertします。

## resetの期待と対象操作

共通ヘルパーで入力値・カウンター、両欄のエラー、行、テーブル・placeholderの表示、文言を確認します。比較成功時には全描画行・行番号・集計と結果見出しへのfocusを確認します。

- 両欄invalid→左だけ編集→比較、両欄invalid→右だけ編集→比較。編集直後は両方の古いエラーを消すという既存の意図を確認し、次の比較では未修正側だけのエラーとfocusを確認。
- 両欄invalid→クリア→空比較、両欄invalid→サンプル→比較。Enterで操作し、両エラー解除、入力・表示・カウンター、元入力へのfocusを確認。
- 有効な比較結果→左だけ編集→再比較、有効な比較結果→右だけ編集→再比較。編集直後に古い結果を消すことを確認。
- サンプル→比較→再比較→サンプル→比較→クリア→空比較→再クリアをmouse・Enter・Spaceで実行し、各操作の状態を確認。
- 両欄invalidから比較・サンプル・クリアを組み合わせた4つの連続操作を、それぞれ同一ブラウザターン内のDOM button clickで実行。最後がクリア・サンプル・空比較・サンプル比較になる各状態を確認。このburst自体はkeyboard入力ではなく、keyboard操作は上の別チェックで確認。

既存の比較fixture、左右の上限、HTML風入力、focus/Tab順序、runtime例外、入力操作による要求なし、空storageのチェックも維持しています。

## 実行結果と失敗の区別

Node.js 24.14.0 / npm 11.9.0。Playwright 1.62.1は検証専用の別ディレクトリに用意し、既存のChromium 151.0.7922.34を利用しました。headless・1440×1000・ja-JPの使い捨てcontextだけを使い、終了時にcontext/browser・一時配信サーバー・一時buildを片付けます。個人profileは使っていません。

| 確認 | 結果 |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 成功、アプリ依存0 |
| `npm run lint` | 成功、構文・改行・空白の既存チェック |
| `npm test` | Mac上の再実行で15/15成功、失敗・skip・cancel 0 |
| `npm run build` | 成功、静的4asset |
| 通常配信のブラウザチェック | 成功、reload/resetと既存機能、runtime例外0 |
| `PAGES_CHECK=1` | 成功、同じreload/resetとheaderless subpath、asset・label・meta CSP probe、runtime例外0 |

初回のsandbox内 `npm test` はlocalhostの `listen EPERM` でserverテストが失敗しました（top-level 9成功・1失敗、serverの子テストは未実行）。Mac上の再実行は全15テスト成功で、この環境制限とアプリの失敗は区別します。

初回の修正中ブラウザチェックは、既に空の欄への `fill('')` を編集イベントとみなしたテスト側の期待値で停止し、以降のケースは未実行でした。非空の合成値で準備して実際の編集を起こすように修正し、通常・subpathの両モードを再実行して成功しました。アプリコードの修正は必要ありませんでした。

## 再実行と未確認範囲

```sh
PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/browser-check.mjs
PAGES_CHECK=1 PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/browser-check.mjs
```

`PLAYWRIGHT_MODULE` は別途用意した検証用Playwrightへの相対パスの例です。アプリ依存・lockfile・workflowにはブラウザツールを追加しません。既存 `CI` / `ci` はlint・unit/serverテスト・buildを実行し、ブラウザチェックは実行しません。ローカルChromiumの成功とGitHub CIの成功は別の証跡です。

Firefox/WebKit、実機screen reader、今回のmobile/画像capture、実際のPages配信・公開ヘッダー、巨大pasteの最適化・性能は未検証です。アプリの表示・操作コードに変更はなく、Before/After画像は作成していません。Web公開状況、設定、deploy、tag・Releaseも変更しません。
