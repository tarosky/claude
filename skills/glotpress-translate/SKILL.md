---
name: glotpress-translate
description: Translate WordPress plugin/theme PO files from GlotPress (translate.wordpress.org). Downloads PO files, translates untranslated strings with AI, and outputs translated PO for import.
allowed-tools: WebFetch, Bash(curl *), Bash(mkdir *), Read, Write, AskUserQuestion
---

# GlotPress Translation Skill

WordPress.org の GlotPress から PO ファイルをダウンロードし、未翻訳部分を AI で翻訳するスキル。

## 使い方

```
/glotpress-translate <plugin-slug> [language-code] [output-dir]
```

例：
- `/glotpress-translate` - カレントディレクトリ名をスラッグとして日本語に翻訳
- `/glotpress-translate ja ~/Downloads` - 出力先を指定
- `/glotpress-translate de` - ドイツ語に翻訳
- `/glotpress-translate ja ./languages other-plugin` - 別のプラグインを指定

## 引数

- `$0` - 言語コード（省略時: `ja`）
- `$1` - 出力ディレクトリ（省略時: `./languages`）
- `$2` - プラグインスラッグ（省略時: カレントディレクトリ名）

## 前提条件

- プラグインのメインファイルに `Text Domain` と `Domain Path` ヘッダーが記述されていること。
- `plugins_loaded` フックで `load_plugin_textdomain()` が呼び出されていること。
- これらが未設定の場合、先に `wp-i18n-setup` スキルを実行して翻訳インフラを構成してください。

---

## 実行手順

### Step 1: 引数の確認

以下の変数を決定する:

| 変数 | 決定方法 |
|------|----------|
| `{SLUG}` | `$2` があればそれを使用、なければ `basename $(pwd)` |
| `{LANG}` | `$0` があればそれを使用、なければ `ja` |
| `{OUTPUT_DIR}` | `$1` があればそれを使用、なければ `./languages` |

**前提** 

1. カレントディレクトリがプラグインのローカルリポジトリであること。
2. languagesを使う場合、そのディレクトリが `.gitignore` に含まれていること。

### Step 2: PO ファイルのダウンロード

**エクスポート URL:**

| 種類 | URL |
|------|-----|
| Dev (コード) | `https://translate.wordpress.org/projects/wp-plugins/{SLUG}/dev/{LANG}/default/export-translations/?format=po` |
| Dev (README) | `https://translate.wordpress.org/projects/wp-plugins/{SLUG}/dev-readme/{LANG}/default/export-translations/?format=po` |

1. 出力ディレクトリを作成
2. curl で PO ファイルをダウンロード
3. ユーザーにコード翻訳・README翻訳のどちらを行うか確認

※ dev への翻訳は stable にも反映される

### Step 3: 未翻訳文字列の抽出

PO ファイルを解析し、`msgstr ""` が空の項目（未翻訳）を抽出。

```
#: path/to/file.php:123
msgid "Original English text"
msgstr ""
```

複数形（plural）の場合：
```
msgid "One item"
msgid_plural "%d items"
msgstr[0] ""
msgstr[1] ""
```

### Step 4: AI 翻訳

未翻訳の各 msgid に対して翻訳を提案。

**翻訳ルール:**
- `%s`, `%d`, `%1$s` などのプレースホルダーはそのまま保持
- HTML タグ (`<a>`, `<strong>` など) は保持
- WordPress 公式用語に従う（Settings → 設定、Posts → 投稿）
- 複数形は日本語では通常同じ訳（`msgstr[0]` と `msgstr[1]` が同一）
- **文脈が不明な場合は AskUserQuestion で確認**

### Step 5: 翻訳のレビュー

翻訳結果を一覧表示：

```
[1] msgid: "Original text"
    訳: "翻訳テキスト"
    ✓ OK

[2] msgid: "Ambiguous text"
    訳: "あいまいなテキスト"
    → 確認が必要
```

修正が必要な場合は番号で指定してもらう。

### Step 6: PO ファイルの更新

翻訳が確定したら、元の PO ファイルを更新して保存：

- `{OUTPUT_DIR}/{SLUG}-{LANG}.po` (コード翻訳)
- `{OUTPUT_DIR}/{SLUG}-{LANG}-readme.po` (README 翻訳)

例: `./languages/anyway-feedback-ja.po`

### Step 7: インポート URL の提示

**インポート URL（PTE 権限が必要）:**

```
コード:
https://translate.wordpress.org/projects/wp-plugins/{SLUG}/dev/{LANG}/default/import-translations/

README:
https://translate.wordpress.org/projects/wp-plugins/{SLUG}/dev-readme/{LANG}/default/import-translations/
```

※ dev への翻訳は stable にも自動反映される

ユーザーに以下を案内：
1. 上記 URL にアクセス（WordPress.org にログイン済みであること）
2. 翻訳済み PO ファイルをアップロード
3. インポート設定を確認して実行

---

## WordPress 翻訳用語集（日本語）

よく使う用語の公式訳：

| English | 日本語 |
|---------|--------|
| Settings | 設定 |
| Posts | 投稿 |
| Pages | 固定ページ |
| Comments | コメント |
| Dashboard | ダッシュボード |
| Plugins | プラグイン |
| Themes | テーマ |
| Users | ユーザー |
| Media | メディア |
| Permalink | パーマリンク |
| Excerpt | 抜粋 |
| Featured Image | アイキャッチ画像 |
| Widget | ウィジェット |
| Shortcode | ショートコード |
| Taxonomy | タクソノミー |
| Term | タームまたは項目 |
| Slug | スラッグ |
| Meta | メタ |
| Hook | フック |
| Filter | フィルター |
| Action | アクション |
| Capability | 権限 |
| Role | 権限グループ |
| Nonce | ノンス |
| Transient | トランジェント |

不明な用語は https://translate.wordpress.org/locale/ja/default/glossary/ を参照。
