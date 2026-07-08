---
name: best-practice-extract
description: "複数リポジトリを横断してテーマ（CI・ビルド・テスト・命名規則など）の実装を調査し、ベストプラクティスを合議で決定して各リポジトリに一括適用・PR作成まで行う横断標準化スキル。"
compatibility: "Any set of git repositories. Requires git, gh (GitHub CLI). WordPress repos honored per GPL. Uses subagents for parallel extraction."
---

# Best Practice Extract（横断ベストプラクティス抽出・標準化）

複数のリポジトリで CI・ビルド・テスト・命名規則などが **ドリフト**していく問題を、
「テーマを決めて横断調査 → ベストプラクティスを合議 → 各リポに一括適用 → PR」で収束させる。

`wp-multi-target` が **1リポジトリ内**の複数ターゲットを扱うのに対し、このスキルは
**複数リポジトリ横断**（inter-repo）の標準化を担う。層が異なる。

## 使用場面

- tarosky / hametuha など、多数のリポジトリで設定がバラバラになってきたとき
- 「GitHub Actions のリリースワークフロー」「PHPUnit の bootstrap」「ESLint 設定」など、
  横断で揃えたいテーマがあるとき
- どのリポのやり方がベストか判断し、標準として全体に展開したいとき

## 安全原則（厳守）

このスキルは **外部リポジトリへの副作用（ブランチ・commit・PR）** を伴う。以下を厳守すること。

1. **既存のローカルリポジトリを一切変更しない。** 全作業はワークスペースへ新規クローンしたコピー上で行う。
2. **適用（ステップ6）は 1リポジトリずつ、差分プレビュー → 明示承認 → PR** の順で進める。まとめて自動 push しない。
3. commit 前に必ず現在ブランチを確認し、**default ブランチ（main/master）では commit しない**。作業ブランチを切る。
4. commit は `git cc-commit "..."` を使う（Co-authored-by が自動付与される）。
5. WordPress 関連の変更は **GPL 2.0以降** を遵守する。
6. 調査（ステップ4）のサブエージェントは **read-only**。書き込みは適用フェーズ（ステップ6）でのみ行う。

---

## 手順

### 1) テーマの確定

ユーザーに「何を横断調査するか」を尋ね、**1つの明確なテーマ**に絞る。曖昧なら具体化する。

良いテーマの例:
- 「GitHub Actions のリリース（タグ→ビルド→デプロイ）ワークフロー」
- 「PHPUnit のテスト構成（bootstrap・wp-env・test スクリプト）」
- 「.gitignore / エディタ設定 / lint 設定の共通化」

テーマから **slug**（kebab-case）を作る。以降 `<theme>` はこの slug を指す。

### 2) ワークスペースの確定

クローン先ディレクトリをユーザーに尋ねる。**デフォルト提案**:

```
~/.claude/tmp/best-practice/<theme>/
```

- セッションをまたぐ可能性があるため、**scratchpad（セッション固有）は使わない**。
- ディレクトリが無ければ作成する。既存で中身がある場合は、再利用するか作り直すかを確認する。

```bash
WORKSPACE="$HOME/.claude/tmp/best-practice/<theme>"   # ユーザー確定値に置換
mkdir -p "$WORKSPACE"
```

### 3) 対象リポジトリの特定とクローン

対象リポジトリの指定方法を選ばせる:

- **A. org から一覧選択** — `gh` で組織のリポを列挙し、複数選択させる。

  ```bash
  # 例: tarosky org のリポ一覧（アーカイブ除外）
  gh repo list tarosky --no-archived --limit 200 --json name,description,updatedAt \
    --jq 'sort_by(.updatedAt) | reverse | .[] | "\(.name)\t\(.description // "")"'
  ```

  複数 org（tarosky / hametuha 等）にまたがる場合は org ごとに列挙する。
  **アカウント混同に注意**（tarosky と hametuha を取り違えない）。

- **B. 明示指定** — ユーザーが `owner/repo` または URL のリストを直接渡す。

