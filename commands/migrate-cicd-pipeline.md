# CI/CD Pipeline Migration

WordPress プラグインの CI/CD パイプラインを整理・移行します。

## 目的

1. **ワークフローの分離**: 単体ファイルで複数トリガーを処理している場合、責務ごとに分離
2. **リリースフローの改善**: タグプッシュ → release-drafter + リリース公開でデプロイ

タグプッシュはCLIでの操作が必要で、GitHub上でプルリクエストをマージした後に再度 `git pull && git tag 1.0.0` が必要になるからです。

## 完成形

| ファイル | トリガー | 責務 |
|---------|---------|------|
| `test.yml` | `pull_request` | テスト・lint（PR時のみ） |
| `release-drafter.yml` | `push: branches: [main]` | リリースドラフト作成 |
| `wordpress.yml` | `release: published` | WordPress.orgへデプロイ |

## 作業手順

### Step 1: 現状確認

まず以下を確認してください：

1. `.github/workflows/` 内のワークフローファイル一覧
2. 各ワークフローのトリガー条件
3. 既存のタグ形式（`v1.0.0` or `1.0.0`）

```bash
ls -la .github/workflows/
git tag --sort=-version:refname | head -5
```

**確認ポイント**: 単体ファイルで複数のトリガーを処理していないか？

```yaml
# こういうパターンは分離対象
on:
  push:
    branches:
      - main
    tags:
      - '*'
  pull_request:
    branches:
      - main
```

### Step 2: ユーザーへの確認事項

以下を確認してください：

- **メインブランチ名**: `main` or `master`?
- **タグ形式**: `v` プレフィックスあり or なし?
- **SVN認証情報の変数名**: `WP_ORG_USERNAME` / `WP_ORG_PASSWORD` など
- **プラグインのスラッグ**: WordPress.org でのプラグイン名
- **tarosky/workflows の使用**: 共有ワークフローを使っているか？

### Step 3: ワークフローの分離

単体ファイルで複数トリガーを処理している場合、以下のように分離します。

#### 分離前（よくあるパターン）

```yaml
# wordpress.yml - 分離前
name: Deploy Plugin

on:
  push:
    branches:
      - main
    tags:
      - '*'
  pull_request:
    branches:
      - main

jobs:
  test:
    name: PHP UnitTest
    # ... テスト処理

  phpcs:
    name: Check PHP Codes
    # ... lint処理

  assets:
    name: Check Assets
    # ... アセットビルド確認

  status-check:
    name: Status Check
    needs: [ test, phpcs, assets ]
    # ...

  release:
    name: Deploy GitHub Release
    needs: [ status-check ]
    if: contains(github.ref, 'tags/')
    # ... デプロイ処理
```

#### 分離後

**test.yml** - PRテスト用（テスト・lint のみ）:
```yaml
name: Test Plugin

on:
  pull_request:
    branches:
      - main

jobs:
  test:
    name: PHP UnitTest
    strategy:
      matrix:
        php: [ '7.4', '8.0' ]
        wp: [ 'latest', '5.9' ]
    uses: tarosky/workflows/.github/workflows/wp-unit-test.yml@main
    with:
      php_version: ${{ matrix.php }}
      wp_version: ${{ matrix.wp }}

  phpcs:
    name: Check PHP Codes
    uses: tarosky/workflows/.github/workflows/phpcs.yml@main
    with:
      version: 7.4

  assets:
    name: Check Assets
    uses: tarosky/workflows/.github/workflows/npm.yml@main
    with:
      node_version: 20
      package: package

  status-check:
    name: Status Check
    runs-on: ubuntu-latest
    needs: [ test, phpcs, assets ]
    steps:
      - name: Display
        run: echo "All Green!"
```

**release-drafter.yml** - リリースドラフト作成:
```yaml
name: Release Drafter

on:
  push:
    branches:
      - main  # または master

permissions:
  contents: write
  pull-requests: write

jobs:
  update_release_draft:
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**wordpress.yml** - デプロイ専用:
```yaml
name: Deploy to WordPress.org

on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  deploy:
    name: Deploy to WordPress.org
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://wordpress.org/plugins/YOUR_PLUGIN_SLUG/
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP with composer
        uses: shivammathur/setup-php@v2
        with:
          php-version: 7.4
          tools: composer
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Install NPM
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build package
        run: bash bin/build.sh ${{ github.event.release.tag_name }}

      - name: Deploy to WordPress Directory
        uses: 10up/action-wordpress-plugin-deploy@stable
        with:
          generate-zip: true
        env:
          SVN_USERNAME: ${{ secrets.YOUR_SVN_USERNAME }}
          SVN_PASSWORD: ${{ secrets.YOUR_SVN_PASSWORD }}

      - name: Upload zip to release
        run: gh release upload ${{ github.event.release.tag_name }} ${{ github.event.repository.name }}.zip --clobber
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Step 4: release-drafter 設定

`.github/release-drafter.yml`:
```yaml
name-template: '$RESOLVED_VERSION'  # vプレフィックスなしの場合
tag-template: '$RESOLVED_VERSION'   # vプレフィックスありなら 'v$RESOLVED_VERSION'
categories:
  - title: '🚀 Features'
    labels:
      - 'feature'
      - 'enhancement'
  - title: '🐛 Bug Fixes'
    labels:
      - 'fix'
      - 'bugfix'
      - 'bug'
  - title: '🧰 Maintenance'
    labels:
      - 'chore'
      - 'dependencies'
change-template: '- $TITLE @$AUTHOR (#$NUMBER)'
change-title-escapes: '\<*_&'
version-resolver:
  major:
    labels:
      - 'major'
  minor:
    labels:
      - 'minor'
  patch:
    labels:
      - 'patch'
  default: patch
template: |
  ## Changes

  $CHANGES
```

### Step 5: 不要ファイルの削除

以下のファイルがあれば削除を検討：
- 古いリリース関連ワークフロー
- `release-publish.yml`（タグ作成用ワークフロー）

### Step 6: 確認

変更後、以下を確認：
- PRでテストが実行されるか
- mainブランチへのプッシュでドラフトリリースが作成されるか
- リリース公開でデプロイが実行されるか
- zipがリリースに添付されるか

## 分離のメリット

1. **責務の明確化**: 各ファイルが単一の責務を持つ
2. **実行時間の短縮**: PR時にデプロイ関連のジョブが実行されない
3. **デバッグの容易さ**: 問題が発生した際に原因を特定しやすい
4. **条件分岐の削除**: `if: contains(github.ref, 'tags/')` などが不要に

## 注意事項

- bin/build.sh 内で `$1` をバージョン番号として使用している場合、`github.event.release.tag_name` が渡されることを確認
- SVN認証情報のシークレット名はリポジトリによって異なる場合がある
- tarosky/workflows を使用している場合は、ワークフローの呼び出し形式を維持
