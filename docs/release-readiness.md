# v0.1.0 source releaseの準備確認

2026-10-08時点の提案です。**判定: GO（小さな行比較MVPのsource release候補）**。確認範囲で実装上の阻害要因は見つかりませんでした。Humanのmerge・公開判断と、以下の公開直前確認は未完了です。タグ・GitHub Release・npm公開・hosted deploymentは行っていません。

## 検証した対象と根拠

検証元はmainの **`fd40bbf1b82e79417d8139d78ddb381bc5bf2433`**。この文書を含むPRのHEAD、将来の文書merge SHA、実際にタグを付けるrelease SHAはそれぞれ別です。この結果を将来のSHAの合格証として使わず、対象を固定して再確認してください。

| 確認 | 根拠と範囲 |
| --- | --- |
| ローカルの基本検証 | Mac / Node.js 24.14.0 / npm 11.9.0でlocked install、lint、13テスト、build成功。failed / skipped / todoは0、buildは静的4ファイル。初回sandbox内のテストはloopback待受がEPERMで失敗し、Mac上で再実行して成功。 |
| main CI | [push/main run 37769413582](https://github.com/m1kekad0/text-diff-lab/actions/runs/37769413582) のheadShaが検証元と完全一致。`CI` / `ci` のinstall・lint・test・build成功。PRの最終HEADの検証・独立レビュー・CIはPR本文に記録。 |
| ブラウザ証拠の再利用 | [MVP検証記録](mvp-verification.md) のChromium 151.0.7922.34による合成入力・使い捨てcontextの確認を再利用。今回の `src/` 4ファイルのSHA-256は記録内の値と全て一致。今回のブラウザ操作・撮影は未実施。bootstrap画像は未実装時の記録であり、現機能の証拠にはしない。 |
| 公開する内容 | 現在の追跡ソース・文書・テスト・リンクとcommitの公開名義を点検。既存PNG14枚は目視で自作UI・合成入力のみ、chunkはIHDR/IDAT/IENDのみでテキスト・EXIF metadataなし。新規画像・実入力・私的資料は追加しない。全履歴・全ref・GitHub添付物の網羅的な安全保証はしない。 |
| ライセンス・由来 | [LICENSE](../LICENSE) はMIT、Copyright (c) 2026 m1kekad0。既存の[自作・検証ツールの由来記録](mvp-verification.md#公開前の点検と実用的な学び)と現ソースを照合。外部フォント・第三者素材なし。package/lockfileはroot packageのみでnpm依存0。 |

CIは既存の公式Actionsをcommit SHAで固定しています。[checkoutのLICENSE](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/LICENSE) と [setup-nodeのLICENSE](https://github.com/actions/setup-node/blob/249970729cb0ef3589644e2896645e5dc5ba9c38/LICENSE) がMITであることを確認しました。これは両Actionの入口のライセンス確認で、内部依存全件の監査ではありません。Actionsや別途用意するPlaywright/Chromiumの実体をsource releaseへ同梱しません。ソースを再配布する際はMITの著作権・許諾表示を保持します。`package.json` の `version: 0.1.0` と `private: true` は既存値で、タグや公開済みReleaseの証拠ではありません。

## 入力処理と既知の限界

`src/app.mjs` / `src/diff.mjs` に入力送信・永続保存・analytics・API呼出しはなく、結果を `textContent` で表示します。ローカルサーバーは127.0.0.1で固定の静的routeだけをGET/HEAD配信し、POST等を拒否、`Cache-Control: no-store` とCSPの `connect-src 'none'` を設定します。既存のChromium確認では操作中の新規要求0、localStorage / sessionStorage / cookie / IndexedDB / Cache Storageは空、再読込で入力が初期化されました。これらは当該コードと観測した操作の結果であり、端末・拡張機能・ブラウザの復元機能や全ての通信経路の安全保証ではありません。公開報告には引き続き合成例を使ってください。

比較は左右各100行・20,000 UTF-16単位以内に限定します。上限超過を切り捨てず比較を拒否しますが、textareaへの入力自体は制限しておらず、入力時の正規化・集計も行います。巨大な貼り付けのメモリ負荷を防ぐ保証はありません。小さな入力の用途を維持します。

Chromium以外の動作、実screen readerの読み上げ、全ブラウザでのアクセシビリティ適合は未確認です。keyboard/focus・属性の既存確認だけから読み上げ品質を主張しません。文字単位diff、ファイル読込、export、大容量比較、保存・共有・同期は未実装です。これらの追加や別ブラウザ・screen reader検証は今後の改善であり、今回の限定したsource releaseを止める実装不具合としては扱いません。

## Humanの公開直前チェックリスト

- [ ] PR本文の最終HEAD、独立レビュー、同HEADの `CI` / `ci` 成功を確認し、HumanがReady・mergeを判断する。既存の[merge後の確認](contributing.md#human-merge後に確認するとき)に従い、文書merge SHAと完全一致するpush/main CIも記録する。
- [ ] release候補SHAを固定する。上の検証元・文書merge SHA・release SHAを別々に記録し、差分が文書のみでもlocked install・lint・test・buildと公開内容を再確認する。コード・配信・依存の差分があれば合成Chromium確認とライセンス確認も更新する。結果不足、CI失敗/承認待ち、公開不能な情報、由来不明の同梱物があればHOLD。
- [ ] [fork机上確認](fork-review-tabletop.md)の3ケースを読み、Human自身の判断を期待判断と照合する。実forkやworkflow承認で演習しない。
- [ ] Humanが `v0.1.0` という名前、タグの対象SHA、下書き本文・既知の限界・MIT表示を確認し、タグ・GitHub Release公開を判断する。未完了なら公開を保留する。公開後はタグの対象が検証したrelease SHAと一致することを確認する。

## Release notes下書き（未公開）

### text-diff-lab v0.1.0 — 小さな行単位比較MVP

2つのテキストをブラウザのメモリ内で比較し、追加・削除・変更なしを色・記号・文字と前後の行番号で表示します。置換は削除と追加で表し、繰り返し行の同点では削除を先に選びます。サンプル、クリア、編集後の古い結果の消去に対応します。

左右各100行・20,000 UTF-16単位まで。CRLF/CRをLFへ統一し、空文字は0行、末尾改行は最後の空行として扱います。空白・大文字小文字は区別します。上限超過時は切り捨てずエラーを表示します。巨大な貼り付けの負荷対策、文字単位diff、ファイル読込、exportは含みません。

Node.js 24とnpmを用意し、取得したソースのルートで起動します。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev
```

`http://127.0.0.1:4173` を開き、終了は `Ctrl+C`。build版は `npm run build` 後にdevを終了して `npm run preview`。hosted deploymentはありません。入力の送信・永続保存・アカウント・テレメトリーは実装していません。端末や拡張機能まで含む安全を保証するものではありません。

動作確認はMacの使い捨てChromium contextと合成入力に限定しています。他ブラウザと実screen readerは未確認です。自作部分はMIT。問題は[貢献手順](contributing.md)に沿って、実入力を含めず最小の合成例で報告してください。
