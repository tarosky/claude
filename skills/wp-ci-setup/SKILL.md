---
name: wp-ci-setup
description: "WordPressプラグイン/テーマのGitHub Actionsワークフロー（test.yml、release-drafter、WordPress.org SVN デプロイ または EC2 rsync デプロイ、WPバージョン監視）を診断・セットアップする。"
compatibility: "Targets GitHub-hosted WordPress plugins/themes. Supports two deploy backends: WordPress.org SVN and EC2 rsync (staging + production). Filesystem-based agent with bash + node."
---

# WP CI Setup

## ファイル名規約

このスキルが扱う標準的なワークフロー名は以下:

| ファイル名 | 用途 | トリガー |
|---|---|---|
| `test.yml` | CI（PHPUnit / PHPCS / lint / build） | pull_request, push |
| `release-drafter.yml` | リリースノート自動更新 | push to default branch |
| `wordpress.yml` | **WordPress.org SVN リリースデプロイ**（公式プラグインのみ） | release published |
| `deploy-stg.yml` | **EC2 ステージングデプロイ** | push to master / `staging-*` タグ |
| `deploy-prod.yml` | **EC2 本番デプロイ** | release published |
| `wp-outdated.yml` | WP バージョン監視 | schedule, workflow_dispatch |

注意: 一部の Tarosky 既存リポジトリでは CI テストを `wordpress.yml` という名前で運用していますが、これは命名衝突を招くため新規セットアップでは `test.yml` に統一してください。

## 使用場面

以下の場合にこのスキルを使用してください:

- GitHub上のWordPressプラグイン/テーマに新規でCI/CDを構築する場合
- テストワークフロー（PHPUnitマトリクス、PHPCS、アセットのlint）を追加する場合
- リリース自動化（release-drafter、WordPress.orgデプロイ、EC2 rsync デプロイ）を追加する場合
- メンテナンスワークフロー（WPバージョン監視）を追加する場合
- 既存のCI/CDに不足しているワークフローがないか監査する場合
- WordPress.orgデプロイ用の .distignore を作成する場合

## 必要な入力

- リポジトリルート（CWD）
- デプロイバックエンド: WordPress.org SVN / EC2 rsync / なし（後述 0c で対話確定）
- GitHubリポジトリの owner/name
- PHPバージョンマトリクス（サポートする最小・最大バージョン）
- WordPressバージョンマトリクス（サポートする最小バージョンとlatest）
- EC2 rsync の場合: SSH ホスト・リモートパス・SSH 鍵 Secret 名・Slack Webhook Secret 名・通知チャンネル

## 手順

### 0a) ターゲットの解決（複数構成への対応）

まず `wp-multi-target` スキルでリポジトリ構成を確認します。

```bash
node ~/.claude/skills/wp-multi-target/scripts/detect_targets.mjs
```

- `targets.length === 1`: そのまま続行
- `targets.length > 1`: ユーザーに「統一ワークフロー / 個別ワークフロー / 特定ターゲットのみ」を質問（`AskUserQuestion` 推奨）。
  - テストワークフローは GitHub Actions のマトリクスで全ターゲット並列実行する形にもできる
  - リリース系（release-drafter, デプロイ）は **必ず 0c) のデプロイ単一選択ルールに従う**
- `shape: "unknown"`: ユーザーに構成をヒアリングしてから続行

詳細は `~/.claude/skills/wp-multi-target/SKILL.md` の対話プロトコルを参照。

### 0b) 検出スクリプトの実行

CI 設定はリポジトリルートに置くため、CWD で実行します。個別ターゲットの設定状況を見たい場合のみ `--path=<target.path>` を指定してください。

```bash
node ~/.claude/skills/wp-ci-setup/scripts/detect_ci.mjs
```

JSON出力を確認してください。`exists: false` の項目が対応の必要な箇所です。

### 0c) デプロイバックエンドの選択（必須）

デプロイは事故が大きいので、**バックエンドの種類と対象**を必ず対話で確定します。

**0c-1. バックエンドを選ぶ** (`AskUserQuestion`):

1. **WordPress.org SVN** — wordpress.org に公開している公式プラグイン専用。`wordpress.yml` を生成する
2. **EC2 rsync** — Tarosky 標準の自社サーバーデプロイ。`deploy-stg.yml` + `deploy-prod.yml` を生成する
3. **なし** — デプロイは作らない（後で手動セットアップ）

