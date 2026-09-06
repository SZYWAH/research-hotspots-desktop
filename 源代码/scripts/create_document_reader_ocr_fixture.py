from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "scripts" / "fixtures" / "document-reader-r3-scanned-ocr.pdf"
PREVIEW_DIR = ROOT / "tmp" / "pdfs" / "document-reader-r3-scanned-ocr"
PAGE_SIZE = (1654, 2339)
MARGIN = 150


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    filename = "msyhbd.ttc" if bold else "msyh.ttc"
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / filename), size)


def page() -> Image.Image:
    return Image.new("RGB", PAGE_SIZE, "white")


def header(draw: ImageDraw.ImageDraw, title: str, subtitle: str) -> int:
    draw.text((MARGIN, 150), title, fill="#111111", font=font(66, bold=True))
    draw.text((MARGIN, 250), subtitle, fill="#4b5563", font=font(32))
    draw.line((MARGIN, 320, PAGE_SIZE[0] - MARGIN, 320), fill="#9ca3af", width=3)
    return 390


def paragraph(draw: ImageDraw.ImageDraw, lines: list[str], x: int, y: int, width: int, *, fill: str = "#111111") -> int:
    line_height = 64
    for line in lines:
        draw.text((x, y), line, fill=fill, font=font(36))
        y += line_height
    draw.rectangle((x - 20, y + 20, x + width, y + 24), fill="#dbeafe")
    return y + 90


def chinese_page() -> Image.Image:
    image = page()
    draw = ImageDraw.Draw(image)
    y = header(draw, "第一页：中文扫描证据", "用于验证本地按需 OCR、页码锚点与来源切换")
    y = paragraph(draw, [
        "研究证据必须回到可核验的页码。",
        "原生文本与 OCR 结果并存，不互相覆盖。",
        "用户主动触发识别，打开文档不会自动运行。",
        "识别结果需要保留坐标、置信度与模型版本。",
    ], MARGIN, y, 1250)
    draw.rounded_rectangle((MARGIN, y, PAGE_SIZE[0] - MARGIN, y + 360), radius=24, outline="#2563eb", width=4)
    draw.text((MARGIN + 50, y + 55), "关键句", fill="#2563eb", font=font(30, bold=True))
    draw.text((MARGIN + 50, y + 135), "中文查询应能引用到这一页的稳定证据锚。", fill="#111111", font=font(42, bold=True))
    draw.text((MARGIN + 50, y + 230), "页码引用：第 1 页", fill="#4b5563", font=font(32))
    return image


def english_page() -> Image.Image:
    image = page()
    draw = ImageDraw.Draw(image)
    y = header(draw, "Page 2: English scanned evidence", "Local OCR acceptance fixture - no embedded PDF text")
    y = paragraph(draw, [
        "Evidence answers must cite a verifiable page number.",
        "OCR is explicitly requested and never starts on document open.",
        "Native text and OCR results coexist without overwriting each other.",
        "A cancelled job must reject every late result.",
    ], MARGIN, y, 1250)
    draw.rounded_rectangle((MARGIN, y, PAGE_SIZE[0] - MARGIN, y + 360), radius=24, outline="#2563eb", width=4)
    draw.text((MARGIN + 50, y + 55), "Anchor sentence", fill="#2563eb", font=font(30, bold=True))
    draw.text((MARGIN + 50, y + 135), "English evidence links back to page 2 precisely.", fill="#111111", font=font(40, bold=True))
    draw.text((MARGIN + 50, y + 230), "Citation target: page 2", fill="#4b5563", font=font(32))
    return image


def dual_column_page() -> Image.Image:
    image = page()
    draw = ImageDraw.Draw(image)
    y = header(draw, "第三页：双栏扫描版面", "验证列顺序、边界坐标及分页隔离")
    gap = 70
    column_width = (PAGE_SIZE[0] - MARGIN * 2 - gap) // 2
    left = MARGIN
    right = MARGIN + column_width + gap
    draw.rounded_rectangle((left, y, left + column_width, y + 1030), radius=20, outline="#94a3b8", width=3)
    draw.rounded_rectangle((right, y, right + column_width, y + 1030), radius=20, outline="#94a3b8", width=3)
    paragraph(draw, [
        "左栏：片段不得跨页。",
        "坐标统一归一化。",
        "文字范围使用 UTF-16。",
        "证据锚不含解析运行 ID。",
        "重定位失败必须显式标记。",
    ], left + 34, y + 50, column_width - 70)
    paragraph(draw, [
        "Right column: page scope is strict.",
        "Coordinates remain normalized.",
        "Ambiguous anchors stay visible.",
        "Missing anchors never move silently.",
        "Source preference survives restart.",
    ], right + 34, y + 50, column_width - 70)
    draw.text((MARGIN, y + 1120), "双栏引用应保持真实页码：第 3 页", fill="#111111", font=font(42, bold=True))
    return image


def rotated_page() -> Image.Image:
    landscape = Image.new("RGB", (PAGE_SIZE[1], PAGE_SIZE[0]), "white")
    draw = ImageDraw.Draw(landscape)
    draw.text((160, 140), "Page 4: Rotated scanned evidence", fill="#111111", font=font(64, bold=True))
    draw.line((160, 240, landscape.width - 160, 240), fill="#9ca3af", width=3)
    paragraph(draw, [
        "This entire raster page is rotated by ninety degrees.",
        "OCR coordinates and clickable citations must rotate together.",
        "The stable sentence on page 4 verifies precise jump-back behavior.",
    ], 160, 330, landscape.width - 320)
    draw.rounded_rectangle((160, 760, landscape.width - 160, 1160), radius=24, outline="#2563eb", width=4)
    draw.text((220, 850), "ROTATED ANCHOR - PAGE 4", fill="#2563eb", font=font(52, bold=True))
    return landscape.rotate(90, expand=True)


def low_confidence_page() -> Image.Image:
    image = page()
    draw = ImageDraw.Draw(image)
    y = header(draw, "第五页：低置信扫描", "低对比、轻度模糊，仅用于显示置信度，不要求自动纠错")
    fill = "#a1a1aa"
    paragraph(draw, [
        "低置信文字仍需保留来源与坐标。",
        "界面必须明确显示识别质量，而不是伪装准确。",
        "用户可以重新识别，但旧证据不能被静默删除。",
    ], MARGIN, y, 1250, fill=fill)
    draw.text((MARGIN, y + 420), "LOW CONFIDENCE PAGE 5", fill="#b6b6bc", font=font(48, bold=True))
    return image.filter(ImageFilter.GaussianBlur(radius=1.4))


def main() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pages = [chinese_page(), english_page(), dual_column_page(), rotated_page(), low_confidence_page()]
    for index, image in enumerate(pages, start=1):
        image.save(PREVIEW_DIR / f"page-{index}.png", format="PNG", optimize=True)
    pages[0].save(
        OUTPUT,
        format="PDF",
        resolution=144.0,
        save_all=True,
        append_images=pages[1:],
        title="Sidera Document OCR R1 Scanned Fixture",
        author="Sidera test fixture",
    )
    print(f"created={OUTPUT}")
    print(f"pages={len(pages)}")
    print(f"bytes={OUTPUT.stat().st_size}")


if __name__ == "__main__":
    main()
