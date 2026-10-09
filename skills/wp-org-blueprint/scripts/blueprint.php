<?php
/**
 * WordPress.org Live Preview 用 blueprint の補助ツール
 *
 * blueprint.json の中の runPHP コードは JSON 文字列なので、手でエスケープすると壊れやすい。
 * そこでデモデータ投入の PHP は別ファイル（demo.php）をマスターにし、このツールで埋め込む。
 *
 * 使い方:
 *   php blueprint.php status <plugin-dir>
 *       プラグインのスラッグ・ローカル版と WordPress.org 公開版のバージョン・既存 blueprint の有無を表示する
 *   php blueprint.php init <plugin-dir>
 *       .wordpress-org/blueprints/blueprint.json と .claude/wp-org-blueprint/demo.php の雛形を作る（既存なら何もしない）
 *   php blueprint.php embed <plugin-dir>
 *       demo.php の内容を blueprint.json の runPHP ステップに埋め込む
 *   php blueprint.php check <plugin-dir>
 *       blueprint.json と demo.php が一致しているか確かめる（不一致なら終了コード 1）
 *   php blueprint.php local <plugin-dir> <out.json> [--published]
 *       wordpress.org からのインストール手順を、マウントしたローカルコードの activatePlugin に差し替えたコピーを書き出す
 *       --published を付けると差し替えず、公開版をインストールする本番どおりのコピーにする
 *       （どちらもエラー表示用の WP_DEBUG を足す）
 *
 * スラッグはディレクトリ名から推定する。異なる場合は WP_ORG_SLUG=<slug> を付けて実行する。
 */

const BLUEPRINT_PATH = '.wordpress-org/blueprints/blueprint.json';
const DEMO_PATH      = '.claude/wp-org-blueprint/demo.php';

/**
 * エラーを出して終了する
 */
function fail( string $message ): void {
	fwrite( STDERR, "Error: {$message}\n" );
	exit( 1 );
}

/**
 * プラグインヘッダーを持つメインファイルを探す
 *
 * @return array{file: string, slug: string, name: string, version: string}
 */
function detect_plugin( string $dir ): array {
	foreach ( glob( $dir . '/*.php' ) as $file ) {
		$head = file_get_contents( $file, false, null, 0, 8192 );
		if ( ! preg_match( '/^[ \t\/*#@]*Plugin Name:(.*)$/mi', $head, $name ) ) {
			continue;
		}
		$version = preg_match( '/^[ \t\/*#@]*Version:(.*)$/mi', $head, $v ) ? trim( $v[1] ) : '';
		return array(
			'file'    => basename( $file ),
			// スラッグはディレクトリ名を採る。worktree などで異なる場合は環境変数 WP_ORG_SLUG で上書きする。
			'slug'    => getenv( 'WP_ORG_SLUG' ) ?: basename( realpath( $dir ) ),
			'name'    => trim( $name[1] ),
			'version' => $version,
		);
	}
	fail( "プラグインヘッダー（Plugin Name:）を持つ PHP ファイルが {$dir} 直下に見つかりません" );
}

function read_blueprint( string $dir ): array {
	$path = $dir . '/' . BLUEPRINT_PATH;
	if ( ! file_exists( $path ) ) {
		fail( BLUEPRINT_PATH . ' がありません。先に init を実行してください' );
	}
	$json = json_decode( file_get_contents( $path ), true );
	if ( ! is_array( $json ) ) {
		fail( BLUEPRINT_PATH . ' が JSON として読めません: ' . json_last_error_msg() );
	}
	return $json;
}

function write_json( string $path, array $data ): void {
	$dirname = dirname( $path );
	if ( ! is_dir( $dirname ) ) {
		mkdir( $dirname, 0755, true );
	}
	$json = json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	file_put_contents( $path, $json . "\n" );
}

/**
 * デモデータを投入する runPHP ステップ（wp-load.php を読むもの）の添字を返す
 */
