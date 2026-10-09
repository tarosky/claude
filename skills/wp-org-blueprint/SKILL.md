---
name: wp-org-blueprint
description: "WordPress.org のプラグインページに Live Preview（WordPress Playground）を出すための blueprint.json を、対話でデモの見せ場を決めて作る。プラグインのコードを読んでシナリオを提案し、デモデータの量・時刻依存・外部依存から作り方を決めて runPHP で投入し、ローカルの Playground で動作確認してから .wordpress-org/blueprints/ に置く。「Live Preview を付けたい」「Playground でデモを見せたい」「blueprint を作りたい」ときに使用する。"
compatibility: "PHP CLI と Node.js 20.18 以上（@wp-playground/cli を npx で一時実行。グローバルインストールはしない）。WordPress.org への公開は 10up/action-wordpress-plugin-deploy の assets 同期を前提とする。"
---

# WordPress.org Live Preview（blueprint）作成

WordPress.org では、SVN の `assets/blueprints/blueprint.json` に blueprint を置くと、プラグインページに **Live Preview** ボタンが出て、インストールせずに Playground で試せる。インストール数の少ないプラグインほど「試してもらう」までの障壁を下げる効果が大きい。

blueprint 作りの手間の大半は **デモデータの設計**。見せ場はプラグインごとに違うので、雛形をコピーして終わりにせず、コードを読んでユーザーと決める。

## 成果物

| パス | 役割 |
|---|---|
| `.wordpress-org/blueprints/blueprint.json` | 本番用。WordPress.org の公開版をインストールしてデモを作る |
| `.claude/wp-org-blueprint/demo.php` | デモデータ投入コードのマスター。編集したら `embed` で blueprint.json に埋め込む |

`demo.php` を別ファイルにする理由: blueprint の `runPHP` は JSON 文字列なので、手でエスケープすると壊れやすく、差分も読めない。`.claude/` は配布物から除外され、リポジトリにはコミットされるので、ソース置き場に向いている（`wp-org-assets` の banner.html と同じ方針）。

スクリプト（`<skill>` はこのスキルのディレクトリ）:

- `php <skill>/scripts/blueprint.php {status|init|embed|check|local} <plugin-dir>` — 状態確認・雛形作成・埋め込み・一致確認・検証用コピー作成
- `bash <skill>/scripts/verify.sh <plugin-dir> <out-dir> [期待する文字列...]` — ローカルの Playground で実行し、所要時間と着地ページを確認する（`PUBLISHED=1` で公開版を使う、`KEEP_RUNNING=1` でサーバーを残す）

スラッグがディレクトリ名と違う場合（worktree など）は、どちらも `WP_ORG_SLUG=<slug>` を付けて実行する。

## 手順

### 0) 前提の確認

- プラグインのリポジトリのルートで作業する。デフォルトブランチにいたら作業ブランチを切る
- `php <skill>/scripts/blueprint.php status .` で次を確認し、ユーザーに要約して伝える
  - `published_version`: WordPress.org の公開版。`null` なら未公開で、Live Preview はまだ使えない（blueprint だけ先に作っておくことはできる）
  - `local_version`: タロスカイのプラグインはヘッダーが `nightly` や `%nightly%` のことが多い。その場合は最新タグや Changelog と見比べる
  - `published_blueprint`: すでに公開済みの blueprint があれば、作り直しか改善かをユーザーに確認する
  - `deploy_workflows`: `action-wordpress-plugin-deploy` があれば、`.wordpress-org/` はサブディレクトリごと SVN の assets に同期されるので、deploy.yml の変更は不要。`ASSETS_DIR` が既定と違えば、その場所に置く。**`assets のみ即時更新` のワークフローがある場合**は、blueprint がリリース前に公開されうる（手順 5 参照）
- `.distignore` に `.wordpress-org` と `.claude` が入っているか確認する（配布 zip に混ざらないように）

