---
name: wp-i18n-setup
description: "Diagnose and set up translation infrastructure for a WordPress plugin: GlotPress for WordPress.org plugins, or manual POT/PO/MO workflow for others."
compatibility: "Targets WordPress plugins with PHP 7.4+. WP-CLI needed for POT generation. Filesystem-based agent with bash + node."
---

# WP i18n Setup

## 使用場面

以下のような場合にこのスキルを使用してください：

- 新しいWordPressプラグインの国際化（i18n）を設定する
- 既存プラグインの翻訳対応状況を監査する
- GlotPress（WordPress.org）と手動POTワークフローのどちらを使うか判断する
- text domain、domain path、`load_plugin_textdomain` の呼び出しが不足している場合の修正
- POTファイルの生成または更新

## 必要な入力

- リポジトリのルートディレクトリ（CWD）
- プラグインがWordPress.orgでホストされているかどうか（翻訳ワークフローの決定に使用）
- Text domain（通常はプラグインのスラッグと一致）

## 手順

### 0) 検出スクリプトの実行

```bash
node ~/.claude/skills/wp-i18n-setup/scripts/detect_i18n.mjs
```

JSON出力を確認してください。重要なフィールド：
- `isWordPressOrgPlugin`: どちらのワークフローに従うかを決定する
- `exists: false` の項目は対応が必要

### 1) プラグインヘッダーの確認

`textDomain` または `domainPath` が不足している場合：

対応：
- メインプラグインファイルのヘッダーに `Text Domain: plugin-slug` を追加
- メインプラグインファイルのヘッダーに `Domain Path: /languages` を追加

### 2) load_plugin_textdomain の呼び出しを確認

`loadTextdomain` が不足している場合：

対応：
- `plugins_loaded` フックで `load_plugin_textdomain( 'plugin-slug' )` を呼び出すコードを追加

### 3a) WordPress.orgプラグインの場合（GlotPress）

`isWordPressOrgPlugin` が true の場合：

参照：
- `references/glotpress.md`

対応：
- `load_plugin_textdomain` がパスパラメータなしで呼び出されていることを確認
- リポジトリからローカルの .po/.mo ファイルを削除（翻訳はWordPress.orgから配信される）
- `languages/` ディレクトリが空の場合は削除可能

### 3b) WordPress.org以外のプラグインの場合（手動POT）

`isWordPressOrgPlugin` が false の場合：

参照：
- `references/pot-generation.md`

対応：
- `languages/` ディレクトリを作成
- POTファイルを生成: `wp i18n make-pot . languages/plugin-slug.pot`
- `load_plugin_textdomain` にパスパラメータが含まれていることを確認
- ドキュメントに翻訳ワークフローを追加

## 検証

1. メインプラグインファイルに `Text Domain` と `Domain Path` ヘッダーが存在することを確認する
2. `plugins_loaded` で `load_plugin_textdomain()` が呼び出されていることを確認する
3. WordPress.orgプラグインの場合：ローカル翻訳ファイルがコミットされていないことを確認する
4. WordPress.org以外のプラグインの場合：POTファイルが存在し、最新であることを確認する

## トラブルシューティング

- **翻訳が読み込まれない**: すべての `__()`, `_e()` 呼び出しでtext domainが一致しているか確認する。`load_plugin_textdomain` が正しいフックで呼び出されているか確認する。
- **「Text Domain does not match plugin slug」（WordPress.orgレビュー）**: Text Domainヘッダーがプラグインのディレクトリ名と一致している必要がある。
- **POTファイルに文字列が不足**: `wp i18n make-pot` を再実行する。`--exclude` がソースディレクトリを除外していないか確認する。
- **JS翻訳が読み込まれない**: `wp_set_script_translations()` が正しいハンドルとtext domainで呼び出されていることを確認する。
