# @kunoichi/grab-deps

WordPress対応のJSバンドラーで、ソースファイルから依存関係ヘッダーを読み取り、バンドル済みJSと依存関係マニフェストを出力します。

## インストール

```bash
npm install --save-dev @kunoichi/grab-deps
```

## JSヘッダー形式

各JSソースファイルにはヘッダーコメントを記述してください:

```javascript
/*!
 * @handle my-plugin-script
 * @deps jquery,wp-api-fetch
 * @strategy defer
 */
```

フィールド:
- `@handle`: WordPressのスクリプトハンドル（wp_register_script で使用）
- `@deps`: このスクリプトが依存するWordPressスクリプトハンドルのカンマ区切りリスト
- `@strategy`: 読み込み戦略 -- `defer`、`async`、または省略でデフォルト

## ビルドコマンド

### JSファイルのバンドル

```bash
grab-deps js src/js assets/js
```

引数: `js <ソースディレクトリ> <出力ディレクトリ>`

### 依存関係マニフェストの生成

```bash
grab-deps dump assets/js,assets/css
```

引数: `dump <カンマ区切りのアセットディレクトリ>`

出力ディレクトリをスキャンし、プロジェクトルートに `wp-dependencies.json` を生成します。

## wp-dependencies.json

生成されるマニフェストには以下のようなエントリが含まれます:

```json
[
  {
    "handle": "my-plugin-script",
    "path": "assets/js/my-script.js",
    "deps": ["jquery", "wp-api-fetch"],
    "hash": "abc123...",
    "ext": "js",
    "footer": true,
    "strategy": "defer"
  }
]
```

## PHPとの連携

init 時に `wp-dependencies.json` を読み込み、すべてのアセットを登録します:

```php
function my_plugin_register_assets() {
  $path = __DIR__ . '/wp-dependencies.json';
  if ( ! file_exists( $path ) ) {
    return;
  }
  $deps = json_decode( file_get_contents( $path ), true );
  if ( empty( $deps ) ) {
    return;
  }
  foreach ( $deps as $dep ) {
    if ( empty( $dep['path'] ) ) {
      continue;
    }
    $url = plugin_dir_url( __FILE__ ) . $dep['path'];
    switch ( $dep['ext'] ) {
      case 'css':
        wp_register_style( $dep['handle'], $url, $dep['deps'], $dep['hash'], $dep['media'] );
        break;
      case 'js':
        $args = [ 'in_footer' => $dep['footer'] ];
        if ( in_array( $dep['strategy'], [ 'defer', 'async' ], true ) ) {
          $args['strategy'] = $dep['strategy'];
        }
        wp_register_script( $dep['handle'], $url, $dep['deps'], $dep['hash'], $args );
        break;
    }
  }
}
add_action( 'init', 'my_plugin_register_assets' );
```

## npm スクリプト

```json
{
  "scripts": {
    "build:js": "grab-deps js src/js assets/js",
    "dump": "grab-deps dump assets/js,assets/css"
  }
}
```
