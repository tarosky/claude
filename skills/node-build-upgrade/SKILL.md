---
name: node-build-upgrade
description: "既存リポジトリの JS/CSS ビルドを Node 24 で動くようにする。変更前のビルド結果を保存し、依存パッケージを更新し、変更前後の CSS を宣言単位で比較し、リリース zip の中身まで確認する。gulp / webpack 4 / node-sass など古いビルド構成のテーマ・プラグインを Node 24 に上げたいとき、ビルドの Node が未指定のリポジトリに Node を指定したいときに使用する。"
compatibility: "package.json を持つリポジトリ。gh（GitHub CLI、認証済み）、Node.js 24、旧 Node を一時的に実行できるバージョンマネージャー（mise / nvm / volta など）があると、変更前のビルドを再現できる。"
---

# Node Build Upgrade

## このスキルの考え方

ビルドの Node を上げる作業で一番危ないのは、**ビルドが通ったのに出力が変わっている** ことと、**失敗しているのに成功に見える** こと。依存の更新そのものより、次の 2 つに時間を使う。

1. 変更前の出力を保存し、変更後と比べる（CSS は宣言単位、リリース zip は中身）
2. 「設定されているのに効いていない」箇所を探す（`references/silent-failures.md`）

tarosky/sportivo-school（gulp + webpack 4 + node-sass 系、Node 14 → 24）での作業がもとになっている。

## スコープ

**この PR に含めるもの**

- Node の指定（`.node-version`、`engines`、workflow の `setup-node`）
- Node 24 でビルドを通すために必要な依存の更新・削除と、それに伴うビルド設定の変更
- `package-lock.json` のコミットと `npm ci` への切り替え
- GitHub Actions の更新（`gha-actions-upgrade` スキルの手順で行う）
- README の Node / ビルド手順の記述

**含めないもの**（見つけたら Issue の下書きを作る）

- lint エラーの修正、lint の挙動の変更
- フレームワークの移行（Bootstrap のメジャー更新、Sass のモジュールシステム化など）
- PHP / Composer の変更。ただし CI が通らない原因になっている場合は、**別の PR** で先に直す
- 使われていないファイルの削除、`.distignore` の整理、README のビルド以外の部分
- PHPUnit のバージョン（WordPress のテストスイートが対応バージョンを縛るため、別途判断する）

迷ったら「Node 24 でビルドとテストを通すのに必要か」で判断する。必要でなければ Issue にする。

## 手順

### 0) 現状を調べる

```bash
node ~/.claude/skills/node-build-upgrade/scripts/detect_node.mjs --path=<repo>
node ~/.claude/skills/gha-actions-upgrade/scripts/detect_actions.mjs --path=<repo>
gh run list --limit 10
gh release list --limit 5
```

`detect_node.mjs` の見方:

- `node.lowestMajor` / `node.pinned`: 今の Node。`pinned: false` は、ビルドがその時インストールされている Node で動いているということ
- `blockers`: Node 24 で動かない依存と対応の方針
- `frameworks`: 依存の更新範囲を決めるもの（次の手順）
- `hints`: 「効いていない」可能性がある箇所。手順 5 で一つずつ確認する

デフォルトブランチの CI がすでに失敗している場合は、原因を確認してユーザーに報告する。今回の変更と関係ない失敗なら、別 PR で先に直すか、Issue にして進めるかをユーザーが決める。

### 1) ブロッカーを先に確認する

依存を更新する前に、**フレームワーク側が何に対応しているか** を確認する。ここで更新範囲が決まる。

- Bootstrap / 親テーマ / Sass のバージョンの組み合わせを確認する。例: Bootstrap 5.3 は Sass の `@import` を使っているため、Dart Sass の `@use` への移行はできない。Dart Sass を上げると非推奨警告が大量に出るが、それは Node 24 化のブロッカーではない
- 親テーマなど **リポジトリの外** のファイルをビルドで参照していないか（`hints` の `outside-repo-path`）。参照している場合、CI ではビルドできない。比較の基準は親テーマがある環境で作る
- gulpfile が CommonJS（`require`）の場合、ESM 専用になったパッケージは使えない。最新メジャーが ESM 専用かどうかを確認する

フレームワークの移行が必要と分かったら、**止まってユーザーに確認する**。この PR では移行せず、Issue にする。

### 2) 変更前の出力を保存する（ベースライン）

変更を始める前に必ず行う。あとから作ることはできない。

```bash
mkdir -p /tmp/baseline
```

基準にするものを、優先順に 1 つ選ぶ:

1. **ビルド結果がコミットされている場合**（`hints` の `committed-build`）: HEAD のファイルをそのまま使う
   ```bash
   git show HEAD:dist/css/style.css > /tmp/baseline/style.css
   ```
2. **旧 Node でビルドできる場合**: 今の Node 指定でビルドする
   ```bash
   mise exec node@14 -- npm install && mise exec node@14 -- npm run build
   cp -r dist /tmp/baseline/
   ```
3. **どちらもできない場合**: 最新リリースの zip を基準にする
   ```bash
   gh release download --pattern '*.zip' --dir /tmp/baseline
   ```

あわせて、最新リリース zip の中身の一覧を保存する（手順 6 で使う）。

```bash
gh release download --pattern '*.zip' --dir /tmp/baseline/release
unzip -l /tmp/baseline/release/*.zip | awk '{print $4}' | sort > /tmp/baseline/zip-files.txt
```

