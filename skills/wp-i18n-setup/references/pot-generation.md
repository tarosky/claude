# POT生成（WordPress.org以外のプラグイン）

WordPress.orgでホストされていないプラグインの場合、翻訳はPOT/PO/MOファイルを使って手動で管理する必要がある。

## POTファイルの生成

### WP-CLIを使用する方法

```bash
wp i18n make-pot . languages/my-plugin.pot
```

すべてのPHPファイルから翻訳関数の呼び出しをスキャンし、POTテンプレートを生成する。

### オプション

```bash
wp i18n make-pot . languages/my-plugin.pot \
  --slug=my-plugin \
  --domain=my-plugin \
  --exclude=tests,node_modules,vendor
```

## ディレクトリ構造

```
languages/
  my-plugin.pot           # テンプレート（生成物、コミットする）
  my-plugin-ja.po         # 日本語翻訳（人が編集）
  my-plugin-ja.mo         # 日本語コンパイル済み（.poから生成）
  my-plugin-fr_FR.po      # フランス語翻訳
  my-plugin-fr_FR.mo      # フランス語コンパイル済み
```

### ファイル命名規則

- POT: `{text-domain}.pot`
- PO: `{text-domain}-{locale}.po`
- MO: `{text-domain}-{locale}.mo`

ロケールの形式：言語コード（例: `ja`）または言語_国コード（例: `fr_FR`）。

## 翻訳の読み込み

```php
function my_plugin_init() {
    load_plugin_textdomain(
        'my-plugin',
        false,
        dirname( plugin_basename( __FILE__ ) ) . '/languages'
    );
}
add_action( 'plugins_loaded', 'my_plugin_init' );
```

**注意**: WordPress.orgプラグインとは異なり、第3パラメータ（`$rel_path`）でプラグインディレクトリからの相対パスとして `languages/` ディレクトリを指定する必要がある。

## POからMOへのコンパイル

### WP-CLIを使用する方法

```bash
wp i18n make-mo languages/
```

ディレクトリ内のすべての `.po` ファイルを `.mo` ファイルにコンパイルする。

## JavaScript翻訳

`@wordpress/i18n` を使用するJavaScriptを含むプラグインの場合：

```bash
wp i18n make-json languages/ --no-purge
```

JS用の `.json` 翻訳ファイルを生成する。WordPressは `wp_set_script_translations()` を通じてこれらを読み込む。

### JS翻訳のPHP設定

```php
wp_set_script_translations( 'my-script-handle', 'my-plugin', plugin_dir_path( __FILE__ ) . 'languages' );
```

## ワークフロー

1. POTを生成: `wp i18n make-pot . languages/my-plugin.pot`
2. 各ロケールのPOファイルを作成・更新（手動またはツールを使用）
3. MOをコンパイル: `wp i18n make-mo languages/`
4. （JSがある場合）JSONを生成: `wp i18n make-json languages/ --no-purge`
5. `languages/` 内のすべてのファイルをコミット
