#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="${HOME}/.claude"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [OPTIONS]

このリポジトリの skills/ と commands/ を ~/.claude/ にインストールします。

Options:
  -l, --link    シンボリックリンクを作成（デフォルト: コピー）
  -u, --uninstall  インストールしたファイルを削除
  -n, --dry-run    実際には実行せず、何が行われるか表示
  -h, --help       このヘルプを表示
USAGE
}

MODE="copy"
DRY_RUN=false
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -l|--link) MODE="link"; shift ;;
    -u|--uninstall) UNINSTALL=true; shift ;;
    -n|--dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

# アンインストール
if $UNINSTALL; then
  echo "Uninstalling skills and commands from ${TARGET_DIR}..."

  for skill_dir in "${REPO_DIR}"/skills/*/; do
    name="$(basename "$skill_dir")"
    target="${TARGET_DIR}/skills/${name}"
    if [ -e "$target" ]; then
      echo "  Remove: skills/${name}"
      run rm -rf "$target"
    fi
  done

  for cmd_file in "${REPO_DIR}"/commands/*.md; do
    [ -f "$cmd_file" ] || continue
    name="$(basename "$cmd_file")"
    target="${TARGET_DIR}/commands/${name}"
    if [ -e "$target" ]; then
      echo "  Remove: commands/${name}"
      run rm -f "$target"
    fi
  done

  echo "Done."
  exit 0
fi

# インストール
echo "Installing to ${TARGET_DIR} (mode: ${MODE})..."
run mkdir -p "${TARGET_DIR}/skills" "${TARGET_DIR}/commands"

for skill_dir in "${REPO_DIR}"/skills/*/; do
  [ -d "$skill_dir" ] || continue
  name="$(basename "$skill_dir")"
  target="${TARGET_DIR}/skills/${name}"

  # 既存がある場合はスキップ（別ソースの可能性）
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Skip: skills/${name} (already exists, not a symlink)"
    continue
  fi

  # 既存のシンボリックリンクは上書き
  if [ -L "$target" ]; then
    run rm -rf "$target"
  fi

  if [ "$MODE" = "link" ]; then
    echo "  Link: skills/${name}"
    run ln -s "$skill_dir" "$target"
  else
    echo "  Copy: skills/${name}"
    run cp -R "$skill_dir" "$target"
  fi
done

for cmd_file in "${REPO_DIR}"/commands/*.md; do
  [ -f "$cmd_file" ] || continue
  name="$(basename "$cmd_file")"
  target="${TARGET_DIR}/commands/${name}"

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "  Skip: commands/${name} (already exists, not a symlink)"
    continue
  fi

  if [ -L "$target" ]; then
    run rm -f "$target"
  fi

  if [ "$MODE" = "link" ]; then
    echo "  Link: commands/${name}"
    run ln -s "$cmd_file" "$target"
  else
    echo "  Copy: commands/${name}"
    run cp "$cmd_file" "$target"
  fi
done

echo "Done. Installed to ${TARGET_DIR}"
