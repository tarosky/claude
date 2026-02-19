# wp-env 設定

## .wp-env.json テンプレート

```json
{
  "phpVersion": "7.4",
  "plugins": [
    "."
  ],
  "themes": [
    "https://downloads.wordpress.org/theme/twentytwentyone.latest-stable.zip"
  ],
  "config": {
    "WP_DEBUG": true,
    "SCRIPT_DEBUG": true,
    "WP_DEBUG_LOG": true
  }
}
```

### カスタマイズ

- `phpVersion`: プロジェクトの最小PHP要件に合わせて設定してください。
- `plugins`: `"."` はカレントディレクトリをプラグインとしてマッピングします。追加プラグイン（例: Query Monitor）をインストールするにはURLを追加してください。
- `themes`: テストに必要な場合はテーマのURLを指定してください。
- `config`: wp-config.php に設定する WordPress 定数です。

## npm スクリプト

```json
{
  "scripts": {
    "test": "RESULT=${PWD##*/} && wp-env run tests-cli ./wp-content/plugins/$RESULT/vendor/bin/phpunit -c ./wp-content/plugins/$RESULT/phpunit.xml.dist",
    "start": "wp-env start",
    "update": "wp-env start --update",
    "stop": "wp-env stop",
    "env": "wp-env",
    "cli": "wp-env run cli wp",
    "cli:test": "wp-env run tests-cli wp"
  }
}
```

### テストコマンドの解説

```bash
RESULT=${PWD##*/} && wp-env run tests-cli ./wp-content/plugins/$RESULT/vendor/bin/phpunit -c ./wp-content/plugins/$RESULT/phpunit.xml.dist
```

- `${PWD##*/}` はディレクトリ名（= プラグインスラッグ）を取得します
- `wp-env run tests-cli` はテスト用 WordPress コンテナ内でコマンドを実行します
- パスはコンテナ内のプラグインの phpunit に解決されます

### JS ユニットテスト

`@wordpress/scripts` を使用した JavaScript テストの場合:

```json
{
  "scripts": {
    "test:js": "wp-scripts test-unit-js --testPathPattern=tests/js"
  }
}
```

## 必須の devDependency

```json
{
  "devDependencies": {
    "@wordpress/env": "^10.38.0"
  }
}
```

## 使い方

```bash
# 環境を起動する
npm start

# PHP テストを実行する
npm test

# WP-CLI コマンドを実行する
npm run cli -- plugin list

# 環境を停止する
npm run stop
```

## Docker の要件

`wp-env` の実行には Docker が必要です。Docker Desktop（または同等のもの）がインストールされ、起動していることを確認してください。