function demo_step_index( array $blueprint ): int {
	foreach ( $blueprint['steps'] ?? array() as $i => $step ) {
		if ( 'runPHP' === ( $step['step'] ?? '' ) && false !== strpos( $step['code'] ?? '', 'wp-load.php' ) ) {
			return $i;
		}
	}
	fail( 'wp-load.php を読み込む runPHP ステップが blueprint.json にありません' );
}

function read_demo( string $dir ): string {
	$path = $dir . '/' . DEMO_PATH;
	if ( ! file_exists( $path ) ) {
		fail( DEMO_PATH . ' がありません' );
	}
	return file_get_contents( $path );
}

/**
 * WordPress.org の公開情報を取得する（未公開なら null）
 */
function fetch_published( string $slug ): ?array {
	$url  = 'https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=' . rawurlencode( $slug );
	$body = @file_get_contents( $url );
	$info = $body ? json_decode( $body, true ) : null;
	return ( is_array( $info ) && isset( $info['version'] ) ) ? $info : null;
}

function cmd_status( string $dir ): void {
	$plugin    = detect_plugin( $dir );
	$published = fetch_published( $plugin['slug'] );
	$headers   = @get_headers( 'https://ps.w.org/' . $plugin['slug'] . '/assets/blueprints/blueprint.json' );
	$deploy    = array();
	foreach ( glob( $dir . '/.github/workflows/*.y*ml' ) as $workflow ) {
		$yaml = file_get_contents( $workflow );
		$assets_dir = preg_match( '/ASSETS_DIR:\s*(\S+)/', $yaml, $m ) ? $m[1] : '既定の .wordpress-org';
		if ( false !== strpos( $yaml, 'action-wordpress-plugin-deploy' ) ) {
			$deploy[] = basename( $workflow ) . " (release / ASSETS_DIR={$assets_dir})";
		}
		// assets だけを即時反映するワークフロー。blueprint がリリース前に公開されうる。
		if ( false !== strpos( $yaml, 'action-wordpress-plugin-asset-update' ) ) {
			$deploy[] = basename( $workflow ) . " (assets のみ即時更新 / ASSETS_DIR={$assets_dir})";
		}
	}
	$result = array(
		'slug'               => $plugin['slug'],
		'main_file'          => $plugin['file'],
		'name'               => $plugin['name'],
		'local_version'      => $plugin['version'],
		'published_version'  => $published['version'] ?? null,
		'published_updated'  => $published['last_updated'] ?? null,
		'published_requires' => $published ? array(
			'wp'  => $published['requires'] ?? null,
			'php' => $published['requires_php'] ?? null,
		) : null,
		'published_blueprint' => ( $headers && false !== strpos( $headers[0], '200' ) ),
		'local_blueprint'     => file_exists( $dir . '/' . BLUEPRINT_PATH ),
		'local_demo'          => file_exists( $dir . '/' . DEMO_PATH ),
		'deploy_workflows'    => $deploy,
	);
	echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
}

function cmd_init( string $dir ): void {
	$plugin = detect_plugin( $dir );
	$bp     = $dir . '/' . BLUEPRINT_PATH;
	$demo   = $dir . '/' . DEMO_PATH;
	if ( ! file_exists( $demo ) ) {
		if ( ! is_dir( dirname( $demo ) ) ) {
			mkdir( dirname( $demo ), 0755, true );
		}
		$code = <<<'PHP'
<?php
/**
 * Live Preview のデモデータ。
 *
 * このファイルがマスター。編集したら次で blueprint.json に埋め込むこと:
 *   php <skill>/scripts/blueprint.php embed .
 */
require '/wordpress/wp-load.php';

// TODO: プラグインの公開 API・モデルでデモデータを投入する。

// 着地ページ: デモ用の固定ページをフロントページにする（ID は事前に分からないため）。
$page_id = wp_insert_post( array(
	'post_type'    => 'page',
	'post_status'  => 'publish',
	'post_title'   => 'Demo',
	'post_content' => '',
) );
update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $page_id );

PHP;
		file_put_contents( $demo, $code );
		echo "作成: " . DEMO_PATH . "\n";
	}
	if ( ! file_exists( $bp ) ) {
		write_json( $bp, array(
			'$schema'           => 'https://playground.wordpress.net/blueprint-schema.json',
			'meta'              => array(
				'title'       => $plugin['name'] . ' demo',
				'description' => 'TODO',
				'author'      => 'tarosky',
				'categories'  => array(),
			),
			'landingPage'       => '/',
			'preferredVersions' => array(
				'php' => '8.2',
				'wp'  => 'latest',
			),
			'features'          => array( 'networking' => true ),
			'steps'             => array(
				array( 'step' => 'login' ),
				array(
					'step'       => 'installPlugin',
					'pluginData' => array(
						'resource' => 'wordpress.org/plugins',
						'slug'     => $plugin['slug'],
					),
					'options'    => array( 'activate' => true ),
				),
				array(
					'step' => 'runPHP',
					'code' => file_get_contents( $demo ),
				),
			),
		) );
		echo "作成: " . BLUEPRINT_PATH . "\n";
	}
}

