#!/usr/bin/env python3
"""
記事タイトル一覧CSVから、全記事分のアイキャッチ/og:imageをまとめて生成する。

CSV列: slug,title,category(任意),lead(任意)
  - lead(リード文)があればモチーフのブリーフ精度が上がるので推奨。
  - 未確定の記事はスキップしてよい(CSVから行を削るだけ)。

使い方:
  python3 scripts/batch_generate.py articles.csv output/

各記事につき generate_motif.py -> render.mjs -> make_variants.sh を順に呼び出す。
1件失敗しても残りは続行し、最後に成否一覧を表示する
(バッチ全部が1件のエラーで止まると確認作業が大変なため)。

生成したモチーフの概要は output/_motif-log.csv に追記していく
(references/design-process.md の「バッチ内でのモチーフ重複を避ける」運用)。
"""
import csv
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent


def run(cmd: list[str]) -> None:
    print(f"$ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, check=True)


def process_row(row: dict, outdir: Path) -> None:
    slug = row["slug"].strip()
    title = row["title"].strip()
    brief = (row.get("lead") or "").strip() or None
    # category はテンプレートでは使っていないが、モチーフ選定の手掛かりとしてログに残す
    category = (row.get("category") or "").strip() or None

    article_dir = outdir / slug
    source_dir = article_dir / "source"
    source_dir.mkdir(parents=True, exist_ok=True)

    motif_svg_path = source_dir / "motif.svg"
    motif_png_path = source_dir / "motif.png"
    master_path = article_dir / "eyecatch-master.png"
    html_out_path = source_dir / "eyecatch.html"

    # モチーフの決め方(SKILL.mdのデザイン方針2):
    #   1. source/motif.svg が既にあればそれを使う(SVGで描く既定の方式)
    #   2. 無ければ画像生成AIに作らせる(APIの設定が必要)
    #   3. どちらも無理なら文字だけでレンダリングし、あとで手当てできるよう警告する
    if motif_svg_path.exists():
        motif_args = ["--motif-svg", str(motif_svg_path)]
    elif os.environ.get("MOTIF_PROVIDER"):
        run([
            sys.executable, str(SCRIPT_DIR / "generate_motif.py"),
            "--title", title,
            *(["--brief", brief] if brief else []),
            "--out", str(motif_png_path),
        ])
        motif_args = ["--motif", str(motif_png_path)]
    else:
        print(
            f"!! {slug}: モチーフがありません"
            f"({motif_svg_path} を作るか MOTIF_PROVIDER を設定してください)。"
            "文字だけでレンダリングします。",
            file=sys.stderr,
        )
        motif_args = []

    run([
        "node", str(SCRIPT_DIR / "render.mjs"),
        "--template", str(SKILL_DIR / "template" / "eyecatch.html"),
        "--title", title,
        *motif_args,
        "--out", str(master_path),
        "--html-out", str(html_out_path),
    ])

    run([str(SCRIPT_DIR / "make_variants.sh"), str(master_path), str(article_dir)])

    log_path = outdir / "_motif-log.csv"
    write_header = not log_path.exists()
    with log_path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(["slug", "title", "category", "brief"])
        writer.writerow([slug, title, category or "", brief or ""])


def main() -> int:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <articles.csv> <output-dir>", file=sys.stderr)
        return 1

    csv_path = Path(sys.argv[1])
    outdir = Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)

    with csv_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    results = []
    for row in rows:
        slug = row.get("slug", "").strip()
        try:
            process_row(row, outdir)
            results.append((slug, "OK"))
        except subprocess.CalledProcessError as e:
            results.append((slug, f"FAILED: {e}"))
            print(f"!! {slug} failed, continuing with next article", file=sys.stderr)

    print("\n=== summary ===")
    for slug, status in results:
        print(f"{slug}: {status}")

    return 0 if all(status == "OK" for _, status in results) else 1


if __name__ == "__main__":
    sys.exit(main())
