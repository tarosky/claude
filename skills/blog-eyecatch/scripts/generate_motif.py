#!/usr/bin/env python3
"""
記事タイトル(+ブリーフ)から、背景モチーフ画像を1枚生成する。

重要: ここで生成する画像には文字・ロゴ・透かしを一切含めない
(デザイン方針2: タイトル文字はHTML/CSS側でレンダリングするため)。

プロバイダは未確定なので pluggable にしてある。
  MOTIF_PROVIDER=vertexai  -> Google Cloud Vertex AI Imagen
  MOTIF_PROVIDER=openai    -> OpenAI Images API (gpt-image-1 等)

どちらも実際に使う前に、
  - 認証情報(GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_CLOUD_PROJECT、
    もしくは OPENAI_API_KEY)
  - 使用するモデル名(下記 DEFAULT_*_MODEL)
  - SDKのバージョンに応じたAPI呼び出しの細部
を実際に1回叩いて確認すること(このファイルはAPI選定前に書いた雛形)。

使い方:
  python3 scripts/generate_motif.py \
    --title "記事タイトル" \
    --brief "モチーフの方向性を1〜2文で" \
    --out output/<slug>/source/motif.png \
    [--provider vertexai|openai]
"""
import argparse
import os
import sys
from pathlib import Path

# references/brand-guideline.md のプレースホルダーと揃えること
BRAND_BASE_COLOR = "#0B1E3D"
BRAND_ACCENT_COLOR = "#3AA0FF"

DEFAULT_VERTEXAI_MODEL = "imagen-3.0-generate-002"  # 要: 選定時に最新モデル名を確認
DEFAULT_OPENAI_MODEL = "gpt-image-1"  # 要: 選定時に最新モデル名を確認

NEGATIVE_CONSTRAINTS = (
    "no text, no letters, no numbers, no watermark, no logo, no signature, "
    "no caption, no typography of any kind"
)


def build_prompt(title: str, brief: str | None) -> str:
    brief_part = brief.strip() if brief else title
    return (
        f"A single simple flat vector-style motif/icon illustration representing: "
        f"{brief_part}. "
        f"Minimal, modern, corporate technology blog illustration. "
        f"Use only these colors: {BRAND_BASE_COLOR} (base/dark) and "
        f"{BRAND_ACCENT_COLOR} (accent), plus white. "
        f"Single centered motif, generous negative space, simple background "
        f"(solid color or very simple gradient), no complex scene, no people's faces. "
        f"{NEGATIVE_CONSTRAINTS}."
    )


def generate_with_vertexai(prompt: str, out_path: Path, model: str) -> None:
    """
    Vertex AI Imagen での生成(雛形)。
    要インストール: `pip install google-genai`（もしくは組織標準のSDK）
    要環境変数: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION
      (ADCが通っていれば GOOGLE_APPLICATION_CREDENTIALS は不要な場合もある)
    """
    from google import genai  # type: ignore

    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    if not project:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT が未設定です")

    client = genai.Client(vertexai=True, project=project, location=location)
    result = client.models.generate_images(
        model=model,
        prompt=prompt,
        config={
            "number_of_images": 1,
            "aspect_ratio": "16:9",
        },
    )
    image = result.generated_images[0].image
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(str(out_path))  # 要: 実際のSDKレスポンス形状を確認して調整する


def generate_with_openai(prompt: str, out_path: Path, model: str) -> None:
    """
    OpenAI Images API での生成(雛形)。
    要インストール: `pip install openai`
    要環境変数: OPENAI_API_KEY
    """
    import base64

    from openai import OpenAI  # type: ignore

    client = OpenAI()
    result = client.images.generate(
        model=model,
        prompt=prompt,
        size="1536x1024",  # 16:9に近いサポートサイズ。要: 実際の対応サイズ一覧を確認
        n=1,
    )
    b64_data = result.data[0].b64_json
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(b64_data))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", required=True)
    parser.add_argument("--brief", default=None, help="モチーフの方向性(あれば)")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument(
        "--provider",
        default=os.environ.get("MOTIF_PROVIDER", "vertexai"),
        choices=["vertexai", "openai"],
    )
    args = parser.parse_args()

    prompt = build_prompt(args.title, args.brief)

    # プロンプトは必ず保存する(再現性のため。デザイン方針4)
    prompt_path = args.out.with_name(args.out.stem + "-prompt").with_suffix(".txt")
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.write_text(
        f"provider: {args.provider}\ntitle: {args.title}\n\n{prompt}\n",
        encoding="utf-8",
    )

    if args.provider == "vertexai":
        generate_with_vertexai(prompt, args.out, DEFAULT_VERTEXAI_MODEL)
    else:
        generate_with_openai(prompt, args.out, DEFAULT_OPENAI_MODEL)

    print(f"Motif saved: {args.out}")
    print(f"Prompt saved: {prompt_path}")
    print("NOTE: 生成画像に文字や余計な要素が写り込んでいないか必ず目視確認すること。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
