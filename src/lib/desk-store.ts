export type SavedRating = {
  symbol: string;
  name: string;
  score: number | null;
  label: string | null;
  industry: string;
  at: string;
};

const WATCH = "halden-watch";
const RECENT = "halden-recent";

function read(key: string): SavedRating[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRating[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, rows: SavedRating[]) {
  window.localStorage.setItem(key, JSON.stringify(rows.slice(0, 12)));
}

export function readWatch(): SavedRating[] {
  return read(WATCH);
}

export function readRecent(): SavedRating[] {
  return read(RECENT);
}

export function isWatched(symbol: string): boolean {
  return readWatch().some((row) => row.symbol === symbol);
}

export function toggleWatch(row: SavedRating): boolean {
  const rows = readWatch();
  const exists = rows.some((item) => item.symbol === row.symbol);
  write(
    WATCH,
    exists ? rows.filter((item) => item.symbol !== row.symbol) : [row, ...rows],
  );
  return !exists;
}

export function remember(row: SavedRating) {
  const rows = readRecent().filter((item) => item.symbol !== row.symbol);
  write(RECENT, [row, ...rows]);
}
