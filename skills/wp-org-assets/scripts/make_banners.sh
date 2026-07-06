#!/usr/bin/env bash
# Convert a 1544x500 PNG screenshot into the two WordPress.org banner JPGs.
#
# Usage: make_banners.sh <input-1544x500.png> <output-dir>
#
# banner-772x250.jpg is produced by resizing banner-1544x500.jpg exactly by
# half, not by re-rendering at a smaller size, so both files show pixel-for-
# pixel the same composition per the WordPress.org convention.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input-1544x500.png> <output-dir>" >&2
  exit 1
fi

input="$1"
outdir="$2"
mkdir -p "$outdir"

width=$(magick identify -format "%w" "$input")
height=$(magick identify -format "%h" "$input")
if [ "$width" != "1544" ] || [ "$height" != "500" ]; then
  echo "Error: input must be exactly 1544x500 (got ${width}x${height})" >&2
  exit 1
fi

magick "$input" -background white -flatten -quality 90 "$outdir/banner-1544x500.jpg"
magick "$outdir/banner-1544x500.jpg" -resize 772x250 "$outdir/banner-772x250.jpg"

identify "$outdir/banner-1544x500.jpg" "$outdir/banner-772x250.jpg"
