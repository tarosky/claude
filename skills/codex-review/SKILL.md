---
name: codex-review
description: "Codex CLI（OpenAI）に作業中の差分を読み取り専用でレビューさせ、別系統のモデルによるセカンドオピニオンを得る。指摘はClaudeが1件ずつ根拠を確かめて「採用／却下／要確認」に分け、採用分だけ直す（再レビューはしない）。PR作成前のレビュー、「Codexに見てもらって」「セカンドオピニオンがほしい」ときに使用する。"
compatibility: "Codex CLI 0.167.0 以上がインストール済みで、`codex login` 済みであること。git リポジトリで実行する。"
---

# Codex によるセカンドオピニオン・レビュー

Claude Code で書いたコードを Claude 系のモデルがレビューすると、見落としが重なりやすい。別系統のモデル（OpenAI Codex）に差分を見せて、その偏りを補う。

このスキルは**評価段階**にある。「Codex だけが拾える本物の指摘」がどれだけあるかを記録し、GitHub Actions（`tarosky/workflows` の `claude-review.yml`）に 2 人目のレビュアーとして入れるかを判断する材料にする。

## スクリプト

`<skill>` はこのスキルのディレクトリ。

```bash
bash <skill>/scripts/codex-review.sh (--base <branch> | --uncommitted | --commit <sha>) \
  --out <dir> [--intent <file>] [--preset wordpress|generic]
```

- Codex は**読み取り専用**のサンドボックスで動く。実行の前後で作業ツリー（HEAD・status・diff）が変わっていたら終了コード 2 で止まる
- Codex CLI が無い、ログインしていない、差分が無い場合は、理由を出して終了コード 1 で止まる
- `<dir>` に `prompt.md`（渡した指示）・`review.md`（結果）・`codex.log`（実行ログ）が残る

## Codex CLI の仕様（0.167.0 で実測）

スクリプトの作りの理由。CLI が更新されたら見直す。

- **`codex review` の `--base` / `--uncommitted` / `--commit` は、独自の指示（PROMPT）と併用できない**（引数の段階でエラー）。そこでスクリプトは範囲を指示文の中で伝え（`git diff main...HEAD` を見よ、など）、PROMPT だけで実行する
- **`~/.codex/config.toml` の既定が `sandbox_mode = "workspace-write"` だと、レビューでも書き込める。** スクリプトは `-c sandbox_mode="read-only"` で上書きしている。書き込みを指示しても `operation not permitted` で拒否されることを確認済み。読み取りやコマンドの実行（`php -r` で挙動を試すなど）はできる
- **意図を渡さないと、仕様どおりの挙動を「バグ」と指摘される。** 試験用の差分で「毎リクエスト option を消す（仕様）」を、意図なしでは P2 のバグとして指摘し、意図を渡すと「投稿が 0 件だと消えない（仕様を満たさない）」という本物のバグに変わった
- 所要時間は小さな差分で 30〜45 秒。大きな差分では数分かかるので、Bash は `run_in_background` で実行する

## 手順

### 1) 範囲を決める

- 作業ブランチで PR 前なら `--base <デフォルトブランチ>`（既定はこれ）
- コミット前の変更なら `--uncommitted`、特定のコミットなら `--commit <sha>`
- 差分が大きすぎる（目安: 数千行、生成物・ロックファイル中心）なら、ユーザーに範囲の絞り方を相談する

### 2) 意図を書く

スクラッチパッドに `intent.md` を書く。Codex はコードしか見ないので、ここが判定の質を決める。

- 何のための変更か（Issue 番号と要点、プラン）
- **仕様として意図している挙動**。特に、一見バグに見えるもの（毎回消す、権限を見ない、エラーを握りつぶす、など）
- 見てほしい観点・見なくてよい箇所（あれば）

プリセットは、WordPress のプラグイン・テーマなら `wordpress`（`claude-review.yml` の Review Focus と同じ観点。`references/focus-wordpress.md`）、それ以外は `generic`。

### 3) 実行する

```bash
bash <skill>/scripts/codex-review.sh --base main --intent <scratchpad>/intent.md --preset wordpress --out <scratchpad>/codex-review
```

Bash は `run_in_background: true` で実行し、完了の通知を待つ。終わったら `review.md` を読む。

### 4) 指摘をトリアージする

`references/triage.md` の基準で、すべての指摘を「採用／却下／要確認」に分ける。**判定にはそれぞれ根拠を付ける**。却下は「Codex が間違っている理由」、採用は「実際に起きる経路」を、コードを読んで確かめて書く。

### 5) 採用した指摘だけを直す

- 要確認はユーザーの判断を待つ
- **再レビューはしない**（往復は 1 回で打ち切る）

### 6) 報告と記録

- ユーザーに、件数のサマリーと判定の表を報告する（形式は `references/triage.md`）
- PR を作るときは、本文に「Codex レビュー記録」の節を入れる（評価用。同じく `references/triage.md`）

## 範囲外

- GitHub Actions への組み込み（評価のあとで別に扱う）
- 逆方向（Codex から Claude を呼ぶ）
- 長時間・双方向のオーケストレーション（Orca の `orchestration` スキルなど）
