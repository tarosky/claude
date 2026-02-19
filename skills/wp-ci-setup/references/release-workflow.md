# リリースワークフロー

## Release Drafter (release-drafter.yml)

PRがmasterにマージされると、GitHubのドラフトリリースを自動的に更新します。

```yaml
name: Release Drafter

on:
  push:
    branches:
      - master

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

### .release-drafter.yml（オプション）

リポジトリルートまたは `.github/.release-drafter.yml` に配置して、カテゴリをカスタマイズできます:

```yaml
categories:
  - title: 'Features'
    labels:
      - 'feature'
      - 'enhancement'
  - title: 'Bug Fixes'
    labels:
      - 'fix'
      - 'bugfix'
      - 'bug'
  - title: 'Maintenance'
    labels:
      - 'chore'
      - 'dependencies'
template: |
  ## Changes

  $CHANGES
```

## WordPress.org デプロイ (wordpress.yml)

GitHubリリースが公開されると、WordPress.orgのSVNにデプロイします。

```yaml
name: Deploy to WordPress.org

on:
  release:
    types:
      - published

jobs:
  deploy:
    name: Deploy to WordPress.org
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://wordpress.org/plugins/PLUGIN_SLUG/
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP with composer v2
        uses: shivammathur/setup-php@v2
        with:
          php-version: 7.4
          tools: composer
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Build package
        run: bash bin/build.sh ${{ github.ref }}

      - name: Deploy to WordPress Directory
        uses: 10up/action-wordpress-plugin-deploy@stable
        with:
          generate-zip: true
        env:
          SLUG: PLUGIN_SLUG
          SVN_USERNAME: ${{ secrets.WP_ORG_USERNAME }}
          SVN_PASSWORD: ${{ secrets.WP_ORG_PASSWORD }}

      - name: Upload release asset
        run: gh release upload ${{ github.event.release.tag_name }} ${{ github.workspace }}/${{ github.event.repository.name }}.zip --clobber
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 必要な Secrets

- `WP_ORG_USERNAME`: WordPress.org の SVN ユーザー名
- `WP_ORG_PASSWORD`: WordPress.org の SVN パスワード

これらはGitHubリポジトリの Settings > Secrets and variables > Actions で設定してください。

### Environment Protection

`environment: production` の設定により、環境保護ルール（承認ゲート、デプロイログなど）を有効にできます。

### リリースアセットのアップロード

`gh release upload` ステップは、生成されたZIPファイルをGitHubリリースに添付し、直接ダウンロードできるようにします。
