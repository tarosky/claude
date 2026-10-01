# トリガーと制限

## トリガーは「setup() を1回実行」で張る

GUI のトリガー画面で設定するより、**コードで張る関数を用意して実行**してもらう方が確実。

- 手順が「この関数を実行して」の一言で済む（画面の選択肢を間違えない）
- 利用形態②のコピー先でも、③のオーナー交代でも、同じ手順で張り直せる
- 二重に張らないよう、既存のトリガーを消してから張る

```javascript
// setup.js
function setup() {
  teardown(); // 二重登録を防ぐ
  // 例: 毎朝9時台に main を実行
  ScriptApp.newTrigger('main').timeBased().everyDays(1).atHour(9).create();
}

// 止めたいときはこれを実行する
function teardown() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
}
```

> `ScriptApp.getProjectTriggers()` が返すのは**実行した本人が張ったトリガーだけ**。③で他の人が張ったトリガーは、その人が `teardown()` しないと消えない。

## シートにメニューを付ける（②では標準、①③でも推奨）

エディタを開かずに、シートのメニューから実行・オンオフできるようにする。②ではコピーした全員がこれだけで使い始められる。

```javascript
// menu.js — シートを開くたびにメニューを作る（シート起点のプロジェクトのみ）
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('自動化')
    .addItem('初期設定（APIキーの入力）', 'menuSetKey')
    .addItem('今すぐ実行', 'main')
    .addSeparator()
    .addItem('自動実行をオンにする', 'menuOn')
    .addItem('自動実行をオフにする', 'menuOff')
    .addToUi();
}

function menuSetKey() {
  promptSecret('BACKLOG_API_KEY', 'Backlog の API キー'); // secrets.md
}

function menuOn() {
  setup();
  SpreadsheetApp.getUi().alert('自動実行をオンにしました。');
}

function menuOff() {
  teardown();
  SpreadsheetApp.getUi().alert('自動実行をオフにしました。');
}
```

初めてメニューを使うときに権限の承認画面が出る（`clasp-workflow.md` 6 と同じ手順）。

## トリガーの種類

| 起点 | コード | 備考 |
|---|---|---|
| 毎日・毎週 | `.timeBased().everyDays(1).atHour(9)` / `.timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9)` | 指定時刻ちょうどではなく、その1時間内のどこかで動く |
| 数分おき | `.timeBased().everyMinutes(5)` | 指定できるのは 1 / 5 / 10 / 15 / 30 のみ |
| シート編集時 | `.forSpreadsheet(SpreadsheetApp.getActive()).onEdit()` | シート起点のプロジェクトのみ |
| フォーム送信時 | `.forSpreadsheet(SpreadsheetApp.getActive()).onFormSubmit()` | フォームの**回答先シート**のプロジェクトに付ける |
| 手動 | トリガー不要。上のメニューから実行 | |

## フォーム送信時の処理

### 受け取れる情報

```javascript
function onFormSubmitHandler(e) {
  // e.namedValues: { '質問の文言': ['回答'] }  ※質問の文言がそのままキーになる
  // e.values:      ['タイムスタンプ', '回答1', '回答2', ...]
  // e.range:       回答が書き込まれた行
}
```

- 質問の文言を変えると `e.namedValues` のキーが変わって処理が壊れる。README に書いておく
- 結果を書き足す列は、回答シートの**右端**に足す。列の位置は番号で決め打ちせず、1行目の見出しから探す（フォームに質問を足すと列がずれるため）

### 空の送信・同時送信に備える

まれに中身が空のイベントが届いたり、同時に送信されたりすることがある。冒頭でガードする：

```javascript
function onFormSubmitHandler(e) {
  if (!e || !e.values || e.values.every((v) => v === '')) {
    return; // 空のイベントは無視する
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    throw new Error('他の処理が実行中のため、今回はスキップしました');
  }
  try {
    // 本体の処理
  } finally {
    lock.releaseLock();
  }
}
```

### エディタから試すにはテスト関数を使う

フォーム送信用の関数をエディタからそのまま実行すると `e` が無いのでエラーになる。**最後の回答行から `e` を組み立てるテスト関数**を用意し、動作確認ではそれを実行してもらう：

```javascript
function testLastRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const values = sheet.getRange(lastRow, 1, 1, headers.length).getDisplayValues()[0];
  const namedValues = {};
  headers.forEach((h, i) => (namedValues[h] = [values[i]]));
  onFormSubmitHandler({ values, namedValues, range: sheet.getRange(lastRow, 1, 1, headers.length) });
}
```

フォームに試しの回答を1件送ってもらってから実行する。

## トリガーは「張った人」のアカウントで動く

張った人の権限でシートやメールにアクセスし、張った人の上限を消費する。張った人がアカウントを失うと止まる。エラーの通知メールも張った人にしか届かない。利用形態③では特に重要（`usage-patterns.md`）。

## Gmail には「メールが届いたら」トリガーが無い

**届いた瞬間に動かすことはできない。** 時間トリガー（例：5分おき、毎朝）で受信箱を見に行き、まだ処理していないメールを処理する方式になる。作る前にこの期待値を本人とそろえる。

### 処理済みの見分け方：メッセージIDをシートに記録する

Gmail のラベルはスレッド（やりとりのまとまり）単位で付くので、「処理済みラベルが無いもの」で探すと、**すでにラベルの付いたスレッドに届いた新しいメールを取りこぼす**。結果をシートに書く場合は、**メールのIDをシートに記録して重複を防ぐ**のが確実：

```javascript
function main() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('記録');
  const doneIds = new Set(sheet.getRange('A2:A').getValues().flat().filter(String));
  const threads = GmailApp.search('from:example@example.com newer_than:7d');
  const rows = [];
  threads.forEach((thread) => {
    thread.getMessages().forEach((m) => {
      if (doneIds.has(m.getId())) return;
      rows.push([m.getId(), m.getDate(), m.getSubject()]);
    });
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}
```

- A列をメールIDにする（人が見なくてよい列なので、非表示にしてもよい）
- 検索条件は Gmail の検索窓と同じ書き方。**本人に Gmail で検索して、狙ったメールだけが出ることを確かめてもらってから**使う
- `newer_than:7d` などで範囲を絞る（全件を毎回見ると遅くなり、制限に当たる）
- メール本文から金額などを抜き出す場合は、**実物のメールを1〜2通（個人情報を伏せて）貼ってもらい**、それに合わせて抜き出し方を書く。想像で書かない
- シートを使わずラベルだけで管理する場合は、ラベル名を `自動化/〇〇処理済み` のようにツール固有にする（他のツールとぶつからないように）

## 制限（Workspace アカウント）

| 項目 | 上限 |
|---|---|
| 1回の実行時間 | **6分** |
| トリガーによる実行の合計 | 6時間 / 日 |
| 外部への通信（UrlFetch） | 10万回 / 日 |
| メールの宛先数 | 1,500 / 日 |
| 1スクリプトあたりのトリガー数 | 1人20個 |

個人の Gmail アカウントではさらに厳しい（トリガー合計90分/日、メール宛先100/日）。必ず会社アカウントで作る。

### 6分を超えそうなとき

- まず処理を絞る（期間・件数で範囲を狭める）
- 「1回で全部」ではなく、進んだ位置を Script Properties に保存して、次のトリガー実行で続きから処理する
- それでも足りない・常に動かしておきたい・外部から呼ばれる必要がある → このスキルの範囲外（SKILL.md の「範囲」参照）
