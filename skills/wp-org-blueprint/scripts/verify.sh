#!/usr/bin/env bash
# blueprint をローカルの Playground で実行し、着地ページの HTML を確かめる
#
# 使い方:
#   bash verify.sh <plugin-dir> <out-dir> [期待する文字列...]
#
# - <plugin-dir> のコード（ビルド済みであること）を /wordpress/wp-content/plugins/<slug> にマウントする
# - blueprint.php local で作った一時コピーを使う（本番用 blueprint.json は変更しない）
# - <out-dir> に blueprint-local.json・playground.log・landing.html を残す
# - 期待する文字列がすべて含まれ、PHP のエラー出力が無ければ終了コード 0
#
# 環境変数: PORT（既定 9431）、WP_ORG_SLUG（スラッグがディレクトリ名と違う場合）、
#           LANDING（確認するパス。既定は blueprint の landingPage）、
#           PUBLISHED=1（ローカルコードをマウントせず、WordPress.org の公開版で本番どおりに実行する）、
#           KEEP_RUNNING=1（検証後もサーバーを止めない。ブラウザでの目視や REST の確認に使う）
# @wp-playground/cli はグローバルインストールせず npx で一時実行する。

set -u

PLUGIN_DIR="$(cd "${1:?plugin-dir を指定してください}" && pwd)"
OUT_DIR="${2:?out-dir を指定してください}"
shift 2
PORT="${PORT:-9431}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SLUG="${WP_ORG_SLUG:-$(basename "$PLUGIN_DIR")}"

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# Playground CLI は Node 20.18 以上が必要。リポジトリの .node-version に引きずられないよう mise の shim を優先する。
NPX="npx"
for candidate in "$HOME/.local/share/mise/shims/npx" "$HOME/.local/mise/shims/npx"; do
	if [ -x "$candidate" ]; then
		NPX="$candidate"
		break
	fi
done

LOCAL_ARGS=()
MOUNT_ARGS=(--mount="$PLUGIN_DIR:/wordpress/wp-content/plugins/$SLUG")
if [ "${PUBLISHED:-}" = 1 ]; then
	LOCAL_ARGS=(--published)
	MOUNT_ARGS=()
fi
WP_ORG_SLUG="$SLUG" php "$SCRIPT_DIR/blueprint.php" local "$PLUGIN_DIR" "$OUT_DIR/blueprint-local.json" ${LOCAL_ARGS[@]+"${LOCAL_ARGS[@]}"} || exit 1
LANDING="${LANDING:-$(php -r 'echo json_decode(file_get_contents($argv[1]), true)["landingPage"] ?? "/";' "$OUT_DIR/blueprint-local.json")}"

echo "Playground を起動中（port ${PORT}）…"
"$NPX" -y @wp-playground/cli@latest server \
	--port="$PORT" \
	${MOUNT_ARGS[@]+"${MOUNT_ARGS[@]}"} \
	--blueprint="$OUT_DIR/blueprint-local.json" \
	>"$OUT_DIR/playground.log" 2>&1 &
SERVER_PID=$!
STARTED_AT="$(date +%s)"

stop_server() {
	kill "$SERVER_PID" 2>/dev/null
	# npx の子プロセス（node）が残るので、このポートの CLI だけを止める
	pkill -f "wp-playground/cli.*--port=$PORT" 2>/dev/null
}
if [ "${KEEP_RUNNING:-}" != 1 ]; then
	trap stop_server EXIT
fi

# 起動待ち（初回は WordPress のダウンロードがあるので数分かかることがある）
READY=0
for _ in $(seq 1 360); do
	if ! kill -0 "$SERVER_PID" 2>/dev/null; then
		echo "Playground が途中で終了しました。ログ: $OUT_DIR/playground.log" >&2
		grep -E 'Error|Fatal|Uncaught|Warning|Notice|Deprecated|Stack trace|#[0-9]+ ' "$OUT_DIR/playground.log" | grep -v '^[[:space:]]*[.#][a-z-]' | head -20 >&2
		exit 1
	fi
	# HTTP の応答だけでは判定しない（blueprint 実行中も "WordPress is not ready yet" の 502 を返す）
	if grep -q 'Ready!' "$OUT_DIR/playground.log"; then
		READY=1
		break
	fi
	sleep 1
done
if [ "$READY" != 1 ]; then
	echo "Playground が 6 分以内に応答しませんでした。ログ: $OUT_DIR/playground.log" >&2
	exit 1
fi
# 起動から blueprint 完了までの秒数。WordPress 本体の起動分を含むので、空のデモとの差がデモデータのコスト。
# 訪問者のブラウザ（PHP-wasm）ではこれより遅くなりうるので、目安として扱う。
echo "Playground 起動〜blueprint 完了: $(( $(date +%s) - STARTED_AT ))秒"

# login ステップがあると初回アクセスで自動ログインの 302 が返り、Cookie が無いとループする。Cookie ジャーを使う。
JAR="$OUT_DIR/cookies.txt"
rm -f "$JAR"
CODE="$(curl -sL -m 120 -c "$JAR" -b "$JAR" -w '%{http_code}' -o "$OUT_DIR/landing.html" "http://127.0.0.1:$PORT$LANDING")"
echo "GET ${LANDING} → HTTP ${CODE}（${OUT_DIR}/landing.html）"

FAILED=0
if [ "$CODE" != "200" ]; then
	FAILED=1
fi
if grep -Eq '(Fatal error|Parse error|Warning|Notice|Deprecated)</b>:|There has been a critical error' "$OUT_DIR/landing.html"; then
	echo "NG: PHP のエラー出力があります" >&2
	grep -Eo '(Fatal error|Parse error|Warning|Notice|Deprecated)</b>:[^<]*<b>[^<]*|There has been a critical error[^<]*' "$OUT_DIR/landing.html" | head -10 >&2
	FAILED=1
fi
if grep -Eiq 'PHP (Fatal|Parse) error|Uncaught' "$OUT_DIR/playground.log"; then
	echo "NG: Playground のログにエラーがあります" >&2
	grep -Ei 'PHP (Fatal|Parse) error|Uncaught' "$OUT_DIR/playground.log" | head -10 >&2
	FAILED=1
fi
for expected in "$@"; do
	COUNT="$(grep -o -- "$expected" "$OUT_DIR/landing.html" | wc -l | tr -d ' ')"
	if [ "$COUNT" -gt 0 ]; then
		echo "OK: \"${expected}\" ×${COUNT}"
	else
		echo "NG: \"$expected\" が見つかりません" >&2
		FAILED=1
	fi
done

if [ "${KEEP_RUNNING:-}" = 1 ]; then
	echo "サーバーは起動したままです: http://127.0.0.1:${PORT}${LANDING}"
	echo "停止: pkill -f 'wp-playground/cli.*--port=${PORT}'"
fi
if [ "$FAILED" = 0 ]; then
	echo "検証成功"
else
	echo "検証失敗" >&2
fi
exit "$FAILED"
