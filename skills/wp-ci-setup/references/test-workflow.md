# テストワークフロー (test.yml)

## テンプレート

```yaml
name: WordPress Plugin Test

on:
  push:
    branches:
      - master
  pull_request:
    branches:
      - master

jobs:
  test:
    strategy:
      matrix:
        php: [ '7.4', '8.3' ]
        wp: [ 'latest', '6.6' ]
    uses: tarosky/workflows/.github/workflows/wp-unit-test.yml@main
    with:
      php_version: ${{ matrix.php }}
      wp_version: ${{ matrix.wp }}

  phpcs:
    name: PHP Syntax Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP with composer v2
        uses: shivammathur/setup-php@v2
        with:
          php-version: 7.4
          tools: composer
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Install dependencies
        run: composer install --no-progress

      - name: PHP CodeSniffer
        run: composer lint

  phplint:
    uses: tarosky/workflows/.github/workflows/phplint.yml@main
    with:
      php_versions: '["7.4", "8.3"]'

  assets:
    name: Test Assets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install NPM Dependencies
        run: npm install

      - name: Lint JS
        run: npm run lint:js

      - name: Lint CSS
        run: npm run lint:css

      - name: JS Unit Test
        run: npm run test:js

  status:
    name: Status Check
    runs-on: ubuntu-latest
    needs: [ test, phpcs, phplint, assets ]
    if: always()
    steps:
      - uses: re-actors/alls-green@release/v1
        with:
          jobs: ${{ toJSON(needs) }}
```

## カスタマイズ

### PHP マトリクス
プロジェクトの要件に合わせてPHPとWPのバージョンマトリクスを調整してください:
- `php`: サポートする最小バージョンと最新の安定版を含める
- `wp`: サポートする最小バージョンと `latest` を含める

### tarosky/workflows
`test` ジョブと `phplint` ジョブは `tarosky/workflows` の再利用可能ワークフローを使用しています。これらは以下を処理します:
- 指定されたPHP/WPバージョンでのwp-envのセットアップ
- コンテナ内でのPHPUnit実行
- 複数のPHPバージョンでの `php -l` 構文チェック

### Assets ジョブ
利用可能なlint/testスクリプトに応じて調整してください:
- JSソースファイルがない場合は `lint:js` を削除
- SCSS/CSSソースファイルがない場合は `lint:css` を削除
- JSテストがない場合は `test:js` を削除

### Status Check
`re-actors/alls-green` を使用した `status` ジョブは、マトリクスが変更された場合でもブランチ保護で要求できる単一のステータスチェックを提供します。
