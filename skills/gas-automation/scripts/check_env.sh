#!/bin/sh
# gas-automation 環境診断
#
# ノーコーダー環境では Node 自体が無いことがあるため、Node に依存しない POSIX sh で書く。
# 結果は JSON で標準出力に出す。何もインストール・変更しない（読み取りのみ）。
#
# 使い方: sh check_env.sh [対象ディレクトリ（省略時はカレント）]

TARGET_DIR="${1:-.}"
NODE_REQUIRED_MAJOR=22

# PATH に node が無くても、よくある場所にあれば拾う（mise / Homebrew / Volta）
find_node() {
	if command -v node >/dev/null 2>&1; then
		command -v node
		return 0
	fi
	for candidate in \
		"$HOME/.local/share/mise/shims/node" \
		"$HOME/.local/mise/shims/node" \
		"/opt/homebrew/bin/node" \
		"/usr/local/bin/node" \
		"$HOME/.volta/bin/node"; do
		if [ -x "$candidate" ]; then
			echo "$candidate"
			return 0
		fi
	done
	return 1
}

json_bool() {
	if [ "$1" -eq 0 ]; then echo true; else echo false; fi
}

json_str() {
	if [ -z "$1" ]; then
		echo null
	else
		printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
	fi
}

# --- ディレクトリ ---------------------------------------------------------
[ -d "$TARGET_DIR" ]
dir_exists=$(json_bool $?)

# .DS_Store と .git だけなら「空」とみなす。存在しないディレクトリは空ではない扱い
if [ "$dir_exists" = true ]; then
	dir_entries=$(ls -A "$TARGET_DIR" 2>/dev/null | grep -v -e '^\.DS_Store$' -e '^\.git$' | wc -l | tr -d ' ')
	[ "$dir_entries" -eq 0 ]
	dir_empty=$(json_bool $?)
else
	dir_empty=false
fi

[ -f "$TARGET_DIR/.clasp.json" ]
has_clasp_project=$(json_bool $?)

# --- Node -----------------------------------------------------------------
node_path=$(find_node)
node_version=""
node_major=""
node_ok=false
node_on_path=false
npx_path=""

if [ -n "$node_path" ]; then
	node_version=$("$node_path" --version 2>/dev/null | sed 's/^v//')
	node_major=$(echo "$node_version" | cut -d. -f1)
	if [ -n "$node_major" ] && [ "$node_major" -ge "$NODE_REQUIRED_MAJOR" ] 2>/dev/null; then
		node_ok=true
	fi
	if command -v node >/dev/null 2>&1; then
		node_on_path=true
	fi
	npx_candidate="$(dirname "$node_path")/npx"
	if command -v npx >/dev/null 2>&1; then
		npx_path=$(command -v npx)
	elif [ -x "$npx_candidate" ]; then
		npx_path="$npx_candidate"
	fi
fi

# --- clasp ----------------------------------------------------------------
# 認証情報は ~/.clasprc.json（npx 経由でもグローバルでも共通）
[ -f "$HOME/.clasprc.json" ]
clasp_logged_in=$(json_bool $?)

# --- 判定 -----------------------------------------------------------------
# clasp: clasp モードで進められる / setup_node: Node の導入・更新が必要
if [ "$node_ok" = true ] && [ -n "$npx_path" ]; then
	mode=clasp
else
	mode=setup_node
fi

cat <<EOF
{
  "target_dir": $(json_str "$(cd "$TARGET_DIR" 2>/dev/null && pwd)"),
  "dir_exists": $dir_exists,
  "dir_empty": $dir_empty,
  "has_clasp_project": $has_clasp_project,
  "node": {
    "path": $(json_str "$node_path"),
    "version": $(json_str "$node_version"),
    "on_path": $node_on_path,
    "required_major": $NODE_REQUIRED_MAJOR,
    "ok": $node_ok
  },
  "npx_path": $(json_str "$npx_path"),
  "clasp_logged_in": $clasp_logged_in,
  "recommended_mode": "$mode"
}
EOF
