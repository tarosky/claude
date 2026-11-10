#!/usr/bin/env bash
# Codex CLI に差分を読み取り専用でレビューさせ、結果をファイルに保存する
#
# 使い方:
#   bash codex-review.sh (--base <branch> | --uncommitted | --commit <sha>) --out <dir> \
#     [--intent <file>] [--preset wordpress|generic]
#
# - <dir> に prompt.md（Codex に渡した指示）・review.md（レビュー結果）・codex.log（実行ログ）を残す
# - Codex は読み取り専用のサンドボックスで動かす。念のため、実行の前後で作業ツリーが変わっていないかも確かめる
# - 終了コード: 0 = 成功、1 = 前提エラー・実行失敗、2 = 作業ツリーが変更された
#
# なぜ codex review の --base などを使わないか:
#   Codex CLI 0.167.0 では --base / --uncommitted / --commit と独自の指示（PROMPT）を併用できない。
#   意図を渡さないと仕様どおりの挙動を「バグ」と指摘されるので、範囲も指示文の中で伝える。

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

fail() {
	echo "Error: $*" >&2
	exit 1
}

MODE=""
TARGET=""
OUT_DIR=""
INTENT_FILE=""
PRESET="generic"
while [ $# -gt 0 ]; do
	case "$1" in
		--base) MODE=base; TARGET="${2:?--base にブランチを指定してください}"; shift 2 ;;
		--uncommitted) MODE=uncommitted; shift ;;
		--commit) MODE=commit; TARGET="${2:?--commit に SHA を指定してください}"; shift 2 ;;
		--out) OUT_DIR="${2:?--out に出力先を指定してください}"; shift 2 ;;
		--intent) INTENT_FILE="${2:?--intent にファイルを指定してください}"; shift 2 ;;
		--preset) PRESET="${2:?--preset に wordpress か generic を指定してください}"; shift 2 ;;
		*) fail "不明な引数: $1" ;;
	esac
done
[ -n "$MODE" ] || fail "範囲を指定してください: --base <branch> | --uncommitted | --commit <sha>"
[ -n "$OUT_DIR" ] || fail "--out <dir> を指定してください"
FOCUS_FILE="$SKILL_DIR/references/focus-$PRESET.md"
[ -f "$FOCUS_FILE" ] || fail "プリセットがありません: $PRESET（$FOCUS_FILE）"
if [ -n "$INTENT_FILE" ] && [ ! -f "$INTENT_FILE" ]; then
	fail "意図のファイルがありません: $INTENT_FILE"
fi

# --- 前提の確認 ---
command -v codex >/dev/null 2>&1 || fail "Codex CLI が見つかりません。インストールしてから再実行してください（https://github.com/openai/codex）"
LOGIN="$(codex login status 2>&1)"
if [ $? -ne 0 ] || ! printf '%s' "$LOGIN" | grep -qi '^logged in'; then  # "Not logged in" に一致させない
	fail "Codex CLI にログインしていません。ユーザーに \`codex login\` を実行してもらってください（${LOGIN}）"
fi
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "git リポジトリの中で実行してください"

# --- 範囲 ---
case "$MODE" in
	base)
		git rev-parse --verify -q "$TARGET" >/dev/null || fail "ブランチがありません: $TARGET"
		git diff --quiet "$TARGET...HEAD" && fail "$TARGET...HEAD に差分がありません"
		SCOPE="Review the changes on the current branch against \`$TARGET\`. Inspect them with \`git diff $TARGET...HEAD\` and \`git log $TARGET..HEAD\`."
		;;
	uncommitted)
		if git diff --quiet HEAD && [ -z "$(git ls-files --others --exclude-standard)" ]; then
			fail "未コミットの変更がありません"
		fi
		SCOPE="Review the uncommitted changes (staged, unstaged, and untracked). Inspect them with \`git diff HEAD\` and \`git status --short\`; read untracked files directly."
		;;
	commit)
		git rev-parse --verify -q "$TARGET^{commit}" >/dev/null || fail "コミットがありません: $TARGET"
		[ -n "$(git show --format= "$TARGET")" ] || fail "コミット $TARGET に差分がありません"
		SCOPE="Review the changes introduced by commit \`$TARGET\`. Inspect them with \`git show $TARGET\`."
		;;
