# claude

Claude Code 用の設定ファイルリポジトリです。カスタムコマンドとスキルを管理しています。

## セットアップ

ホームディレクトリの `~/.claude` にこのリポジトリを配置してください。

```bash
# クローンして配置
git clone git@github.com:fumikito/claude.git ~/.claude
```

既に `~/.claude` が存在する場合は、シンボリックリンクで対応できます。

```bash
git clone git@github.com:fumikito/claude.git ~/claude-config
ln -s ~/claude-config/commands ~/.claude/commands
ln -s ~/claude-config/skills ~/.claude/skills
```

## ディレクトリ構造

```
.
├── commands/          # カスタムコマンド（.md）
│   ├── migrate-build-system.md
│   └── migrate-cicd-pipeline.md
├── skills/            # スキル定義
│   ├── glotpress-translate/
│   │   └── SKILL.md
│   ├── t-wada/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   └── references/
│   ├── wp-build-setup/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   └── references/
│   ├── wp-ci-setup/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   └── references/
│   ├── wp-i18n-setup/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   └── references/
│   └── wp-test-setup/
│       ├── SKILL.md
│       ├── scripts/
│       └── references/
├── CLAUDE.md          # プロジェクトレベルの開発方針
├── README.md
└── .gitignore
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `migrate-build-system` | WordPress プラグインのビルドシステムを Gulp から npm scripts + @kunoichi/grab-deps v3 に移行する |
| `migrate-cicd-pipeline` | WordPress プラグインの CI/CD パイプラインを責務ごとに分離・整理する |

## スキル一覧

| スキル | 説明 |
|-------|------|
| `glotpress-translate` | GlotPress（translate.wordpress.org）から PO ファイルをダウンロードし、未翻訳部分を AI で翻訳する |
| `t-wada` | 和田卓人の TDD 哲学を体現する言語非依存のテスト環境アドバイザー。対話を通じて改善プランを作成する |
| `wp-build-setup` | WordPress プラグインの JS/CSS ビルドパイプライン（grab-deps, sass, postcss, @wordpress/scripts）を診断・構築する |
| `wp-ci-setup` | WordPress プラグインの GitHub Actions ワークフロー（テスト、リリース、WordPress.org デプロイ、WP バージョン監視）を診断・構築する |
| `wp-i18n-setup` | WordPress プラグインの翻訳インフラ（GlotPress / POT / PO / MO）を診断・構築する |
| `wp-test-setup` | WordPress プラグインの PHPUnit・wp-env テスト基盤を診断・構築する |
