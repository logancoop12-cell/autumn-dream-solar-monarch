import type { RatingLabel, SleeveGrade } from "@/lib/rating/types";

export function labelFor(score: number): RatingLabel {
  if (score >= 81) return "Strong Buy";
  if (score >= 61) return "Buy";
  if (score >= 41) return "Hold";
  if (score >= 21) return "Sell";
  return "Strong Sell";
}

export function gradeFor(score: number): SleeveGrade {
  if (score >= 81) return "A";
  if (score >= 61) return "B";
  if (score >= 41) return "C";
  if (score >= 21) return "D";
  return "F";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function fmtMultiple(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}×`;
}

export function fmtPct(decimal: number | null, digits = 1): string {
  if (decimal == null || !Number.isFinite(decimal)) return "—";
  const v = decimal * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

export function fmtPctPlain(decimal: number | null, digits = 1): string {
  if (decimal == null || !Number.isFinite(decimal)) return "—";
  return `${(decimal * 100).toFixed(digits)}%`;
}

export function fmtRatio(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function fmtYield(decimal: number | null): string {
  return fmtPctPlain(decimal, 2);
}

export function fmtMetric(unit: "x" | "pct" | "ratio" | "yield", n: number | null): string {
  if (unit === "x") return fmtMultiple(n);
  if (unit === "pct") return fmtPctPlain(n);
  if (unit === "yield") return fmtYield(n);
  return fmtRatio(n);
}

export function fmtCompact(n: number | null, currency = "USD"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [step, suffix] of units) {
    if (abs >= step) {
      const digits = abs / step >= 100 ? 0 : abs / step >= 10 ? 1 : 2;
      return `${sign}${symbolFor(currency)}${(abs / step).toFixed(digits)}${suffix}`;
    }
  }
  return `${sign}${symbolFor(currency)}${abs.toFixed(0)}`;
}

export function fmtPrice(n: number | null, currency = "USD"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 100 ? 2 : 2;
  return `${symbolFor(currency)}${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function symbolFor(currency: string): string {
  if (currency === "USD" || currency === "CAD" || currency === "AUD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  if (currency === "JPY") return "¥";
  return "";
}

export function toneOf(label: RatingLabel | null): "buy" | "hold" | "sell" | "muted" {
  if (label === "Strong Buy" || label === "Buy") return "buy";
  if (label === "Hold") return "hold";
  if (label === "Sell" || label === "Strong Sell") return "sell";
  return "muted";
}
