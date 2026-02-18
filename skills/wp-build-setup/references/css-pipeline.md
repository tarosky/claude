# CSSビルドパイプライン (Sass + PostCSS)

## 依存パッケージ

```json
{
  "devDependencies": {
    "sass": "^1.83.0",
    "postcss": "^8.4.33",
    "postcss-cli": "^11.0.0",
    "autoprefixer": "^10.4.16"
  }
}
```

## ビルドコマンド

```bash
sass ./src/scss/:./assets/css/ --style=compressed && postcss ./assets/css/*.css --use autoprefixer --replace
```

このコマンドは以下を実行します:
1. `src/scss/` 内のすべてのSCSSファイルを `assets/css/` にコンパイル（圧縮形式）
2. 出力されたCSSファイルに autoprefixer をインプレースで適用

## ディレクトリ構造

```
src/
  scss/
    style.scss
    admin.scss
    _variables.scss    # パーシャル（_プレフィックス付き）は直接コンパイルされません
assets/
  css/
    style.css          # コンパイル出力
    admin.css
```

## npm スクリプト

```json
{
  "scripts": {
    "build:css": "sass ./src/scss/:./assets/css/ --style=compressed && postcss ./assets/css/*.css --use autoprefixer --replace"
  }
}
```

## grab-deps との連携

CSSビルド後に `grab-deps dump` を実行して、CSSファイルを `wp-dependencies.json` に含めます:

```json
{
  "scripts": {
    "dump": "grab-deps dump assets/js,assets/css",
    "package": "npm run build:css && npm run build:js && npm run build:blocks && npm run dump"
  }
}
```

## ウォッチモード

開発時には `npm-watch` を使用してください:

```json
{
  "devDependencies": {
    "npm-watch": "^0.13.0"
  },
  "scripts": {
    "watch": "npm-watch"
  },
  "watch": {
    "build:css": {
      "extensions": "scss",
      "patterns": ["src/scss"]
    },
    "build:js": {
      "extensions": "js",
      "patterns": ["src/js"]
    },
    "dump": {
      "extensions": "js,css",
      "patterns": ["assets/js", "assets/css"]
    }
  }
}
```
