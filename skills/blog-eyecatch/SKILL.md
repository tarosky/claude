---
name: blog-eyecatch
description: "Maintic（ja.wpplatform.maintic.com）のブログ記事タイトルから、アイキャッチ画像(1600x900)とog:image(1200x630)を生成する。記事タイトル一覧が確定した後のバッチ生成、または既存記事のog:image差し替えに使用する。"
compatibility: "Node.js + Playwright（HTML+CSSのヘッドレスレンダリング用）。画像生成APIはプロバイダ未確定・pluggable（scripts/generate_motif.py参照）。ImageMagickは最終的なJPG変換・クロップ・リサイズにのみ使う。"
---

# Maintic ブログアイキャッチ生成

## 背景（なぜこの設計か）

2026-08-11、担当者がChatGPTにmainticのFVスクリーンショットを読ませてアイキャッチを1枚生成したが、**画像生成AIが描いたタイトル文字が崩れて読めず**、結局Photoshopで文字組みを手作業に戻した（社内Slackのスレッドで議論）。その場で「HTMLで画像生成すればタイポグラフィを正確に扱えるのでは」「Webフォント+`font-feature-settings`で綺麗になる」という結論に至り、一方で「背景のモチーフ（アイコン的な絵）がタイトルから連想される内容になっている点」は今まで通り活かしたい、という要望も出た。

このスキルはその結論をそのまま実装したもの：**タイトル文字はHTML/CSSでレンダリングし、画像生成AIには文字を一切描かせず、モチーフ（単純な1枚絵）だけを生成させて背景に敷く。**

## デザイン方針（過去のユーザー判断・勝手に変えない）

1. **タイトル文字を画像生成AIに描かせない。** 必ずHTML/CSS + Webフォントでレンダリングする（Playwrightでスクリーンショット）。これが今回の設計の出発点。
2. **背景モチーフは画像生成AIに作らせる。** ただしプロンプトには常に「文字・ロゴ・透かしを含めない」「単純なフラットな1モチーフに限定する」を明示し、モデルに文字を描く余地を与えない。
   - **2026-09-15追記: 画像生成APIが使えない場合は、モチーフをSVGで直接描いてよい**（`--motif-svg`）。実際にこの方式で1本目を作った。ブランドのイラストは「黒アウトライン6px・白面・赤アクセント」のフラットな線画なので、AIに描かせるよりSVGの方が線幅・配色が揃い、あとから部分修正もできる。写真的・有機的なモチーフが欲しいときだけ画像生成に戻す。
3. **記事タイトルの一覧は既に確定しているため、1件ずつ対話的に作るのではなく、CSV/JSON一覧からバッチで全件生成できるようにする**（マーケ担当の要望）。
4. **成果物のソース（テンプレートHTML・使用したモチーフ画像・生成プロンプト）は使い捨てにせず保存する。** JPGは再現不能なので、後から「文字の色をもう少し薄く」等の再修正のたびにゼロから作り直しにならないようにする（`wp-org-assets`スキルと同じ思想）。
5. **サイズはmasterの1600×900(16:9)を基準にし、og:image用の1200×630は master を中央クロップ→縮小して作る。** 別々にレンダリングしない（縮小後にフォントのサブピクセル配置が変わって見た目が微妙にズレるのを防ぐため。`wp-org-assets`のbanner 1544x500→772x250と同じ考え方）。アスペクト比が16:9(1.778)と1200:630(1.905)で異なるため、クロップ量を`references/rendering.md`のセーフエリア計算に従って必ず確認する。
6. **配色・フォントは2026-09-15に実サイトで確認済み**（`#A60C30` / `#242424` / 地色 `#FBF6F3` / Noto Sans JP。詳細は`references/brand-guideline.md`）。テンプレートもこの値で作り直してある。スキル作成当初の濃紺＋白抜きは憶測のプレースホルダーで、実ブランドとは別物だった。**憶測の配色でレンダリングしないこと。**
7. **タイトルは`｜`で主題とサブに分割し、前半を黒・後半を臙脂にする**（現行og:imageの構成を踏襲）。`scripts/render.mjs`が自動で分割する。
8. **ロゴと背景はデザイナー支給のSVG（`references/logo.svg` / `references/bg.svg`）をそのまま埋め込む。** `render.mjs`が自動で差し込むので、ロゴをテキストで組み直したり、背景を自作の円で代用したりしない（初版はどちらもやっていて、実物とは別物だった）。
9. **フォントサイズを決め打ちにしない。** テンプレートの`__fitText()`が実測して2行に収まる最大サイズまで自動で詰める。決め打ちだと長いタイトルで語中改行や行溢れが起き、まさにこのスキルが避けようとした「読めないアイキャッチ」になる。