esac

# --- 指示文 ---
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
{
	echo "# Review request"
	echo
	echo "## Scope"
	echo
	echo "$SCOPE"
	echo "You may read any file in the repository for context, but report only problems introduced or exposed by these changes."
	echo
	echo "## Intent of the change"
	echo
	if [ -n "$INTENT_FILE" ]; then
		cat "$INTENT_FILE"
	else
		echo "(Not provided. Infer the intent from commit messages. If a behavior looks deliberate, say so instead of calling it a bug.)"
	fi
	echo
	cat "$FOCUS_FILE"
	echo
	echo "## Output rules"
	echo
	echo "- Write the review in Japanese."
	echo "- Report only issues you are confident are real. For each, give the file and line, why it is a problem, and a concrete scenario (input or state) that triggers it."
	echo "- Behavior that the intent above describes as the specification is not a bug. If you think the specification itself is risky, label it as a design concern, not a bug."
	echo "- If there are no real issues, say so plainly. Do not pad the review."
} >"$OUT_DIR/prompt.md"

# --- 実行前の状態 ---
# 出力先がリポジトリの中なら、スクリプト自身が書くファイルで誤検知しないよう比較から外す。
EXCLUDE=()
TOPLEVEL="$(git rev-parse --show-toplevel)"
case "$OUT_DIR/" in
	"$TOPLEVEL"/*) EXCLUDE=(":(top,exclude)${OUT_DIR#"$TOPLEVEL"/}") ;;
esac
snapshot() {
	git rev-parse HEAD
	git status --porcelain=v1 -uall -- :/ ${EXCLUDE[@]+"${EXCLUDE[@]}"}
	git diff HEAD -- :/ ${EXCLUDE[@]+"${EXCLUDE[@]}"} | git hash-object --stdin
	# 未追跡ファイルは status の行が変わらず diff にも出ないので、内容のハッシュも取る（.gitignore の対象は見ない）。
	(cd "$TOPLEVEL" && git ls-files --others --exclude-standard -z -- :/ ${EXCLUDE[@]+"${EXCLUDE[@]}"} | xargs -0 git hash-object --)
}
BEFORE="$(snapshot)"

echo "Codex でレビュー中（数分かかることがあります）… 出力先: $OUT_DIR"
STARTED_AT="$(date +%s)"
# 設定ファイルの既定が workspace-write でも書き込めないよう、サンドボックスと承認を明示的に上書きする。
codex review \
	-c 'sandbox_mode="read-only"' \
	-c 'approval_policy="never"' \
	- <"$OUT_DIR/prompt.md" >"$OUT_DIR/review.md" 2>"$OUT_DIR/codex.log"
STATUS=$?
echo "所要時間: $(( $(date +%s) - STARTED_AT ))秒"

if [ "$BEFORE" != "$(snapshot)" ]; then
	echo "Error: Codex の実行中に作業ツリーが変わりました。git status と git diff を確認してください" >&2
	exit 2
fi
if [ "$STATUS" -ne 0 ]; then
	echo "Error: codex review が失敗しました（終了コード ${STATUS}）。ログ: $OUT_DIR/codex.log" >&2
	tail -20 "$OUT_DIR/codex.log" >&2
	exit 1
fi
if ! grep -q 'sandbox: read-only' "$OUT_DIR/codex.log"; then
	echo "Error: Codex が読み取り専用で動いたことをログで確認できません。$OUT_DIR/codex.log の冒頭を確認してください" >&2
	exit 1
fi
echo "レビュー結果: $OUT_DIR/review.md"
