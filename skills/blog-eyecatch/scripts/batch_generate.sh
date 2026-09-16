#!/usr/bin/env bash
# scripts/batch_generate.py の薄いラッパー。SKILL.mdの手順どおり
# `scripts/batch_generate.sh articles.csv output/` で呼べるようにしている。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$DIR/batch_generate.py" "$@"
