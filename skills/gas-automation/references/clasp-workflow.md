# clasp モード — 空ディレクトリから動くところまで

Claude がコードを書いて `clasp` で Google に送り、人間は**ログインと権限承認だけ**をする進め方。
コマンドは clasp 3.x の名前で書く（2.x の `create` / `deploy` / `open` とは名前が違う）。

## 前提

- Node 22 以上（`scripts/check_env.sh` で確認済みであること。clasp の README の要件に合わせている）
- グローバルインストールはしない。毎回 `npx -y @google/clasp@3 ...` で呼ぶ
  - `-y`：Claude の実行環境は対話できないので、初回ダウンロードの確認で止まらないようにする
  - `@3`：メジャー版を固定する（2.x → 3.x でコマンド名が変わった前例がある）
  - Claude の実行環境で `npx` にパスが通っていない場合は、`check_env.sh` が返した `npx_path` をフルパスで使う

以下、`CLASP` は `npx -y @google/clasp@3` を指す。

## 1) Apps Script API を有効にする（1回だけ・人間の作業）

本人に次を開いてもらい、**「Google Apps Script API」をオン**にしてもらう：

https://script.google.com/home/usersettings

これを忘れると、後の `create-script` や `push` が次のようなエラーで失敗する：

> User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings then retry.

オンにした直後は反映に数分かかることがある。エラーが続く場合は少し待って再実行する。

## 2) ログイン（1回だけ・人間の作業）

**ログインは本人に実行してもらう。** ブラウザでの許可を待ち続けるコマンドなので、Claude が実行すると止まる。本人に Claude Code の入力欄で次を打ってもらう（先頭の `!` で本人の操作として実行される）：

```bash
! npx -y @google/clasp@3 login
```

ブラウザが開くので、**会社のGoogleアカウント**でログインし、権限を許可してもらう。認証情報は `~/.clasprc.json` に保存され、以後は不要。

**押してもらう前に伝えること**：ドライブ・Apps Script・ログなど、たくさんの権限が並んだ画面が出る。これは「このパソコンから自分の Apps Script を作って送るため」の許可で、ログイン情報はこのパソコンの中（`~/.clasprc.json`）にだけ残る。

- ブラウザが自動で戻らない場合：`! npx -y @google/clasp@3 login --no-localhost` で、表示されたコードを貼り付ける方式にする
- `check_env.sh` の `clasp_logged_in` はログイン情報のファイルがあるかしか見ていない。期限切れなどで後のコマンドが認証エラーになったら、もう一度ログインしてもらう
- **`Error 400: admin_policy_enforced`**（「組織のポリシーによりアクセスが制限されています」）が出た場合：
  Workspace 管理者が外部アプリを制限している。**本人では解決できない**。
  → 管理者への依頼文（「clasp（Google公式のApps Script用ツール）のOAuthアクセスを許可してほしい」）を出力し、
    今回は `gui-fallback.md` の GUI 手順に切り替える

## 3) プロジェクトを作る

**結果をシートに書く・シートのデータを使うなら、きっかけが Gmail や時間でも「シート起点」で作る**（シートに紐づいたスクリプト）。シートを使わないときだけスクリプト単体にする。コードはどちらも `src/` に置く。

**シート起点・新しいシートを作る** — シートごと新規作成される：

```bash
CLASP create-script --type sheets --title "〇〇管理" --rootDir src
```

**シートを使わない（Gmail の仕分けだけ、通知だけ、など）** — 独立したスクリプトを作る：

```bash
CLASP create-script --type standalone --title "〇〇自動化" --rootDir src
```

作成後、表示されたURL（シートとスクリプト）を本人に伝える。カレントに `.clasp.json`、`src/` に `appsscript.json` ができる。

### 既存のシート・フォームに付けたい場合

本人がすでにシートを持っているなら、シートのURLの `/d/` と `/edit` の間（ファイルID）を聞き、`--type` は付けずに `--parentId` で作る：

```bash
CLASP create-script --parentId <シートのファイルID> --title "〇〇自動化" --rootDir src
```

**Googleフォームがすでにある場合**は、スクリプトは**フォームではなく回答先のシート**に付ける：

