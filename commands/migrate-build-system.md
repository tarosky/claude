# Build System Migration

WordPress プラグインのビルドシステムを Gulp から npm scripts + @kunoichi/grab-deps v3 に移行します。

## 完成形

- **CSS**: `sass` CLI + `postcss` + `autoprefixer`
- **JS**: `@kunoichi/grab-deps js` (内蔵webpack)
- **依存関係**: `@kunoichi/grab-deps dump` → `wp-dependencies.json`
- **Watch**: `npm-watch`
- **Lint**: `@wordpress/scripts`

## 作業手順

### Step 1: 現状確認

まず以下を確認してください：

1. 現在の package.json の内容
2. gulpfile.js の内容（存在する場合）
3. webpack.config.js の内容（存在する場合）
4. assets/ と dist/ のディレクトリ構造

```bash
cat package.json
ls -la assets/
ls -la dist/
```

### Step 2: ユーザーへの確認事項

以下を確認してください：

- **アセットの構造**: `assets/js/`, `assets/scss/` の場所
- **出力先**: `dist/js/`, `dist/css/` の場所
- **Node.js バージョン**: 18以上を使用可能か？
- **既存のカスタム webpack 設定**: 特別な設定があるか？

### Step 3: package.json の更新

```json
{
  "name": "your-plugin-name",
  "scripts": {
    "start": "wp-env start",
    "update": "wp-env start --update",
    "stop": "wp-env stop",
    "cli": "wp-env run cli wp",
    "cli:test": "wp-env run tests-cli wp",
    "package": "npm run build:css && npm run build:js && npm run dump",
    "watch": "npm-watch",
    "build:css": "sass ./assets/scss/:./dist/css/ --style=compressed && postcss ./dist/css/*.css --use autoprefixer --replace",
    "build:js": "grab-deps js assets/js dist/js",
    "dump": "grab-deps dump dist",
    "fix": "npm run fix:js && npm run fix:css",
    "fix:js": "eslint --fix -c .eslintrc assets/js",
    "fix:css": "stylelint --fix assets/scss",
    "lint": "npm run lint:css && npm run lint:js",
    "lint:css": "wp-scripts lint-style './assets/scss/**/*.scss'",
    "lint:js": "wp-scripts lint-js ./assets/js"
  },
  "engines": {
    "node": ">=18.0"
  },
  "devDependencies": {
    "@kunoichi/grab-deps": "^3.0.0",
    "@wordpress/env": "^10.0",
    "@wordpress/scripts": "^30.0.0",
    "autoprefixer": "^10.4.16",
    "npm-watch": "^0.13.0",
    "postcss": "^8.4.33",
    "postcss-cli": "^11.0.0",
    "sass": "^1.69.7"
  },
  "watch": {
    "build:js": {
      "extensions": "js,jsx",
      "patterns": [
        "assets/js"
      ]
    },
    "build:css": {
      "extensions": "scss",
      "patterns": [
        "assets/scss"
      ]
    },
    "dump": {
      "extensions": "js,css",
      "patterns": [
        "dist/js",
        "dist/css"
      ]
    }
  }
}
```

### Step 4: .eslintrc の更新

`@babel/eslint-parser` が不要になるので削除：

```json
{
  "env": {
    "browser": true,
    "jquery": true
  },
  "globals": {
    "wp": false,
    "jQuery": false
  },
  "extends": [
    "plugin:@wordpress/eslint-plugin/recommended-with-formatting"
  ],
  "rules": {
    "no-alert": "off",
    "prettier/prettier": "off",
    "object-shorthand": "off",
    "jsdoc/require-jsdoc": "off",
    "jsdoc/no-undefined-types": "off",
    "react/react-in-jsx-scope": "off",
    "react/jsx-sort-props": "off",
    "jsdoc/check-tag-names": "off",
    "react-hooks/rules-of-hooks": "off",
    "import/order": "off",
    "no-prototype-builtins": "off",
    "object-curly-newline": "off",
    "object-property-newline": "off",
    "yoda": "off",
    "strict": "off"
  },
  "settings": {
    "react": {
      "version": "18.0"
    }
  }
}
```

### Step 5: 不要ファイルの削除

以下のファイルを削除：

- `gulpfile.js`
- `webpack.config.js`（@kunoichi/grab-deps が内蔵 webpack を使用）

### Step 6: GitHub Actions の更新

Node.js バージョンを 20以上 に更新：

```yaml
- name: Install NPM
  uses: actions/setup-node@v4
  with:
    node-version: 20
```

### Step 7: テスト

```bash
# node_modules を再インストール
rm -rf node_modules package-lock.json
npm install

# ビルドテスト
npm run package

# 出力確認
ls -la dist/js/ dist/css/
cat wp-dependencies.json
```

## 削除されるパッケージ

- gulp, gulp-*
- webpack-stream
- vinyl-named
- babel-loader
- @babel/core, @babel/preset-env, @babel/eslint-parser, @babel/plugin-transform-react-jsx
- gulp-eslint, gulp-stylelint
- stylelint-config-wordpress（@wordpress/scripts に含まれる）

## 追加されるパッケージ

- @kunoichi/grab-deps (v3)
- @wordpress/scripts
- postcss, postcss-cli, autoprefixer
- npm-watch
- sass

## 注意事項

- `npm run package` などのビルド用コマンド名は維持（GitHub Actions で使用されている可能性がある）
- アセットのパスはリポジトリによって異なる場合がある（`src/`, `build/` など）
- 既存の webpack.config.js に特殊な設定がある場合は確認が必要
- @kunoichi/grab-deps v3 は WordPress の依存関係を自動検出する
