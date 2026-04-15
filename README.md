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
│   ├── skill-review/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── t-wada/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-build-setup/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-ci-setup/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-i18n-setup/
│   │   └── SKILL.md (+ scripts/, references/)
│   ├── wp-plugin-evaluate/
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
| `glotpress-translate` | GlotPress（translate.wordpress.org）からWordPressプラグイン/テーマのPOファイルをダウンロードし、未翻訳文字列をAIで翻訳してインポート用POを出力する。 |
| `skill-review` | スキルセット棚卸しインタビュー。現在のスキル・興味・経験の変化を対話形式で確認し、~/.claude/CLAUDE.md を更新する。四半期に1回の実施を推奨。 |
| `t-wada` | t-wadaに着想を得た言語非依存のテストアドバイザー。テスト基盤を診断し、対話形式で改善計画を作成する。 |
| `wp-build-setup` | WordPressプラグインのJS/CSSビルドパイプライン（grab-deps, sass, postcss, @wordpress/scripts等）を診断・セットアップする。 |
| `wp-ci-setup` | WordPressプラグインのGitHub Actionsワークフロー（テスト、release-drafter、WordPress.orgデプロイ、WPバージョン監視）を診断・セットアップする。 |
| `wp-i18n-setup` | WordPressプラグインの翻訳基盤を診断・セットアップする。WordPress.org公式プラグインにはGlotPress、それ以外には手動POT/PO/MOワークフローを適用。 |
| `wp-plugin-evaluate` | WordPressプラグインの市場ポジション・健全性・将来性を評価し、継続/サンセット判断の材料を提供する。 |
| `wp-test-setup` | WordPressプラグインのPHPUnit、wp-env、テストスクリプトを診断・セットアップする。 |
<!-- END:SKILLS -->

---

各セクションは `node scripts/sync-readme.mjs` で自動更新されます。
