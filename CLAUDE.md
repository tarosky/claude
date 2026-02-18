# プロジェクト方針

このリポジトリは Claude Code のカスタムコマンドとスキルを管理するための設定リポジトリです。

## ファイル追加ルール

### コマンド

- `commands/` ディレクトリに `.md` ファイルとして追加
- ファイル名がそのままコマンド名になる（例: `migrate-build-system.md` → `/migrate-build-system`）

### スキル

- `skills/{skill-name}/SKILL.md` として追加
- スクリプトが必要な場合は `skills/{skill-name}/scripts/` に配置
- 参照ドキュメントが必要な場合は `skills/{skill-name}/references/` に配置

## .gitignore の運用

このリポジトリはホワイトリスト方式（`/*` で全無視 → `!` で個別許可）を採用しています。
新しいトップレベルのディレクトリやファイルを追加した場合は、`.gitignore` にも `!` エントリを追加してください。

`commands/` と `skills/` 配下のファイルは自動的に追跡されます。

## 記述言語

コマンドとスキルは日本語で記述してください（SKILL.md の frontmatter 内の `description` は英語可）。
