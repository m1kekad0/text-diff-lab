# カウンターと上限確認の配列生成を減らす検証

2026-10-09 UTC、macOS 27.0.1 / arm64、Node.js 24.14.0 / npm 11.9.0。baseは `b59f91e852f7f0007fe61d7a6eefb9cfece3a346`。最終HEADの独立レビューとPR CIはDraft PR本文に記録します。

従来の `inspectText` はカウンターと上限確認でも入力全体を正規化・splitしていました。`countText` はUTF-16 code unitを一度走査し、行数・正規化後の文字数だけを定数の追加メモリで返します。ライブカウンターと比較前の確認に使い、左右両方が上限内の場合だけ既存の `inspectText` で行配列を作ります。`inspectText` の公開API、100行・20,000文字の上限、エラー文、切り捨てなし、LCSの削除優先tieと行番号は維持します。

## 回帰確認

- 空文字0行、CRLFを1文字のLFとして扱うこと、単独CR、末尾空行、UTF-16文字数を確認。8種のtoken（文字・CR・LF・日本語・絵文字・結合文字・Unicode行区切り・単独surrogate）で長さ0〜5の全37,449入力を既存の正規化/splitと照合。
- `x` 19,999文字＋CRLFは正規化後20,000文字で受理。絵文字10,000個は受理し、さらに `x` を足すと拒否。
- LF / CRLF / CRを各100,000回繰り返す限定fixtureは100,001行・100,000文字、左右両方の完全なエラーと `rows: null`。一方だけが無効でも両側で正規化/splitを呼ばないことを確認。
- 繰り返し空行を含む36組から両入力と連番を復元。既存のtie・最小編集・上限のテストも維持。
- `npm ci --ignore-scripts --no-audit --no-fund`、lint、unit/server 20/20、buildの静的4assetが成功。sandbox内の初回serverテストは `listen EPERM` で停止し、Mac上の再実行で成功したものを最終結果とする。

別途用意済みのPlaywright 1.62.1 / Chromium 151.0.7922.34で、合成入力・使い捨てcontextのみを使用しました。通常配信とheaderなし `/text-diff-lab/` 配信の両modeで成功。既存の比較・keyboard/focus・エラー/result reset、非空の両入力と描画結果をassertしてからのreload reset、入力操作の追加要求0・storage空、Pages modeのmeta CSP probeを維持しています。

追加のブラウザ確認は、境界文字数・空行と、20,000個の `x` ＋1,000回のLF / CRLFです。1,001行・21,000文字のエラー、結果なし→他方だけ編集して両エラー解除→再比較で未修正側のエラー→クリア→サンプル→比較の回復を左右で確認しました。初回は100,000改行のfixtureを `fill` しようとして両modeとも30秒timeoutになり、後続確認は未実行でした。最終QAは上記の限定サイズへ変更しています。この失敗にはtextarea入力・描画とautomationが含まれ、原因や関数処理時間、実pasteのfreezeを切り分けて測定したものではありません。

## 同条件の画面比較

baseの `src/` と変更後buildをPages型の同じ配信条件で撮影。desktop 1440×1000 / mobile 390×844、ja-JP、サンプル比較・101行エラー・空比較の計6組でPNG全体のbyte一致をassertしました。代表のdesktop通常・mobileエラーも目視確認しました。表示差分がないため、既存画像の差し替えはありません。下記は各Before/Afterに共通のSHA-256です。

| viewport / 状態 | SHA-256 |
| --- | --- |
| desktop / 通常 | `fdfb5cc62d73c85e8050d7800e7eb767dd2748825e6f88ba5d6dadd161609dc9` |
| desktop / エラー | `656e052263395d70cbb7130a338cd90b796d7085b1c3974144e35bec26895ef3` |
| desktop / 空 | `ac62bfa9e6b835a269d25b4a4571b6068c06577b935eb606a69c961395948ce5` |
| mobile / 通常 | `6e1eddf9f1057533e89b0a8222a98d4e0a9a84e48b57d7ae92180b4b414f6573` |
| mobile / エラー | `6905849d811854ba5a705c966d735047a7d716a92ad67c0bdd2f5e5a26193b1b` |
| mobile / 空 | `5ffd1185ef9688eb1abb5dcdf318e20e813c2ca436ad4cb362bf01ade23091ea` |

## 限定したNode計測

`scripts/counts-benchmark.mjs` で、baseの `inspectText` と変更後の `countText` を比較しました。単一入力のカウンター用途だけを測定し、各fixtureを事前に用意・warmup、各sample直前にGC、実行順を交互にして9回の中央値を記録します。heap値は結果が存在する時点の `heapUsed` 増分で、総allocation・peak RSSではありません。

| 改行の繰り返し | before ms | after ms | before heap増分 byte | after heap増分 byte |
| --- | ---: | ---: | ---: | ---: |
| LF 100,000回 | 0.821 | 0.142 | 809,120 | 488 |
| LF 1,000,000回 | 7.785 | 0.902 | 8,000,624 | 488 |
| CRLF 100,000回 | 1.372 | 0.253 | 4,100,752 | 488 |
| CRLF 1,000,000回 | 13.722 | 2.468 | 41,002,512 | 488 |

この環境・fixtureでは不要な文字列/配列の生成と時間が減りました。GC・JIT・計測器の影響があり、全入力での倍率やメモリ値の保証ではありません。ブラウザのDOM/textarea、実paste、両欄のライブ更新全体、有効入力のdiff処理はこの計測に含みません。CIに時間閾値は追加していません。

```sh
git show b59f91e852f7f0007fe61d7a6eefb9cfece3a346:src/diff.mjs > ../base-diff.mjs
BASE_DIFF_MODULE=../base-diff.mjs node --expose-gc scripts/counts-benchmark.mjs
PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/browser-check.mjs
PAGES_CHECK=1 PLAYWRIGHT_MODULE=../browser-tools/node_modules/playwright/index.mjs node scripts/browser-check.mjs
```

画像比較も再実行する場合は、baseの静的4assetをrepo外のディレクトリに用意し、Pages modeに `BASE_SRC` と `CAPTURE_DIR` を指定します。ブラウザツールは既存のローカル環境で用意する別の検証ツールで、アプリ依存・lockfile・CIには追加しません。

入力全体の走査は依然O(n)で、入力文字列自体とtextareaは保持されます。任意サイズでの応答性保証、大容量比較、実pasteのfreeze改善、Firefox/WebKit、実screen reader、実際の公開Pagesでの今回の変更は未確認です。公開サイトの配信元は引き続き `74dd1449195da93595373495e33a2fa87ee117a6` で、このPRやmergeによる自動deployはありません。
