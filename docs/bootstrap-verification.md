# Phase 1.0 bootstrap verification

この記録は画面の骨組みと開発基盤の確認です。テキスト比較アプリの完成や、未実装機能のテスト成功を示しません。

## ローカルで実施した確認

- Node.js 24.14.0 / npm 11.9.0。
- `npm ci --ignore-scripts --no-audit --no-fund`（依存0、ローカルではoffline実行）。
- `npm run lint`: Nodeスクリプト構文、改行、末尾空白の確認に成功。
- `npm test`: bootstrapテスト6件成功。buildの内容、HTML/CSS配信、HEAD、404、非GET/HEADの405、欠けたassetの500を確認。
- `npm run build`: HTML/CSSの2ファイルを出力。
- Mac Chromium (Chrome 154.0.8037.98) の使い捨てcontextで、build済みページをループバック経由で確認。

## ブラウザ確認

viewportはdesktop 1440×1000、mobile 390×844。画像は各ページ全体です。

- 横方向のはみ出しなし。入力欄はdesktopで2列、mobileで1列。
- 入力欄2つとボタン3つは無効。入力欄のlabel関連付けと開発中・未実装の表示を確認。
- ページのscript・formなし、localStorage・sessionStorageともに空。
- 観測したページの要求はローカルHTML/CSSとfaviconのみ。faviconは未提供で404。
- runtime例外なし。入力・差分計算・比較・サンプル・クリアは未実装のため機能検証の対象外。

スクリーンショットは自作UIと合成内容のみで、人物・個人profile・実データを使用していません。画像を目視し、PNGのメタデータに個人情報やローカルパスが含まれないことを点検してから追加しました。

| Desktop | Mobile |
| --- | --- |
| [画面](images/bootstrap-desktop.png) | [画面](images/bootstrap-mobile.png) |

これらのブラウザ確認はローカルで実施したもので、CIには含みません。CIの実結果と対象SHAはPRで確認してください。
