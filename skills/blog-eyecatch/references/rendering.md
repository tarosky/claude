# レンダリング手順（Playwright + セーフエリア）

## 全体の流れ

1. `template/eyecatch.html`のプレースホルダーをタイトル・モチーフ画像パスで置換した実HTMLを作る（`scripts/render.mjs`が行う）。
2. Playwrightでビューポート1600x900を開き、その実HTMLをフルページではなくビューポートのスクリーンショットとして撮る（`wp-org-assets`がChrome DevTools MCPでやっているのと同じ「ビューポート指定→そのままのサイズで撮る」方式）。
3. 撮ったPNGをImageMagickでクロップ・リサイズ・JPG化する。**ImageMagickは一切テキストやモチーフの合成に使わない**（`wp-org-assets`の「ImageMagickの弱いSVGレンダラを信用しない」という教訓と同じ理由。文字組みは必ずブラウザに任せる）。

## セーフエリア（16:9 → 1200x630クロップの計算）

master は 1600×900（16:9 = 1.778）。og:image は 1200×630（1.905）で、mainticが今使っているアスペクト比とは異なる。**同じ構図に見えるように、masterの中央から上下を均等にクロップしてから縮小する。**

```
crop_height = round(1600 / (1200/630)) = round(1600 / 1.90476) = 840
trim_total  = 900 - 840 = 60px
trim_each_side = 30px  # 上下から30pxずつ切る
```

つまり `y=30`〜`y=870`の範囲（高さ840px、幅1600pxそのまま）を切り出してから1200x630に縮小する。**タイトル文字・重要なモチーフ要素は、上下30pxのクロップ代を見込んで、y=30〜870の範囲（＝上下中央840px）に必ず収める。** `template/eyecatch.html`の`.safe-area`要素がこの範囲を表しているので、テンプレートを調整する際はこの枠からはみ出させない。

```bash
magick eyecatch-master.png -crop 1600x840+0+30 +repage eyecatch-1600x840-crop.png
magick eyecatch-1600x840-crop.png -resize 1200x630! eyecatch-1200x630.jpg
```

（`scripts/make_variants.sh`がこの計算込みで自動実行する）

## フォント・タイポグラフィ

- 和文タイトルには`font-feature-settings: "palt" 1;`を指定し、文字間を詰めて見出しらしい密度にする（社内Slackでの提案）。
- **文字サイズは決め打ちにしない。** `template/eyecatch.html`の`__fitText()`が、フォント読み込み後にタイトル(2行以内・76→44px)とサブタイトル(2行以内・40→26px)を1pxずつ実測して詰める。`scripts/render.mjs`が結果を`fit .title: 67px / 2行`のように出力し、最小サイズでも収まらなければ`警告:`を出す。
- `word-break: auto-phrase;` を指定して和文を文節単位で折り返す。これが無いと「ルールの作/り方」のように語中で割れる（実際に起きた）。Chromium 119+ が必要。
- Webフォント（Google Fonts）を`<link>`で読み込む場合、Playwrightのレンダリング環境がオフラインだとフォントが読み込めずフォールバックフォントで撮ってしまう。**レンダリング前に一度そのマシンでページを開いてフォントが読み込めるか確認する**か、フォントファイルをテンプレート側に`base64`で埋め込んでオフラインでも安定させる。

## Playwrightが使えない環境の場合

`PLAYWRIGHT_MODULES`に他プロジェクトの`node_modules`を指定すれば、インストール済みのplaywrightを借用できる（`scripts/render.mjs`が対応済み。ただしそのバージョンに対応するChromiumが`~/Library/Caches/ms-playwright`に必要）。自前で入れる場合は`npx playwright install chromium`でブラウザ本体を用意する。ネットワーク制限等でPlaywright自体が使えない場合は、代わりにChrome DevTools MCPで同じHTMLを開いてビューポート1600x900にリサイズしてからスクリーンショットを撮ってもよい（1件ずつの調整作業に向く。バッチ本番は素直にPlaywrightが動く環境で実行する）。

## 生成後のチェック

- `identify`でサイズが1600x900 / 1200x630ぴったりであることを確認する
- タイトル文字がテンプレートの安全領域からはみ出していないか目視確認する（自動検算はしていない。文字が欠けたまま気づかなかった実例が`wp-org-assets`のシェブロン中心ズレと同種の失敗として起きうるので、必ず目視する）
