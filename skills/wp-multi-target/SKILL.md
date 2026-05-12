---
name: wp-multi-target
description: "リポジトリ内のプラグイン/テーマ・ターゲットを検出し、テスト・リント・ビルド・デプロイ系スキルが複数構成へ安全に対応できるよう対話プロトコルを提供する。"
compatibility: "Targets WordPress repositories of any shape: single plugin, single theme/block theme, multi-plugin (wp-content/plugins-like), multi-theme (themes-like), or full wp-content. Filesystem-based agent with bash + node."
---

# WP Multi Target

WordPress リポジトリには複数のレイアウトが存在する:

- **single-plugin**: リポジトリルート直下が単体プラグイン
- **single-theme**: リポジトリルート直下が単体テーマ（block theme 含む）
- **multi-plugin**: `wp-content/plugins/*` 相当（ルートが plugins/ 的で、配下に複数プラグインが並ぶ）
- **multi-theme**: `wp-content/themes/*` 相当（ルートが themes/ 的で、配下に複数テーマが並ぶ）
- **mixed**: `wp-content/` 相当（配下に plugins/, themes/, mu-plugins/ などが並ぶフルレイアウト）

テスト・リント・ビルド・デプロイは、構成によって方針が変わる。特にデプロイは事故につながるため、**ターゲットを明示確定してから実行する**ことを必須とする。

このスキルは「ターゲット解決」と「対話プロトコル」を提供し、`wp-test-setup` / `wp-ci-setup` / `wp-build-setup` / `wp-i18n-setup` から最初に呼ばれることを想定する。

## 使用場面

以下の場合にこのスキルを呼び出してください:

- 上記の関連スキルを実行する前段として、対象ディレクトリを特定する場合
- 既存リポジトリのレイアウトを分類して、続行可否を判断する場合
- 複数プラグイン/テーマが混在するリポジトリで、デプロイ対象を1つに絞る場合

## 必要な入力

- リポジトリのルートディレクトリ（CWD）

## 手順

### 1) 検出スクリプトの実行

```bash
node ~/.claude/skills/wp-multi-target/scripts/detect_targets.mjs
```

JSON 出力の `shape` と `targets[]` を確認してください。

形式:

```json
{
  "shape": "single-plugin | single-theme | multi-plugin | multi-theme | mixed | unknown",
  "repoRoot": "/abs/path",
  "targets": [
    {
      "type": "plugin | theme",
      "isBlockTheme": false,
      "path": "/abs/path/to/target",
      "relativePath": "wp-content/plugins/my-plugin",
      "slug": "my-plugin",
      "name": "My Plugin",
      "mainFile": "my-plugin.php"
    }
  ]
}
```

### 2) 構成に応じた対話プロトコル

`targets.length` で分岐します。

#### A. 単体構成（`targets.length === 1`、shape が single-* ）

追加の対話なしで呼び出し元スキルへ戻り、`target.path` を作業ディレクトリとして利用します。

#### B. 複数構成（`targets.length > 1`）

ユーザーに以下を必ず確認します。

**B-1. 適用方針の質問**

呼び出し元スキルがテスト・リント・ビルド・i18n のいずれかである場合:

> このリポジトリには複数のターゲット（{count}件: {一覧}）が存在します。
> {スキル名} を適用するにあたって、以下のどちらにしますか？
>
> 1. **統一ワークフロー**: 全ターゲットを同じ設定で一括対応（例: ルートに共通のテスト設定、CI で全件マトリクス）
> 2. **個別ワークフロー**: ターゲットごとに独立した設定を作る（テーマだけ外部管理する等、事情がある場合）
> 3. **特定ターゲットのみ**: 1つ以上を選んで対象を絞る

選択結果に応じて、呼び出し元スキルは作業を進める。`AskUserQuestion` を使うのが望ましい。

**B-2. デプロイは単一ターゲット選択を必須化**

呼び出し元が `wp-ci-setup` でかつ WordPress.org デプロイステップ（`wordpress.yml`）の生成を行う場合は、**統一ワークフロー選択時であっても**、デプロイ対象を1つに絞る質問を必須で行ってください。

> WordPress.org へのデプロイは事故を防ぐため、1リポジトリ1ターゲットに限定します。
> どのターゲットをデプロイ対象にしますか？
>
> - (a) {target-slug-1} を1つだけデプロイする
> - (b) どれもデプロイしない（後で手動セットアップ）
>
> ※ 複数ターゲットを個別に WordPress.org 公開したい場合は、現状リポジトリを分割することを推奨します（slug ごとに SVN リポジトリが別なため）。

#### C. 該当なし（`targets.length === 0` または shape が unknown）

ユーザーに状況を報告し、続行可否を確認してください。誤検出の可能性もあるため、ディレクトリ構成のヒアリングを行ってから呼び出し元スキルへ戻ります。

### 3) 呼び出し元スキルへの引き渡し

ターゲット解決後は、各 detect スクリプトを `--path=<target.path>` 付きで起動するか、`cd target.path && node detect_*.mjs` の形で個別実行します。複数ターゲットを順に処理する場合は、ループ前にこの方針をユーザーに明示してから着手してください。

## 検証

1. `node ~/.claude/skills/wp-multi-target/scripts/detect_targets.mjs` を実行する
2. `shape` と `targets[]` が想定と一致することを確認する
3. 複数ターゲットを正しく列挙できているかを確認する

## トラブルシューティング

- **`shape: "unknown"` になる**: ルート直下にプラグインのメインファイルもテーマの `style.css` も無く、`wp-content/` 系のサブツリーも見つからない場合に発生します。`--root=<dir>` で正しいパスを指定してください。
- **テーマと誤判定される**: `style.css` に `Theme Name:` ヘッダーが入っていると検出されます。ライブラリ用の `style.css` を置いている場合はファイル名を変更してください。
- **`wp-content/mu-plugins/*` が含まれない**: 現状 mu-plugins は検出対象外です。必要であれば手動で対象に追加してください。
