# ブラウザ回帰のCI検証

2026-10-09 UTC。baseは `765ad9cd207fb3e1f8c2d8fc7774f10cb269f398`。アプリの `src/`、公開用の4asset、表示・操作仕様は変更しません。最終HEADでのローカル検証・独立レビュー・Linux CIのrun URLと各stepの結果はDraft PR本文に記録します。

## 固定依存と公開情報

Playwright `1.62.1` をexact-pinned devDependencyに追加し、lockfileで公式 `registry.npmjs.org` のtarball URLとintegrityを固定します。既存手動QAと同じ公開安定版を選びました。確認時のlatestは `1.64.0` ですが、自動更新は行いません。Node.js要件は `>=20` で、プロジェクトのNode.js 24と互換です。

| パッケージ | 固定版 | ライセンス・範囲 |
| --- | --- | --- |
| playwright | 1.62.1 | Apache-2.0、devのみ |
| playwright-core | 1.62.1 | Apache-2.0、devのみ |
| fsevents | 2.3.2 | MIT、Mac限定optional、Linuxでは対象外 |

公式npmの[playwright公開情報](https://registry.npmjs.org/playwright/1.62.1)、[playwright-core公開情報](https://registry.npmjs.org/playwright-core/1.62.1)、[fsevents公開情報](https://registry.npmjs.org/fsevents/2.3.2)、[公式release](https://github.com/microsoft/playwright/releases/tag/v1.62.1)を確認しました。インストール済み両PlaywrightパッケージのLICENSE/NOTICEとfseventsのLICENSEも点検しました。`npm audit` の報告は脆弱性0件でした（確認時点の公開情報であり、将来の保証ではありません）。パッケージやブラウザを `dist/` に再配布しません。

3スクリプトは `import { chromium } from 'playwright'` で固定依存を読み込みます。旧 `PLAYWRIGHT_MODULE` 指定は使いません。CLIは `node node_modules/playwright/cli.js` で実行し、未導入時に最新版を取得する `npx` は使いません。固定版のブラウザ定義はChromium/headless shell revision `1234`、version `151.0.7922.34` です。

## 必須CIの対象範囲

既存workflow `CI` のjob ID/name `ci`、`contents: read`、credentials非永続化、公式Actionsのcommit SHA固定を維持します。同じjob内で以下を順に実行するため、ブラウザだけ別の任意チェックとして扱うことはありません。

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. lint、unit/server、static build
3. `node node_modules/playwright/cli.js install --with-deps chromium`
4. `npm run check:browser`、`npm run check:keyboard`
5. `PAGES_CHECK=1` で同じ比較・キーボードチェック

GitHub-hosted `ubuntu-24.04` 上の手順3で、固定版に対応するChromiumと必要なLinux依存を明示インストールします。OSのmajor版も固定し、[ubuntu-latestのUbuntu 26移行予告](https://github.com/actions/runner-images/issues/14748)による検証環境の自動切替を避けます。runner imageの更新やOS依存のパッチ版までは固定せず、完全なbit単位の再現性を主張しません。[Playwright公式CI手順](https://playwright.dev/docs/ci)と[ブラウザ準備手順](https://playwright.dev/docs/browsers)に従い、ブラウザキャッシュや代替ダウンロード設定は追加しません。

| チェック | CIで確認する範囲 |
| --- | --- |
| browser / 通常 | 合成入力の比較行・集計、上限、HTML風入力の文字表示、編集/サンプル/クリアによるreset、非空状態からのreload、storage・通信・例外、focus順序 |
| browser / Pages | 同じ機能と `/text-diff-lab/` のheaderless asset/MIME、早期meta CSP拒否probe |
| keyboard / 通常・Pages | 1440×1000と390×844、初回Tab/Shift+Tab・Enter/Space、比較/編集/上限エラーからの復帰、focus-visible・outline・横overflow、storage・通信・例外 |

Pages modeは一時buildをローカルsubpathで配信します。公開サイトへの接続・deploy、実モバイルOS、実screen reader、実paste/IME、Firefox/WebKit、個人profileやOS clipboard、画面画像の目視確認はCI対象外です。390pxはデスクトップChromiumの狭いviewportです。

取得・起動・assertion・子プロセスの非ゼロ終了はjobの失敗に伝播します。`continue-on-error`、条件による成功扱い、失敗時のブラウザ代替はありません。jobは15分、取得stepは5分、各回帰stepは3分で停止し、timeoutも成功として扱いません。[GitHub Actionsのstep失敗・timeoutの仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)に従います。これらはハングを制限する運用上限で、入力処理の性能閾値ではありません。

## ローカルで再実行

Node.js 24で依存導入後、固定版と対応する既存Chromiumがあればダウンロード不要です。

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

ブラウザ未導入で、取得が許可された新しいローカル環境では `node node_modules/playwright/cli.js install chromium` を明示実行します。Linux CIの `--with-deps` はMacで実行しません。取得拒否済み環境では再試行・設定変更・mirror取得をせずHOLDとして報告します。今回Macでは既存Chromiumと使い捨てcontext/profileのみを使用し、Linux CIの取得成功とは別の証跡として扱います。

限定サイズの速度測定は以下の手動コマンドで継続します。1秒wall/200ms同期区間の安全停止基準と2秒deadlineをCI性能保証に持ち込みません。測定方法と限界は [入力・復帰確認](input-responsiveness-verification.md) を参照してください。

```sh
npm run check:input-responsiveness
PAGES_CHECK=1 npm run check:input-responsiveness
```

## fail-closedの一時fixture確認

恒久的な壊れたPRを作らず、一時ディレクトリのpackageに実際のnpm script定義とworkflowのrunコマンドをコピーしました。取得CLIまたは各子スクリプトを、指定ケースだけexit 23する合成stubに置換し、Bashの `-e -o pipefail` と失敗後のstep停止を使って結果を確認しました。全成功controlでは5stepすべてexit 0です。

| 一時fixture | 観測結果 |
| --- | --- |
| 取得CLIの子コマンドが非ゼロ | exit 23、残り4stepはnot-run |
| 通常browserのみ失敗 | npmからexit 23、後続3stepはnot-run |
| 通常keyboardのみ失敗 | npmからexit 23、後続2stepはnot-run |
| Pages browserのみ失敗 | 通常2チェックは成功、exit 23、最後のstepはnot-run |
| Pages keyboardのみ失敗 | 先行4stepは成功、最後がexit 23 |
| 取得CLIの子コマンドがハング | fixtureの300ms期限でETIMEDOUT/SIGTERM、成功扱いなし |
| 実スクリプト4組合せに空のbrowser cacheを指定 | 全4件が `Executable doesn't exist` / exit 1、取得なし |

missing-browserはstubではなく、実際の比較・キーボードスクリプトを `PLAYWRIGHT_BROWSERS_PATH` に空の一時ディレクトリを指定して実行しました。元のbrowser cacheやリポジトリは改変せず、一時fixtureは終了後に削除しました。fixtureはローカルの失敗伝播検証です。GitHubのtimeout実測や実際のLinuxブラウザ取得・起動成功を示すものではなく、後者は最終HEADのPR CI全stepで確認します。
