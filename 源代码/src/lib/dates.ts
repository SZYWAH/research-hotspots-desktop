export function nowIso() {
  return new Date().toISOString();
}

export function formatDateTime(value?: string) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function clampYear(value: unknown, fallback = new Date().getFullYear()) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(new Date().getFullYear() + 1, Math.max(1900, Math.trunc(parsed)));
}
