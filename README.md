# claude

Claude Code 用のカスタムコマンド・スキル管理リポジトリです。

## セットアップ

任意のディレクトリにクローンし、インストールスクリプトで `~/.claude/` に配置します。

```bash
# クローン
git clone git@github.com:tarosky/claude.git ~/claude-config

# コピーでインストール
~/claude-config/scripts/install.sh

# または、シンボリックリンクでインストール（開発時に便利）
~/claude-config/scripts/install.sh --link
```

既に `~/.claude/skills/` に他のスキル（WordPress 公式など）がある場合でも、同名でない限り共存できます。

```bash
# 何が実行されるか事前確認
~/claude-config/scripts/install.sh --dry-run

# アンインストール（このリポジトリのスキル/コマンドだけを削除）
~/claude-config/scripts/install.sh --uninstall
```

## ディレクトリ構造

<!-- BEGIN:DIRECTORY_TREE -->
```
.
├── commands/          # カスタムコマンド（.md）
│   ├── migrate-build-system.md
│   └── migrate-cicd-pipeline.md
├── scripts/           # ユーティリティスクリプト
│   ├── install.sh
│   └── sync-readme.mjs
├── skills/            # スキル定義
│   ├── glotpress-translate/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── t-wada/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-build-setup/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-ci-setup/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-i18n-setup/
│   │   └── SKILL.md (+ scripts/, references/)
│   └── wp-test-setup/
│       └── SKILL.md (+ scripts/, references/)
├── CLAUDE.md          # プロジェクトレベルの開発方針
├── README.md
└── .gitignore
```
<!-- END:DIRECTORY_TREE -->

## コマンド一覧

<!-- BEGIN:COMMANDS -->
| コマンド | 説明 |
|---------|------|
| `migrate-build-system` | WordPress プラグインのビルドシステムを Gulp から npm scripts + @kunoichi/grab-deps v3 に移行します。 |
| `migrate-cicd-pipeline` | WordPress プラグインの CI/CD パイプラインを整理・移行します。 |
<!-- END:COMMANDS -->

## スキル一覧

<!-- BEGIN:SKILLS -->
| スキル | 説明 |
|-------|------|
| `glotpress-translate` | Translate WordPress plugin/theme PO files from GlotPress (translate.wordpress.org). Downloads PO files, translates untranslated strings with AI, and outputs translated PO for import. |
| `t-wada` | Language-agnostic TDD advisor inspired by Takuto Wada. Diagnoses test infrastructure and creates improvement plans through interactive dialogue. |
| `wp-build-setup` | Diagnose and set up JS/CSS build pipeline (grab-deps, sass, postcss, @wordpress/scripts for blocks) for a WordPress plugin project. |
| `wp-ci-setup` | Diagnose and set up GitHub Actions workflows (test, release-drafter, WordPress.org deploy, WP version monitoring) for a WordPress plugin project. |
| `wp-i18n-setup` | Diagnose and set up translation infrastructure for a WordPress plugin: GlotPress for WordPress.org plugins, or manual POT/PO/MO workflow for others. |
| `wp-test-setup` | Diagnose and set up PHPUnit, wp-env, and test scripts for a WordPress plugin project. |
<!-- END:SKILLS -->

---

各セクションは `node scripts/sync-readme.mjs` で自動更新されます。
