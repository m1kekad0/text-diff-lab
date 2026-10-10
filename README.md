# text-diff-lab

**公開サイト: [text-diff-lab](https://m1kekad0.github.io/text-diff-lab/)**

ブラウザ内で2つのテキストを行単位で比較する、小さなツールを育てる公開プロジェクトです。

**MVP / 行単位の比較** — 左右に入力して「比較する」を押すと、追加・削除・変更なしを色・記号・文字で表示します。合成テキストのサンプルとクリアも使えます。

[v0.1.0 source Release](https://github.com/m1kekad0/text-diff-lab/releases/tag/v0.1.0) は公開済みです（`6e709f36b58093dffb00b91b0fc6a32eced511a0`）。Webサイトの初回デプロイ元は別のcommitです。[Pages公開記録・Human手順](docs/pages-hosting.md) に対象SHAと確認範囲を記録しています。公開更新は手動workflowで行い、mergeしても自動公開しません。

## 起動と検証

Node.js 24 と npm を使用します。アプリの実行時npm依存はありません。ブラウザ検証用のdevDependencyはPlaywright `1.64.0` に固定しています。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

`http://127.0.0.1:4173` を開きます。サーバーはループバックのみにbindします。終了は `Ctrl+C`。

```sh
npm run lint
npm test
npm run build
npm run preview
```

- `lint`: JavaScriptの構文、ソース・主要文書の改行と末尾空白を確認します。
- `test`: 行比較の仕様・上限・小さな入力の全組み合わせと、build・静的配信・404・許可しないHTTPメソッドを検証します。
- `build`: `src/` のHTML/CSS/ブラウザ用JavaScriptだけを `dist/` へコピーします。
- `preview`: build済みの `dist/` を同じローカルURLで配信します。先にdevサーバーを終了してください。

buildの成功時、出力先は `index.html`・`styles.css`・`app.mjs`・`diff.mjs` の4ファイルだけになります。再buildは既存の通常ファイルを更新しますが、許可外のファイル・ディレクトリ、出力先自体のsymlink、asset名のsymlink・hard link・ディレクトリがある場合は、既存assetを書き換える前に失敗します。余分な項目は自動削除しません。失敗した出力先を公開せず、必要なデータを保持したまま別の空ディレクトリを選んでください。スクリプトから `build(destination)` を呼ぶ場合は、`dist/` またはproject外の専用ディレクトリを使い、親ディレクトリを先に用意します。親のsymlinkは実体パスで境界を確認し、projectの別ディレクトリや祖先への出力を拒否します。同じ出力先を変更する処理との並行実行や、I/O失敗時の全asset一括更新は保証しません。

新規環境の依存導入・ブラウザ取得計画・明示的な準備は [ブラウザセットアップ手順](docs/browser-setup.md) を参照してください。対応するChromium headless shellが既にあれば、取得せずに以下を実行できます。

```sh
npm run check:browser
npm run check:keyboard
PAGES_CHECK=1 npm run check:browser
PAGES_CHECK=1 npm run check:keyboard
```

CIはpull requestとmainへのpushでlint・test・build、固定版CLIによるChromiumとLinux依存の明示インストール、上記4チェックを順に実行します。workflow名は `CI`、job名は `ci`（発行元: GitHub Actions）です。取得・起動・テスト・timeoutの失敗は必須 `ci` の失敗になります。[CIの対象範囲・再実行手順](docs/browser-ci-verification.md) を参照してください。Pages modeはローカルsubpath配信の検証です。

`npm run check:input-responsiveness` と `PAGES_CHECK=1 npm run check:input-responsiveness` は手動の限定計測用です。1秒/200msの安全停止基準はローカル測定のためで、CIの性能保証には使いません。

## 比較のルールと上限

- 左右それぞれ **100行・20,000文字** まで。超過時は比較せず、その入力欄に現在の数と修正方法を表示します。入力は切り捨てません。
- CRLFとCRはLFとして数え、比較します。文字数はJavaScriptのUTF-16単位です。LFは1文字、絵文字などは2文字以上になります。
- 空文字は0行。空行は保持し、末尾改行は最後の空行として数えます。`a` は1行、`a\n` は2行、`\n` は2つの空行です。
- 空白・大文字小文字は区別します。両側が空なら「比較する行はありません」、同一ならすべて「変更なし」です。片側だけ空なら、すべて追加または削除です。
- 最長共通部分列（LCS）で同じ行をできるだけ多く残します。置換は削除と追加で表します。同じ行が繰り返されて同じ長さの候補がある場合、変更前の削除を先に選びます。行番号は各入力の1から始まり、存在しない側は `—` です。
- 入力の編集・サンプル・クリアで古い結果とエラーを消します。比較は明示的にボタンを押したときだけ行います。

計算量は最大100×100のLCS表と、最大200行の結果に制限されます。文字単位の差分、ファイル読込、大容量比較はこのMVPの対象外です。

カウンターと上限確認は、入力全体を走査して数だけを求めます。両入力が上限内の場合だけ正規化文字列と行配列を作ります。余分な配列を減らす改善であり、任意サイズの入力・貼り付けの応答性を保証しません。[回帰確認と限定計測](docs/counts-preflight-verification.md)に確認範囲を記録しています。

上限付近から100,000文字までの合成入力・エラー表示・クリア復帰・連続入力は、[限定サイズのブラウザ検証](docs/input-responsiveness-verification.md)に記録しています。Playwright/DOMの入力経路を区別しており、実ユーザーのpasteは未確認です。

初回表示からTab / Shift+Tabだけで到達する比較・編集・サンプル・クリアと上限エラーからの復帰は、[キーボード経路の検証](docs/keyboard-verification.md)に記録しています。通常/subpath、デスクトップ/狭いviewportを既存Chromiumで確認します。

## 入力の扱い

入力処理はブラウザのメモリ内だけです。永続保存・入力送信・API・DB・アカウント・テレメトリーはありません。再読込でアプリの状態は初期化されます。HTMLに見える文字も `textContent` で文字として表示します。外部フォント・第三者素材は使いません。

ローカルサーバーは指定した静的ファイルだけをGET/HEADで配信します。HTMLの早期meta CSPは同一オリジンのスクリプト・CSS・画像だけを許可し、`connect-src 'none'` でfetchなどの接続を禁止します。metaでは `frame-ancestors` などのヘッダー専用の保護を引き継げません。静的ホストの応答ヘッダーは別途確認が必要です。[CSPの範囲と制限](docs/pages-hosting.md#静的配信のcspと入力の扱い) を参照してください。

PagesではHTMLなどの取得リクエストがGitHubに届き、訪問者のIPアドレスはセキュリティ目的で記録されます。「入力を送信しない」は「ホストがログを持たない」という意味ではありません。[GitHub公式のデータ収集説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

## 公開作業

不具合報告からHuman merge後の確認までを [貢献・公開作業チェックリスト](docs/contributing.md) にまとめています。実入力や私的な情報は公開せず、合成例を使ってください。エージェント向けの作業指示は [AGENTS.md](AGENTS.md) を参照してください。

公開済みsource Releaseの準備記録は [v0.1.0準備確認・Release notes下書き](docs/release-readiness.md) にあります。今後のWebサイトの公開更新も、対象SHAの確認と手動実行・deploy承認をHumanが行います。設定変更が必要な場合は別途Human承認が必要です。

## ライセンス

このリポジトリの新規自作部分は [MIT](LICENSE)、Copyright (c) 2026 m1kekad0。第三者の素材・ツールにはそれぞれのライセンスが適用されます。workflowで利用する `actions/checkout`、`actions/setup-node`、`actions/upload-pages-artifact`、`actions/deploy-pages` はMITライセンスの公式Actionsです。

検証用のPlaywrightとplaywright-coreはApache-2.0、Mac限定のoptional依存fseventsはMITです。ライセンス・NOTICEは各インストール済みパッケージに含まれます。これらのツールやブラウザは公開用の `dist/` に含めません。[固定依存の確認記録](docs/browser-ci-verification.md#固定依存と公開情報) に配布元と確認内容を記録しています。
