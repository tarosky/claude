# レンダリング手順（Chrome DevTools MCP）

## なぜ ImageMagick の `magick` を信用しないか

`magick input.svg output.png` はSVGを直接ラスタライズする際、`rsvg-convert` がインストールされていればそれに委譲するが、入っていない環境では内部の簡易 MSVG レンダラにフォールバックする。このレンダラは `<polyline>` を無視する、`stroke-linecap`/`stroke-linejoin` が効かない等、実装が不完全。**一見動いているように見えて要素が丸ごと消える**ことがあるので、デザイン確認には使わない。

確認方法:
```bash
magick -list delegate 2>/dev/null | grep -i svg
which rsvg-convert
```
`rsvg-convert` が無ければ、SVG/HTMLのプレビューは必ずブラウザ（`chrome-devtools` MCP）で行う。ImageMagick はJPG変換・リサイズ・クロップなどラスター操作専用に使う。

## icon.svg のプレビュー手順

1. SVGファイルをスクラッチディレクトリに書く。
2. `mcp__chrome-devtools__new_page` または `navigate_page` で `file:///絶対パス/xxx.svg` を開く。
3. 単体SVGファイルを直接開くと、ブラウザのビューア倍率やウィンドウ制約でスクリーンショットが正方形にならないことがある（例: 256指定のはずが500x256になった実例あり）。**正確な寸法が欲しい場合はSVGを直接開かず、固定サイズのdivで包んだHTMLを作ってスクリーンショットする。**

```html
<!doctype html><html><head><style>
html,body{margin:0;padding:0;background:#e5e5e5;} /* 背景色はデバッグ用。実ファイルには含めない */
.box{width:256px;height:256px;}
.box svg{display:block;width:256px;height:256px;}
</style></head>
<body><div class="box">
  <!-- ここに icon.svg の中身をインラインで貼る -->
</div></body></html>
```

4. `resize_page` はウィンドウ全体のサイズで、小さい値（数百px未満）だと最小ウィンドウ幅にクランプされることがある。**確実なのは、ウィンドウを800x600のように十分大きく取り、`take_screenshot`（fullPageなし = ビューポート）してから、対象要素が置かれている座標（HTML側で0,0起点に配置）を`magick -crop WxH+0+0 +repage`で正確に切り出す方法。**

```bash
magick icon-viewport.png -crop 256x256+0+0 +repage PNG32:icon-preview.png
```

`-crop` 後に妙に小さいファイルサイズ（数KB、色数が数十程度）になったら、切り出し位置がズレて背景色しか写っていない可能性が高い。`identify -verbose` で色数を見るか、素直にクロップ後の画像を `Read` して目視確認する。

## banner のレンダリング手順

banner はテキスト・ロゴ・装飾を含む複合レイアウトなので、SVG単体よりHTMLで組む。

1. `width:1544px;height:500px` の `.banner` 要素を1つ作り、中に配置する。
2. 公式ロゴSVG（`horizontal-wh_rgb.svg` 等）はそのままインラインSVGとして埋め込む（座標・パスを一切編集しない）。
3. `resize_page` に `{width:1544, height:500}` を指定 → `take_screenshot`（ビューポート、fullPageなし）で撮る。1544x500程度の大きさならクランプされずそのまま正確なサイズで撮れる。
4. PNGで撮ってからJPGに変換する（`scripts/make_banners.sh` 参照）。

```bash
magick banner-1544x500.png -background white -flatten -quality 90 banner-1544x500.jpg
magick banner-1544x500.jpg -resize 772x250 banner-772x250.jpg
identify banner-1544x500.jpg banner-772x250.jpg
```

772x250 は **1544x500 のJPGをリサイズしたもの**であって、別々にHTMLをレンダリングしない（フォントのサブピクセル配置等で微妙に見た目が変わってしまうため、「縮小したもの」というレギュレーションにも忠実に従う）。

### 四辺が純白かのピクセル検算（デザイン方針5）

WordPress.org のプラグインページは白背景。バナーの端に少しでも色が残ると「箱」に見えて浮く。PNGを撮ったら **JPG化の前に** 四辺を検算する:

```bash
for g in North South West East; do
  dim=1544x1; case $g in West|East) dim=1x500;; esac
  echo "$g min=$(magick banner-1544x500.png -gravity $g -crop $dim+0+0 +repage -format '%[min]' info:)"
done
# すべて min=65535（=255, 純白）であること。1つでも下回る辺は、その方向に
# 背景グローが届いている。
```

背景に白ベース + ラジアルグローを敷く場合、グローは必ず端の手前で `rgba(...,0)`（透明 = 白）に収束させる。CSS のラジアルグラデーションは `radial-gradient(<半径x> <半径y> at <中心x> <中心y>, <色> 0%, ... , rgba(r,g,b,0) 100%)` の形で px 指定し、**「中心から各端までの距離」より半径を小さく**する。例: 中心を左端から 224px の位置に置くなら、横半径は 224px 未満（実例では 205px）にして左端を純白に保つ。値を変えたら必ず上の検算を回す（目視で済ませない）。

グローはプラグインの価値を象徴する語の中心に置くと意味が乗る（実例: rich-taxonomy は "Rich" の中心にブルーグローを配置）。リファレンスの `banner.html`（`rich-taxonomy/.claude/wp-org-assets/banner.html`）の `.banner{background:...}` がそのまま参考になる。

## ジオメトリのコツ

### 正円を直径で正確に2色に割る

中心 `(cx, cy)`、半径 `r`、分割したい角度 `θ`（θ と θ+180° を結ぶ直径で分割する）について:

```
x1 = cx + r*cos(θ),      y1 = cy + r*sin(θ)
x2 = cx + r*cos(θ+180°), y2 = cy + r*sin(θ+180°)
```

このとき次のpathは、弧 + 直径（Zで自動的に直線で閉じる）だけで正確な半円になる（中心への線分は不要）:

```svg
<path d="M {x1},{y1} A {r},{r} 0 0 1 {x2},{y2} Z" fill="black"/>
```

`sweep-flag`（上の例では `1`）で弧がどちら側を通るかが変わる。狙った側（例: 右上側）に弧が来るかは実際にレンダリングして確認する — 暗算だけで確定させない。

例: θ=225°（左上）と θ=45°（右下）を結ぶと、対角線で「右上半分／左下半分」に割れる。Taroskyのロゴマークも黒がおおむね右上、ブルーが左下に来る配色なので、このパターンはブランドの雰囲気に合う。

### ピクトグラムの重心を正円の中心に合わせる（検算必須）

手書きの座標でシェブロン（`>`）やアイコンを組むと、**見た目の中心と数値上の中心がズレやすい**。実際にあった不具合: 二重シェブロン `»` の左右の端点が `x=82` と `x=150` で、バウンディングボックス中心は `(82+150)/2=116`。円の中心は `x=128`。つまり **12px左にズレていた**が、座標を目で追っただけでは気づかず、ユーザーのレビューで指摘されて発覚した。

対策: 複数の図形要素を組んでピクトグラムを作ったら、必ず全要素のバウンディングボックス（最小x・最大x・最小y・最大y）を書き出し、`(min+max)/2` が円の中心と一致するか計算で確認してから提示する。線幅（`stroke-width`）が太い場合、丸いキャップ/ジョインで見た目の輪郭は座標のさらに外側まで広がるが、左右対称に広がる分には中心は動かないので、対称性が保たれているかだけ見ればよい。
