# 呼び出し元スキルからの統合パターン

`wp-test-setup` / `wp-ci-setup` / `wp-build-setup` / `wp-i18n-setup` などのスキルは、本体処理に入る前にこのスキルを呼ぶ。共通の手順は以下。

## 1. ターゲット解決

```bash
node ~/.claude/skills/wp-multi-target/scripts/detect_targets.mjs
```

`shape` と `targets[]` を取得する。

## 2. 単体構成（targets.length === 1）

`target.path` を作業ディレクトリとして、従来通りスキル本体の検出スクリプトを実行する。

```bash
node ~/.claude/skills/wp-<skill>/scripts/detect_<skill>.mjs --path=<target.path>
```

`--path` 未指定時は CWD を対象とする（後方互換）。

## 3. 複数構成（targets.length > 1）

### 3-a. 適用方針を確認（テスト・リント・ビルド・i18n）

`AskUserQuestion` で次の選択肢を提示する:

- 統一ワークフロー（全ターゲット同じ設定で一括対応）
- 個別ワークフロー（ターゲットごとに独立した設定）
- 特定ターゲットのみ（対象を絞る）

選択結果に応じてループまたは単発で本体処理を実施する。

### 3-b. デプロイは必ず1ターゲットに絞る（wp-ci-setup の wordpress.yml）

統一ワークフローを選んだ場合でも、`wordpress.yml` 生成時は対象を1つに限定する。

`AskUserQuestion` で次の選択肢を提示する:

- どれか1つを選んでデプロイする
- どれもデプロイしない（後で手動セットアップ）

選択結果に応じてワークフローファイルを1つだけ生成する。複数の WordPress.org slug を扱いたい場合はリポジトリ分割を推奨する旨を明示する。

## 4. shape が unknown の場合

検出が外れている可能性をユーザーに伝え、`--root=<dir>` で正しいパスを指定するか、構成のヒアリングを行う。