### 1) コードを読んで、見せられるものを洗い出す

コードを読むのは Explore サブエージェントに任せてよい。調べる観点と、結果のまとめ方は `references/demo-design.md` の「コードの読み方」を参照。最低限、次をそろえる。

- 見せ場の候補: ブロック、ショートコード、フロントの出力、管理画面、設定
- デモデータを入れる手段: 公開 API・モデルクラス・メタキー・オプション名
- カスタムテーブルが作られるタイミング（`plugins_loaded`、有効化フックなど）

README.md / readme.txt の Description とスクリーンショットのキャプションも読む。作者がそのプラグインで何を売りにしているかが分かる。

### 2) 誰に何を見せるかを決める（対話）

`AskUserQuestion` で次を順に決める。いきなり作り始めない。

1. **見せられない機能を先に伝える**: API キー・AI サービス・メール・決済など外部に依存する機能は Playground では動かない。プラグインの売りがそこにあるなら、代わりに何を見せるかから話す（`references/data-strategy.md` の「外部依存のある機能は見せられない」）
2. **誰に見せるか・何に驚いてほしいか**: 洗い出した候補をもとに、具体的なシナリオを 2〜3 案出す。例: taro-open-hour では「架空の歯科医院の診療時間表（○／マーク）と所在地を、ブロックで置いたページ」、hamelp では「架空のノートアプリのヘルプセンター。40 件の FAQ をカテゴリ分けし、検索ボックスで引ける」
3. **データの作り方**: シナリオのデータを、量・時間・メディア・外部依存の 4 つの軸で分類し、作り方（直接書く／ループ生成／プラグインにデモ生成の仕組みを同梱／WXR）を決める。判断基準と実測値は `references/data-strategy.md`。件数と、現在時刻に依存するデータの有無は、必ずユーザーと確認する
4. **着地ページ**: 既定はフロントページ（`landingPage: "/"`）。投稿 ID は事前に分からないので、デモ用の固定ページを `page_on_front` にする。管理画面（設定画面・一覧・ブロックエディタ）を見せたい場合の選択肢は `references/demo-design.md` の「着地ページ」
5. **デモデータの言語**: 既定は英語（WordPress.org の訪問者は世界中にいる）。日本向けのプラグインなら日本語＋`setSiteLanguage` も選択肢

決まったシナリオは、作業ログとしてユーザーに 3〜5 行で復唱してから実装に進む。

### 3) demo.php を書いて埋め込む

```bash
php <skill>/scripts/blueprint.php init .     # 雛形（既存なら何もしない）
# .claude/wp-org-blueprint/demo.php を編集
php <skill>/scripts/blueprint.php embed .    # demo.php → blueprint.json
```

blueprint.json の `meta`（title・description・categories）と `preferredVersions` も埋める。`preferredVersions.php` は、プラグインの Requires PHP 以上で、現行の安定版（既定 8.2）にする。

demo.php を書くときの原則（詳しくは `references/demo-design.md` と `references/data-strategy.md`）:

- 先頭で `require '/wordpress/wp-load.php';`。WordPress がロードされるので `plugins_loaded` 等は発火済み
- 雛形の `wp_set_current_user( 1 );` は消さない。runPHP はログインユーザー無しで動き、権限チェックのある処理（`tax_input` など）がエラー無しで無視される
- **プラグインの公開 API・モデルを使って投入する。** SQL を直接書かない（テーブル構造の変更で壊れやすい）
- ID は決め打ちせず、`wp_insert_post()` などの戻り値を使う
- データは架空のもの（example.com、架空の店名・住所）。実在の人物・企業を使わない
- 現在時刻に依存するデータ（日付・期限・予定）は `time()` からの相対で作る。固定の日付は数か月後に壊れる
- 生成するときは乱数のシードを固定し、まとめて入れるときはトランザクションと件数更新の保留で高速化する
- 見せ場に必要な量だけにする。Playground は訪問者のブラウザで動くので、重いと離脱される。demo.php の実行時間は数秒以内が目安

