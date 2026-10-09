# キーボード経路の検証

2026-10-09 UTC、Mac / Node.js 24.14.0、別途用意済みPlaywright 1.62.1 / Chromium 151.0.7922.34。baseは最新mainの `9bf2bed46f989f6202e8cb04d03b0ce9cae6453c`。PR #10 のmerge SHAと一致し、reviewed head `5b0f8f79202ee667427c87e9317a1dfcb3671b12` と旧main `f43c2f5329fbdee9a14498628e476fda3ae77eed` を祖先に含みます。最終HEADでの再実行・独立レビュー・exact HEAD CIはDraft PR本文に記録します。

## 方法と既存QAとの差

`scripts/keyboard-check.mjs` は一時buildをループバックで配信し、既存Chromiumのheadless・ja-JP・使い捨てprofile/contextを使用します。通常の `/` と独自response headerのない `/text-diff-lab/`、1440×1000と390×844の各組合せを確認します。390pxはデスクトップブラウザの狭いviewportで、実モバイルOSの検証ではありません。

初回の `document.body` focusからTabを開始し、ホーム→変更前→変更後→サンプル→クリア→比較する→比較のルール、逆方向も確認します。以降の経路もすべてTab / Shift+Tabです。locatorの `focus` / `click` / `fill`、DOMのfocus・click・値代入・scroll操作は使いません。アプリ自身の操作後のfocus移動は観測します。既存 `browser-check.mjs` のボタンへの直接focusやホームにfocusしてからのTab確認とは異なる、初回到達と連続復帰の回帰確認です。

小さい合成テキストは `keyboard.type`、上限fixtureは `keyboard.insertText` で入力します。全選択はMacではMeta+A、削除はBackspaceです。後者はブラウザエンジンの文字挿入で、実paste・OS clipboard・物理キー入力の再現とは扱いません。最大fixtureは101行（201 UTF-16単位）または20,001文字です。

- Enter / Spaceで比較、サンプル、クリアを操作。比較成功と空比較では結果見出し、サンプルとクリアでは変更前入力へのfocusを確認。
- 結果見出しから逆順で左右それぞれの入力へ戻って編集。古い行・表・エラーの解除、文言・カウンター・全文、再比較の全行と集計を確認。
- 左右それぞれの101行・20,001文字エラーから、実際にfocusされた欄をキーボードで修正して再比較。完全なエラー文・`aria-invalid`、未超過側にエラーなし、結果の復帰を確認。
- サンプル→比較→再比較→クリア→空比較をEnter / Spaceで繰り返し、全操作後のfocus保持を確認。比較のルールもSpaceで開きEnterで閉じる。
- 各到達点で `:focus-visible`、3px以上のsolid outline、横方向の枠とページのoverflowなしを確認。縦方向はコントロールの可視部分（高さ44pxまたは要素の高さの小さい方）と上辺か下辺の完全な枠を確認し、textarea全体が常に画面内という条件にはしません。
- 入力・操作中の追加request 0、外部origin request 0、runtime例外0、local/session storage・cookie・IndexedDB・Cache Storageが空であることを確認。

## 結果・探索時の失敗

| 確認 | 結果 |
| --- | --- |
| 通常 / 1440×1000 | passed、190回のfocus確認 |
| 通常 / 390×844 | passed、190回のfocus確認 |
| subpath / 1440×1000 | passed、190回のfocus確認 |
| subpath / 390×844 | passed、190回のfocus確認 |

アプリ不具合は確認されず、`src/`・依存・CI・配信設定は変更しません。既存QAで通る経路だけを再確認する変更ではなく、飛び越しのない初回・逆順・復帰経路と狭いviewportのチェックを追加します。

初回sandbox内の実行は `listen EPERM` でsetupがfailed、全入力ケースはnot-runでした。許可されたMac上のループバックで再実行した結果とは区別します。探索中には、狭いviewportでtextarea全体・全周outlineが常に収まるという厳しすぎるテスト条件でも停止しました。Chromiumのcaret scrollにより上端が少し切れる場合や、逆順で戻ると欄の一部が画面外になる場合があり、画像で左右・下辺の枠と編集位置が見えることを確認しました。この探索停止をアプリの操作不能や修正済み不具合とは扱いません。

`CAPTURE_DIR` を指定した探索実行で入力・比較ボタン・結果見出し・エラー欄のスクリーンショットを取得し、通常のデスクトップ/狭い幅とsubpathの狭い幅の代表画像を目視確認しました。アプリの表示変更はなく、Before/Afterの改善画像は作成していません。

## 再実行・限界

```sh
PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/keyboard-check.mjs
PAGES_CHECK=1 PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/keyboard-check.mjs
```

`PLAYWRIGHT_MODULE` は既存検証用Playwrightへの相対パスの例です。Chromiumのダウンロードは行いません。`CAPTURE_DIR` は任意のローカル画像保存先で、省略時は画像を作りません。失敗時は非ゼロ終了し、完了した組合せと失敗した組合せ、残りnot-runを出力します。終了時にこのスクリプトのcontext/browser・server・一時buildを片付けます。

既存 `scripts/browser-check.mjs` の通常/subpath QAと、lint・unit/server・buildは別途実行します。GitHub `CI` / `ci` はlint・unit/server・buildだけを実行し、このローカルChromium検証の成功と同一視しません。

実screen reader、同一テキストのlive region更新が実際にどう発声されるか、実モバイルOS、実paste/IME、Firefox/WebKit、個人ブラウザ設定、公開Pagesの今回の更新はnot-runです。音声の推測だけによるlive region変更や、WCAG全体への適合の主張は行いません。永続保存・送信・公開deployも追加しません。
