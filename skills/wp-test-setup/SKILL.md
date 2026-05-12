---
name: wp-test-setup
description: "WordPressプラグインのPHPUnit、wp-env、テストスクリプトを診断・セットアップする。"
compatibility: "Targets WordPress plugins with PHP 7.4+. Requires Docker for wp-env. Filesystem-based agent with bash + node."
---

# WP Test Setup

## 使用場面

以下の場合にこのスキルを使用してください:

- 新しいWordPressプラグインにPHPUnitテストをセットアップする場合
- wp-env（Docker ベースの WordPress 開発環境）を追加する場合
- 既存プロジェクトのテストインフラの不足を監査する場合
- テスト設定の不具合を修正する場合（bootstrap、phpunit.xml、wp-env）

## 必要な入力

- リポジトリのルートディレクトリ（CWD）
- メインプラグインファイル名（bootstrap.php テンプレート用）
- 最小PHPバージョン（.wp-env.json の phpVersion 用）

## 手順

### 0a) ターゲットの解決（複数構成への対応）

まず `wp-multi-target` スキルでリポジトリ構成を確認します。

```bash
node ~/.claude/skills/wp-multi-target/scripts/detect_targets.mjs
```

- `targets.length === 1`: そのまま続行（`target.path` を作業ディレクトリとして利用）
- `targets.length > 1`: ユーザーに「統一ワークフロー / 個別ワークフロー / 特定ターゲットのみ」を質問（`AskUserQuestion` 推奨）。
  - 統一: ルート1箇所にテスト設定を作る or マトリクス化
  - 個別: ターゲットごとにループして本スキルを適用
  - 特定: 選ばれたターゲットのみ処理
- `shape: "unknown"`: ユーザーに構成をヒアリングしてから続行

詳細は `~/.claude/skills/wp-multi-target/SKILL.md` の対話プロトコルを参照。

### 0b) 検出スクリプトの実行

ターゲットを確定したら、それぞれに対して以下を実行します。

```bash
node ~/.claude/skills/wp-test-setup/scripts/detect_tests.mjs --path=<target.path>
```

`--path` を省略した場合は CWD を対象とします（単体構成の従来動作）。JSON出力を確認してください。`exists: false` となっている項目は対応が必要です。

### 1) PHPUnit のセットアップ

`phpunitConfig`、`testBootstrap`、`phpunitDependency` のいずれかが不足している場合:

以下を参照:
- `references/phpunit-config.md`

実施内容:
- composer.json の require-dev に phpunit/phpunit と yoast/phpunit-polyfills を追加
- phpunit.xml.dist を作成
- tests/bootstrap.php を作成（プラグインファイルのパスをカスタマイズ）
- サンプルテストファイルを作成

### 2) wp-env のセットアップ

`wpEnvConfig` または `wpEnvDependency` が不足している場合:

以下を参照:
- `references/wp-env-config.md`

実施内容:
- package.json の devDependencies に @wordpress/env を追加
- .wp-env.json を作成
- npm スクリプトを追加: test, start, update, stop, cli, cli:test

## 検証

1. `npm start` を実行 -- wp-env が起動すること（Docker が必要）
2. `npm test` を実行 -- テストコンテナ内で PHPUnit が実行されること
3. `npm run cli -- plugin list` を実行 -- プラグインが有効として表示されること

## トラブルシューティング

- **"Docker is not running"**: wp-env を実行する前に Docker Desktop を起動してください。
- **"Could not find .../functions.php"**: WP テストライブラリが利用できません。wp-env を使用する場合、テストはコンテナ内で実行されるため、この設定は事前に構成済みです。
- **PHPUnit バージョンの不一致**: PHP 7.4-8.x の互換性には phpunit ^9.0 を使用してください。PHP 8.1 以上のみを対象とするプロジェクトでは、phpunit ^10 または ^11 でも構いません。
- **"No tests executed"**: テストファイルの接頭辞が phpunit.xml.dist の設定と一致しているか確認してください（デフォルト: `test-`）。テストメソッドが `test_` で始まっているかも確認してください。
