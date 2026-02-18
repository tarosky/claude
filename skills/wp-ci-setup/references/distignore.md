# .distignore

WordPress.org SVNデプロイから除外するファイルとディレクトリの一覧です。`10up/action-wordpress-plugin-deploy` で使用されます。

## テンプレート

```
# Development config
.distignore
.claude
.editorconfig
.git
.gitignore
.gitlab-ci.yml
.husky
.travis.yml
.github
.wp-env.json
.stylelintrc.json

# OS files
.DS_Store
Thumbs.db

# Build/config
composer.json
composer.lock
Gruntfile.js
gulpfile.js
package.json
package-lock.json
yarn.lock

# Testing
behat.yml
bitbucket-pipelines.yml
.circleci/config.yml
phpunit.xml
phpunit.xml.dist
multisite.xml
multisite.xml.dist
phpcs.xml
phpcs.xml.dist
tests
wp-cli.local.yml

# Documentation (README.md is replaced by readme.txt)
README.md

# Directories
bin
node_modules
/dev/
/wp/

# Archives & generated
*.sql
*.tar.gz
*.zip
```

## 注意事項

- `wp-dependencies.json` は .distignore に含めないでください。アセット登録時にランタイムで必要です。
- `readme.txt` は除外しないでください。WordPress.org の readme として必要です。
- プラグインがランタイムでComposer autoloadを使用している場合、`vendor/` は除外しないでください。
- `assets/` は除外しないでください。ビルド済みのJS/CSSファイルが含まれています。
- プロジェクト固有のエントリは必要に応じて追加してください（例: 開発専用ファイル用の `/dev/`）。

## 10up/action-wordpress-plugin-deploy の動作

このアクションは `rsync` を `--exclude-from=.distignore` オプション付きで実行し、SVNデプロイ用にプラグインのクリーンなコピーを作成します。`.distignore` のパターンに一致するファイルが除外されます。
