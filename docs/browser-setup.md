# 新規環境のブラウザセットアップ

Node.js 24とnpmを使い、リポジトリのexact pinとlockfileから検証依存を復元します。別ディレクトリのPlaywright、グローバルCLI、`npx` による未導入パッケージの自動取得は使いません。

## 固定版の選択と互換性

2026-10-09 UTCに公式npmとvendor releaseを照合しました。別環境で報告されたPlaywright 1.64.0 / Chromium 156の構成を、リポジトリ内の固定依存と対応ブラウザ定義に揃えます。報告にはsource SHAと保存環境の記録がなく、この変更の検証証跡には代用しません。

| 項目 | PR #12の固定版 | 今回の固定版 |
| --- | --- | --- |
| playwright / playwright-core | 1.62.1 / 1.62.1 | 1.64.0 / 1.64.0 |
| npm公開日（UTC） | 2026-07-30 | 2026-10-07 |
| Node.js要件 | >=20 | >=20 |
| Chromium / headless shell | 151.0.7922.34、revision 1234 | 156.0.8078.4、revision 1248 |
| FFmpeg | revision 1011 | revision 1013 |
| Mac限定optional依存 | fsevents 2.3.2 | なし |
| CLI entrypoint | playwright/cli.js | playwright/cli.js |

[playwright 1.62.1](https://registry.npmjs.org/playwright/1.62.1)、[core 1.62.1](https://registry.npmjs.org/playwright-core/1.62.1)、[playwright 1.64.0](https://registry.npmjs.org/playwright/1.64.0)、[core 1.64.0](https://registry.npmjs.org/playwright-core/1.64.0)、[公式release 1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0)を確認しました。両パッケージのLICENSE/NOTICEはApache-2.0です。lockfileの公式registry URLとintegrityでnpmパッケージを固定し、ブラウザのrevisionはcoreの `browsers.json` が指定します。検証依存とブラウザをアプリの `dist/` に含めません。

既存スクリプトは `import { chromium } from 'playwright'` と `chromium.launch({ headless: true })` を使います。channel指定がないため、必要なのは固定版に対応するheadless shellです。Chromium本体だけ、またはOS提供のChromiumだけの起動成功では4チェック成功を示せません。[公式のheadless shell説明](https://playwright.dev/docs/browsers#chromium-headless-shell)

[1.63のrelease](https://github.com/microsoft/playwright/releases/tag/v1.63.0)と1.64の変更を確認しました。Ubuntu 20.04のサポート終了は既存CIのUbuntu 24.04に影響しません。1.64のdevice descriptorのscreen、JSX、snapshot更新、hidden iframeの挙動変更に対し、既存チェックはdevice descriptor・JSX・snapshot更新・iframeを使いません。これは静的な互換性確認で、ブラウザを使う実行確認は同じHEADのCI結果で別途判断します。

## 保存する準備手順

保存環境のセットアップ欄には、リポジトリのルートで実行する次のコマンドを登録します。環境のネットワーク・認証・OS依存の設定はHumanが管理します。

```sh
npm ci --include=dev --ignore-scripts --no-audit --no-fund
```

これでlockfileの開発依存を明示的に含めて導入します。ブラウザやLinuxライブラリの導入は行いません。Node.js 24、公式npm registryへのアクセス、依存を置く作業ディレクトリの書込権限が最低要件です。

ブラウザ取得前に、ダウンロードを行わず計画を確認できます。

```sh
node --version
node node_modules/playwright/cli.js --version
npm run setup:browser:plan
```

Linux x64の通常の取得計画は次の3つです。転送先も含めた実効許可リストは管理者側で確認します。dry-runは通信成功や許可を確認するものではありません。

- Chromium: `https://cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/chrome-linux64.zip`
- FFmpeg: `https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip`
- Headless shell: `https://cdn.playwright.dev/builds/cft/156.0.8078.4/linux64/chrome-headless-shell-linux64.zip`

cacheを保存する場合は、取得時とチェック実行時で同じ `PLAYWRIGHT_BROWSERS_PATH` を使い、同じOS/architecture・対応revisionの実体を保持します。未設定ならPlaywrightの既定cacheを使います。npm依存の導入、ブラウザcacheの存在、環境snapshotへの保存は別の確認項目です。別タスクのインストール成功からsnapshot保存を推定しません。

必要な取得とOSライブラリの準備が許可され、過去の拒否が解決した環境では、次のコマンドで固定版CLIを明示実行します。

```sh
npm run setup:browser
```

`--no-remove` で他のPlaywright導入が使う既存ブラウザを削除しません。自動セットアップやチェックから取得コマンドを呼びません。Linuxの必要ライブラリは [公式のブラウザ準備](https://playwright.dev/docs/browsers#install-system-dependencies)を基に管理者が用意します。既存GitHub-hosted CIでは従来どおり `install --with-deps chromium` を実行します。権限制限のあるcloudで `apt`・`sudo`・`--with-deps` を実行する手順にはしません。

403などの取得拒否が未解決の環境では `setup:browser` を実行せず、Humanの判断を待ちます。CLIには自動再試行・fallback取得経路があるため、拒否後に同じコマンドを続けて実行しません。mirror・代理取得・認証移送・許可リスト変更・バージョン変更による回避も行いません。1.64.0もFFmpegが必要で、版の統一は403を解決した証拠ではありません。

## 同じソースで検証する

依存導入後に以下を実行します。後半の4チェックは対応headless shellとLinuxライブラリが準備済みの場合だけ実行します。

```sh
git rev-parse HEAD
npm run lint
npm test
npm run build
npm run check:browser
npm run check:keyboard
PAGES_CHECK=1 npm run check:browser
PAGES_CHECK=1 npm run check:keyboard
```

source SHA、Playwright/core版、ブラウザrevision、OS/architecture、4チェックの各結果、CI run URLを記録します。取得不可・実体欠落は未実行、起動やassertionの非ゼロ終了は失敗として記録します。古いSHAの成功や合成HTMLだけの起動確認を代用しません。Pages modeはローカルsubpath確認で、公開サイトへのdeployは行いません。

snapshotを保存した場合は保存識別子と保存対象のsource SHAを記録し、そこから起動した新しい環境で依存・ブラウザ実体・同じ4チェックを再確認します。ここまで確認して初めて、保存済みセットアップの再現成功として扱います。
