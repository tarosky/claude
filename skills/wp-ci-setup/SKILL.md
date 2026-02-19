---
name: wp-ci-setup
description: "Diagnose and set up GitHub Actions workflows (test, release-drafter, WordPress.org deploy, WP version monitoring) for a WordPress plugin project."
compatibility: "Targets GitHub-hosted WordPress plugins. Filesystem-based agent with bash + node."
---

# WP CI Setup

## 使用場面

以下の場合にこのスキルを使用してください:

- GitHub上のWordPressプラグインに新規でCI/CDを構築する場合
- テストワークフロー（PHPUnitマトリクス、PHPCS、アセットのlint）を追加する場合
- リリース自動化（release-drafter、WordPress.orgデプロイ）を追加する場合
- メンテナンスワークフロー（WPバージョン監視）を追加する場合
- 既存のCI/CDに不足しているワークフローがないか監査する場合
- WordPress.orgデプロイ用の .distignore を作成する場合

## 必要な入力

- リポジトリルート（CWD）
- プラグインがWordPress.orgに公開されているかどうか（デプロイワークフローの要否を判断するため）
- GitHubリポジトリの owner/name
- PHPバージョンマトリクス（サポートする最小・最大バージョン）
- WordPressバージョンマトリクス（サポートする最小バージョンとlatest）

## 手順

### 0) 検出スクリプトの実行

```bash
node ~/.claude/skills/wp-ci-setup/scripts/detect_ci.mjs
```

JSON出力を確認してください。`exists: false` の項目が対応の必要な箇所です。

### 1) テストワークフローの構築

`testWorkflow` が存在しない場合:

参照:
- `references/test-workflow.md`

作業内容:
- .github/workflows/test.yml を作成する
- PHP/WPマトリクスをカスタマイズし、利用可能なnpmスクリプトに応じてアセットテストのステップを調整する

### 2) Release Drafter の構築

`releaseDrafterWorkflow` が存在しない場合:

参照:
- `references/release-workflow.md`（release-drafter セクション）

作業内容:
- .github/workflows/release-drafter.yml を作成する
- 必要に応じて .release-drafter.yml を作成し、カテゴリをカスタマイズする

### 3) WordPress.org デプロイの構築

`wpDeployWorkflow` が存在せず、プラグインがWordPress.orgに公開されている場合:

参照:
- `references/release-workflow.md`（wordpress.yml セクション）
- `references/distignore.md`

作業内容:
- .github/workflows/wordpress.yml を作成する（SLUGとSecret名をカスタマイズ）
- .distignore を作成する
- bin/build.sh が存在することを確認する（wp-build-setup スキルを参照）
- ユーザーに WP_ORG_USERNAME と WP_ORG_PASSWORD のSecretsの設定をリマインドする

### 4) メンテナンスワークフローの構築

`maintenanceWorkflow` が存在しない場合:

参照:
- `references/maintenance-workflow.md`

作業内容:
- .github/workflows/wp-outdated.yml を作成する
- assigneesとlabelsをカスタマイズする

## 検証

1. ブランチをpushしてPRを作成する -- テストワークフローがトリガーされることを確認する。
2. masterにマージする -- release-drafterがドラフトリリースを更新することを確認する。
3. リリースを公開する -- デプロイワークフローがトリガーされることを確認する（Actionsタブで確認）。
4. Actionsタブからメンテナンスワークフローを手動実行する。

## トラブルシューティング

- **テストワークフローが失敗する場合**: PHP/WPマトリクスの値を確認し、composer.json と package.json のスクリプトが存在するか確認する。
- **Release Drafter が更新されない場合**: permissions（contents:write, pull-requests:write）とブランチ名（master vs main）を確認する。
- **デプロイがSVNエラーで失敗する場合**: WP_ORG_USERNAME/PASSWORD のSecretsが正しいか確認する。
- **alls-green が失敗する場合**: 必須ジョブの1つ以上が失敗している。各ジョブのログを確認する。
- **.distignore が過剰に除外している場合**: ランタイムに必要なファイルがデプロイ後のプラグインに含まれていない場合、.distignore が除外していないか確認する。
