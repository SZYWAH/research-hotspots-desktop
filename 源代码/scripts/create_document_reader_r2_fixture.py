from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "fixtures" / "document-reader-r2-four-page.pdf"
FONT_PATH = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_NAME = "SideraFixtureCjk"


def heading(pdf: canvas.Canvas, title: str, subtitle: str, width: float, height: float) -> None:
    pdf.setFillColor(HexColor("#111111"))
    pdf.setFont(FONT_NAME, 18)
    pdf.drawString(54, height - 64, title)
    pdf.setFillColor(HexColor("#555555"))
    pdf.setFont(FONT_NAME, 9)
    pdf.drawRightString(width - 54, height - 60, subtitle)
    pdf.setStrokeColor(HexColor("#D7D7D7"))
    pdf.line(54, height - 76, width - 54, height - 76)


def lines(pdf: canvas.Canvas, values: list[str], x: float, y: float, width: float) -> None:
    pdf.setFillColor(HexColor("#222222"))
    pdf.setFont(FONT_NAME, 11)
    cursor = y
    for value in values:
        pdf.drawString(x, cursor, value)
        cursor -= 22
    pdf.setStrokeColor(HexColor("#B9C7DD"))
    pdf.rect(x - 8, cursor - 5, width, y - cursor + 16, stroke=1, fill=0)


def build() -> Path:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_PATH), subfontIndex=0))
    width, height = A4
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    pdf.setTitle("Sidera Document Reader R2 Four Page Fixture")
    pdf.setAuthor("Sidera automated fixture")

    heading(pdf, "第一页：中文原生文本", "中文 / UTF-16 / 精确选区", width, height)
    lines(
        pdf,
        [
            "证据锚必须绑定文档版本、页码和原文范围。",
            "模型检索只是候选来源，最终引用必须回到可核验页码。",
            "人工智能与 machine learning 共享同一段双语证据。",
            "选择“精确范围”时，高亮不能扩展到整行文本。",
        ],
        70,
        height - 125,
        width - 140,
    )
    pdf.showPage()

    heading(pdf, "Page 2: English native text", "English / lexical / semantic", width, height)
    lines(
        pdf,
        [
            "Evidence anchors remain stable across parser revisions.",
            "Hybrid retrieval combines lexical and semantic rankings with weighted RRF.",
            "A cancelled indexing job must not replace the last ready snapshot.",
            "The exact selected phrase stays aligned at 100% and 125% zoom.",
        ],
        70,
        height - 125,
        width - 140,
    )
    pdf.showPage()

    heading(pdf, "第三页：双栏学术版面", "双栏 / 不跨页分段", width, height)
    left = [
        "左栏：每个检索片段不得跨页。",
        "默认片段最多八百个 UTF-16 字符。",
        "相邻片段保留一百二十字符重叠。",
        "词法索引不可伪装成语义索引。",
        "批注数据库独立于可重建派生库。",
    ]
    right = [
        "右栏：页面坐标统一归一化到零至一。",
        "重定位多义时必须标记 ambiguous。",
        "找不到原文时必须标记 missing。",
        "删除派生库不会删除用户批注。",
        "阅读器正文始终优先于低频工具。",
    ]
    lines(pdf, left, 64, height - 125, (width - 150) / 2)
    lines(pdf, right, width / 2 + 10, height - 125, (width - 150) / 2)
    pdf.showPage()

    rotated_width, rotated_height = landscape(A4)
    pdf.setPageSize((rotated_width, rotated_height))
    pdf.setPageRotation(90)
    heading(
        pdf,
        "Page 4: Rotated evidence geometry",
        "rotation 90 / viewport transform",
        rotated_width,
        rotated_height,
    )
    lines(
        pdf,
        [
            "Rotated pages must apply the PDF.js viewport transform before normalization.",
            "Canvas and TextLayer share one exact CSS size and one scale factor.",
            "Keyboard and pointer selections produce the same evidence anchor contract.",
        ],
        70,
        rotated_height - 125,
        rotated_width - 140,
    )
    pdf.save()
    return OUTPUT


if __name__ == "__main__":
    print(build())