**0c-2. デプロイ対象ターゲットを選ぶ**（1 または 2 を選んだ場合）:

複数ターゲット構成のリポジトリでも、**1リポジトリ1デプロイ対象**に絞ります。`AskUserQuestion` で次のいずれかを選ばせる:

- 1ターゲットを選んでデプロイする
- デプロイは作らない（後で手動セットアップ）

複数 slug を1リポジトリから同時公開すると事故につながりやすいため、必要があればリポジトリ分割を提案してください。

**0c-3. バックエンド固有の追加情報を収集**:

- WordPress.org の場合: `WP_ORG_USERNAME` / `WP_ORG_PASSWORD` Secret 名（通常そのまま）、SVN slug
- EC2 rsync の場合: ステージング/本番それぞれの SSH ユーザー、ホスト、リモートパス、SSH 鍵 Secret 名、Slack Webhook Secret 名、Slack チャンネル

決定結果はステップ 3) で使用します。

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

### 3) デプロイワークフローの構築

ステップ 0c で選んだバックエンドに応じて分岐します。

#### 3a) WordPress.org SVN デプロイ

0c で「WordPress.org SVN」を選択した場合:

参照:
- `references/release-workflow.md`（wordpress.yml セクション）
- `references/distignore.md`

作業内容:
- `.github/workflows/wordpress.yml` を作成する（0c で確定した SLUG と Secret 名をカスタマイズ）
- 複数ターゲット構成の場合は、選択したターゲットディレクトリ（例: `wp-content/plugins/{slug}`）をデプロイソースとして指定する
- `.distignore` を作成する（選択ターゲット側に配置）
- `bin/build.sh` が存在することを確認する（wp-build-setup スキルを参照）
- ユーザーに `WP_ORG_USERNAME` と `WP_ORG_PASSWORD` の Secrets 設定をリマインドする

#### 3b) EC2 rsync デプロイ

0c で「EC2 rsync」を選択した場合:

参照:
- `references/ec2-rsync-deploy.md`

作業内容:
- `.github/workflows/deploy-stg.yml` を作成する（push to master / `staging-*` タグでステージング rsync）
- `.github/workflows/deploy-prod.yml` を作成する（release published で本番 rsync、`tarosky/workflows/check-tag-in-branch.yml@main` でタグ起源検証、Slack 通知、zip リリースアセット）
- `bin/cleanup.sh` または `bin/build.sh` のビルドスクリプトが存在することを確認する（wp-build-setup スキルを参照）
- 複数ターゲット構成の場合は、選択したターゲットディレクトリを rsync の src に指定する（例: `./wp-content/themes/{slug}/`）。リモートパスは `dest` に直接指定
- ユーザーに以下の Secrets 設定をリマインドする:
  - `{REPO}_DEPLOY_KEY`: ステージング/本番 SSH 秘密鍵（環境別の場合は2つ）
  - `SLACK_WEBHOOK`: Slack 通知用 Webhook URL
- GitHub Environments を作成（`staging`, `production`）し、必要なら approver を設定するよう案内する

#### 3c) デプロイなし

0c で「なし」を選択した場合は本ステップをスキップ。

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
- **WordPress.org デプロイが SVN エラーで失敗する場合**: WP_ORG_USERNAME/PASSWORD のSecretsが正しいか確認する。
- **EC2 rsync デプロイが Permission denied で失敗する場合**: デプロイキー（`*_DEPLOY_KEY`）が正しいか、サーバー側 `~/.ssh/authorized_keys` に登録されているかを確認する。SSH ユーザー（例: `nginx`）の権限とリモートパスの所有者も確認。
- **EC2 rsync で本番反映が遅い**: `action-rsyncer` の flags `--checksum` が効くサイズか確認。差分検出のためチェックサムは時間がかかるので大規模なテーマでは外す選択肢もある。
- **check-tag-in-branch が失敗する**: タグが `master` 以外のブランチから切られている。本番デプロイは `master` ブランチに含まれるコミットへのタグでのみ許可されるよう制限している。
- **alls-green が失敗する場合**: 必須ジョブの1つ以上が失敗している。各ジョブのログを確認する。
- **.distignore が過剰に除外している場合**: ランタイムに必要なファイルがデプロイ後のプラグインに含まれていない場合、.distignore が除外していないか確認する。
