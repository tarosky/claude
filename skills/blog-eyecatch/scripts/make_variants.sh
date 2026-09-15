#!/usr/bin/env bash
# eyecatch-master.png(1600x900) から、記事用JPGとog:image用JPGを作る。
#
# Usage: make_variants.sh <input-1600x900.png> <output-dir>
#
# og:image(1200x630)は master を中央クロップ(上下30pxずつ)してから縮小したもので、
# 別レンダリングはしない(references/rendering.mdのセーフエリア計算を参照。
# wp-org-assetsのbanner-1544x500->772x250と同じ考え方)。
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input-1600x900.png> <output-dir>" >&2
  exit 1
fi

input="$1"
outdir="$2"
mkdir -p "$outdir"

width=$(magick identify -format "%w" "$input")
height=$(magick identify -format "%h" "$input")
if [ "$width" != "1600" ] || [ "$height" != "900" ]; then
  echo "Error: input must be exactly 1600x900 (got ${width}x${height})" >&2
  exit 1
fi

# 1) 記事本体用: そのままJPG化
magick "$input" -background white -flatten -quality 90 "$outdir/eyecatch-1600x900.jpg"

# 2) og:image用: 中央を1600x840にクロップ(上下30pxずつ)してから1200x630に縮小
#    references/rendering.md のセーフエリア計算と一致させること
magick "$input" -crop 1600x840+0+30 +repage -background white -flatten \
  -resize 1200x630! -quality 90 "$outdir/eyecatch-1200x630.jpg"

echo "--- size check ---"
identify "$outdir/eyecatch-1600x900.jpg" "$outdir/eyecatch-1200x630.jpg"
