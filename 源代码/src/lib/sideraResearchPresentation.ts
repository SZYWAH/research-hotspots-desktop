export type SideraResearchDisplayOrder =
  | "source-return-order"
  | "newest"
  | "oldest"
  | "title";

export type SideraResearchPresentationCandidate = {
  id: string;
  title: string;
  year?: number | null;
  retrievalPosition?: { rank?: number | null } | null;
};

export type SideraResearchSnapshotIdentity = {
  taskId: string;
  epoch: number;
};

export type SideraResearchPresentationFilters = {
  recordKinds: readonly string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  fullTextOnly: boolean;
};

export function orderSideraResearchCandidates<T extends SideraResearchPresentationCandidate>(
  candidates: readonly T[],
  displayOrder: SideraResearchDisplayOrder,
): T[] {
  const rows = candidates.map((candidate, index) => ({
    candidate,
    index,
    rank: candidate.retrievalPosition?.rank ?? index + 1,
  }));
  if (displayOrder === "source-return-order") return rows.map((row) => row.candidate);
  rows.sort((left, right) => {
    if (displayOrder === "title") {
      const titleOrder = left.candidate.title.localeCompare(right.candidate.title, "zh-CN", {
        sensitivity: "base",
        numeric: true,
      });
      return titleOrder || left.rank - right.rank || left.index - right.index;
    }
    const leftYear = left.candidate.year;
    const rightYear = right.candidate.year;
    if (leftYear == null && rightYear != null) return 1;
    if (leftYear != null && rightYear == null) return -1;
    if (leftYear != null && rightYear != null && leftYear !== rightYear) {
      return displayOrder === "newest" ? rightYear - leftYear : leftYear - rightYear;
    }
    return left.rank - right.rank || left.index - right.index;
  });
  return rows.map((row) => row.candidate);
}

export function paginateSideraResearchCandidates<T>(
  candidates: readonly T[],
  requestedPage: number,
  pageSize = 10,
) {
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.max(1, Math.ceil(candidates.length / safePageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1));
  return {
    currentPage,
    pageCount,
    candidates: candidates.slice(
      (currentPage - 1) * safePageSize,
      currentPage * safePageSize,
    ),
  };
}

export function toggleSideraResearchPageSelection<T extends { id: string }>(
  selectedIds: readonly string[],
  pageCandidates: readonly T[],
  checked: boolean,
) {
  const pageIds = new Set(pageCandidates.map((candidate) => candidate.id));
  return checked
    ? [...new Set([...selectedIds, ...pageIds])]
    : selectedIds.filter((id) => !pageIds.has(id));
}

export function sideraResearchSnapshotKey(
  snapshot: SideraResearchSnapshotIdentity | null | undefined,
) {
  return snapshot ? `${snapshot.taskId}:${snapshot.epoch}` : "none";
}

export function shouldResetSideraResearchPresentation(
  previousKey: string | null,
  snapshot: SideraResearchSnapshotIdentity | null | undefined,
) {
  const nextKey = sideraResearchSnapshotKey(snapshot);
  return previousKey !== null && previousKey !== nextKey;
}

export function sideraResearchFiltersAreActive(filters: SideraResearchPresentationFilters) {
  const defaultKinds = ["journal-article", "conference-paper", "thesis"];
  const requestedKinds = new Set(filters.recordKinds);
  return requestedKinds.size !== defaultKinds.length
    || defaultKinds.some((kind) => !requestedKinds.has(kind))
    || filters.yearFrom != null
    || filters.yearTo != null
    || filters.fullTextOnly;
}
