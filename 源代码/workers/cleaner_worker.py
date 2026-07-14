import html
import json
import re
import sys
from pathlib import Path


SOURCE_PRIORITY = {"cnki": 0, "openalex": 1, "arxiv": 2, "local": 3}


def normalize_whitespace(value):
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_title(title):
    return re.sub(r"\s+", " ", (title or "").lower()).strip()


def clean_text(value, max_len):
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    return normalize_whitespace(text)[:max_len]


def paper_rank(paper):
    source = str(paper.get("source") or "local").lower()
    abstract_len = len(str(paper.get("abstract") or ""))
    year = int(paper.get("year") or 0)
    return (SOURCE_PRIORITY.get(source, 9), -abstract_len, -year)


def run_cleaner(papers):
    before_count = len(papers)
    cleaned = []
    removed = []

    for paper in papers:
        next_paper = dict(paper)
        next_paper["title"] = clean_text(next_paper.get("title", ""), 500)
        next_paper["abstract"] = clean_text(next_paper.get("abstract", ""), 5000)
        if not next_paper["title"] or not next_paper["abstract"]:
            removed.append(str(next_paper.get("id", "")))
            continue
        cleaned.append(next_paper)

    kept_by_doi = {}
    for paper in cleaned:
        doi = normalize_whitespace(str(paper.get("doi") or "")).lower()
        if not doi:
            continue
        current = kept_by_doi.get(doi)
        if current is None or paper_rank(paper) < paper_rank(current):
            if current is not None:
                removed.append(str(current.get("id", "")))
            kept_by_doi[doi] = paper
        else:
            removed.append(str(paper.get("id", "")))

    doi_keep_ids = {str(paper.get("id", "")) for paper in kept_by_doi.values()}
    doi_removed_ids = set(removed)
    doi_filtered = [
        paper
        for paper in cleaned
        if str(paper.get("id", "")) in doi_keep_ids
        or normalize_whitespace(str(paper.get("doi") or "")) == ""
        or str(paper.get("id", "")) not in doi_removed_ids
    ]

    kept_by_title = {}
    final = []
    for paper in sorted(doi_filtered, key=paper_rank):
        key = normalize_title(paper.get("title", ""))
        if not key:
            removed.append(str(paper.get("id", "")))
            continue
        if key in kept_by_title:
            removed.append(str(paper.get("id", "")))
            continue
        kept_by_title[key] = paper
        final.append(paper)

    duplicate_ids = sorted({item for item in removed if item})
    return {
        "beforeCount": before_count,
        "afterCount": len(final),
        "removedCount": before_count - len(final),
        "duplicateIds": duplicate_ids,
        "cleanedPapers": final,
        "summary": f"清洗 {before_count} 篇，保留 {len(final)} 篇，移除 {before_count - len(final)} 篇。",
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("missing input json path")

    input_path = Path(sys.argv[1])
    papers = json.loads(input_path.read_text(encoding="utf-8-sig"))
    print(json.dumps(run_cleaner(papers), ensure_ascii=False))


if __name__ == "__main__":
    main()
