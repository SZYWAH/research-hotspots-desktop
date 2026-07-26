from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


VARIANTS = (
    ("v3", "v3 hierarchical/shared"),
    ("a", "UMAP-A · n15 / min_dist 0"),
    ("b", "UMAP-B · n30 / min_dist 0.02"),
    ("c", "UMAP-C · n60 / min_dist 0.05"),
)

GROUPS = (
    ("global", "1. 全局主体 · 45°/18° · P95 构图"),
    ("interwoven", "2. 严重交织区域 · Computational Biology 138/96"),
    ("system-small", "3. 小热点系统 · Computational Biology 138"),
    ("system-medium", "4. 中热点系统 · Artificial Intelligence 78"),
    ("system-large", "5. 大热点系统 · Quantum Physics 1"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        default=r"D:\wenjian\Desktop\综合课程设计\验收临时\galaxy-layout-ab-20260725",
    )
    parser.add_argument("--run-dir", default="multiscale-20260726")
    return parser.parse_args()


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def crop_capture(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = image.convert("RGB")
        if image.size != (1600, 900):
            raise ValueError(f"unexpected raw screenshot size {image.size}: {source}")
        cropped = image.crop((80, 0, 1520, 900))
        if cropped.size != (1440, 900):
            raise ValueError(f"unexpected crop size {cropped.size}: {source}")
        cropped.save(destination, "JPEG", quality=95, subsampling=0, optimize=True)


def make_grid(images: list[tuple[str, Path]], destination: Path) -> None:
    canvas = Image.new("RGB", (1440, 900), "#000000")
    draw = ImageDraw.Draw(canvas)
    label_font = font(24)
    for index, (label, image_path) in enumerate(images):
        with Image.open(image_path) as image:
            tile = image.convert("RGB").resize((720, 450), Image.Resampling.LANCZOS)
        left = (index % 2) * 720
        top = (index // 2) * 450
        canvas.paste(tile, (left, top))
        draw.rectangle((left + 14, top + 14, left + 290, top + 54), fill=(2, 7, 17, 218))
        draw.text((left + 26, top + 20), label, font=label_font, fill="#edf6ff")
        draw.rectangle((left, top, left + 719, top + 449), outline="#29354d", width=2)
    canvas.save(destination, "JPEG", quality=95, subsampling=0, optimize=True)


def render_page(run_root: Path, manifest: dict) -> str:
    sections = []
    for group_id, group_label in GROUPS:
        cards = []
        for variant_id, variant_label in VARIANTS:
            relative = f"images/{group_id}-{variant_id}.jpg"
            cards.append(
                f"""
                <a class="card" href="{html.escape(relative)}" target="_blank">
                  <img src="{html.escape(relative)}" alt="{html.escape(group_label)} · {html.escape(variant_label)}">
                  <span>{html.escape(variant_label)}</span>
                </a>
                """
            )
        sections.append(
            f"""
            <section id="{html.escape(group_id)}">
              <div class="section-head">
                <h2>{html.escape(group_label)}</h2>
                <a href="grids/{html.escape(group_id)}-four-grid.jpg" target="_blank">打开四宫格原图</a>
              </div>
              <img class="grid-preview" src="grids/{html.escape(group_id)}-four-grid.jpg" alt="{html.escape(group_label)} 四宫格">
              <div class="cards">{"".join(cards)}</div>
            </section>
            """
        )
    supplemental = []
    for name in (
        "v3-theory-best-overview.png",
        "umap-a-overview.jpg",
        "umap-b-overview.jpg",
        "umap-c-overview.jpg",
    ):
        if (run_root.parent / "screenshots" / name).exists():
            supplemental.append(
                f'<a href="../screenshots/{html.escape(name)}" target="_blank">{html.escape(name)}</a>'
            )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>理论星图 v3 / UMAP-A/B/C 多尺度 A/B</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: #03050a; color: #dce8fb; }}
    main {{ width: min(1500px, calc(100vw - 40px)); margin: 0 auto; padding: 36px 0 80px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    h2 {{ margin: 0; font-size: 20px; }}
    p {{ color: #91a2bd; line-height: 1.7; }}
    nav {{ position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0;
      background: rgba(3,5,10,.92); backdrop-filter: blur(12px); }}
    nav a, .section-head a, .supplemental a {{ color: #b9d7ff; text-decoration: none; border: 1px solid #25334b;
      border-radius: 999px; padding: 7px 12px; background: #080d17; }}
    section {{ margin-top: 32px; padding: 20px; border: 1px solid #182238; border-radius: 14px; background: #070a11; }}
    .section-head {{ display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }}
    .grid-preview {{ display: block; width: 100%; aspect-ratio: 16/10; object-fit: contain; background: #000;
      border: 1px solid #1e2a42; border-radius: 10px; }}
    .cards {{ display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 14px; }}
    .card {{ color: #dce8fb; text-decoration: none; border: 1px solid #1b2740; border-radius: 9px; overflow: hidden; background: #050810; }}
    .card img {{ display: block; width: 100%; aspect-ratio: 16/10; object-fit: cover; }}
    .card span {{ display: block; padding: 10px 12px; font-size: 13px; }}
    .supplemental {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 14px; }}
    code {{ color: #cfe5ff; }}
    @media (max-width: 900px) {{ .cards {{ grid-template-columns: repeat(2,minmax(0,1fr)); }} }}
  </style>
</head>
<body>
<main>
  <h1>理论星图 v3 / UMAP-A/B/C 多尺度 A/B</h1>
  <p>所有主对照使用同一 1440×900 逻辑画布。全局与交织区统一 45°/18°；局部系统统一 45°/26°、距离 8。
  本页只用于人工选择，没有启用任何 UMAP 候选。</p>
  <nav>
    {"".join(f'<a href="#{group_id}">{html.escape(label.split("·")[0].strip())}</a>' for group_id, label in GROUPS)}
    <a href="fixed-view-metrics.html">固定视角指标</a>
    <a href="capture-manifest.json">截图清单</a>
  </nav>
  {"".join(sections)}
  <section>
    <h2>补充：各候选既有独立最佳视角</h2>
    <p>这些图片只作补充，不参与同视角横向判断。</p>
    <div class="supplemental">{"".join(supplemental) or "无"}</div>
  </section>
</main>
</body>
</html>
"""


def metrics_page(run_root: Path) -> str:
    markdown_path = run_root / "fixed-view-metrics.md"
    markdown = markdown_path.read_text(encoding="utf-8") if markdown_path.exists() else ""
    escaped = html.escape(markdown)
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>固定视角指标</title>
<style>body{{margin:0;background:#03050a;color:#dce8fb;font:15px/1.7 Consolas,"Microsoft YaHei",monospace}}
main{{max-width:1200px;margin:auto;padding:32px}}pre{{white-space:pre-wrap;border:1px solid #1c2940;border-radius:12px;padding:20px;background:#070b13}}
a{{color:#b9d7ff}}</style></head><body><main><a href="index.html">← 返回 A/B</a><pre>{escaped}</pre></main></body></html>"""


def main() -> None:
    args = parse_args()
    root = Path(args.root).resolve()
    run_root = root / args.run_dir
    raw_root = run_root / "raw"
    image_root = run_root / "images"
    grid_root = run_root / "grids"
    image_root.mkdir(parents=True, exist_ok=True)
    grid_root.mkdir(parents=True, exist_ok=True)

    manifest_entries = []
    for group_id, _group_label in GROUPS:
        grid_images = []
        for variant_id, variant_label in VARIANTS:
            source = raw_root / f"{group_id}-{variant_id}.jpg"
            destination = image_root / f"{group_id}-{variant_id}.jpg"
            crop_capture(source, destination)
            grid_images.append((variant_label, destination))
            manifest_entries.append(
                {
                    "group": group_id,
                    "variant": variant_id,
                    "path": destination.relative_to(run_root).as_posix(),
                    "width": 1440,
                    "height": 900,
                    "sha256": sha256(destination),
                }
            )
        make_grid(grid_images, grid_root / f"{group_id}-four-grid.jpg")

    capture_manifest = {
        "purpose": "fixed-camera multiscale A/B only; no candidate selected",
        "logicalViewport": {"width": 1440, "height": 900},
        "groups": [group_id for group_id, _label in GROUPS],
        "variants": [variant_id for variant_id, _label in VARIANTS],
        "captures": manifest_entries,
    }
    (run_root / "capture-manifest.json").write_text(
        json.dumps(capture_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (run_root / "index.html").write_text(
        render_page(run_root, capture_manifest),
        encoding="utf-8",
    )
    (run_root / "fixed-view-metrics.html").write_text(
        metrics_page(run_root),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "pass": True,
                "index": str(run_root / "index.html"),
                "captureCount": len(manifest_entries),
                "gridCount": len(GROUPS),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
