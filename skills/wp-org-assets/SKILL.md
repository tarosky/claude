---
name: wp-org-assets
description: "Taroskyブランドガイドラインに沿って、WordPress.orgプラグイン用のicon.svg・banner-1544x500.jpg・banner-772x250.jpgを作成する。プラグインの新規公開時、またはアイコン/バナー未設置のWP監査Issue対応時に使用する。"
compatibility: "Chrome DevTools MCP（SVGの正確なレンダリング用）と claude.ai Google Drive MCP（ブランド素材取得用）を使用。ImageMagickは最終的なJPG変換のみに使う。"
---

# WP.org Assets（icon / banner 生成）

## レギュレーション

| ファイル | サイズ | 備考 |
|---|---|---|
| `icon.svg` | 256×256 | ベクター。透過背景 |
| `banner-1544x500.jpg` | 1544×500 | メインバナー |
| `banner-772x250.jpg` | 772×250 | **banner-1544x500.jpg を正確に50%縮小したもの**（別レンダリングしない） |

配置先は各プラグインリポジトリ直下の `.wordpress-org/`。`.distignore` に `.wordpress-org` が正しく（アンダースコアでなくハイフンで）除外登録されているか必ず確認する。既存プラグインには `.wordpress_org`（アンダースコア）という誤記が残っている場合があるので見つけたら修正する。

## デザイン方針（重要・過去のユーザー判断）

このスキルは1回のセッションでの試行錯誤から作られた。以下はユーザーから明示的に確認済みの方針であり、勝手に変えない。

1. **icon.svg はプラグイン固有の機能を表現する。Taroskyの公式ロゴマーク（円形の"目"マーク）をそのまま使い回さない。**
   理由: `taro-xxx` 系プラグインが多数あり、全部同じロゴアイコンだと見分けがつかなくなるとユーザーが明言している。ブランドカラー（後述）と、ロゴマークに通じる幾何学的な処理（正円、太いストローク、シャープな色分割）は踏襲しつつ、ピクトグラムはプラグインの機能から独自に設計すること。
2. **banner にはTaroskyの公式ロゴをそのまま使ってよい。** ただし「ロゴ使用時の禁止事項」（配色変更禁止・変形禁止・異なるタイプフェイス禁止・異なるサブタイトル禁止）は厳守。背景色に応じて用意されている白版/黒版などの sanctioned variant をそのまま使う。
3. プラグイン名から機能を早合点しない。`taro-lead-next` は名前から「リード獲得（マーケティング）」を連想したが、実際は「投稿のページネーション（次のページへ誘導するブロック）」だった。**必ず README.md / プラグインヘッダーの Description を読んで実際の機能を確認してから**アイコンのモチーフを決めること。
4. 兄弟プラグイン（同じ組織の他の `.wordpress-org/icon.svg` 等）を調査し、モチーフが被っていないか確認する。詳細は `references/design-process.md`。

## 手順

### 0) ブランド素材の取得

`references/brand-guideline.md` を読み、Taroskyのロゴ・配色・フォント・禁止事項を把握する。素材はGoogle Driveにあり、`claude.ai Google Drive` のMCP連携が必要（未接続なら `/mcp` でユーザーに認証してもらう）。フォルダIDが分かっている場合は `search_files` に `parentId = 'xxx'` を渡して列挙する。

必要なファイル:
- `mark_rgb.svg`（円形ロゴマーク、カラー版） — 配色・幾何学処理の参考にする（icon.svgに直接転用はしない。方針1参照）
- `horizontal_rgb.svg` / `horizontal-wh_rgb.svg`（横組みロゴ、通常版・白版） — banner に使う
- ブランドガイドラインPDF（`TaroskyCorporateLogoDocument*.pdf`） — カラーコード・フォント名・禁止事項の一次情報

DriveのファイルはSVGでも `read_file_content` ではなく `download_file_content`（base64）を使い、`base64 -d` でデコードして保存する。PDFは `read_file_content` がテキストを返さないことが多い（画像主体のPDFのため）ので、`download_file_content` → `base64 -d` → `pdftoppm -png -r 100` でページをラスタライズしてから `Read` で目視確認する。

