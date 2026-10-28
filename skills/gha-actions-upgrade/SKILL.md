---
name: gha-actions-upgrade
description: "GitHub Actions の action を Node 24 で動くバージョンに更新し、アーカイブ済みの action を置き換えて PR を作る。ビルドの Node（node-version）は変えない。更新した workflow がどこで検証できるか（PR／マージ後／手動実行／リリース時）を PR に明記する。「Node.js 20 is deprecated」の警告を消したい、古い action を一括で更新したいときに使用する。"
compatibility: "GitHub 上のリポジトリ（言語を問わない）。gh（GitHub CLI、認証済み）と Node.js 22 以上が必要。"
---

# GHA Actions Upgrade

## このスキルがやること・やらないこと

GitHub Actions の action は、それぞれ決まったバージョンの Node で動く（`action.yml` の `runs.using`）。node12 / node16 / node20 の action は GitHub が Node 24 での実行に順次切り替えており、いずれ動かなくなる。

**やること**

- `uses:` の action を、Node 24 で動く最新メジャーに更新する
- `@master` / `@main` などのブランチ指定を、バージョン指定に変える
- アーカイブ済み・更新停止の action を置き換える（`references/replacements.md`）
- 置き換えに必要な `permissions:` や入力の変更

**やらないこと**（見つけたら Issue にする）

- `setup-node` の `node-version` を変える。ビルドの Node の更新は `node-build-upgrade` スキルの担当。action を更新してもビルドの Node は変わらないので、このスキルは単独で使える
- PHP バージョン、サービスコンテナ（MySQL など）、ジョブ構成、テスト内容の変更
- 共有 workflow（`tarosky/workflows/...@main`）の中身。直すなら tarosky/workflows 側で直す

## 必要な入力

- 対象リポジトリ（CWD、またはリポジトリ名のリスト）
- 関連する Backlog 課題（あれば PR 本文にリンクする）

## 手順

### 0) 着手できる状態か確認する

```bash
git status --short            # 作業ツリーがきれいか
gh run list --branch "$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)" --limit 10
```

- **デフォルトブランチの CI がすでに失敗している場合は止まる。** 更新後も失敗するので、更新が原因かどうか判断できない。失敗の原因を別 PR で直すか、`node-build-upgrade` で対応するようユーザーに伝える
- 最新のデフォルトブランチから作業ブランチを切る（例: `gha-node24`）

### 1) 検出スクリプトを実行する

```bash
node ~/.claude/skills/gha-actions-upgrade/scripts/detect_actions.mjs --path=<repo> > /tmp/actions.json
```

出力の見方:

| `status` | 意味 | 対応 |
|---|---|---|
| `ok` | node24 で動き、バージョン指定済み | なし |
| `upgrade` | 最新メジャーは node24 | `latest.suggest` に更新 |
| `pin-version` | ブランチ指定（`@master` など） | バージョン指定に変える。`actions/checkout@master` は放置されたブランチで node12 のまま |
| `archived` | action のリポジトリがアーカイブ済み | `references/replacements.md` に従い置き換え |
| `no-node24-release` | 最新リリースも node24 ではない | 置き換え先を探す。なければ更新せず Issue にする |
| `check-manually` | composite / docker | 中身の `uses:` を確認する。node24 化は action 側の対応待ちのことが多い |
| `not-found` | action が存在しない（typo など） | ユーザーに報告する |

`summary.affectedJobs` は、変更する action を含むジョブごとに **どこで検証できるか** を示す。

| `verification` | 検証できるタイミング |
|---|---|
| `PR` | この PR の CI |
| `merge` | マージ後の push / schedule / コメント起動 |
| `dispatch` | 作業ブランチから手動実行 |
| `tag/release` | 次のリリースまで検証できない。ジョブ単位・ステップ単位の `if:` でタグ限定になっているものも含む |

`lastRun` が `failure` / `never` のジョブは、更新前から動いていない。PR の CI が通っても検証にならない。

### 2) 計画をユーザーに見せる

変更前に、次の表をユーザーに見せて確認を取る。複数リポジトリを一括で扱う場合は、全リポジトリ分をまとめて 1 回見せる。

| action | 現在 | 更新先 | 使っているジョブ | 検証 |
|---|---|---|---|---|

