# メンテナンスワークフロー (wp-outdated.yml)

プラグインの「Tested up to」WordPressバージョンが古くなっていないか定期的にチェックし、必要に応じてIssueを作成します。

## テンプレート

```yaml
name: Latest WP Support

on:
  workflow_dispatch:
  schedule:
    - cron: "0 2 5 * *" # Every month on the 5th at 2am UTC

jobs:
  is-outdated:
    name: Check if WP version is outdated
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@main

      - name: Install Node
        uses: actions/setup-node@master
        with:
          node-version: '18'

      - name: Check wp version
        uses: tarosky/farmhand-wp-action@v1
        id: wp_version

      - name: Update Issue if needed
        if: ${{ 'true' == steps.wp_version.outputs.should_update }}
        uses: actions-ecosystem/action-create-issue@v1
        with:
          github_token: ${{ secrets.github_token }}
          title: WordPress ${{ steps.wp_version.outputs.version }} をサポートする
          body: |
            ## TODO

            - [ ] プラグインがWordPress ${{ steps.wp_version.outputs.version }} に対応しているかチェックする
            - [ ] README.MD の "Tested up to" を更新する

          labels: |
            wp-org
          assignees: |
            fumikito
```

## カスタマイズ

- `cron` のスケジュールは必要に応じて調整してください（デフォルト: 毎月5日）。
- `assignees` を適切なGitHubユーザー名に変更してください。
- Issueの `title` と `body` の文言は必要に応じて変更してください。
- `labels` フィールドはIssueに指定されたラベルを作成/使用します。
- `workflow_dispatch` により、Actionsタブから手動でトリガーできます。

## 仕組み

1. `tarosky/farmhand-wp-action` が最新のWordPressバージョンをプラグインの「Tested up to」値と比較します。
2. 更新が必要な場合、`should_update` 出力が `true` になります。
3. タスクのチェックリスト付きのIssueが自動的に作成されます。
