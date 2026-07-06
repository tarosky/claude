# Tarosky ブランドガイドライン（一次情報）

出典: `タロスカイ株式会社 2021年版コーポレートロゴ`（デザイナー: 高見新）。
Google Drive フォルダ: https://drive.google.com/drive/folders/1DbrdLaHZpbcnnhmd6ql-qTwbapzzHwdL
（`claude.ai Google Drive` MCP が未接続の場合は、作業前にユーザーへ `/mcp` での認証を依頼する）

## カラースキーム

| 色 | HEX | RGB | CMYK |
|---|---|---|---|
| ブルー | `#00A9D9` | R0,G169,B217 | C74,M19,Y13,K0 |
| ブラック | `#000000` | R0,G0,B0 | C0,M0,Y0,K100 |

これ以外の色をロゴ本体に使うのは禁止（「異なるカラースキームを使うこと」は明示的にNG）。プラグイン独自のピクトグラム（icon.svg）側は、この2色 + 白のみで構成すると必ずブランドと調和する。

## フォント

- 欧文ベースフォント: **Futura PT Heavy**（Adobe Fonts）
- 和文ベースフォント: **凸版文久見出しゴシック StdN EB**（Adobe Fonts）

どちらも商用フォントで開発機に入っていないことが多い。**ロゴ本体（マーク・ワードマーク）は必ず提供されたSVGをそのまま埋め込み、フォントを再現しようとしない。** banner等でロゴ以外に独自の見出し文字を組む場合は、近い印象のシステムフォントで代替してよい:
- 欧文: `Avenir Next`（Heavy/900） — Futura系ジオメトリックサンセリフの代替として十分機能する
- 和文: `Hiragino Sans`（W8） — 太めのゴシックとして代替可能

## ロゴ・マーク

円形の"目"のようなマーク。ブルーとブラックで構成され、内側に三角形の切り欠き（ノッチ）がある。

- `mark_rgb.svg`（カラー版、通常背景用）
- `mark-wh_rgb.svg`（白版、濃色背景用）
- モノトーン版・グレースケール版・ライト/ダーク反転版も用意されている（`png/1_mono_bk`, `png/2_mono_wh` 等）

## ロゴ・タイプ／組み合わせ

- `type_rgb.svg`（ロゴタイプ単体 "TAROSKY"）
- `horizontal_rgb.svg`（マーク＋タイプの水平組み合わせ、カラー版）
- `horizontal-wh_rgb.svg`（同、白版 — 濃色/カラー背景の banner で使う）
- `stack_rgb.svg`（垂直組み合わせ）
- サブタイトル付き版（`*_sub_ja_rgb.svg` = 「タロスカイ株式会社」、`*_sub_en_rgb.svg` = "TAROSKY inc."）もあるが、**独自のサブタイトルを追加するのはNG**（禁止事項参照）。

## 余白ルール

ロゴの外接ボックスの短辺を `X` として、上下左右に `0.2X` のクリアスペースを確保する。これより内側に他の要素を置かない。

## ロゴ使用時の禁止事項（すべてNG）

1. 決められた空白・レイアウトを変更すること
2. 異なるカラースキームを使うこと（グラデーション化・別色化なども含む）
3. ロゴを変形させて使用すること（縦横比を変える、斜めにする等）
4. 異なるタイプフェイスを使うこと
5. 異なるサブタイトルを使うこと（独自のキャッチコピーを直接ロゴに合成しない。プラグイン名やタグラインはロゴから離して別要素として配置する）

## Drive フォルダ構成（抜粋）

```
TaroskyCorporateLogoDocument-ja.pdf   ← ガイドライン本体（画像主体、テキスト抽出不可。pdftoppmでラスタライズして読む）
TaroskyCorporateLogoDocument.ai / -ja.ai
svg/
  RGB/
    mark_rgb.svg, mark-wh_rgb.svg
    type_rgb.svg, type-wh_rgb.svg
    horizontal_rgb.svg, horizontal-wh_rgb.svg
    stack_rgb.svg, stack-wh_rgb.svg
    *_sub_ja_rgb.svg, *_sub_en_rgb.svg（サブタイトル付き。通常は使わない）
    1_mono/, 2_white/ （単色・白版バリエーション）
  CMYK/ （印刷用。Web/プラグイン用途では使わない）
png/
  1_mono_bk/, 2_mono_wh/ （黒・白のPNG書き出し）
各種サイト用/ （SNSアイコン等、既存の展開例）
制作過程資料/
```

## PDFの読み方（画像主体のPDF対策）

`read_file_content` は空文字を返すことが多い（デザインガイドはほぼ全ページ画像）。以下の手順で目視確認する:

```bash
# Driveからbase64でダウンロード（download_file_content）した後
base64 -d < downloaded.b64 > guideline.pdf
pdftoppm -png -r 100 guideline.pdf page
# page-1.png, page-2.png ... を Read ツールで1枚ずつ確認
```
