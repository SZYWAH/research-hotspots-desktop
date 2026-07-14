import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


STOPWORDS = {
    "about",
    "after",
    "also",
    "and",
    "analysis",
    "approach",
    "based",
    "between",
    "data",
    "design",
    "different",
    "for",
    "from",
    "into",
    "large",
    "learning",
    "method",
    "methods",
    "model",
    "models",
    "paper",
    "proposed",
    "research",
    "results",
    "study",
    "system",
    "that",
    "their",
    "this",
    "use",
    "using",
    "with",
    "without",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def tokenize(text):
    words = []
    for token in re.findall(r"[a-zA-Z][a-zA-Z-]{2,}", text.lower()):
        token = token.strip("-")
        if len(token) >= 3 and token not in STOPWORDS:
            words.append(token)

    # Small Chinese fallback: keep compact 2-6 character scientific phrases.
    for chunk in re.findall(r"[\u4e00-\u9fff]{2,12}", text):
        for size in (4, 3, 2):
            if len(chunk) >= size:
                words.extend(chunk[index : index + size] for index in range(0, len(chunk) - size + 1, size))
                break
    return words


def top_keywords(papers, limit=8):
    counts = Counter()
    for paper in papers:
        counts.update(tokenize(f"{paper.get('title', '')} {paper.get('abstract', '')}"))
    return [word for word, _ in counts.most_common(limit)]


def keyword_weights(papers, limit=10):
    counts = Counter()
    for paper in papers:
        counts.update(tokenize(f"{paper.get('title', '')} {paper.get('abstract', '')}"))
    if not counts:
        return []
    max_count = max(counts.values())
    return [
        {"keyword": word, "weight": round(count / max_count, 4)}
        for word, count in counts.most_common(limit)
    ]


def safe_year(paper):
    year = paper.get("year")
    if isinstance(year, int):
        return year
    if isinstance(year, str) and year[:4].isdigit():
        return int(year[:4])
    published = str(paper.get("publishedDate") or "")
    if published[:4].isdigit():
        return int(published[:4])
    return datetime.now().year


def paper_score(paper):
    source_priority = {"cnki": 0, "openalex": 1, "arxiv": 2, "local": 3}
    source = str(paper.get("source") or "local").lower()
    abstract_len = len(str(paper.get("abstract") or ""))
    return (source_priority.get(source, 9), -abstract_len, -safe_year(paper))


def coordinates(seed, index, count):
    digest = hashlib.sha1(seed.encode("utf-8")).digest()
    angle = ((digest[0] / 255) * math.tau) + index * 0.9
    radius = 18 + min(58, count * 8 + digest[1] / 8)
    return {
        "x": round(math.cos(angle) * radius, 2),
        "y": round(math.sin(angle) * radius, 2),
        "z": round((digest[2] / 255) * 52 - 26, 2),
    }


def trend_for(year_counts):
    if len(year_counts) < 2:
        return "Stable"
    years = sorted(year_counts)
    first = year_counts[years[0]]
    last = year_counts[years[-1]]
    if last > first:
        return "Surging"
    if last < first:
        return "Declining"
    return "Stable"


def group_papers(papers):
    by_field = defaultdict(list)
    for paper in papers:
        by_field[normalize_text(paper.get("field")) or "Local Literature"].append(paper)

    groups = []
    for field, rows in by_field.items():
        if len(rows) <= 4:
            keywords = top_keywords(rows, 5)
            label = keywords[0] if keywords else field.lower().replace(" ", "-")
            groups.append((field, label, rows))
            continue

        buckets = defaultdict(list)
        for paper in rows:
            keyword = top_keywords([paper], 1)
            buckets[keyword[0] if keyword else field.lower().replace(" ", "-")].append(paper)
        groups.extend((field, label, bucket) for label, bucket in buckets.items())

    return groups


def run_cluster(papers):
    cleaned = [dict(paper) for paper in papers if normalize_text(paper.get("title")) or normalize_text(paper.get("abstract"))]
    hotspots = []
    timestamp = now_iso()

    for index, (field, label, rows) in enumerate(sorted(group_papers(cleaned), key=lambda item: len(item[2]), reverse=True), start=1):
        weights = keyword_weights(rows, 10)
        keywords = [item["keyword"] for item in weights] or [label]
        year_counts = Counter(safe_year(paper) for paper in rows)
        evolution = []
        for year in sorted(year_counts):
            year_rows = sorted([paper for paper in rows if safe_year(paper) == year], key=paper_score)
            evolution.append(
                {
                    "year": year,
                    "count": len(year_rows),
                    "keywords": keywords[:5],
                    "representativeIds": [str(paper.get("id")) for paper in year_rows[:5] if paper.get("id")],
                }
            )

        title = " ".join(word.capitalize() for word in keywords[:3])
        hotspots.append(
            {
                "id": f"local-cluster:{field}:{index}",
                "field": field,
                "topicId": index,
                "title": title or label,
                "label": "_".join(keywords[:5]),
                "summary": (
                    f"基于 {len(rows)} 篇本地文献生成的关键词聚类。"
                    f"核心词：{', '.join(keywords[:6])}。"
                ),
                "keywords": keywords,
                "keywordWeights": weights,
                "paperCount": len(rows),
                "confidence": min(0.95, round(0.42 + len(rows) * 0.08 + min(len(keywords), 8) * 0.025, 4)),
                "source": "worker",
                "trend": trend_for(year_counts),
                "coordinates": coordinates(f"{field}:{label}:{index}", index, len(rows)),
                "evolution": evolution,
                "updatedAt": timestamp,
            }
        )

    return {
        "beforeCount": len(papers),
        "clusterCount": len(hotspots),
        "hotspots": hotspots,
        "summary": f"已从 {len(cleaned)} 篇文献生成 {len(hotspots)} 个本地关键词热点。",
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("missing input json path")
    input_path = Path(sys.argv[1])
    papers = json.loads(input_path.read_text(encoding="utf-8-sig"))
    print(json.dumps(run_cluster(papers), ensure_ascii=False))


if __name__ == "__main__":
    main()
