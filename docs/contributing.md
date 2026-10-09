# 貢献・公開作業チェックリスト

text-diff-labは、ブラウザのメモリ内で行単位の比較を行うMVPです。入力送信・永続保存はありません。公開するIssue・PR・ログ・画像にも実入力を含めないでください。

## 不具合を報告するとき

- [ ] 実入力を使わず、同じ問題が起きる最小の合成例を作る。左右の入力、操作、期待した結果、実際の結果、対象commit SHA、ブラウザ・OSのバージョンを書く。
- [ ] 改行が関係する場合はLF/CRLF/CR、末尾改行、空行を明記する。上限の問題は左右それぞれの行数とUTF-16文字数を書く（上限は100行・20,000文字）。
- [ ] 例として左 `庭\n花`、右 `庭\n木`（`\n` はLF）を使える。機密文書、個人情報、token、私的なURLやローカルパスは貼らない。画像やログも合成例だけにする。

## 変更を準備するとき

- [ ] 最新の `origin/main` から作業ブランチを作り、1つの目的に絞る。直接mainへpushせず、無関係な変更を含めない。外部forkの取り扱いは下記を先に確認する。
- [ ] Node.js 24とnpmで既存の確認を実行し、結果を記録する。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm test
npm run build
npm run check:browser
npm run check:keyboard
PAGES_CHECK=1 npm run check:browser
PAGES_CHECK=1 npm run check:keyboard
```

新規環境のブラウザ準備は [ブラウザセットアップ手順](browser-setup.md)、CIの対象範囲と速度計測との区別は [ブラウザCI検証手順](browser-ci-verification.md) を参照してください。対応するChromium headless shellが既にある場合はダウンロード不要です。取得が拒否された環境では再試行や代替取得をせず、未実行として報告します。

- [ ] アプリの表示・操作を変えた場合は、同じ合成入力・viewportで確認し、必要な画像を残す。文書だけの変更は「アプリの表示変更なし」と記載し、画面確認や画像を実施したことにしない。
- [ ] commitを固定し、実装者とは別のレビュー担当にbase・HEADの完全なSHAと差分を渡す。指摘を修正したら、更新したHEADで検証と独立レビューをやり直す。

## 公開前とDraft PR

- [ ] 送信対象の全commit、追跡ファイル、著者・committer・coauthor、文書、リンク、ログ、画像とそのメタデータ、PR本文を確認する。公開用の名前・メールを使い、秘密情報・実入力・個人メール・識別可能なローカルパス・私的な資料やリンクを除く。第三者素材を追加する場合は利用権とライセンス表記を確認する。
- [ ] 作業ブランチを通常pushする。force pushはしない。ローカルHEAD、リモートブランチ、PRのHEADが一致することを確認する。
- [ ] 日本語のDraft PRに目的・変更・base/HEAD SHA・実施した検証・独立レビューの対象SHAと結果・未確認事項を書く。自動チェックは、そのPRの最新HEADに対応する `CI` / `ci` の結果とrunリンクを確認する。失敗・未実行・承認待ちは成功と扱わない。
- [ ] DraftのままHumanへ提示する。エージェントはReadyへの変更・merge・設定変更を行わない。

## 外部forkからのPRを確認するとき

[合成3ケースの机上確認](fork-review-tabletop.md) で、この手順をどう使うか確認できます。

- [ ] workflowの実行承認前に、最新HEADの全差分を読む。`.github/workflows/` だけでなく、`package.json`、lockfile、`scripts/`、テスト、そこから呼ばれるコードも確認する。既存CIもPRのコードを実行するため、文書変更という説明だけでは判断しない。
- [ ] 未信頼のforkコードはローカルでも実行しない。実行承認はHumanが内容を確認して判断する。判断できなければ保留し、承認設定を緩めない。[GitHubのfork workflow承認ガイド](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks) も参照する。

## Human merge後に確認するとき

- [ ] GitHub上のmerge済みPRからmerge commit SHAを取得し、`origin/main` をfetchして到達を確認する。PRのHEADとmerge SHAは別々に記録する。
- [ ] `push` / `main` の `CI` / `ci` が、そのmerge SHAと完全一致する `headSha` で成功したことをrunリンクとともに記録する。別SHAやPR時点の成功で代用しない。mainが先へ進んでいても、対象merge SHAのrunを確認する。

入力処理、送信・保存、依存、CI、公開設定、デプロイを広げる変更は、別の明示的な依頼として扱います。