### 1) プラグインの実際の機能を確認する

README.md、プラグイン本体のヘッダーコメント（Description）を読む。名前だけで判断しない（上記方針3）。

### 2) 兄弟プラグインの資産を調査する

同じ組織内の他プラグインの `.wordpress-org/icon.svg` 等を集めて見比べ、モチーフの重複を避ける。手順は `references/design-process.md`。

### 3) デザイン方針をユーザーに確認する

最低限、以下をAskUserQuestionで確認する:
- icon.svg: 公式ロゴそのまま流用か、機能特化の独自ピクトグラムか（本スキルのデフォルト推奨は後者）
- banner: 公式ロゴ使用の可否・配置

### 4) SVGを手書きし、Chrome DevTools MCPでプレビューする

**ImageMagickの `magick` コマンドはSVGレンダリングにネイティブでは対応しておらず（`rsvg-convert` 未インストール環境が多い）、内部の弱いMSVGレンダラにフォールバックする。`<polyline>` 等が正しく描画されないことがあるため、プレビューには必ず `chrome-devtools` MCPを使う。** 詳細な手順・座標計算のコツ（正円を直径で綺麗に2色分割する方法、ピクトグラムの重心を正円の中心に正確に合わせる検算など）は `references/rendering.md` を参照。

### 5) banner を HTML + Chrome DevTools MCP でレンダリングする

banner はテキスト（プラグイン名・タグライン）とロゴを含むため、SVG単体よりHTMLで組んでChromeでスクリーンショットする方が扱いやすい。フォントは購入フォント（Futura PT Heavy / 凸版文久見出しゴシック StdN EB）が無い前提で、システムフォントの近似（例: `Avenir Next` Heavy、`Hiragino Sans` W8）で代替してよい—ただし**公式ロゴ自体のタイプフェイスは変更しない**（ロゴはSVGそのまま埋め込む。文字はプラグイン名・タグラインなどロゴ以外の部分にのみ使う）。手順は `references/rendering.md`。

### 6) JPG化・772x250の生成

1544x500のスクリーンショット(PNG)を撮ったら:

```bash
magick banner-1544x500.png -background white -flatten -quality 90 banner-1544x500.jpg
magick banner-1544x500.jpg -resize 772x250 banner-772x250.jpg
identify banner-1544x500.jpg banner-772x250.jpg   # サイズが正確か必ず確認
```

`scripts/make_banners.sh <1544x500のPNGパス> <出力先ディレクトリ>` でもよい。

### 7) レビューと確定

`.wordpress-org/` に書く前に、生成したファイルをユーザーに確認してもらう。ローカルの `Preview.app` で開くと実サイズで確認しやすい:

```bash
open -a Preview icon-preview.png banner-1544x500.jpg banner-772x250.jpg
```

指摘を受けたら都度SVG座標を直して再レンダリング。座標をいじった後は必ず「意図した中心・余白になっているか」を計算で検算する（目視だけで済ませない。過去に二重シェブロンの重心が正円の中心から12pxずれていた事例あり）。

### 8) 配置・コミット

- `.wordpress-org/icon.svg`、`.wordpress-org/banner-1544x500.jpg`、`.wordpress-org/banner-772x250.jpg` を配置
- `.distignore` の `.wordpress-org` 表記（ハイフン）を確認・修正
- 作業用の一時ファイル（スクリーンショット下書きなど）は gitignore 対象のスクラッチディレクトリ（例: `artifacts/`）で作業し、コミット前に削除する
- **必ずフィーチャーブランチで作業する（mainに直接コミットしない）**
- コミットメッセージは `git cc-commit "..."` を使う（Tarosky/ユーザー標準のCo-Authored-Byエイリアス）
- PR作成やマージは明示的に指示されるまで行わない

## 参照ドキュメント

- `references/brand-guideline.md` — Taroskyブランドの一次情報（色・フォント・禁止事項・Drive内ファイル一覧）
- `references/rendering.md` — Chrome DevTools MCPでのSVG/HTMLレンダリング手順とハマりどころ
- `references/design-process.md` — 兄弟プラグインとのモチーフ重複調査、機能からピクトグラムを設計する考え方
