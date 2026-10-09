# デモの設計

## コードの読み方

サブエージェントに渡すときは、次の観点で調べさせ、表にまとめさせる。

| 観点 | 探す場所・キーワード | デモで使うもの |
|---|---|---|
| ブロック | `block.json`、`register_block_type` | ブロック名・属性（シリアライズしてページに置く） |
| ショートコード | `add_shortcode` | タグ名・属性 |
| 投稿タイプ・タクソノミー | `register_post_type`、`register_taxonomy` | スラッグ |
| メタ | `update_post_meta`、`register_meta`、メタボックスの保存処理 | メタキー（接頭辞に注意。例 `_tsoh_`） |
| 設定 | `register_setting`、`get_option` | オプション名・値の形式 |
| カスタムテーブル | `dbDelta`、`CREATE TABLE` | 作成タイミング・投入用のモデルクラス |
| モデル・公開 API | `instance()`、`add()`、`create()` など | データを入れるメソッド |
| 管理画面 | `add_menu_page`、`add_submenu_page`、`add_meta_box` | 着地ページの URL |
| ウィジェット | `register_widget` | ブロックテーマでは見せにくいので後回し |

README.md / readme.txt の Description・FAQ・スクリーンショットのキャプションも読む。作者の売りが分かり、シナリオの材料になる。

## シナリオの立て方

「機能の一覧」ではなく「使っている場面」を見せる。1 つの架空の利用者に絞ると、データに一貫性が出る。

- 良い例: 「架空の歯科医院のサイト。診療時間表（○／）と所在地がフロントページに出ている」
- 悪い例: 「サンプル投稿が 3 件と、全ブロックを並べたページ」

シナリオ案を出すときは、次を 1 行ずつ添える。

- 誰の想定か（業種・サイトの種類）
- 着地したとき最初に目に入るもの
- 訪問者がそのあと触れるもの（管理画面のどこか）

## 着地ページ

| 見せたいもの | landingPage | 準備 |
|---|---|---|
| フロントの出力（既定） | `/` | デモ用の固定ページを作り、`show_on_front=page`・`page_on_front=<ID>` |
| 投稿タイプの一覧 | `/wp-admin/edit.php?post_type=<type>` | `login` ステップ |
| 設定画面 | `/wp-admin/options-general.php?page=<slug>` など | `login` ステップ |
| ブロックエディタ | `/wp-admin/post-new.php?post_type=page` | 既存ページの編集は ID が分からないので、新規作成画面か、`/` にしてリンクを置く |

`login` ステップは、着地がフロントでも入れておく。訪問者がそのまま管理画面を触れる。

## demo.php の注意点

- **カスタムテーブル**: `runPHP` は `wp-load.php` を読むので、`plugins_loaded` で作るテーブルは投入時点で存在する。有効化フック（`register_activation_hook`）でしか作らないプラグインは、`installPlugin` の `activate: true` / `activatePlugin` で作られる想定だが、**必ず verify.sh で確かめる**。作られていなければ、demo.php の先頭でプラグインのインストール処理を呼ぶ
- **ブロック**: `<!-- wp:namespace/name {"attr":1} /-->` のコメントで `post_content` に置く。ID を渡す属性は `sprintf()` で埋める。ダイナミックブロックはそのまま描画される
- **マルチバイト**: `○` などの記号や日本語も、`embed` が JSON に UTF-8 のまま入れるので問題ない
- **外部通信**: 地図・oEmbed・外部 API を使うなら `features.networking: true`（雛形の既定）。使わないなら外してもよい
- **テーマ**: 既定テーマ（Twenty Twenty-Five など）で見え方を確認する。特定のテーマが必要なら `installTheme` を足すが、Live Preview が重くなる
- **依存プラグイン**: WooCommerce などが必要なら `installPlugin` を前に足す。`blueprint.php local` は自分のスラッグの `installPlugin` だけを差し替える

## 参考: taro-open-hour

tarosky/taro-open-hour#123 で作った最初の例。`.wordpress-org/blueprints/blueprint.json` を参照。

- 拠点（`location` 投稿）を作り、`_tsoh_` 接頭辞のメタで住所・業種（Dentist）・休診日メモを入れる
- 営業時間は `\Tarosky\OpenHour\Model::instance()->add()` で投入（カスタムテーブル）
- `tsoh_open_mark` / `tsoh_close_mark` で ○／ を設定
- Open Hour ブロックと Business Place ブロックを置いた固定ページをフロントページにして `/` に着地
- 検証: `verify.sh . <out> tsoh-time-table ○ ／ "Sakura Dental Clinic"` → ○ 10 個・／ 4 個