## レギュレーション

| ファイル | サイズ | 備考 |
|---|---|---|
| `eyecatch-1600x900.jpg` | 1600×900 (16:9) | 記事本体・WPのアイキャッチ画像に使う原本 |
| `eyecatch-1200x630.jpg` | 1200×630 | og:image / SNSカード用。**`eyecatch-1600x900.jpg`を中央クロップして縮小したもの**（別レンダリングしない） |

出力先は1記事につき1ディレクトリ（例: `output/<slug>/`）。以下も同じディレクトリに残す（成果物ソースの永続化。方針4参照）:

- `output/<slug>/source/eyecatch.html` — レンダリングに使ったHTML（タイトル文字・モチーフパスを埋め込み済みの完成形）
- `output/<slug>/source/motif.svg` — SVGで描いた場合のモチーフ（`--motif-svg`で使う。推奨）
- `output/<slug>/source/motif-iso.py` — そのSVGの生成スクリプト（アイソメトリックの場合。寸法を変えて作り直せる）
- `output/<slug>/source/motif.png` — 画像生成AIを使った場合のモチーフ（透過PNG推奨）
- `output/<slug>/source/motif-prompt.txt` — 画像生成AIを使った場合のプロンプト全文（プロバイダ名・パラメータ込み）

## 事前準備（依存関係のインストール）

このスキルを初めて使うマシンでは、以下が入っていない可能性が高い（動作確認時に実際に未インストールだった）。

**playwrightは必ずしも入れ直さなくてよい。** 他プロジェクトにインストール済みのものを借用できる:

```bash
export PLAYWRIGHT_MODULES=/Users/guy/Documents/GitHub/maintic-blocks/node_modules
```

`scripts/render.mjs`はこの環境変数があればそこからplaywrightを読む（対応するChromiumが
`~/Library/Caches/ms-playwright`にキャッシュ済みである必要がある。バージョンがずれていると
`Executable doesn't exist`で落ちるので、その場合は別プロジェクトのものを指す）。
グローバルに入れ直すより副作用が少ない。

```bash
# 自前で入れる場合
npm install playwright
npx playwright install chromium

# 画像後処理用（Macなら Homebrew）
brew install imagemagick

# モチーフ生成用（選んだプロバイダのSDKのみでよい）
pip install google-genai   # MOTIF_PROVIDER=vertexai の場合
pip install openai         # MOTIF_PROVIDER=openai の場合
```

## 手順

### 0) ブランド素材・入力の確認

- `references/brand-guideline.md` を読む。配色・フォント・支給アセット（`logo.svg` / `bg.svg` / `layout-guide-logo.png`）は2026-09-15に確定済み。**`layout-guide-logo.png`がロゴとMマークの配置の正解**で、テンプレートはその実測値で組んである。目分量で動かさない。
- 入力は「記事タイトル一覧」（最低限 `slug, title` の2列。`category`や`lead`（リード文）があればモチーフ選定の精度が上がるので歓迎する）。1件のみの場合もこの手順は変わらない。

### 1) 記事ごとにモチーフのブリーフを作る

タイトルだけで早合点しない（`wp-org-assets`の「プラグイン名だけで機能を早合点しない」と同じ注意）。タイトルに`category`や`lead`が付随している場合は必ず読み、モチーフの方向性を1〜2文で言語化してから次に進む。考え方の詳細は `references/design-process.md`。

同じバッチ内で同じモチーフ（例: 全部「盾」や「歯車」）に偏らないよう、選んだモチーフの一覧をその場でメモしながら進める（`references/design-process.md`のログ運用を参照）。

### 2) モチーフを作る（SVGで描く / 画像生成AIに作らせる）

**SVGで描く場合（推奨・APIキー不要）**: 画風はフラット＋**アイソメトリック**（デザイナー指定）。`scripts/iso.py`（等角投影のライブラリ）を使って`output/<slug>/source/motif-iso.py`を書き、`motif.svg`を生成する。黒アウトライン`stroke-width:6`・白面・`#A60C30`のアクセントで、要素は2〜4個。文字は一切入れない。落とし穴は`references/design-process.md`の手順3.5に書いてある（**先に読むこと**）。