### 4) ローカルの Playground で検証する

ビルドが必要なプラグイン（composer / npm）は、**先にビルドしておく**（マウントしたコードがそのまま動くため）。

```bash
bash <skill>/scripts/verify.sh . <scratchpad>/verify "期待する文字列1" "期待する文字列2"
```

- 本番用 blueprint のうち、プラグインのインストール手順だけを「ローカルコードのマウント＋`activatePlugin`」に差し替えた一時コピーで実行する。本番用ファイルは変更しない
- 検証用コピーには `WP_DEBUG` / `WP_DEBUG_DISPLAY` を足してあるので、PHP エラーは画面とログに出る。`runPHP` の Fatal error は `/internal/eval.php:31` のように出る。この行番号は demo.php の行番号
- 期待する文字列には、デモデータが出力されたことを示すもの（ブロックの CSS クラス、架空の店名、マークの記号など）を選ぶ
- 着地ページが管理画面の場合も、`login` ステップがあれば Cookie で自動ログインするので確認できる
- 「Playground 起動〜blueprint 完了」の秒数が出る。空のデモで 10〜12 秒なので、その差がデモデータのコスト
- **着地ページの文字列だけで済ませない。** 件数・カテゴリとの関連付け・日付は、`KEEP_RUNNING=1` で起動したまま REST API で確かめる（手順は `references/data-strategy.md` の「落とし穴」）。ユーザーに目視してもらうときも `KEEP_RUNNING=1` で URL を渡す

失敗したら demo.php を直して `embed` → `verify.sh` を繰り返す。成功したら `blueprint.php check .` で埋め込み漏れが無いことを確認する。

公開版がすでに blueprint の依存する機能を含んでいる場合は、`PUBLISHED=1 bash <skill>/scripts/verify.sh ...` で**本番どおり（WordPress.org からインストール）**にも実行して確認する。

### 5) 公開版との差を確認する

blueprint は WordPress.org の**公開版**をインストールする。demo.php が使う関数・クラス・ブロック・オプションが公開版に無ければ、Live Preview は壊れる。

- 公開版のタグ（`git show <tag>:path`）で、demo.php が使う API の有無を確認する。`PUBLISHED=1` の検証が通ればそれで確認済み
- 公開版に無い場合は、ユーザーに**警告**し、次を案内する
  - 通常のリリースフロー（タグ → deploy.yml）なら、assets もリリースと同時に同期されるので問題ない。blueprint はリリースまでマージを待つか、リリースに含める
  - assets のみ即時更新するワークフローがある場合は、マージした時点で壊れた Live Preview が出る（コミッターにだけ見える状態でも、テストにならない）。リリース後にマージする

### 6) コミットと PR

- blueprint.json と demo.php を一緒にコミットする（`verify.sh` が通っていればコミットしてよい）
- PR を作るときは、本文にデモのシナリオ、検証の結果（`verify.sh` の OK 行）、公開版との差の有無を書く

### 7) 最後に必ず伝えること（リポジトリ外の作業）

作業の最後に、次をユーザーに**必ず**伝える。

- **Live Preview を一般公開するには、コミッターが WordPress.org のプラグイン管理画面（Advanced タブ）で Preview を public に切り替える必要がある。** それまでは Live Preview ボタンはコミッターにしか表示されない
- 切り替える前に、コミッター向けの **Test Preview** で、実際の Playground でデモが動くことを確認する
- blueprint が SVN に反映されるのは、デプロイ（通常はリリース）のとき。反映前に管理画面を見ても変化は無い

## 範囲外

- PR ごとの Playground プレビュー（tarosky/workflows の playground-preview-build.yml / playground-preview-publish.yml で対応済み）
- CI での blueprint 検証（tarosky/workflows 側にある）
- スクリーンショット撮影、アイコン・バナー（`wp-org-assets` スキル）
