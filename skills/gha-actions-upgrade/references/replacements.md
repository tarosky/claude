# アーカイブ済み・更新停止の action の置き換え

tarosky org の棚卸し（2026-10）で実際に使われていたもの。ここにない action は、リポジトリの README とリリースノートを読んで判断する。

## actions/create-release + actions/upload-release-asset（アーカイブ済み・node12）

`softprops/action-gh-release` の 1 ステップにまとめる。ジョブに `permissions: contents: write` が必要。

変更前:

```yaml
    - name: Create Release
      id: create_release
      uses: actions/create-release@v1.0.0
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: ${{ github.ref }}
        release_name: Release ${{ github.ref }}
        draft: false
        prerelease: false
    - name: Upload release asset
      uses: actions/upload-release-asset@v1.0.1
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        upload_url: ${{ steps.create_release.outputs.upload_url }}
        asset_path: ${{ github.workspace }}/${{ github.event.repository.name }}.zip
        asset_name: ${{ github.event.repository.name }}.zip
        asset_content_type: application/zip
```

変更後:

```yaml
  release:
    permissions:
      contents: write
    steps:
    # ...
    - name: Create release with asset
      uses: softprops/action-gh-release@v3
      with:
        name: Release ${{ github.ref_name }}
        files: ${{ github.event.repository.name }}.zip
```

確認すること:

- `asset_name` と `files` のファイル名が同じか。zip 名が変わると、手動デプロイの手順や外部の取得処理が壊れる
- `release_name` に `github.ref`（`refs/tags/1.2.0`）を使っていた場合、`github.ref_name`（`1.2.0`）に変えるとリリース名が変わる。旧リリースとの表記の違いを PR に書く
- `draft` / `prerelease` を true にしていた場合は、同名の入力で引き継ぐ
- `steps.create_release.outputs.*` をほかのステップが参照していないか

`AButler/upload-release-assets` も同じく `softprops/action-gh-release` の `files:` に置き換える。

## repo-sync/pull-request（アーカイブ済み）

`gh pr create` に置き換える。ジョブに `permissions: pull-requests: write` が必要。

```yaml
    - name: Create pull request
      env:
        GH_TOKEN: ${{ github.token }}
      run: |
        gh pr create --base main --head "${GITHUB_REF_NAME}" \
          --title "..." --body "..." || echo "PR already exists"
```

元の `source_branch` / `destination_branch` / `pr_title` / `pr_body` / `pr_label` を `--head` / `--base` / `--title` / `--body` / `--label` に移す。同じブランチ間の PR が既にあると `gh pr create` は失敗するので、元の action の挙動（既存 PR があれば何もしない）に合わせて失敗を握りつぶすか、事前に `gh pr list` で確認する。

## actions-ecosystem/action-create-issue（node12、更新停止）

`gh issue create` に置き換える。ジョブに `permissions: issues: write` が必要。

```yaml
    - name: Create issue
      env:
        GH_TOKEN: ${{ github.token }}
      run: |
        gh issue create --title "..." --body "..." --label "..." --assignee "..."
```

## einaregilsson/build-number（アーカイブ済み）

`${{ github.run_number }}` で代替できるが、**番号の付け方が変わる**。build-number はリポジトリ全体で連番を保持するが、`run_number` は workflow ごとの連番。リリース番号やファイル名に使っている場合は、置き換え前に必ずユーザーに確認する。

## actions/checkout@master / actions/setup-node@master など

アーカイブではないが、`master` ブランチは放置されていて node12 のまま。`@v7` などのバージョン指定に変える。`@main` は最新を指すが、予告なく変わるのでバージョン指定に変える。

## tarosky/farmhand-wp-action@v1（node16）

tarosky 自身の action。利用側では直せない。先に tarosky/farmhand-wp-action を node24 対応して新しいメジャーを出し、それから利用側を更新する。それまでは「更新しないもの」として PR に書く。
