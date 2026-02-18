---
name: wp-build-setup
description: "Diagnose and set up JS/CSS build pipeline (grab-deps, sass, postcss, @wordpress/scripts for blocks) for a WordPress plugin project."
compatibility: "Targets WordPress plugins with Node.js 22+. Filesystem-based agent with bash + node."
---

# WP Build Setup

## 使用場面

以下の場合にこのスキルを使用してください:

- 新しいWordPressプラグインにアセットビルドパイプラインをセットアップする場合
- @kunoichi/grab-deps によるJSバンドルを追加する場合
- sass + postcss + autoprefixer によるSCSSコンパイルを追加する場合
- @wordpress/scripts によるブロックビルドを追加する場合
- リリースビルドスクリプト (bin/build.sh) をセットアップする場合
- 既存プロジェクトのビルド設定の不足箇所を監査する場合

## 必要な入力

- リポジトリルート (CWD)
- プロジェクトが必要とするアセットの種類: JSのみ、CSSのみ、ブロック、またはすべて
- 非ブロックJSに @kunoichi/grab-deps と @wordpress/scripts のどちらを使用するか

## 手順

### 0) 検出スクリプトの実行

```bash
node ~/.claude/skills/wp-build-setup/scripts/detect_build.mjs
```

JSON出力を確認してください。`exists: false` の項目は対応が必要です。

### 1) JSバンドルのセットアップ (grab-deps)

`grabDeps`、`buildJsScript`、または `dumpScript` が欠けている場合:

参照:
- `references/grab-deps.md`

対応内容:
- @kunoichi/grab-deps をインストール
- 必要に応じて src/js/ ディレクトリを作成
- package.json に build:js と dump スクリプトを追加
- PHP側で wp-dependencies.json を読み込む処理をセットアップ

### 2) CSSパイプラインのセットアップ

`sassDep`、`postcssDeps`、または `buildCssScript` が欠けている場合:

参照:
- `references/css-pipeline.md`

対応内容:
- sass, postcss, postcss-cli, autoprefixer をインストール
- 必要に応じて src/scss/ ディレクトリを作成
- package.json に build:css スクリプトを追加

### 3) ブロックビルドのセットアップ（必要な場合）

プロジェクトにGutenbergブロックがあり、`wpScriptsDep` または `buildBlocksScript` が欠けている場合:

対応内容:
- @wordpress/scripts をインストール
- build:blocks スクリプトを追加: `wp-scripts build --source-path=src/blocks --output-path=assets/blocks`

### 4) 統合パッケージスクリプトのセットアップ

すべてのビルドステップを実行する `package` スクリプトを追加してください:

```json
{
  "scripts": {
    "package": "npm run build:css && npm run build:js && npm run build:blocks && npm run dump"
  }
}
```

### 5) ビルドスクリプトのセットアップ（CI/リリース用）

`buildScript` が欠けている場合:

参照:
- `references/build-script.md`

対応内容:
- bin/build.sh を作成
- 実行権限を付与 (chmod +x)

## 検証

1. `npm run build:js` を実行 -- JSファイルが assets/js/ に生成されることを確認。
2. `npm run build:css` を実行 -- CSSファイルが assets/css/ に生成されることを確認。
3. `npm run dump` を実行 -- wp-dependencies.json が更新されることを確認。
4. `npm run package` を実行 -- すべてのビルドステップが正常に完了することを確認。

## トラブルシューティング

- **grab-deps "no files found"**: src/js/ ディレクトリが存在し、適切なヘッダーを持つ .js ファイルが含まれているか確認してください。
- **sass "Error: Can't find stylesheet"**: SCSSのインポートパスとパーシャルファイルの存在を確認してください。
- **postcss が失敗する場合**: postcss だけでなく postcss-cli がインストールされていることを確認してください。
- **wp-dependencies.json が空になる場合**: アセットビルド後に dump を実行してください（ビルド前ではありません）。
