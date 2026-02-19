---
name: wp-test-setup
description: "Diagnose and set up PHPUnit, wp-env, and test scripts for a WordPress plugin project."
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

### 0) 検出スクリプトの実行

```bash
node ~/.claude/skills/wp-test-setup/scripts/detect_tests.mjs
```

JSON出力を確認してください。`exists: false` となっている項目は対応が必要です。

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