1. 本人にフォームの編集画面 →「回答」タブ →「スプレッドシートにリンク」を押してもらう（リンク済みなら「スプレッドシートで表示」）
2. 開いたシートのURLからファイルIDを聞き、上のコマンドで作る
3. 送信時の処理は `triggers.md` の「フォーム送信時の処理」に従う

### 置き場所の移動（利用形態②の原本・③の場合）

作成されたシートは本人のマイドライブにできる。`usage-patterns.md` に従い、②の原本・③は**共有ドライブへ移動**してもらう（ドライブでファイルを右クリック → 整理 → 移動）。紐づいたスクリプトも一緒に移動する。

- フォームがある場合は、**フォームも**移動する
- 権限やポリシーで移動できないことがある。③で最初から共有ドライブにフォームやシートを作れるなら、そちらの方が安全（作ったシートのIDを `--parentId` に渡す）

## 4) コードを書く

Claude が `src/` にファイルを書く。構成の目安：

```
src/
  appsscript.json   # timeZone を "Asia/Tokyo" にする
  main.js           # 本体の処理
  setup.js          # トリガーを張る setup() / 外す teardown()（triggers.md）
```

`appsscript.json` の最小形：

```json
{
  "timeZone": "Asia/Tokyo",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

## 5) 送る（push）

```bash
CLASP push --force
```

- **`--force` は必須。** `appsscript.json` を含む push では上書き確認が出るが、Claude の実行環境は対話できないため、確認に答えられず「Skipping push.」と表示して**何も送らずに正常終了**してしまう
- 出力に `Pushed N files`（変更が無ければ `Script is already up to date.`）が出たことを必ず確認する。どちらも出ていなければ送れていない

## 6) 動かして確かめる（人間の作業）

```bash
CLASP open-script
```

エディタが開くので、本人に：

1. 左のファイル一覧で、実行したい関数が入ったファイル（例 `main.gs`）を**先に開く**。上部の関数選択には、開いているファイルの関数しか出てこない
2. 関数選択で `main`（またはテスト用関数）を選び、**実行** を押す
3. 初回は「承認が必要です」→ アカウントを選ぶ →（警告が出たら「詳細」→「（安全ではないページ）に移動」）→ **許可**
   - 自分で作ったスクリプトなので問題ないことを**先に**伝えておく（警告画面で不安になる人が多い）
   - Gmail を使う場合、「メールの閲覧・作成・送信・完全な削除」のような強い文言が出る。Gmail を扱う権限はまとめてこの表示になるだけで、**コードに書いたこと以外はしない**と伝える
4. 下の **実行ログ** に結果やエラーが出る。エラーが出たらその文面を貼ってもらう

**初回の確認で0件にならないようにする**：メールやデータを探す処理は、最初の確認だけ範囲を広げる（例 `newer_than:7d` → `newer_than:90d`）。0件では正しく動いたか確かめられない。確認できたら元に戻す。

トリガーで動いて失敗した場合は、Google から**トリガーを張った人にエラー通知のメール**が届く。本人に「失敗したらメールで分かる」と伝えておく。

> `clasp run-function` は使わない。自前の OAuth クライアント設定が必要で、ノーコーダー向けではない。

シートを開くには `CLASP open-container`。

## 7) トリガーを張る

`triggers.md` の `setup()` を、手順6と同じ要領でエディタから1回実行してもらう。

## 8) Web画面にする場合（簡易UIが要るとき）

`doGet()` と HTML を書いて push したあと：

```bash
CLASP create-version "初版"
CLASP create-deployment --versionNumber 1 --description "初版"
CLASP list-deployments
```

- アクセスできるユーザーの設定は `appsscript.json` の `webapp` で指定する（`"access": "DOMAIN"` で社内のみ、`"executeAs": "USER_DEPLOYING"`）
- 公開URLを開くには `CLASP open-web-app`
- 更新時は `create-version` → `update-deployment <デプロイID>` でURLを維持したまま差し替える

## Git で管理する場合

- `.clasp.json`（scriptId が入っているだけで秘密情報ではない）と `src/` はコミットしてよい
- `~/.clasprc.json`（ログイン情報）はホームにあり、リポジトリには入らない。**絶対にリポジトリへコピーしない**
- APIキーは Script Properties に入れ、コードやリポジトリには書かない（`secrets.md`）
