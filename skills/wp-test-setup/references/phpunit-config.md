# PHPUnit 設定

## phpunit.xml.dist テンプレート

```xml
<?xml version="1.0"?>
<phpunit
  bootstrap="tests/bootstrap.php"
  backupGlobals="false"
  colors="true"
  convertErrorsToExceptions="true"
  convertNoticesToExceptions="true"
  convertWarningsToExceptions="true"
  >
  <testsuites>
    <testsuite>
      <directory prefix="test-" suffix=".php">./tests/</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

## tests/bootstrap.php テンプレート

```php
<?php
/**
 * PHPUnit bootstrap file
 *
 * @package PluginName
 */

$_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $_tests_dir ) {
  $_tests_dir = rtrim( sys_get_temp_dir(), '/\\' ) . '/wordpress-tests-lib';
}

if ( ! file_exists( $_tests_dir . '/includes/functions.php' ) ) {
  echo "Could not find $_tests_dir/includes/functions.php, have you run bin/install-wp-tests.sh ?" . PHP_EOL;
  exit( 1 );
}

// Give access to tests_add_filter() function.
require_once $_tests_dir . '/includes/functions.php';

/**
 * Manually load the plugin being tested.
 */
function _manually_load_plugin() {
  require dirname( __DIR__ ) . '/plugin-main.php';
}
tests_add_filter( 'muplugins_loaded', '_manually_load_plugin' );

// Start up the WP testing environment.
require $_tests_dir . '/includes/bootstrap.php';
```

**重要**: `plugin-main.php` を実際のメインプラグインファイル名に置き換えてください。

## composer.json の必須パッケージ

```json
{
  "require-dev": {
    "phpunit/phpunit": "^9.0",
    "yoast/phpunit-polyfills": "^4.0"
  }
}
```

### yoast/phpunit-polyfills が必要な理由

WordPress のテストスイートでは、PHPUnit バージョン間の互換性を確保するためにポリフィルが必要です。`yoast/phpunit-polyfills` パッケージがこの役割を担います。

### WP_TESTS_DIR

環境変数 `WP_TESTS_DIR` は WordPress テストライブラリの場所を指します。`wp-env` を使用する場合、テストコンテナ内で `/wordpress-phpunit/` として自動的に利用可能です。

## サンプルテストファイル

```php
<?php
/**
 * Sample test
 *
 * @package PluginName
 */

class SampleTest extends WP_UnitTestCase {

  /**
   * Test that plugin is loaded.
   */
  public function test_plugin_loaded() {
    $this->assertTrue( function_exists( 'my_plugin_function' ) );
  }
}
```

テストファイルの注意点:
- `test-` 接頭辞を使用すること（phpunit.xml.dist の `prefix` 設定に合わせる）
- `WP_UnitTestCase` を継承すること
- メソッド名は `test_` で始めること
