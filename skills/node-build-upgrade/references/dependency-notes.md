# 依存ごとの注意点

tarosky/sportivo-school（gulp 4 の gulpfile、CommonJS）を Node 14 から 24 に上げたときの組み合わせ。バージョンは 2026-10 時点。作業時は `npm view <package> version` で最新を確認する。

## node-sass / gulp-sass 4 → Dart Sass

node-sass はネイティブモジュールで Node 24 では動かない。gulp-sass 4 以下は node-sass に依存している。

```js
// 変更前（gulp-load-plugins 経由で gulp-sass 4 を読み、node-sass で動いていた）
$ = require( 'gulp-load-plugins' )();
// ...
.pipe( $.sass( { outputStyle: 'compressed', includePaths: [ ... ] } ) )

// 変更後（gulp-sass ^6 + sass）。gulp-sass 5 以上はコンパイラを渡す必要があるため、
// gulp-load-plugins の自動読み込み（$.sass）ではなく明示的に require する
const sass = require( 'gulp-sass' )( require( 'sass' ) );
// ...
.pipe( sass( { style: 'compressed', loadPaths: [ ... ] } ) )
```

オプションは Dart Sass のモダン API の名前にする。

| node-sass | Dart Sass |
|---|---|
| `includePaths` | `loadPaths` |
| `outputStyle` | `style` |

注意:

- 出力 CSS が変わりうる。`@extend` の展開結果、小数の丸め、色の表記が変わることがある。`css_compare.mjs` で必ず比較する
- Dart Sass は `@import` やグローバル関数（`/` での除算など）に非推奨警告を出す。Bootstrap 4 / 5 を使っている限り警告はなくならない。警告を消さず、対応は Issue にする
- `fibers` は不要になるので削除する

## webpack 4 → 5

webpack 4 は Node 17 以上で `ERR_OSSL_EVP_UNSUPPORTED` で止まる。webpack-stream 6 以下は webpack 4 を内包しているため、一緒に上げる。

sportivo-school での組み合わせ:

- webpack ^5
- webpack-stream ^7（`require( 'webpack-stream' )` に `require( 'webpack' )` を渡す）
- babel-loader ^9
- terser-webpack-plugin ^5（`uglifyjs-webpack-plugin` の代わり）

```js
const TerserPlugin = require( 'terser-webpack-plugin' );
// ...
optimization: {
	minimizer: [ new TerserPlugin( { extractComments: false } ) ],
},
```

`extractComments: false` がないと、ライセンスコメントが `*.LICENSE.txt` として別ファイルに出力され、zip の中身が変わる。

## gulp-imagemin / imagemin-*

8 以上は ESM 専用で、CommonJS の gulpfile から `require` できない。imagemin 系のネイティブバイナリも環境によって壊れやすい。

- まず、画像最適化のタスクがビルドに含まれているかを確認する。含まれている場合、削除すると **画像の最適化がなくなる**（機能が減る）ので、止まってユーザーに確認する
- sportivo-school では `build` タスクに含まれていた（`assets/images` を最適化して `dist/images` に出力）。ユーザーと相談のうえ削除し、代替は検討事項として残した
- 代替が必要な場合は `sharp`（ラスター画像）と `svgo`（SVG）を直接使う方法を検討する。これは別 Issue にする

## gulp-stylelint

更新が止まっている。stylelint の Node API を gulpfile から直接呼ぶ。

sportivo-school（stylelint 14）での書き方:

```js
const stylelint = require( 'stylelint' );

gulp.task( 'stylelint', function () {
	return stylelint.lint( {
		files: './assets/scss/**/*.scss',
		formatter: 'string',
	} ).then( function ( result ) {
		if ( result.output ) {
			console.log( result.output );
		}
	} );
} );
```

- このままでは lint エラーがあっても終了コード 0 になる（`silent-failures.md` 参照）。失敗させるには `result.errored` を見て例外を投げる。sportivo-school ではエラーの扱いを別 Issue にしたため、まだ失敗させていない
- stylelint 16 以降は、整形済みの結果が `result.output` ではなく `result.report` に入る。バージョンに合わせる

## gulp 3

新しい Node では `primordials is not defined` で動かない。gulp 4 に上げ、タスク定義を `gulp.series` / `gulp.parallel` に書き換える。タスク構成の変更が大きい場合は、wp-build-setup スキルの構成（npm scripts + sass CLI + grab-deps）への移行を検討する。その場合は移行自体を別の判断としてユーザーに確認する。

## @wordpress/scripts

メジャーごとに対応する Node の範囲がある。最新メジャーの `engines` を確認する。

```bash
npm view @wordpress/scripts engines
```