あわせて、`no-node24-release` / `check-manually` / `not-found` で **今回は更新しないもの** とその理由を示す。

### 3) 変更する

- `uses:` の行だけを書き換える。ほかの行の整形や並び替えはしない
- バージョンはメジャータグ（`@v7`）で指定する。リポジトリが既に完全なバージョンや SHA で固定している場合は、その方式に合わせる
- **メジャーをまたぐ更新は、リリースノートで破壊的変更を確認する。** 記憶に頼らず、実際に読む:
  ```bash
  gh release list -R actions/upload-artifact --limit 20
  gh release view v4.0.0 -R actions/upload-artifact
  ```
  入力名の変更、デフォルト値の変更、必要な `permissions:` の追加があれば、あわせて直す
- 置き換えは `references/replacements.md` に従う。置き換えによってリリース成果物（zip 名、リリース名、ビルド番号など）が変わる場合は止まってユーザーに確認する

### 4) 確認する

```bash
node ~/.claude/skills/gha-actions-upgrade/scripts/detect_actions.mjs --path=<repo> --no-runs | jq '.summary.byStatus'
git diff --stat
```

- 残っている `ok` 以外が、手順 2 で「更新しない」と説明したものだけであること
- 差分が `uses:` 行と、置き換えに必要な箇所だけであること
- `actionlint` が使える環境なら実行する（必須ではない）

### 5) PR を作る

- コミットは 1 つでよい。置き換え（アーカイブ済み action）がある場合は、単純なバージョン更新と分けて 2 コミットにすると、レビューしやすい
- PR 本文に **検証表** を入れる。これが PR の一番大事な情報:

```markdown
## 検証

| workflow / ジョブ | 変更した action | 検証タイミング | 状態 |
|---|---|---|---|
| test.yml / test | actions/checkout v4→v7 | この PR の CI | |
| wordpress.yml / release | create-release → action-gh-release | 次回リリース | 未確認 |

- [ ] PR の CI が通った
- [ ] マージ後の実行（release-drafter など）が通った
- [ ] 次回リリースで release ジョブが通った（確認担当: ）
```

- `tag/release` のジョブがある場合は、**検証のためだけにタグを打たない**（多くは本番デプロイや WordPress.org への公開）。次回の通常リリースで確認する。確認担当が決まっていなければ、マージ前にユーザーに確認する
- 自分でマージしない。ブランチ保護でレビュー必須のリポジトリが多い

### 6) マージ後

- `merge` のジョブ: マージ後の実行結果を確認する
- `dispatch` のジョブ: 手動で 1 回実行する
- `tag/release` のジョブ: Backlog 課題の該当リポジトリに「次回リリースで確認」と記録する。チェックはリリースで確認できてから付ける

## 複数リポジトリを一括で扱う場合

- 1 リポジトリ 1 PR。まとめて 1 つの PR にはしない
- 手順 0 で CI が失敗しているリポジトリ、`tag/release` のジョブがあり確認担当が決まっていないリポジトリは、一括の対象から外してユーザーに報告する
- 同じ action の更新が多数のリポジトリに出るので、破壊的変更の確認（手順 3）は action ごとに 1 回でよい。確認結果を最初に共有する

## 止まってユーザーに確認する場面

- デフォルトブランチの CI がすでに失敗している
- node24 版が出ていない action しかない（置き換えるか、待つか）
- 置き換えでリリース成果物や番号の付け方が変わる
- `tag/release` のジョブを変えるが、確認担当が決まっていない
- tarosky 自身の action（`tarosky/farmhand-wp-action` など）が古い。先にその action のリポジトリを更新する必要がある

## スコープ外で見つけたもの

PR には含めず、Issue の下書きを作ってユーザーに見せる。よくあるもの:

- `setup-node` の `node-version` が古い → `node-build-upgrade`
- 使われていないサービスコンテナ、設定の typo、意味のない設定
- PHP / WordPress のバージョンマトリクスが古い

## トラブルシューティング

- **`gh api` が 404 を返す**: action のリポジトリが削除・改名されている。`not-found` として報告する
- **メジャータグがない action**（`shivammathur/setup-php` の `2.40.0` など）: 既存の指定（`@v2`）が node24 で動くなら `ok` になる。動かない場合だけ完全なタグに変える
- **`softprops/action-gh-release` で 403**: ジョブに `permissions: contents: write` が必要
