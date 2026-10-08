# text-diff-lab

ブラウザ内で2つのテキストを行単位で比較する、小さなツールを育てる公開プロジェクトです。

**開発中 / Phase 1.0 bootstrap** — 現在は静的な画面の骨組みと開発・検証・CIの土台のみです。入力欄と操作ボタンは無効です。入力、差分計算、結果表示、サンプル挿入、クリアはまだ実装していません。

## 起動と検証

Node.js 24 と npm を使用します。アプリ・開発ツールのnpm依存はありません。

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

- `lint`: Nodeスクリプトの構文、ソース・文書の改行と末尾空白を確認します。
- `test`: 一時ディレクトリへのbuild、配信するHTML/CSS、404、許可しないHTTPメソッドを検証します。差分機能のテストではありません。
- `build`: `src/` のHTML/CSSだけを `dist/` へコピーします。
- `preview`: build済みの `dist/` を同じローカルURLで配信します。先にdevサーバーを終了してください。

CIはpull requestとmainへのpushで同じlint・test・buildを順に実行します。workflow名は `CI`、job名は `ci`（発行元: GitHub Actions）です。ブラウザでの見た目確認はCIに含みません。

## 今回の範囲

静的HTML/CSS、Node標準機能だけのローカルサーバー・build・bootstrapテスト、MITライセンス、公開作業の規約、CIを用意します。外部フォント、API、DB、認証、永続保存、テレメトリー、入力の送信、デプロイはありません。画面の図形とスタイルはこのプロジェクト用に作成しています。

## 次のMVP案（未実装）

左右それぞれ100行・20,000文字を上限案として、行単位の差分をブラウザ内で計算します。サンプル・比較・クリアを用意し、追加・削除は色に加えて記号と文字でも示す予定です。具体的な差分方式と上限の数え方は次のPRで決め、検証します。

## 公開作業

作業ブランチから通常pushし、検証と独立レビューを経てDraft PRで提示します。mainの更新とmergeはHumanが行います。公開前にcommitの著者情報、文書、ログ、画像、依存とライセンスを点検します。詳しくは [AGENTS.md](AGENTS.md) を参照してください。

## ライセンス

このリポジトリの新規自作部分は [MIT](LICENSE)、Copyright (c) 2026 m1kekad0。第三者の素材・ツールにはそれぞれのライセンスが適用されます。CIで利用する `actions/checkout` と `actions/setup-node` はMITライセンスの公式Actionsです。
