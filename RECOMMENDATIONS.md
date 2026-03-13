# Claude おすすめ設定


## Agent Skills

このリポジトリにも Agent Skills がありますが、いくつかおすすめのスキルも存在します

- WordPress Agent Skills https://github.com/WordPress/agent-skills

## MCP Server

Claude Code と Claude Desktop のそれぞれに設定できます。おすすめはBacklogとGoogle Chromeです。

```json
{
  "mcpServers": {
    "backlog": {
      "command": "docker",
      "args": [
        "run",
        "--pull",
        "always",
        "-i",
        "--rm",
        "-e",
        "BACKLOG_DOMAIN",
        "-e",
        "BACKLOG_API_KEY",
        "ghcr.io/nulab/backlog-mcp-server"
      ],
      "env": {
        "BACKLOG_DOMAIN": "tarosky.backlog.jp",
        "BACKLOG_API_KEY": "xxxxxxxxxxxxxxxx"
      }
    },
    "chrome-devtools": {
      "command": "/bin/zsh",
      "args": [
        "-l",
        "-c",
        "npx chrome-devtools-mcp@latest"
      ]
    },
}
```

「ブラウザでの確認が必要なときはChromeのMCPサーバーを使って下さい」などと書いておくと、勝手に起動します。

## CLI Tools

CLIツールをインストールして、それが使えることを `~/.claude/CLAUDE.md` に書いておくと、特に説明なく使ってくれます。

### GitHub CLI

https://docs.github.com/ja/github-cli/github-cli/about-github-cli

GitHubの操作が行えます。これがあればGitHubのMCPサーバーはいりません。

```markdown
- 私のGitHubアカウントは @xxxxx です。taroskyというOrganizationによくコミットしています。
- gh コマンドがインストールされているので、イシュー・プルリクエスト作成に利用してください
- 作業の際には必ずブランチを確認し、デフォルトブランチで直接作業をしないでください。
```

### クラウド系

クラウドインフラ系のツールは入れておくと直接見てくれるのでログ確認などで役立つ可能性があります。

- AWS CLI https://aws.amazon.com/jp/cli/
- Googe Cloug CLI https://cloud.google.com/cli?hl=ja


### ローカル開発

- Docker 普通入っていると思いますが。
- wp-cli 同様