### 3) Node を指定する

- `.node-version` に `24` と書く（なければ作る）。`.nvmrc` があれば同じ値にそろえるか、片方に寄せる
- `package.json` に `engines.node` があれば `24.x` にする
- workflow の `setup-node` は `node-version-file: '.node-version'` で読む（手順 7）

### 4) 依存を更新する

Node 24 で `npm install` → ビルドが通るまで、`blockers` から順に直す。

**更新の基準**

1. 最新メジャーがビルド構成で使えて（CommonJS の gulpfile から読めるなど）、出力が同等なら、最新メジャーに上げる
2. 使えない場合、使われていなければ削除する。使われている場合（ビルドに含まれている）は、削除すると機能が減るので止まってユーザーに確認する（例: imagemin。sportivo-school では build に含まれていたが、相談のうえ削除した）
3. どちらもできなければ、今のバージョンを残して Issue にする（例: Bootstrap）

**依存ごとの注意点** は `references/dependency-notes.md` を参照。

- ビルドに関係ない依存（jQuery、Bootstrap などの実行時ライブラリ）は、この PR では変えない
- Sass の非推奨警告を `quietDeps` / `silenceDeprecations` で消さない。警告は見える状態にしておく
- `package-lock.json` を `.gitignore` から外してコミットする。ビルドスクリプト（`bin/build.sh` など）の `npm install` は `npm ci` にする

### 5) 「効いていない」設定を確認する

`references/silent-failures.md` のチェックリストを一つずつ確認する。`hints` に出たものは必ず確認する。

特に、**ビルドが本当に成功したか** は次で確かめる。終了コード 0 だけでは不十分。

```bash
rm -rf dist && npm run build; echo "exit=$?"
ls -la dist/css dist/js   # 全ファイルが今作られたか（更新時刻）
```

見つけたものは、Node 24 化に必要なら直し、そうでなければ Issue にする。

### 6) 変更前後を比較する

**CSS**: 宣言単位で比較する。圧縮の有無、色の表記、小数の桁、セレクタの並び順の違いは無視される。

```bash
node ~/.claude/skills/node-build-upgrade/scripts/css_compare.mjs /tmp/baseline/style.css dist/css/style.css --postcss-from=<repo>
```

- 終了コード 0 なら差分なし
- 差分は **一つずつ原因を説明できること**。説明できない差分が残ったら止まってユーザーに確認する
- 許容してよい差分の例（sportivo-school で実際に出たもの）:
  - autoprefixer の更新で、不要になったベンダープレフィックス（`-webkit-clip-path` など）が消えた
  - Dart Sass の `@extend` の展開結果が変わり、セレクタが増減した

**JS**: バンドラーが変わるとバイト単位では一致しないので、出力ファイル名の一覧が同じか、サイズが極端に変わっていないかを確認する。ローカル環境があれば、ブラウザのコンソールにエラーが出ないかを見る。

**リリース zip**: `bin/build.sh` など、リリースと同じ手順で zip を作り、中身を比べる。

```bash
unzip -l <new>.zip | awk '{print $4}' | sort > /tmp/new-zip-files.txt
diff /tmp/baseline/zip-files.txt /tmp/new-zip-files.txt
```

`package-lock.json`、`.node-version`、`node_modules` など、開発用のファイルが zip に入っていないこと。入る場合は `.distignore` などの除外設定を確認する（直すのは別 PR）。

### 7) GitHub Actions を更新する

`gha-actions-upgrade` スキルの手順に従う。このスキルでは加えて:

- `setup-node` の `node-version: 12` などの直書きを `node-version-file: '.node-version'` に変える
- CI のビルドが、ローカルと同じコマンド（`npm ci` → ビルド）になっているか確認する

### 8) README を更新する

Node のバージョンとビルド手順（`npm ci`、必要な前提ディレクトリなど）だけを直す。ほかの記述は変えない。

### 9) PR を作る

コミットを分ける:

1. Node の指定と依存・ビルド設定の変更
2. GitHub Actions の変更
3. README の変更

PR 本文に入れるもの:

- Node: 変更前 → 24
- 依存の変更表（パッケージ / 変更前 / 変更後 / 理由）。削除したものは、使われていないことをどう確認したか
- **比較結果**: CSS の差分と、その一つずつの説明。zip の中身の差分
- GitHub Actions の検証表（`gha-actions-upgrade` の形式）
- スコープ外として起票した Issue の一覧

自分でマージしない。リリースとデプロイはユーザーが行う。

## 止まってユーザーに確認する場面

- フレームワークの移行が必要と分かった（手順 1）
- 使われているかもしれない依存を削除する
- CSS の差分に説明できないものがある
- デフォルトブランチの CI が今回と関係ない理由で失敗している
- `Requires at least` / `Requires PHP` など、最低動作バージョンを上げたくなった（サーバーのバージョンを確認してからでないと、WordPress がアップロードを拒否する）
- リリース・ステージングでの表示確認・本番デプロイ。これらは常にユーザーが行う

## 複数リポジトリで使う場合

1 リポジトリずつ進める。リポジトリごとにビルド構成が違い、壊れ方も違う。同じ構成（gulp + webpack 4 の子テーマなど）が続く場合は、前のリポジトリで分かった依存のバージョンの組み合わせを使ってよいが、比較（手順 6）は毎回行う。