確定した各リポを **ワークスペースにクローン**する（default ブランチのみで可）。

```bash
cd "$WORKSPACE"
gh repo clone owner/repo -- --depth 1    # 調査だけなら --depth 1 で軽量に
# 適用フェーズに進む可能性が高いリポは full clone（PR 用に履歴が要る場合）:
# gh repo clone owner/repo
```

> 注: `--depth 1` は調査は速いが、後で push する際に不都合が出ることがある。
> 適用まで行う見込みなら full clone にする。迷ったら full clone。

クローンした絶対パスの一覧を記録しておく。

### 4) 横断抽出（サブエージェント fan-out）

**リポジトリ1つにつきサブエージェント1体**を並列起動する（1メッセージで複数 Agent 呼び出し）。
各エージェントは **read-only** で調査し、`references/summary-schema.md` のスキーマに従って
**構造化サマリ**を返す。粒度は「**要約＋関連ファイルパス**」（ファイル丸ごとは返させない）。

各サブエージェントへの指示に必ず含める:
- 対象リポジトリの絶対パス
- テーマの説明
- 「そのテーマをどう扱っているか」「関連ファイルのパス」「強み」「弱み・逸脱」を
  `summary-schema.md` の形式で返すこと
- **ファイルを変更しないこと（read-only）**

全エージェントの結果を統合し、`$WORKSPACE/Summary.md` を生成する。
リポ横断の比較表（テーマの観点 × リポジトリ）を含めると合議しやすい。

### 5) 合議によるベストプラクティス決定

`Summary.md` をユーザーに提示し、`AskUserQuestion` で対話的に標準を決める。

- 各リポの案の **強み・弱み** を並べる
- 単純な「どれが一番か」だけでなく、**統合案X**（「A のここ＋B のここ」）を積極的に提案する
- 統合案を精密化する際は、**必要なファイルだけ**をその場で読む（丸ごと事前ロードしない）

決定したら **標準ドキュメント**を作成する。保存先はユーザーに尋ねる。
形式は `references/standard-template.md` に従う。内容:
- 決定した標準の定義（あるべき姿）
- 根拠（どのリポの何を採用したか）
- 適用手順（各リポで何を変えるか）
- 除外・例外条件

### 6) 適用とPR作成（opt-in・1リポジトリずつ）

ユーザーが適用に進むと確認したら、**1リポジトリずつ**以下を繰り返す。
一括自動化はしない。各リポで:

```bash
cd "$WORKSPACE/<repo>"

# 6-1. default ブランチにいないことを確認しつつ作業ブランチを作成
git switch -c chore/apply-<theme>

# 6-2. 標準ドキュメントに従って変更を適用（Edit/Write）

# 6-3. 差分をユーザーに提示して承認を得る
git --no-pager diff
```

ユーザーが承認したら:

```bash
# 6-4. commit（Co-authored-by 自動付与）
git add -A
git cc-commit "chore: <theme> を横断標準に合わせる"

# 6-5. push
git push -u origin chore/apply-<theme>

# 6-6. PR 作成
gh pr create --fill --base <default-branch> \
  --title "chore: <theme> を横断標準に合わせる" \
  --body "best-practice-extract スキルによる横断標準化。\n\n## 変更点\n- ...\n\n## 根拠\n決定した標準に基づく。"
```

作成した PR の URL を記録し、次のリポジトリへ。
**1リポ完了ごとに** 続行するか止めるかをユーザーに確認できるようにする。

### 7) 後片付け

- 作成した全 PR の URL 一覧を提示する。
- ワークスペースの削除は **確認の上で任意**（`rm -rf "$WORKSPACE"`）。マージ前は残す方が安全。

---

## 成果物まとめ

- `$WORKSPACE/Summary.md` — 横断調査の要約と比較
- 標準ドキュメント（ユーザー指定の場所）— 決定した標準
- 各リポジトリの PR（適用フェーズを実行した場合）