**画像生成AIを使う場合**: `scripts/generate_motif.py` を使う。プロバイダは環境変数 `MOTIF_PROVIDER`（`vertexai` または `openai`）で切り替える。**プロンプトには必ず「文字・ロゴ・透かしを含めない」「単純な1モチーフに限定する」を含める**（デザイン方針2）。生成後は目視で文字や余計な要素が紛れ込んでいないか確認する（自動検出はしていない。過去の失敗の再発防止が目的なのでここは省略しない）。

```bash
python3 scripts/generate_motif.py \
  --title "第三者によるWordPressの品質担保｜受け入れテストの種類と指摘への向き合い方" \
  --brief "第三者QA・受け入れテストの様子。虫眼鏡や検査リストのような検証のモチーフ" \
  --out output/qa-and-acceptance-testing/source/motif.png
```

### 3) HTMLテンプレートにタイトルとモチーフを流し込み、Playwrightでレンダリングする

`template/eyecatch.html` がマスターテンプレート。Playwrightでビューポート1600x900のスクリーンショットを撮る。座標やフォントサイズの調整はこのテンプレート自体を直接編集する（使い捨てで作り直さない。`wp-org-assets`の`banner.html`永続化と同じ考え方）。

`{{TITLE}}` `{{SUBTITLE}}` `{{MOTIF}}` を置換する。タイトルは`｜`で自動分割されるので、記事タイトルをそのまま渡してよい。

```bash
export PLAYWRIGHT_MODULES=/Users/guy/Documents/GitHub/maintic-blocks/node_modules
node scripts/render.mjs \
  --template template/eyecatch.html \
  --title "第三者によるWordPressの品質担保｜受け入れテストの種類と指摘への向き合い方" \
  --motif-svg output/qa-and-acceptance-testing/source/motif.svg \
  --out output/qa-and-acceptance-testing/eyecatch-master.png \
  --html-out output/qa-and-acceptance-testing/source/eyecatch.html
```

画像生成AIのPNGを使う場合は`--motif-svg`を`--motif`に変える。
実行時に`fit .title: 67px / 2行`のようにフォントサイズが出る。`警告:`が出たら文字が溢れているので握りつぶさない。

テンプレートの新規調整・微調整は、まず`references/rendering.md`のセーフエリアの数値を守っているか確認してから行う。1件だけ細かく見た目を詰めたい場合はChrome DevTools MCPで同じHTMLを開いて調整してもよい（バッチ本番はPlaywrightスクリプトに戻す）。

### 4) JPG化・og:imageサイズの生成

```bash
scripts/make_variants.sh output/qa-and-acceptance-testing/eyecatch-master.png output/qa-and-acceptance-testing
```

内部で行っていること（`scripts/make_variants.sh`参照）:
1. `eyecatch-master.png`が1600x900であることを確認
2. `references/rendering.md`のセーフエリア座標でクロップ→1200x630にリサイズ
3. 両方をJPG化（quality 90）
4. サイズが正確か`identify`で検算

### 5) レビュー

`eyecatch-1600x900.jpg`と`eyecatch-1200x630.jpg`を並べて、タイトル文字がクロップで切れていないか・モチーフに文字や違和感のある要素が紛れていないかを確認する。指摘があれば、テンプレートかモチーフのプロンプトを直して2)または3)からやり直す（`source/`が残っているのでゼロからにはならない）。

### 6) バッチ実行

記事一覧CSV（`slug,title,category,lead`）がある場合は`scripts/batch_generate.sh`で1)〜4)を全記事分ループできる:

```bash
scripts/batch_generate.sh articles.csv output/
```

このスキルの範囲は画像ファイルの出力までで、WordPressへのアップロード・og:imageの差し替えは対象外（人が行う）。

## 参照ドキュメント

- `references/brand-guideline.md` — Mainticの配色・フォント・現行og:imageの状況（未確定部分は要更新）
- `references/design-process.md` — タイトルからモチーフのブリーフを作る考え方、バッチ内でのモチーフ重複を避ける運用
- `references/rendering.md` — テンプレートのセーフエリア計算、Playwrightでのレンダリング手順、`font-feature-settings`の設定
- `scripts/iso.py` — アイソメトリック（等角投影）のSVGを組み立てるライブラリ
- `references/layout-guide-logo.png` — デザイナー支給のレイアウトガイド（1200×630）。ロゴとMマークの配置の正解
- `references/logo.svg` / `references/bg.svg` — 支給アセット。`render.mjs`が自動で埋め込む
- `template/eyecatch.html` — マスターテンプレート（新規調整はここを直接編集する）
