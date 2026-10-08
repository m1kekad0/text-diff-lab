# GitHub Pages公開記録とHuman手順

**公開サイト: [text-diff-lab](https://m1kekad0.github.io/text-diff-lab/)**。初回デプロイは2026-10-08 15:05 UTC（2026-10-09 00:05 JST）に成功しました。source Release・デプロイ元・その後のmainは別の参照です。

| 対象 | 記録 |
| --- | --- |
| 公開済み [v0.1.0 source Release](https://github.com/m1kekad0/text-diff-lab/releases/tag/v0.1.0) | `6e709f36b58093dffb00b91b0fc6a32eced511a0`（tag・Releaseの参照は維持） |
| 初回成功run | [37793469753](https://github.com/m1kekad0/text-diff-lab/actions/runs/37793469753)（`workflow_dispatch`、build・deploy成功） |
| 初回デプロイ元SHA | `74dd1449195da93595373495e33a2fa87ee117a6` |
| 初回runのartifact | `github-pages`、ID `11557048101`（保持1日） |
| この文書更新のbase main | `8d4c0dd977665103c42a300e8c292e108065f02f`（[PR #7](https://github.com/m1kekad0/text-diff-lab/pull/7) 後。初回デプロイ元からの差分はブラウザ検証スクリプト・検証文書のみ） |

初回公開後、公開4ファイルがHTTP 200で取得でき、artifactとデプロイ元の `src/` にバイト単位で一致することを確認しました。macOSの使い捨てChromium 151.0.7922.34、1440×1000・390×844で、合成入力の比較・サンプル・編集による結果解除・クリア・上限・エラーを確認しました。非空の両入力を比較した状態からの再読込で入力・結果が初期化されることも確認しています。確認した通常操作では追加の通信要求0、storageは空で、meta CSPのprobeは拒否されました。これらは初回公開サイトの確認範囲で、全ブラウザ・実機・ホストのログや安全性全般の保証ではありません。

過去のローカルMVPスクリプトではクリア後のreloadしか確認していませんでした。[PR #7の訂正と回帰チェック](browser-reset-verification.md#過去のreload検証の訂正) と、上記の公開サイト確認は別の証跡です。bootstrap・MVP・source Releaseの過去の記録を公開サイトのQAに読み替えません。

## 手動workflowの範囲

`.github/workflows/pages.yml` は `workflow_dispatch` だけで起動し、build・deployとも `refs/heads/main` に限定します。PR・push・merge・Release公開では起動しません。既存の `CI` / `ci` とmain保護は変更しません。

buildは選択されたrunの `github.sha` をcheckoutし、Node.js 24でlocked install、lint、test、buildを順に実行します。token権限は `contents: read`、checkoutのcredential保持は無効です。成功後に `dist/` の4ファイルだけを `github-pages` artifactへアップロードします（保持1日）。deployは `needs: build` の別jobで、同じrunのartifactを使います。`pages: write` / `id-token: write` はdeployだけに付与し、ソースのcheckoutやnpm実行は行いません。`github-pages` environmentの設定はHumanが別途行います。[GitHub公式workflow要件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

公式Actionsのtag参照を2026-10-08に元repositoryで確認し、完全なcommit SHAに固定しました。uploadの内部 `actions/upload-artifact` もSHA固定です。これは参照の固定であり、サプライチェーン全体の安全性保証ではありません。[GitHubのSHA固定ガイド](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions)

| Official Action | 確認したtag | 固定commit |
| --- | --- | --- |
| actions/checkout | v7 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-node | v6 | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| actions/upload-pages-artifact | v4 | `7b1f4a764d45c48632c6b24a0339c27f5614fb0b` |
| actions/deploy-pages | v4 | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` |

## 静的配信のCSPと入力の扱い

`scripts/serve.mjs` の応答ヘッダーはPagesへコピーされません。HTMLのcharset直後、link・scriptより前にmeta CSPを置きます。

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'
```

同一オリジンのmodule/CSS/画像を許可し、inline script/style、外部asset、fetch/XHR/WebSocket/sendBeacon、base変更、form送信を制限します。`'self'` はorigin単位で、project subpathへの限定ではありません。CSPは防御の一層です。入力は `textContent` とtextareaの値で扱い、ブラウザメモリ内だけで比較します。backend・保存・telemetry・外部素材・CSP報告先は追加しません。

metaでは `frame-ancestors`、`sandbox`、`report-uri`、Report-Onlyを利用できません。特にローカルの `frame-ancestors 'none'` による埋め込み防止と同等とは言えません。meta前のresourceにも適用されません。`X-Content-Type-Options: nosniff` と `Cache-Control: no-store` もHTMLで代替できません。初回公開後の応答では `Cache-Control: max-age=600` を観測し、CSP・`X-Frame-Options`・`X-Content-Type-Options` ヘッダーはありませんでした。今後の公開更新でも実際の応答を確認します。[W3C CSP3 §3.3（Working Draft）のmeta制限](https://www.w3.org/TR/CSP3/#meta-element)

静的ファイル取得はホストに届きます。GitHubは訪問者のIPアドレスをセキュリティ目的で記録するため、「入力送信なし」を「ログなし」と表現しません。[GitHubのデータ収集説明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

## Human設定・初回公開の手順（実施済み履歴）

初回公開は上記runで完了しています。以下は当時の手順を参照用に残したものです。設定変更の承認と初回公開の承認は、準備PRとは別に行います。

1. Humanが差分・固定HEADのCI/独立レビュー・公開する4ファイルを確認し、mergeを判断する。merge後はmerge SHAに対応する既存CIの成功を確認する。mergeだけではWeb公開しない。
2. **設定変更の別途承認後**、repositoryの **Settings → Pages → Build and deployment → Source: GitHub Actions** を選ぶ。既存 `pages.yml` を使い、自動pushトリガーのテンプレートを追加しない。[公式設定手順](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow)
3. 初回runの前に **Settings → Environments → github-pages** を作成・確認する。**Deployment branches and tags: Selected branches and tags** でbranch `main` だけを許可し、tagは許可しない。利用可能なら **Required reviewers** にHumanを指定し、admin bypassもHumanが判断する。environmentなしでrunすると自動作成される場合があり、保護設定の代わりにはならない。[公式environment要件](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-protection-rules)
4. sole maintainerが手動実行し唯一のreviewerにもなる場合、**Prevent self-review** を有効にすると本人が承認できず停止する。単独運用なら自己承認を許可したうえで、run開始とdeploy承認をHumanが別々に行う。自己承認を禁止したい場合は別の承認可能なHumanを先に確保する。利用できない保護機能は未確認のまま進めず、Humanが代替運用を決める。[公式self-reviewの制限](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers)
5. **初回公開の別途承認後**、公開予定main SHAを記録し、**Actions → Deploy GitHub Pages (manual) → Run workflow → main** をHumanが実行する。runの `head_sha` が承認したSHAと一致すること、build/artifact成功、environmentの対象SHAを確認してdeployを承認する。不一致なら中止する。権限不足時は自動でaccount権限を拡張しない。
6. deploy成功run・**実際のdeploy SHA**・`page_url` を記録する。公開URLで4assetの取得、比較/サンプル/編集/クリア/非空入力からの再読込、入力送信・保存なし、meta CSPと実際の応答ヘッダーを合成入力で再確認する。初回の結果は本書冒頭に記録し、READMEの公開状況を今回更新しました。

## 今後の手動公開更新

公開対象のmain SHA、対応するCI・独立レビュー・4ファイルをHumanが確認し、手動実行を承認します。上記手順5・6と同様にrunの `head_sha` と承認したSHAを照合し、build/artifact成功後にHumanがdeployを承認します。不一致・失敗・承認待ちは公開成功と扱いません。設定変更が必要な場合も別途Human承認を得ます。mergeだけでは公開更新されません。

## ローカル検証

`npm ci --ignore-scripts --no-audit --no-fund`、`npm run lint`、`npm test`、`npm run build` を実行します。testは早期meta CSP、relative URL、4asset、手動/main guard、権限分離、検証順序、artifact受け渡し、Actions固定を確認します。workflowの静的検査はGitHubでの実際のdeploy成功を証明しません。

Macで別途用意したPlaywrightを `PLAYWRIGHT_MODULE` に指定し、`PAGES_CHECK=1 node scripts/browser-check.mjs` を実行します。アプリ依存やlockfileには追加しません。このmodeは使い捨てChromiumで `/text-diff-lab/` を配信し、既存サーバーのCSPヘッダーを使いません。合成入力だけでasset取得、各操作、上限、HTML風入力の文字表示、再読込による初期化、storage、keyboard/label、CSPの拒否を確認します。外部probeにはネットワーク遮断の予備策を置き、CSPでその前に拒否されることも確認します。

`BASE_SRC` と `CAPTURE_DIR` を指定すれば、mainと変更後の同じ合成入力・viewport（desktop/mobile、normal/error/empty）で6組の画像のpixel一致を検査できます。今回のアプリの可視文言・CSS・操作コードは変更しません。個人profile、Firefox/WebKit、実際のPages配信は対象外です。ローカルQAの結果・対象HEAD・独立レビュー・最新CIはDraft PRに記録します。
