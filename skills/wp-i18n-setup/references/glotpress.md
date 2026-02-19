# GlotPress（WordPress.org翻訳）

WordPress.orgでホストされているプラグインの翻訳は、translate.wordpress.orgのGlotPressで管理される。

## 仕組み

WordPress.orgがプラグインのソースコードからPOTファイルを自動生成し、翻訳パックをサイトに配信する。プラグインリポジトリにローカルの `.po`/`.mo` ファイルは不要。

## プラグイン要件

### 1. プラグインヘッダー

メインプラグインファイルに `Text Domain` と `Domain Path` ヘッダーが必要：

```php
/**
 * Plugin Name:     My Plugin
 * Text Domain:     my-plugin
 * Domain Path:     /languages
 */
```

### 2. テキストドメインの読み込み

`plugins_loaded` フックで `load_plugin_textdomain()` を呼び出す：

```php
function my_plugin_init() {
    // Translations are loaded from WordPress.org via GlotPress.
    load_plugin_textdomain( 'my-plugin' );
}
add_action( 'plugins_loaded', 'my_plugin_init' );
```

**注意**: WordPress.orgプラグインの場合、`$path` パラメータを指定する必要はない。WordPressが `WP_LANG_DIR/plugins/` から翻訳ファイルを自動的に検索する。

### 3. 翻訳関数の使用

text domainを指定して標準のWordPress i18n関数を使用する：

```php
__( 'Hello', 'my-plugin' )
_e( 'Hello', 'my-plugin' )
esc_html__( 'Hello', 'my-plugin' )
sprintf( __( 'Hello %s', 'my-plugin' ), $name )
_n( '%d item', '%d items', $count, 'my-plugin' )
```

## ローカル言語ファイルは不要

WordPress.orgプラグインの場合：
- `.po`/`.mo` ファイルをリポジトリにコミットしない
- 翻訳ファイルを含む `languages/` ディレクトリは不要
- WordPressが翻訳ファイルの配信を自動的に処理する
- `languages/` ディレクトリはリポジトリから完全に省略可能

## GlotPress翻訳スキル

AIによる文字列の一括翻訳には、`glotpress-translate` Claude Codeスキルを使用できる。GlotPressからPOファイルをダウンロードし、未翻訳の文字列を翻訳して、インポート用のPOを出力する。
