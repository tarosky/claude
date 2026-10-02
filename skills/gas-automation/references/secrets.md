# APIキー・秘密情報の扱い

Backlog・Gemini のAPIキー、**Slack の Webhook URL** はどれも秘密情報。**コードにもリポジトリにも書かない**。

Claude はキーの値を聞かない・受け取らない。本人に直接入力してもらう。チャットに貼られた場合は、そのキーを発行し直すよう伝える。

## どこに保存するか

| 型 | 保存先 | 入れ方 |
|---|---|---|
| ① 自分だけ | Script Properties | エディタの ⚙ プロジェクトの設定 → スクリプト プロパティ |
| ② n人がn個 | **User Properties** | **シートのメニュー**から入力（下の雛形）。コピーした人にエディタを開かせない |
| ③ n人が1個 | Script Properties | 運用オーナーがエディタから入れる。持ち主を**人名で**READMEに書く |

②で User Properties を使う理由：使う人ごとに別々に保存され、原本やコピー元のキーが他の人に渡らない。②の原本の Script Properties には何も入れない。

③のキーは、できればチーム用・サービス用のアカウントで発行する（個人のキーだと、その人がいなくなると止まる）。

## コードからの読み方

```javascript
// ①③: Script Properties から読む
function getSecret(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error(`スクリプトプロパティ ${name} が未設定です。プロジェクトの設定から追加してください。`);
  }
  return value;
}
```

```javascript
// ②: User Properties に、シートのメニューから入力してもらう
function promptSecret(name, label) {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(`${label}を貼り付けてください`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK || !res.getResponseText().trim()) {
    return;
  }
  PropertiesService.getUserProperties().setProperty(name, res.getResponseText().trim());
  ui.alert('保存しました。');
}

function getUserSecret(name) {
  const value = PropertiesService.getUserProperties().getProperty(name);
  if (!value) {
    throw new Error(`${name} が未設定です。メニューの「初期設定」から入力してください。`);
  }
  return value;
}
```

## ログやエラーにキーを出さない

- URL にキーが入る API（Backlog など）は、エラーメッセージや `console.log` に**URLをそのまま出さない**。パスとステータスコードだけ出す
- 渡し方を選べる API（Gemini）は、URL ではなくヘッダーで渡す

## Backlog を使う場合

1. Backlog 右上の自分のアイコン → **個人設定 → API** → メモを付けて「登録」→ キーが発行される
2. スペースのアドレス（`xxx.backlog.jp` または `xxx.backlog.com`）は秘密ではないので、コードの先頭に定数で書いてよい
3. キーは URL の `apiKey=` でしか渡せない。上の「ログに出さない」を守る

```javascript
const BACKLOG_HOST = 'example.backlog.jp'; // 自分のスペースに変える

function backlogGet(path, params, apiKey) {
  const query = Object.entries({ ...params, apiKey })
    .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const res = UrlFetchApp.fetch(`https://${BACKLOG_HOST}/api/v2${path}?${query}`, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    // URL にはキーが入っているので、パスとコードだけ出す
    throw new Error(`Backlog API エラー ${res.getResponseCode()}: ${path}`);
  }
  return JSON.parse(res.getContentText());
}
// 例: backlogGet('/issues', { 'assigneeId[]': [myId], count: 100 }, getUserSecret('BACKLOG_API_KEY'))
```

## Slack に通知する場合

1. Slack で **Incoming Webhook** を作り、通知先チャンネルを選ぶ（ワークスペースの管理者の承認が要ることがある）
2. 発行された `https://hooks.slack.com/services/...` の URL を保存先に入れる（`SLACK_WEBHOOK_URL`）

- Webhook は**作った人に紐づく**。③では持ち主を README に書く
- 人に通知を飛ばす（メンション）には、名前ではなく**メンバーID**で `<@U0123ABCD>` と書く。メンバーIDは Slack のプロフィール →「︙」→「メンバーIDをコピー」

```javascript
function notifySlack(text) {
  const res = UrlFetchApp.fetch(getSecret('SLACK_WEBHOOK_URL'), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`Slack 通知エラー ${res.getResponseCode()}`);
  }
}
```

## Gemini を使う場合

### 無料枠に個人情報・社外秘を送らない

Gemini API の**無料枠では、送った内容が Google のサービス改善に使われ、人が読むことがある**（Gemini API 利用規約）。課金が有効な Cloud プロジェクトのキー（有料枠）なら改善には使われない。

- 問い合わせ本文・顧客名・社内の数字など、**外に出てはいけない内容を送るなら有料枠のキーが必須**
- 有料枠のキーの発行は、ノーコーダーが自分ではできない（課金設定が要る）。**CTO に依頼する**。依頼文には「何に使うか」「送るデータの種類」「1日のおおよその件数」を書く
- 公開情報だけを扱う、自分の試し用、といった場合に限り無料枠でよい

### キーの発行（無料枠）

1. https://aistudio.google.com/ に会社アカウントでログイン
2. **Get API key → Create API key**
3. 発行されたキーを保存先に入れる（`GEMINI_API_KEY`）

Workspace 管理者が AI Studio を制限していて発行できない場合も、CTO に相談する。

```javascript
function askGemini(prompt) {
  const model = 'gemini-2.5-flash'; // 例。使う時点の最新モデル名を確認する
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': getSecret('GEMINI_API_KEY') },
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    muteHttpExceptions: true,
  });
  // エラー時は HTML が返ることもあるので、先にステータスを見る
  if (res.getResponseCode() !== 200) {
    throw new Error(`Gemini API エラー ${res.getResponseCode()}`);
  }
  const data = JSON.parse(res.getContentText());
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
```

- **分類に使う場合**は、選択肢をプロンプトに列挙し、返ってきた値が選択肢に無ければ「その他」に寄せる。決まった形で受け取りたいときは `generationConfig: { responseMimeType: 'application/json' }` を付ける
- 大量の行を1行ずつ投げると、6分制限と料金の両方に当たる。件数を絞るか、まとめて1回で投げる