function cmd_embed( string $dir ): void {
	$blueprint = read_blueprint( $dir );
	$index     = demo_step_index( $blueprint );
	$blueprint['steps'][ $index ]['code'] = read_demo( $dir );
	write_json( $dir . '/' . BLUEPRINT_PATH, $blueprint );
	echo "埋め込み完了: " . DEMO_PATH . " → " . BLUEPRINT_PATH . "\n";
}

function cmd_check( string $dir ): void {
	$blueprint = read_blueprint( $dir );
	$index     = demo_step_index( $blueprint );
	if ( $blueprint['steps'][ $index ]['code'] !== read_demo( $dir ) ) {
		fail( 'blueprint.json の runPHP と demo.php が一致しません。embed を実行してください' );
	}
	echo "OK: blueprint.json と demo.php は一致しています\n";
}

function cmd_local( string $dir, string $out, bool $published ): void {
	$plugin    = detect_plugin( $dir );
	$blueprint = read_blueprint( $dir );
	$replaced  = $published;
	foreach ( $published ? array() : $blueprint['steps'] as $i => $step ) {
		$data = $step['pluginData'] ?? $step['pluginZipFile'] ?? array();
		if ( 'installPlugin' === ( $step['step'] ?? '' ) && ( $data['slug'] ?? '' ) === $plugin['slug'] ) {
			$blueprint['steps'][ $i ] = array(
				'step'       => 'activatePlugin',
				'pluginPath' => $plugin['slug'] . '/' . $plugin['file'],
			);
			$replaced = true;
		}
	}
	if ( ! $replaced ) {
		fail( "wordpress.org/plugins から {$plugin['slug']} を入れる installPlugin ステップが見つかりません" );
	}
	// 検証時だけエラーを表示する。本番用の blueprint には入れない（来訪者に Notice を見せないため）。
	array_unshift( $blueprint['steps'], array(
		'step'   => 'defineWpConfigConsts',
		'consts' => array(
			'WP_DEBUG'         => true,
			'WP_DEBUG_DISPLAY' => true,
		),
	) );
	write_json( $out, $blueprint );
	echo $published
		? "公開版の検証用: {$out}（マウント不要）\n"
		: "ローカル検証用: {$out}（{$plugin['slug']} を /wordpress/wp-content/plugins/{$plugin['slug']} にマウントして使う）\n";
}

$command = $argv[1] ?? '';
$dir     = rtrim( $argv[2] ?? '.', '/' );
if ( ! is_dir( $dir ) ) {
	fail( "ディレクトリがありません: {$dir}" );
}
switch ( $command ) {
	case 'status':
		cmd_status( $dir );
		break;
	case 'init':
		cmd_init( $dir );
		break;
	case 'embed':
		cmd_embed( $dir );
		break;
	case 'check':
		cmd_check( $dir );
		break;
	case 'local':
		if ( empty( $argv[3] ) ) {
			fail( '出力先を指定してください: local <plugin-dir> <out.json>' );
		}
		cmd_local( $dir, $argv[3], in_array( '--published', $argv, true ) );
		break;
	default:
		fwrite( STDERR, "使い方: php blueprint.php {status|init|embed|check|local} <plugin-dir> [out.json]\n" );
		exit( 1 );
}
