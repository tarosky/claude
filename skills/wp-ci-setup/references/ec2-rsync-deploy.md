# EC2 rsync デプロイ

Tarosky 標準の自社サーバーデプロイパターン。WordPress.org に公開しない案件（テーマ・サイトプロジェクト・非公開プラグイン）で使う。

## 構成

2つのワークフローを使い、ステージングと本番を分離する。

| ワークフロー | トリガー | デプロイ先 |
|---|---|---|
| `deploy-stg.yml` | push to master / `staging-*` タグ | ステージング EC2 |
| `deploy-prod.yml` | release published | 本番 EC2 |

## 前提

- リモートサーバー（EC2 等）が SSH 接続を受け付け、デプロイ先ディレクトリに対する書き込み権限を持つユーザー（例: `nginx`）が存在すること
- GitHub Secrets にデプロイ用 SSH 秘密鍵が登録されていること
- ビルドスクリプト（`bin/cleanup.sh` または `bin/build.sh`）が存在すること

## Secrets

| 名前 | 用途 |
|---|---|
| `{PROJECT}_DEPLOY_KEY` | SSH 秘密鍵（ステージング/本番で別にする場合は `*_STG_DEPLOY_KEY` / `*_PROD_DEPLOY_KEY`） |
| `SLACK_WEBHOOK` | Slack 通知用 Webhook URL |

## GitHub Environments

`staging` と `production` を作成し、`production` には reviewer による approval を設定することを推奨する。

## deploy-stg.yml テンプレート

```yaml
name: Deploy Staging Environment

on:
  push:
    branches:
      - master
    tags:
      - 'staging-*'

jobs:
  deploy_staging:
    name: Deploy Staging Server
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: 'https://{STAGING_HOST}/'
    steps:
      - uses: actions/checkout@main

      - name: Setup PHP with composer v2
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'  # プロジェクトに合わせる
          tools: composer

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build package
        run: bash bin/cleanup.sh  # または bin/build.sh

      - name: Deploy to Staging Server
        id: deploystaging
        uses: Pendect/action-rsyncer@v1.1.0
        env:
          DEPLOY_KEY: ${{ secrets.{PROJECT}_DEPLOY_KEY }}
        with:
          flags: '-rptv --checksum --delete'
          options: ''
          ssh_options: ''
          src: './'  # 単体プラグイン/テーマの場合。複数構成なら './wp-content/themes/{slug}/' 等
          dest: '{SSH_USER}@{STAGING_HOST}:{REMOTE_PATH}'

      - name: Display Deploy Status
        run: echo "${{ steps.deploystaging.outputs.status }}"

      - name: Notify Slack
        uses: rtCamp/action-slack-notify@v2
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
          SLACK_CHANNEL: '{SLACK_CHANNEL}'
          SLACK_LINK_NAMES: true
          SLACK_MESSAGE: 'ステージングを確認してください https://{STAGING_HOST}/'
          SLACK_TITLE: 'Stagingへのデプロイが完了しました'
```

## deploy-prod.yml テンプレート

```yaml
name: Deploy Production Environment

on:
  release:
    types:
      - published

jobs:
  tags-check:
    name: Check tagged branch
    uses: tarosky/workflows/.github/workflows/check-tag-in-branch.yml@main
    with:
      allowed_branch: "master"

  deploy_production:
    needs: tags-check
    name: Deploy Production Server
    runs-on: ubuntu-latest
    environment:
      name: production
      url: 'https://{PROD_HOST}/'
    steps:
      - uses: actions/checkout@main

      - name: Setup PHP with composer v2
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          tools: composer

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Build package
        run: bash bin/cleanup.sh

      - name: Deploy to Production Server
        id: deployproduction
        uses: Pendect/action-rsyncer@v1.1.0
        env:
          DEPLOY_KEY: ${{ secrets.{PROJECT}_DEPLOY_KEY }}
        with:
          flags: '-rptv --checksum --delete'
          options: ''
          ssh_options: ''
          src: './'
          dest: '{SSH_USER}@{PROD_HOST}:{REMOTE_PATH}'

      - name: Display Deploy Status
        run: echo "${{ steps.deployproduction.outputs.status }}"

      - name: Notify Slack
        uses: rtCamp/action-slack-notify@v2
        env:
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
          SLACK_CHANNEL: '{SLACK_CHANNEL}'
          SLACK_LINK_NAMES: true
          SLACK_MESSAGE: '本番環境を確認してください https://{PROD_HOST}/'
          SLACK_TITLE: 'Productionへのデプロイが完了しました'

      - name: Zip Archive
        run: |
          mkdir ${{ github.event.repository.name }}
          rsync -av --exclude=${{ github.event.repository.name }} --exclude=.git ./ ./${{ github.event.repository.name }}/
          zip -r ./${{ github.event.repository.name }}.zip ./${{ github.event.repository.name }}

      - name: Upload Release Asset
        uses: softprops/action-gh-release@v1
        with:
          files: ${{ github.event.repository.name }}.zip
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 置換するプレースホルダー

| プレースホルダー | 例 |
|---|---|
| `{PROJECT}` | リポジトリ名のアッパースネーク（例: `PRTIMESMEDIA`） |
| `{SSH_USER}` | サーバー側のデプロイユーザー（例: `nginx`） |
| `{STAGING_HOST}` | ステージング SSH ホスト（例: `ssh.example-staging.click`） |
| `{PROD_HOST}` | 本番 SSH ホスト（例: `ssh.example.com`） |
| `{REMOTE_PATH}` | リモート側のデプロイ先パス（例: `/var/web/wp/wp-content/themes/my-theme/`） |
| `{SLACK_CHANNEL}` | Slack チャンネル名（例: `1234-myproject-inside`） |

## 複数ターゲット構成の取り扱い

`wp-multi-target` で `mixed` / `multi-plugin` / `multi-theme` と判定された場合は、デプロイ対象を1つに絞ったうえで:

- `src` をリポジトリルートではなく対象ディレクトリにする（例: `./wp-content/themes/{slug}/`）
- `dest` のリモートパスを、対象のスラッグに合わせる（例: `/var/web/wp/wp-content/themes/{slug}/`）

複数ターゲットを1リポジトリから同時デプロイすることは、原則として推奨しない（事故時の影響範囲が広がる）。

## トリガー設計の指針

- ステージング: master へのマージで自動反映 + `staging-*` タグでも反映できるようにすると、検証 → 本番リリースのワークフローが自然
- 本番: GitHub Release の publish をトリガーにする。タグから本番にいくため `tarosky/workflows/check-tag-in-branch.yml` で「タグが master ブランチに含まれるコミットを指している」ことを必ず検証する（feature ブランチからタグを切って事故るパターンの防止）
