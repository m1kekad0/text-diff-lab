# text-diff-lab

ブラウザ内で2つのテキストを行単位で比較する、小さなツールを育てる公開プロジェクトです。

**MVP / 行単位の比較** — 左右に入力して「比較する」を押すと、追加・削除・変更なしを色・記号・文字で表示します。合成テキストのサンプルとクリアも使えます。

[v0.1.0 source Release](https://github.com/m1kekad0/text-diff-lab/releases/tag/v0.1.0) は公開済みです（`6e709f36b58093dffb00b91b0fc6a32eced511a0`）。Webサイトはまだ公開していません。公開予定URLは `https://m1kekad0.github.io/text-diff-lab/` です。今回の [Pages準備・Human手順](docs/pages-hosting.md) は手動workflowと静的配信用CSPの準備だけで、mergeしても自動公開しません。

## 起動と検証

Node.js 24 と npm を使用します。アプリ・CIのnpm依存はありません。

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

CIはpull requestとmainへのpushで同じlint・test・buildを順に実行します。workflow名は `CI`、job名は `ci`（発行元: GitHub Actions）です。Chromiumでの操作・画面確認は別途実施し、[MVPの検証記録](docs/mvp-verification.md) に残します。

## 比較のルールと上限

- 左右それぞれ **100行・20,000文字** まで。超過時は比較せず、その入力欄に現在の数と修正方法を表示します。入力は切り捨てません。
- CRLFとCRをLFに統一してから数え、比較します。文字数はJavaScriptのUTF-16単位です。LFは1文字、絵文字などは2文字以上になります。
- 空文字は0行。空行は保持し、末尾改行は最後の空行として数えます。`a` は1行、`a\n` は2行、`\n` は2つの空行です。
- 空白・大文字小文字は区別します。両側が空なら「比較する行はありません」、同一ならすべて「変更なし」です。片側だけ空なら、すべて追加または削除です。
- 最長共通部分列（LCS）で同じ行をできるだけ多く残します。置換は削除と追加で表します。同じ行が繰り返されて同じ長さの候補がある場合、変更前の削除を先に選びます。行番号は各入力の1から始まり、存在しない側は `—` です。
- 入力の編集・サンプル・クリアで古い結果とエラーを消します。比較は明示的にボタンを押したときだけ行います。

計算量は最大100×100のLCS表と、最大200行の結果に制限されます。文字単位の差分、ファイル読込、大容量比較はこのMVPの対象外です。

## 入力の扱い

入力処理はブラウザのメモリ内だけです。永続保存・入力送信・API・DB・アカウント・テレメトリーはありません。再読込でアプリの状態は初期化されます。HTMLに見える文字も `textContent` で文字として表示します。外部フォント・第三者素材は使いません。

ローカルサーバーは指定した静的ファイルだけをGET/HEADで配信します。HTMLの早期meta CSPは同一オリジンのスクリプト・CSS・画像だけを許可し、`connect-src 'none'` でfetchなどの接続を禁止します。metaでは `frame-ancestors` などのヘッダー専用の保護を引き継げません。静的ホストの応答ヘッダーは別途確認が必要です。[CSPの範囲と制限](docs/pages-hosting.md#静的配信のcspと入力の扱い) を参照してください。

Pages公開後はHTMLなどの取得リクエストがGitHubに届き、訪問者のIPアドレスはセキュリティ目的で記録されます。「入力を送信しない」は「ホストがログを持たない」という意味ではありません。[GitHub公式のデータ収集説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

## 公開作業

不具合報告からHuman merge後の確認までを [貢献・公開作業チェックリスト](docs/contributing.md) にまとめています。実入力や私的な情報は公開せず、合成例を使ってください。エージェント向けの作業指示は [AGENTS.md](AGENTS.md) を参照してください。

公開済みsource Releaseの準備記録は [v0.1.0準備確認・Release notes下書き](docs/release-readiness.md) にあります。Webサイトの初回公開には、設定変更と初回実行それぞれの別途Human確認が必要です。

## ライセンス

このリポジトリの新規自作部分は [MIT](LICENSE)、Copyright (c) 2026 m1kekad0。第三者の素材・ツールにはそれぞれのライセンスが適用されます。workflowで利用する `actions/checkout`、`actions/setup-node`、`actions/upload-pages-artifact`、`actions/deploy-pages` はMITライセンスの公式Actionsです。
