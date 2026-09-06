from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import registerFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


OUTPUT = Path("output/pdf/document-reader-lifecycle-240-page-v2.pdf")
PAGE_COUNT = 240
LINE_REPEAT = 1


def draw_header(pdf: canvas.Canvas, page: int, title: str) -> None:
    width, height = A4
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(42, height - 42, title)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(width - 42, height - 42, f"Sidera lifecycle fixture - page {page}/{PAGE_COUNT}")
    pdf.setLineWidth(0.4)
    pdf.line(42, height - 50, width - 42, height - 50)


def draw_chinese_page(pdf: canvas.Canvas, page: int) -> None:
    width, height = A4
    draw_header(pdf, page, "Chinese evidence page")
    pdf.setFont("SideraFixtureCJK", 10)
    y = height - 72
    for line in range(42):
        for repeat in range(LINE_REPEAT):
            text = (
                f"第{page}页第{line + 1}行副本{repeat + 1}：页码与上下文稳定，"
                "引用可回到原页。"
            )
            pdf.drawString(46, y, text)
        y -= 16


def draw_english_page(pdf: canvas.Canvas, page: int) -> None:
    width, height = A4
    draw_header(pdf, page, "English evidence page")
    pdf.setFont("Helvetica", 9)
    y = height - 72
    for line in range(44):
        for repeat in range(LINE_REPEAT):
            text = (
                f"Page {page}, line {line + 1}, copy {repeat + 1}: ML evidence keeps page citations and anchors."
            )
            pdf.drawString(46, y, text)
        y -= 15


def draw_two_column_page(pdf: canvas.Canvas, page: int) -> None:
    width, height = A4
    draw_header(pdf, page, "Two-column evidence layout")
    top = height - 72
    gutter = 18
    column_width = (width - 84 - gutter) / 2
    pdf.setFont("Helvetica", 8)
    for column in range(2):
        x = 42 + column * (column_width + gutter)
        y = top
        for line in range(42):
            for repeat in range(LINE_REPEAT):
                text = (
                    f"C{column + 1}-{line + 1}-{repeat + 1}: segment {page}; citation stable."
                )
                pdf.drawString(x, y, text[:48])
            y -= 15
    pdf.setLineWidth(0.25)
    pdf.line(width / 2, 56, width / 2, height - 66)


def main() -> None:
    global LINE_REPEAT, PAGE_COUNT
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--title-suffix", default="")
    parser.add_argument("--pages", type=int, default=PAGE_COUNT)
    parser.add_argument("--line-repeat", type=int, default=LINE_REPEAT)
    args = parser.parse_args()
    PAGE_COUNT = args.pages
    LINE_REPEAT = args.line_repeat

    registerFont(TTFont("SideraFixtureCJK", r"C:\Windows\Fonts\simhei.ttf"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(args.output), pagesize=A4, pageCompression=1)
    pdf.setTitle(f"Sidera document reader lifecycle fixture {args.title_suffix}".strip())
    pdf.setAuthor("Sidera isolated acceptance fixture")

    for page in range(1, PAGE_COUNT + 1):
        # Keep this long fixture deliberately free of page rotation: it is used
        # only for parse/index lifecycle timing. Rotation and selection accuracy
        # are covered by the separate four-page evidence fixture.
        if page % 12 == 3:
            draw_two_column_page(pdf, page)
        elif page % 2:
            draw_chinese_page(pdf, page)
        else:
            draw_english_page(pdf, page)
        pdf.showPage()

    pdf.save()
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest().upper()
    print(f"created={args.output.resolve()}")
    print(f"pages={PAGE_COUNT}")
    print(f"bytes={args.output.stat().st_size}")
    print(f"sha256={digest}")


if __name__ == "__main__":
    main()
