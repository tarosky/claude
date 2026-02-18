# ビルドスクリプト (bin/build.sh)

CI/CDでリリース用ビルドを作成するために使用します。

## テンプレート

```bash
#!/usr/bin/env bash

set -e

# タグからバージョンを抽出（'v'プレフィックスがあれば除去）
if [ -z "$1" ]; then
  echo "Error: No tag provided"
  exit 1
fi

TAG_NAME=$1
# Remove 'refs/tags/' prefix if present (from GitHub Actions)
TAG_NAME=${TAG_NAME#refs/tags/}
# Remove 'v' prefix if present
VERSION=${TAG_NAME#v}

echo "Building version: ${VERSION} from tag: ${TAG_NAME}"

# Install PHP dependencies (production only)
composer install --no-dev --prefer-dist

# Install Node dependencies and build assets
npm install
npm run package

# Generate readme.txt from README.md
echo 'Generate readme.'
curl -L https://raw.githubusercontent.com/fumikito/wp-readme/master/wp-readme.php | php

# Inject version into plugin main file and readme.txt
echo "Updating version to ${VERSION}"
sed -i.bak "s/\* Version: .*/\* Version: ${VERSION}/g" ./plugin-main.php
sed -i.bak "s/^Stable Tag: .*/Stable Tag: ${VERSION}/g" ./readme.txt

# Clean up backup files
rm -f ./plugin-main.php.bak ./readme.txt.bak
```

## カスタマイズ

- `plugin-main.php` は実際のメインプラグインファイル名に置き換えてください。
- `wp-readme.php` スクリプトは `README.md` をWordPress形式の `readme.txt` に変換します。プロジェクトで `readme.txt` を直接管理している場合は、このステップを削除してください。
- `sed` コマンドはリリースバージョンをプラグインヘッダーとreadmeに注入します。

## CIでの使用方法

デプロイワークフローから呼び出されます:

```yaml
- name: Build package
  run: bash bin/build.sh ${{ github.ref }}
```

`github.ref` は完全な参照（例: `refs/tags/v1.2.3`）を提供し、スクリプトがそこからバージョンを抽出します。

## 注意事項

- `composer install --no-dev` により、リリースに開発用依存パッケージが含まれないようにします。
- `npm run package` はすべてのアセット（JS、CSS、ブロック）をビルドし、wp-dependencies.json を生成する必要があります。
- スクリプトに実行権限を付与してください: `chmod +x bin/build.sh`
