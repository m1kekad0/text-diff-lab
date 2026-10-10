# 限定サイズのブラウザ入力・復帰確認

以下の自動実測はCI組込み前の記録です。現在の固定依存と再実行手順は [ブラウザCI検証手順](browser-ci-verification.md) を参照してください。速度測定は引き続き手動です。小さいサンプルでの実貼り付け・日本語IMEの基本操作は、後述の [Humanによる公開サイト確認](#humanによる公開サイト確認2026-10-10-jst) に別の証跡として記録します。

2026-10-09 UTC、macOS 27.0.1 / arm64、Node.js 24.14.0 / npm 11.9.0、別途用意済みのPlaywright 1.62.1 / Chromium 151.0.7922.34。アプリの検証対象・baseは `f43c2f5329fbdee9a14498628e476fda3ae77eed`。この変更は検証スクリプトと文書だけで、`src/`・依存・CI・配信設定を変更しません。最終HEADの再実行、独立レビュー、exact HEADのPR CIはDraft PR本文に記録します。

## 方法と停止基準

`scripts/input-responsiveness-check.mjs` は一時buildをループバックで配信し、既存Chromiumをheadless・1440×1000・ja-JPの一時profile/contextで起動します。通常配信と、独自response headerを付けない `/text-diff-lab/` 配信で同じ確認を行います。外部originへのブラウザ要求を遮断し、入力操作の追加要求0、空のlocal/session storage・cookie・IndexedDB・Cache Storage、runtime例外0をassertします。

fixtureは小さいものから順に、最大100,000 UTF-16 code units・改行1,000個までです。各サイズで下記3方法を左右それぞれに適用し、次のサイズへ進みます。途中で失敗すると後続ケースは `not-run`、プロセスは非ゼロ終了です。

| 方法 | 入力経路 | 観測したinput event |
| --- | --- | --- |
| `fill` | Playwrightのtextarea置換 | `isTrusted=true` / `insertText` |
| `dom-input` | `.value` 代入後に合成 `InputEvent` をdispatch | `isTrusted=false` / `insertText` |
| `insertText` | Playwright `keyboard.insertText` によるブラウザエンジンの文字挿入 | `isTrusted=true` / `insertText` |

これらは実ユーザーのpasteではありません。`isTrusted=true` もpasteの根拠にしません。この自動検証ではOS clipboardを読み書きせず、`paste` eventや`insertFromPaste`を使う実pasteは `not-run` です。DOM一括代入はtextarea値設定・アプリのinput handlerを確認できますが、貼り付け操作全体を再現しません。

各ブラウザ操作・状態取得・frame待機のdeadlineは2秒。測定した操作のwall timeまたはframe待機が1秒以上、同一操作のイベント同期区間の合計が200ms以上なら、そのサイズで停止します。timeout時と終了時にはこのスクリプトが `launchServer` で起動したbrowserだけを `kill()` し、一時build/server/profileを片付けます。既存ブラウザや個人profileを検索・終了しません。時間閾値は安全に止めるためのローカル検証用であり、アプリの性能仕様・CI gateではありません。

## 各ケースの確認

- 比較結果を表示してから入力し、全文・正規化後のカウンター、古い結果・両欄のエラー解除をassertします。超過時も切り捨てません。
- 比較ボタンで現在の完全なエラー文・`aria-invalid`と結果なしを確認します。上限内では結果テーブルと行が復帰することを確認します。
- 他方だけを編集して両エラーが消えること、再比較で未修正の超過欄のエラーが戻ることを確認します。
- クリアで両入力・カウンター・エラー・結果を初期化し、サンプル比較に復帰することを確認します。
- 最大サイズを確認した後、各方法で100,000文字の `x` / `y` を6回連続置換します。アプリ入力の保持量は片側100,000文字までで、6回分を追記しません。6 input events、最後の全文・カウンター、比較エラー、クリア復帰を確認します。このburstは1行の入力で、frame待機を操作の間に追加しません。

通常配信・subpathとも13 fixture × 3方法 × 左右2欄 = 78ケースと、3方法のburstで計81ケースが `passed`。入力・エラー・クリア復帰・連続入力に不具合や停止基準超過は確認されず、アプリ修正は行いません。

## 資料作成時の限定計測

以下は上記の変更前アプリに対する探索実行です。各方法・欄で1回ずつ測定し、サイズ行には6ケース中の入力wall timeの最大値を示します。統計的な性能保証やbefore/afterの改善量ではありません。計測中に他のブラウザQA・unit/buildは並走させていません。

| fixture | raw UTF-16 units | 正規化後の行 / units | 比較結果 | 通常 max ms | subpath max ms | 検証 |
| --- | ---: | --- | --- | ---: | ---: | --- |
| 100行 | 199 | 100 / 199 | 受理 | 22.1 | 21.3 | passed |
| 101行 | 201 | 101 / 201 | 行数エラー | 22.9 | 27.3 | passed |
| 19,999文字 | 19,999 | 1 / 19,999 | 受理 | 6.5 | 6.7 | passed |
| 20,000文字 | 20,000 | 1 / 20,000 | 受理 | 5.9 | 6.1 | passed |
| 末尾CR | 20,000 | 2 / 20,000 | 受理・末尾空行保持 | 7.5 | 7.8 | passed |
| 絵文字10,000個 | 20,000 | 1 / 20,000 | 受理 | 12.0 | 12.7 | passed |
| 20,001文字 | 20,001 | 1 / 20,001 | 文字数エラー | 5.8 | 5.7 | passed |
| 末尾CRLF | 20,001 | 2 / 20,000 | 受理・末尾空行保持 | 8.8 | 9.7 | passed |
| 20,000文字＋LF 1,000個 | 21,000 | 1,001 / 21,000 | 両上限エラー | 262.7 | 269.5 | passed |
| 50,000文字・1行 | 50,000 | 1 / 50,000 | 文字数エラー | 10.4 | 9.2 | passed |
| 49,000文字＋LF 1,000個 | 50,000 | 1,001 / 50,000 | 両上限エラー | 287.5 | 287.7 | passed |
| 100,000文字・1行 | 100,000 | 1 / 100,000 | 文字数エラー | 17.0 | 16.4 | passed |
| 99,000文字＋LF 1,000個 | 100,000 | 1,001 / 100,000 | 両上限エラー | 340.5 | 347.1 | passed |
| 100,000文字 × 6連続置換 | 各100,000 | 最後は1 / 100,000 | 文字数エラー・クリア復帰 | 62.2 | 63.9 | passed |

`wallMs` はNode側でautomation APIの呼出前〜returnまで測ります。ブラウザ操作・automation通信を含み、別途待つframeや状態assertの時間は含みません。ブラウザ内ではイベントのdocument capture〜bubbleを測り、アプリ同期handlerを含む区間の合計 `syncTotalMs` と最大 `syncMaxMs` を記録します。input dispatch前の挿入処理・layout、後続描画を全部含む値ではありません。`framesMaxMs` はcaptureから2回の `requestAnimationFrame` 到達までで、headlessのframe機会を確認するものです。実ディスプレイでのpaint完了・ユーザーが感じる遅延とは同一視しません。observer自体の処理・frame callbackも測定を変えます。

| 方法・全fixture/burst中の最大 | 通常 input wall ms | subpath input wall ms | 通常 同期区間合計 ms | subpath 同期区間合計 ms |
| --- | ---: | ---: | ---: | ---: |
| `fill` | 340.5 | 347.1 | 約105.9 | 約106.8 |
| `dom-input` | 12.6 | 12.5 | 約1.2 | 約1.3 |
| `insertText` | 327.6 | 332.0 | 約106.3 | 約106.8 |

探索実行の同期区間合計は各eventを0.01msへ丸めた記録から集計したため近似です。スクリプトの最終版は丸める前に合計し、コンパクトなケース集計を出力します。

1,000 LFを含む `fill` / `insertText` は1操作で1,001 input events、`dom-input` は1 eventでした。前者では部分挿入のたびにアプリのライブ更新が実行されます。このautomation経路のイベント数・ブラウザ処理がwall timeに含まれるため、単一handlerの最大値だけで全入力操作を評価しません。実pasteが同じイベント列になるとは確認できず、この差だけを根拠にアプリ処理を変更しません。

両配信を通じて比較ボタンのwall最大42.9ms、クリア32.6ms、同期区間最大は比較9.5ms・クリア1.1ms、inputのframe待機最大109.8msでした。各最大値は別ケースの場合があります。

## Humanによる公開サイト確認（2026-10-10 JST）

2026-10-10 JST、Humanが [公開サイト](https://m1kekad0.github.io/text-diff-lab/) で下記を実行し、全項目OKと報告しました。環境はGoogle Chrome / macOS標準の日本語入力です。ブラウザ・OSのバージョンは未取得です。結果はHumanの報告によるもので、自動実行ログ・イベント記録・スクリーンショットによる証跡ではありません。

公開版の参照情報は、最後に確認済みのデプロイ元 `f43c2f5329fbdee9a14498628e476fda3ae77eed` と [Pages run 37869169833](https://github.com/m1kekad0/text-diff-lab/actions/runs/37869169833) です（[公開記録](pages-hosting.md#2回目の成功デプロイと今回の確認範囲)）。Humanの実行時に配信バイトやSHAを再採取していないため、このSHAで実操作したと確定する証跡にはしません。文書更新のbase main `5e1735a5f40932d867914efc201ea85bd47d5b72` まで `src/` の差分はなく、両SHAの `src/` treeは一致します。これはソースの照合であり、実行時の配信内容の一致を保証しません。

以下の `\n` はLFを表し、貼り付ける両テキストに末尾改行は付けません。

| 手順 | 期待値・報告された結果 | 判定 |
| --- | --- | --- |
| 1. クリア後、変更前へ `共通\n変更前\n末尾`、変更後へ `共通\n変更後\n末尾` を実際のCmd+Vで貼り付けて比較 | 追加1・削除1・変更なし2、出力4行 | 合格（Human報告） |
| 2. 変更後を全選択し、日本語IMEで `にほんご` から `日本語` に変換確定。余分なReturnは入れない | 変更後は1行、古い結果は消える。比較すると追加1・削除3・変更なし0 | 合格（Human報告） |
| 3. 右の `日本語` の末尾へ `とりけし` を入力して変換候補を出し、Escで取り消す。未確定のひらがなが残る場合はその部分だけdeleteする | 確定済みの `日本語` が残り、再比較は追加1・削除3・変更なし0 | 合格（Human報告） |
| 4. クリアし、手順1を再入力して比較 | クリア後は左右とも空・0行・0文字、結果表なし。再入力後は追加1・削除1・変更なし2、出力4行に復帰 | 合格（Human報告） |

今回確認できたのは、この小さいサンプルでの実貼り付け・IME変換確定・候補取消・クリアと再比較の基本操作です。操作時間やinput/composition event列は測定していません。大容量のOS貼り付け、上限付近のIME、IMEのその他の動作、他ブラウザ・OS、実モバイルOS、実screen readerは未検証です。自動測定のサイズ・速度結果を実貼り付けやIMEへ一般化せず、あらゆるIME動作の保証とも扱いません。

## 再実行・未確認範囲

```sh
npm run check:input-responsiveness
PAGES_CHECK=1 npm run check:input-responsiveness
```

現在は固定devDependencyを直接読み込み、`PLAYWRIGHT_MODULE` による外部モジュール指定は使いません。スクリプトはChromiumのダウンロードを行いません。最終JSONには方法別のevent数・trusted/type、操作wall time・同期区間・frame待機を出力します。通常/subpathの機能・keyboard/focus・reset・CSP QAは必須CIでも実行し、この限定計測は手動のままにします。

初回sandbox内は `listen EPERM` でsetupが `failed`、全入力ケースは `not-run` でした。許可されたMac上のループバック・隔離Chromiumで再実行した上記結果と区別します。

`src/`・build対象4assetは自動実測時のbaseと同一で、アプリの表示変更はありません。before/after PNGは作成・目視確認していません。上記の自動検証では実paste、headed/実画面の応答性、mobile、IME、Firefox/WebKit、100,000文字超・100,000改行、メモリ枯渇、任意サイズでの応答性、公開Pagesの更新は `not-run` です。実貼り付け・IMEの小さいサンプルでの基本操作は前節のHuman報告と区別し、大容量OS貼り付け・上限付近IME・他ブラウザ/OS・実screen readerは引き続き未検証です。過去の100,000改行 `fill` timeoutの原因や改善を、この限定サイズの成功で確定しません。今回の文書更新で入力の送信・永続化・公開deployは追加しません。
