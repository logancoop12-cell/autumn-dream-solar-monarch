import { clamp, gradeFor, labelFor } from "@/lib/rating/format";
import type {
  AnnualPoint,
  EquityReport,
  Flag,
  MetricRow,
  PeerRow,
  Pillar,
  PricePoint,
  RatingLabel,
  Sleeve,
  StreetView,
} from "@/lib/rating/types";

export type PeerInput = {
  symbol: string;
  name: string;
  marketCap: number | null;
  currency: string | null;
  pe: number | null;
  forwardPe: number | null;
  ps: number | null;
  pb: number | null;
  dividendYield: number | null;
  change52w: number | null;
  evEbitda: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  fcfMargin: number | null;
};

export type CompanyInput = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  sector: string;
  industry: string;
  profile: string;
  price: number;
  changePct: number | null;
  marketCap: number | null;
  beta: number | null;
  week52High: number | null;
  week52Low: number | null;
  shares: number | null;
  dividendYield: number | null;
  totalRevenue: number | null;
  ebitda: number | null;
  eps: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  freeCashFlow: number | null;
  enterpriseToEbitda: number | null;
  enterpriseValue: number | null;
  revenuePerShare: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  forwardPe: number | null;
  peg: number | null;
  payout: number | null;
  insider: number | null;
  institution: number | null;
  shortInterest: number | null;
  annual: {
    revenue: SeriesPoint[];
    grossProfit: SeriesPoint[];
    netIncome: SeriesPoint[];
    ebitda: SeriesPoint[];
    eps: SeriesPoint[];
    fcf: SeriesPoint[];
    opcf: SeriesPoint[];
    debt: SeriesPoint[];
    equity: SeriesPoint[];
    currentAssets: SeriesPoint[];
    currentLiabilities: SeriesPoint[];
    assets: SeriesPoint[];
    dividends: SeriesPoint[];
    buybacks: SeriesPoint[];
    pe: SeriesPoint[];
    ps: SeriesPoint[];
    evEbitda: SeriesPoint[];
    marketCap: SeriesPoint[];
    shares: SeriesPoint[];
    interest: SeriesPoint[];
    operatingIncome: SeriesPoint[];
  };
  prices: PricePoint[];
  spyPrices: PricePoint[];
  peers: PeerInput[];
  detailedPeerCount: number;
  street: StreetView;
};

export type SeriesPoint = { date: string; value: number };

function finite(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function median(values: Array<number | null | undefined>): number | null {
  const xs = values.filter(finite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

function valuesOf(series: SeriesPoint[]): number[] {
  return series.map((p) => p.value).filter(finite);
}

/** Median of completed years, dropping the latest print so it is not compared with itself. */
function priorMedian(series: SeriesPoint[]): number | null {
  const xs = valuesOf(series);
  if (xs.length >= 3) return median(xs.slice(0, -1));
  if (xs.length === 2) return xs[0] ?? null;
  return null;
}

function levelMedian(series: SeriesPoint[]): number | null {
  const xs = valuesOf(series);
  if (xs.length >= 2) return median(xs);
  return null;
}

function yearsSpanned(dates: string[]): number {
  if (dates.length < 2) return 0;
  const a = Date.parse(dates[0]!);
  const b = Date.parse(dates[dates.length - 1]!);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, (b - a) / (365.25 * 24 * 3600 * 1000));
}

function slopePerYear(series: SeriesPoint[]): number | null {
  const pts = series.filter((p) => finite(p.value));
  if (pts.length < 3) return null;
  const t0 = Date.parse(pts[0]!.date);
  const xs = pts.map((p) => (Date.parse(p.date) - t0) / (365.25 * 24 * 3600 * 1000));
  const ys = pts.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

function cagr(series: SeriesPoint[]): number | null {
  const pts = series.filter((p) => finite(p.value) && p.value > 0);
  if (pts.length < 2) return null;
  const years = yearsSpanned(pts.map((p) => p.date));
  if (years < 0.75) return null;
  const first = pts[0]!.value;
  const last = pts[pts.length - 1]!.value;
  if (!(first > 0) || !(last > 0)) return null;
  return (last / first) ** (1 / years) - 1;
}

/** Lower multiple vs benchmark scores higher. Fair (1.0×) lands near 58. */
function cheapScore(current: number, bench: number): number {
  if (!(current > 0) || !(bench > 0)) return 12;
  const score = 58 - 36 * Math.tanh(Math.log(current / bench) / 0.42);
  return clamp(score, 3, 97);
}

/** Higher ratio vs benchmark scores higher. */
function richScore(current: number, bench: number): number {
  if (!(bench > 0)) return 40;
  if (current <= 0) return 18;
  const score = 58 + 36 * Math.tanh(Math.log(current / bench) / 0.42);
  return clamp(score, 3, 97);
}

/** Absolute spread, used for margins and ROE where a few points matter more than a ratio. */
function spreadScore(current: number, bench: number, scale: number): number {
  const score = 58 + 36 * Math.tanh((current - bench) / scale);
  return clamp(score, 3, 97);
}

function blend(parts: Array<{ score: number | null; w: number }>): number | null {
  const live = parts.filter((p): p is { score: number; w: number } => finite(p.score) && p.w > 0);
  const tw = live.reduce((s, p) => s + p.w, 0);
  if (tw <= 0) return null;
  return live.reduce((s, p) => s + p.score * p.w, 0) / tw;
}

function relPhrase(
  kind: "price" | "less" | "more",
  current: number | null,
  history: number | null,
  industry: number | null,
): string {
  if (!finite(current)) return "Not reported.";
  const bits: string[] = [];
  const judge = (ratio: number, who: string) => {
    const high = ratio >= 1.15;
    const low = ratio <= 0.87;
    if (kind === "price") {
      if (low) bits.push(`cheaper than ${who}`);
      else if (high) bits.push(`richer than ${who}`);
      else bits.push(`in line with ${who}`);
    } else if (kind === "less") {
      if (low) bits.push(`lower than ${who}`);
      else if (high) bits.push(`higher than ${who}`);
      else bits.push(`in line with ${who}`);
    } else if (high) bits.push(`higher than ${who}`);
    else if (low) bits.push(`lower than ${who}`);
    else bits.push(`in line with ${who}`);
  };
  if (finite(history) && history !== 0) judge(current / history, "its own history");
  if (finite(industry) && industry !== 0) judge(current / industry, "the industry");
  if (!bits.length) return "No history or peer baseline — left out of the score.";
  const sentence = bits.join(" and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function spreadPhrase(current: number | null, history: number | null, industry: number | null): string {
  if (!finite(current)) return "Not reported.";
  const bits: string[] = [];
  const judge = (delta: number, who: string) => {
    if (delta >= 0.02) bits.push(`ahead of ${who}`);
    else if (delta <= -0.02) bits.push(`behind ${who}`);
    else bits.push(`in line with ${who}`);
  };
  if (finite(history)) judge(current - history, "its own history");
  if (finite(industry)) judge(current - industry, "the industry");
  if (!bits.length) return "No history or peer baseline — left out of the score.";
  return bits[0]!.charAt(0).toUpperCase() + bits.join(", ").slice(1) + ".";
}

function alignRatio(
  num: SeriesPoint[],
  den: SeriesPoint[],
  allowNegDen = false,
): SeriesPoint[] {
  const d = new Map(den.map((p) => [p.date, p.value]));
  const out: SeriesPoint[] = [];
  for (const p of num) {
    const b = d.get(p.date);
    if (!finite(b)) continue;
    if (!allowNegDen && !(b > 0)) continue;
    if (b === 0) continue;
    out.push({ date: p.date, value: p.value / b });
  }
  return out;
}

function capRoe(n: number | null): number | null {
  if (!finite(n)) return null;
  return clamp(n, -0.4, 0.6);
}

function trendScore(slope: number | null, scale: number, flat = 62): number | null {
  if (!finite(slope)) return null;
  return clamp(flat + 34 * Math.tanh(slope / scale), 4, 97);
}

function growthScore(cagrValue: number | null): number | null {
  if (!finite(cagrValue)) return null;
  return clamp(48 + 40 * Math.tanh(cagrValue / 0.14), 4, 96);
}

function returnOver(prices: PricePoint[], days: number): number | null {
  if (prices.length < 8) return null;
  const last = prices[prices.length - 1]!;
  const target = Date.parse(last.date) - days * 86400000;
  let chosen: PricePoint | null = null;
  for (const p of prices) {
    if (Date.parse(p.date) <= target) chosen = p;
    else break;
  }
  if (!chosen || chosen.close <= 0 || chosen.date === last.date) return null;
  const gap = target - Date.parse(chosen.date);
  if (gap > 50 * 86400000) return null;
  return last.close / chosen.close - 1;
}

function maxDrawdown(prices: PricePoint[]): number | null {
  if (prices.length < 8) return null;
  let peak = prices[0]!.close;
  let dd = 0;
  for (const p of prices) {
    if (p.close > peak) peak = p.close;
    if (peak > 0) dd = Math.min(dd, p.close / peak - 1);
  }
  return dd;
}

function annualizedVol(prices: PricePoint[]): number | null {
  if (prices.length < 12) return null;
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1]!.close;
    const b = prices[i]!.close;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 10) return null;
  const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(52);
}

function sma(prices: PricePoint[], n: number): number | null {
  if (prices.length < n) return null;
  const slice = prices.slice(-n);
  return slice.reduce((s, p) => s + p.close, 0) / n;
}

function peerMedian(
  peers: PeerInput[],
  pick: (p: PeerInput) => number | null,
  lo: number,
  hi: number,
): number | null {
  const xs = peers.map((p) => pick(p)).filter((n): n is number => finite(n) && n > lo && n < hi);
  if (xs.length < 3) return null;
  return median(xs);
}

function metric(partial: Omit<MetricRow, "points" | "weight"> & { weight: number }): MetricRow {
  return { ...partial, points: 0 };
}

export function rateCompany(input: CompanyInput): EquityReport {
  const financialish = /financial|bank|insurance|capital market/i.test(`${input.sector} ${input.industry}`);
  const a = input.annual;

  const grossSeries = alignRatio(a.grossProfit, a.revenue);
  const netSeries = alignRatio(a.netIncome, a.revenue);
  const fcfMarginSeries = alignRatio(a.fcf, a.revenue);
  const roeSeries = alignRatio(a.netIncome, a.equity).map((p) => ({
    date: p.date,
    value: capRoe(p.value) ?? p.value,
  }));
  const rawRoeSeries = alignRatio(a.netIncome, a.equity);
  const deSeries = alignRatio(a.debt, a.equity).filter((p) => p.value >= 0 && p.value < 20);
  const crSeries = alignRatio(a.currentAssets, a.currentLiabilities).filter((p) => p.value > 0 && p.value < 20);

  const yieldSeries: SeriesPoint[] = [];
  const capByDate = new Map(a.marketCap.map((p) => [p.date, p.value]));
  const bbByDate = new Map(a.buybacks.map((p) => [p.date, p.value]));
  for (const div of a.dividends) {
    const cap = capByDate.get(div.date);
    if (!finite(cap) || !(cap > 0)) continue;
    const bb = bbByDate.get(div.date) ?? 0;
    const divCash = div.value < 0 ? Math.abs(div.value) : 0;
    const bbCash = bb < 0 ? Math.abs(bb) : 0;
    yieldSeries.push({ date: div.date, value: (divCash + bbCash) / cap });
  }

  const fcfDebtSeries: SeriesPoint[] = [];
  const debtByDate = new Map(a.debt.map((p) => [p.date, p.value]));
  for (const f of a.fcf) {
    const debt = debtByDate.get(f.date);
    if (!finite(debt)) continue;
    if (debt <= 0) {
      fcfDebtSeries.push({ date: f.date, value: f.value > 0 ? 1.5 : 0 });
    } else {
      fcfDebtSeries.push({ date: f.date, value: f.value / debt });
    }
  }

  const livePe = finite(input.eps) && input.eps > 0 ? input.price / input.eps : null;
  const pe = finite(livePe) && livePe > 0 && livePe < 400 ? livePe : null;
  const ps =
    finite(input.marketCap) && finite(input.totalRevenue) && input.totalRevenue > 0
      ? input.marketCap / input.totalRevenue
      : finite(input.revenuePerShare) && input.revenuePerShare > 0
        ? input.price / input.revenuePerShare
        : null;
  const evEbitda =
    finite(input.enterpriseToEbitda) && input.enterpriseToEbitda > 0 && input.enterpriseToEbitda < 150
      ? input.enterpriseToEbitda
      : finite(input.enterpriseValue) && finite(input.ebitda) && input.ebitda > 0
        ? input.enterpriseValue / input.ebitda
        : null;

  const thinEquity = (() => {
    const eq = a.equity.at(-1)?.value;
    const assets = a.assets.at(-1)?.value;
    return finite(eq) && finite(assets) && assets > 0 && eq / assets < 0.2;
  })();

  const ind = {
    pe: peerMedian(input.peers, (p) => p.pe, 0, 150),
    ps: peerMedian(input.peers, (p) => p.ps, 0, 80),
    ev: peerMedian(input.peers, (p) => p.evEbitda, 0, 80),
    gross: peerMedian(input.peers, (p) => p.grossMargin, -0.2, 0.95),
    net: peerMedian(input.peers, (p) => p.netMargin, -0.8, 0.7),
    roe: peerMedian(
      input.peers,
      (p) => capRoe(p.roe),
      -0.5,
      0.61,
    ),
    de: peerMedian(input.peers, (p) => p.debtToEquity, -0.05, 12),
    cr: peerMedian(input.peers, (p) => p.currentRatio, 0.05, 8),
    yield: peerMedian(input.peers, (p) => p.dividendYield, -0.001, 0.2),
    revG: peerMedian(input.peers, (p) => p.revenueGrowth, -0.8, 2),
    fcfM: peerMedian(input.peers, (p) => p.fcfMargin, -0.8, 0.8),
  };

  const histPe = priorMedian(a.pe.filter((p) => p.value > 0 && p.value < 400));
  const histPs = priorMedian(a.ps.filter((p) => p.value > 0 && p.value < 100));
  const histEv = priorMedian(a.evEbitda.filter((p) => p.value > 0 && p.value < 150));

  const valuationMetrics: MetricRow[] = [];
  const pushVal = (id: string, label: string, current: number | null, history: number | null, industry: number | null) => {
    if (!finite(current) || current <= 0) return;
    const parts: Array<{ score: number | null; w: number }> = [];
    if (finite(history)) parts.push({ score: cheapScore(current, history), w: 1 });
    if (finite(industry)) parts.push({ score: cheapScore(current, industry), w: 1 });
    const score = blend(parts);
    if (!finite(score)) return;
    valuationMetrics.push(
      metric({
        id,
        label,
        unit: "x",
        current,
        history,
        industry,
        score,
        weight: 1,
        note: relPhrase("price", current, history, industry),
      }),
    );
  };
  pushVal("pe", "P/E", pe, histPe, ind.pe);
  pushVal("ps", "P/S", finite(ps) && ps > 0 && ps < 200 ? ps : null, histPs, ind.ps);
  if (!financialish) pushVal("ev", "EV/EBITDA", finite(evEbitda) && evEbitda < 120 ? evEbitda : null, histEv, ind.ev);

  const valScore = scorePillar(valuationMetrics);

  const grossCurrent = finite(input.grossMargin) ? input.grossMargin : (grossSeries.at(-1)?.value ?? null);
  const netCurrent = finite(input.netMargin) ? input.netMargin : (netSeries.at(-1)?.value ?? null);
  const roeCurrentRaw = finite(input.roe) ? input.roe : (rawRoeSeries.at(-1)?.value ?? null);
  const roeCurrent = capRoe(roeCurrentRaw);

  const profitMetrics: MetricRow[] = [];
  const pushSpread = (
    id: string,
    label: string,
    current: number | null,
    historySeries: SeriesPoint[],
    industry: number | null,
    scale: number,
    unit: MetricRow["unit"],
  ) => {
    if (!finite(current)) return;
    const history = levelMedian(historySeries);
    const slope = slopePerYear(historySeries);
    const level = blend([
      { score: finite(history) ? spreadScore(current, history, scale) : null, w: 1 },
      { score: finite(industry) ? spreadScore(current, industry, scale) : null, w: 1 },
    ]);
    const trend = trendScore(slope, scale * 0.55);
    const score = blend([
      { score: level, w: finite(trend) ? 0.65 : 1 },
      { score: trend, w: finite(trend) ? 0.35 : 0 },
    ]);
    if (!finite(score)) return;
    const trendNote = !finite(slope)
      ? ""
      : slope > 0.005
        ? " Trend is expanding."
        : slope < -0.005
          ? " Trend is contracting."
          : " Trend is stable.";
    profitMetrics.push(
      metric({
        id,
        label,
        unit,
        current: id === "roe" ? roeCurrentRaw : current,
        history: id === "roe" ? levelMedian(rawRoeSeries) : history,
        industry: id === "roe" ? peerMedian(input.peers, (p) => p.roe, -1, 5) : industry,
        score,
        weight: 1,
        note:
          (id === "roe" && thinEquity
            ? "Equity is thin after buybacks, so ROE is scored on a 60% cap. "
            : "") +
          spreadPhrase(id === "roe" ? roeCurrent : current, id === "roe" ? levelMedian(roeSeries) : history, industry) +
          trendNote,
      }),
    );
  };
  pushSpread("gm", "Gross margin", grossCurrent, grossSeries, ind.gross, 0.06, "pct");
  pushSpread("nm", "Net margin", netCurrent, netSeries, ind.net, 0.05, "pct");
  pushSpread("roe", "Return on equity", roeCurrent, roeSeries, ind.roe, 0.08, "pct");
  const profitScore = scorePillar(profitMetrics);

  const deCurrent = (() => {
    if (finite(input.totalDebt) && input.totalDebt <= 0 && finite(input.totalCash)) return 0;
    if (finite(input.debtToEquity) && input.debtToEquity >= 0) return input.debtToEquity;
    const last = deSeries.at(-1)?.value;
    return finite(last) ? last : null;
  })();
  const netCash =
    finite(input.totalCash) && finite(input.totalDebt) ? input.totalCash - input.totalDebt : null;

  const strengthMetrics: MetricRow[] = [];

  if (finite(netCash) && netCash > 0 && (!finite(deCurrent) || deCurrent < 0.15)) {
    strengthMetrics.push(
      metric({
        id: "de",
        label: "Debt / equity",
        unit: "ratio",
        current: deCurrent ?? 0,
        history: levelMedian(deSeries),
        industry: ind.de,
        score: 93,
        weight: 1,
        note: "Net cash. The balance sheet is not being asked to carry the equity story.",
      }),
    );
  } else if (finite(deCurrent)) {
    const history = levelMedian(deSeries);
    const score = blend([
      { score: finite(history) && history > 0 ? cheapScore(Math.max(deCurrent, 0.01), Math.max(history, 0.01)) : null, w: 1 },
      { score: finite(ind.de) && ind.de > 0 ? cheapScore(Math.max(deCurrent, 0.01), Math.max(ind.de, 0.01)) : null, w: 1 },
    ]);
    if (finite(score)) {
      strengthMetrics.push(
        metric({
          id: "de",
          label: "Debt / equity",
          unit: "ratio",
          current: deCurrent,
          history,
          industry: ind.de,
          score,
          weight: 1,
          note: relPhrase("less", deCurrent, history, ind.de),
        }),
      );
    }
  }

  const crCurrent = finite(input.currentRatio) ? input.currentRatio : (crSeries.at(-1)?.value ?? null);
  const crMeaningful = !financialish && finite(crCurrent) && crCurrent > 0 && crCurrent < 12;
  if (crMeaningful) {
    const history = levelMedian(crSeries);
    const capped = Math.min(crCurrent, 2.6);
    const score = blend([
      { score: finite(history) ? richScore(capped, Math.min(Math.max(history, 0.2), 2.6)) : null, w: 1 },
      { score: finite(ind.cr) ? richScore(capped, Math.min(Math.max(ind.cr, 0.2), 2.6)) : null, w: 1 },
      { score: spreadScore(Math.min(crCurrent, 3), 1.4, 0.55), w: finite(history) || finite(ind.cr) ? 0.4 : 1 },
    ]);
    if (finite(score)) {
      strengthMetrics.push(
        metric({
          id: "cr",
          label: "Current ratio",
          unit: "ratio",
          current: crCurrent,
          history,
          industry: ind.cr,
          score,
          weight: 1,
          note:
            crCurrent < 1
              ? "Short-term liabilities exceed liquid assets."
              : relPhrase("more", crCurrent, history, ind.cr),
        }),
      );
    }
  }

  const latestBb = a.buybacks.at(-1)?.value ?? null;
  const buybackYield =
    finite(latestBb) && latestBb < 0 && finite(input.marketCap) && input.marketCap > 0
      ? Math.abs(latestBb) / input.marketCap
      : 0;
  const shareholderYield =
    (finite(input.dividendYield) ? Math.max(input.dividendYield, 0) : 0) + buybackYield;
  const yieldHistory = levelMedian(yieldSeries);
  if (shareholderYield > 0 || finite(yieldHistory) || finite(ind.yield)) {
    const current = shareholderYield;
    const score = blend([
      { score: finite(yieldHistory) && yieldHistory > 0 ? richScore(Math.max(current, 0.001), yieldHistory) : null, w: 1 },
      { score: finite(ind.yield) ? spreadScore(current, ind.yield, 0.015) : null, w: 0.7 },
      { score: clamp(40 + current * 900, 8, 94), w: finite(yieldHistory) || finite(ind.yield) ? 0.35 : 1 },
    ]);
    if (finite(score)) {
      strengthMetrics.push(
        metric({
          id: "sy",
          label: "Shareholder yield",
          unit: "yield",
          current,
          history: yieldHistory,
          industry: ind.yield,
          score,
          weight: 1,
          note:
            buybackYield > 0.005
              ? `Dividend plus a ${(buybackYield * 100).toFixed(1)}% buyback yield. The industry figure is the peer dividend yield only.`
              : relPhrase("more", current, yieldHistory, ind.yield),
        }),
      );
    }
  }

  const fcfMarginNow =
    finite(input.freeCashFlow) && finite(input.totalRevenue) && input.totalRevenue > 0
      ? input.freeCashFlow / input.totalRevenue
      : (fcfMarginSeries.at(-1)?.value ?? null);
  const fcfDebtNow = (() => {
    if (finite(input.freeCashFlow) && finite(input.totalDebt)) {
      if (input.totalDebt <= 0) return input.freeCashFlow > 0 ? 1.5 : 0;
      return input.freeCashFlow / input.totalDebt;
    }
    return fcfDebtSeries.at(-1)?.value ?? null;
  })();
  const fcfLevel = blend([
    {
      score: finite(fcfMarginNow) ? spreadScore(fcfMarginNow, levelMedian(fcfMarginSeries) ?? fcfMarginNow, 0.06) : null,
      w: 1,
    },
    { score: finite(fcfMarginNow) && finite(ind.fcfM) ? spreadScore(fcfMarginNow, ind.fcfM, 0.06) : null, w: 1 },
  ]);
  const fcfTrend = trendScore(slopePerYear(fcfMarginSeries), 0.03);
  const fcfDebtLevel = blend([
    {
      score:
        finite(fcfDebtNow) && finite(levelMedian(fcfDebtSeries))
          ? richScore(Math.max(fcfDebtNow, 0.01), Math.max(levelMedian(fcfDebtSeries)!, 0.05))
          : null,
      w: 1,
    },
  ]);
  const fcfDebtTrend = trendScore(slopePerYear(fcfDebtSeries), 0.12);
  const fcfScore = blend([
    { score: fcfLevel, w: 1 },
    { score: fcfTrend, w: finite(fcfTrend) ? 0.8 : 0 },
    { score: fcfDebtLevel, w: 1 },
    { score: fcfDebtTrend, w: finite(fcfDebtTrend) ? 0.9 : 0 },
    {
      score: finite(input.freeCashFlow) ? (input.freeCashFlow > 0 ? 70 : 18) : null,
      w: finite(fcfLevel) ? 0.3 : 1,
    },
  ]);
  if (finite(fcfScore) && (finite(fcfMarginNow) || finite(fcfDebtNow))) {
    const rising = (slopePerYear(fcfDebtSeries) ?? 0) > 0.02 || (slopePerYear(fcfMarginSeries) ?? 0) > 0.005;
    strengthMetrics.push(
      metric({
        id: "fcf",
        label: "FCF / debt",
        unit: "ratio",
        current: fcfDebtNow,
        history: levelMedian(fcfDebtSeries),
        industry: null,
        score: fcfScore,
        weight: 1,
        note: finite(input.freeCashFlow) && input.freeCashFlow < 0
          ? "Free cash flow is negative. Coverage of the debt stack fails the test."
          : rising
            ? "Free cash flow relative to debt is rising versus this company’s own history."
            : "Judged on cash-flow margin, its trend, and free cash flow against the debt stack.",
      }),
    );
  }

  applyWeights(strengthMetrics, baseWeights({ de: 0.3, cr: 0.25, sy: 0.2, fcf: 0.25 }, strengthMetrics));
  const strengthScore = weightedAverage(strengthMetrics);

  // Valuation & profitability stay equal-weight inside the pillar.
  applyWeights(valuationMetrics, equalWeights(valuationMetrics));
  applyWeights(profitMetrics, equalWeights(profitMetrics));

  const pillarSeeds: Array<{ id: Pillar["id"]; name: string; blurb: string; score: number | null; metrics: MetricRow[] }> = [
    {
      id: "valuation",
      name: "Valuation",
      blurb: "Price against the company’s own multiple history and the industry median.",
      score: valScore,
      metrics: valuationMetrics,
    },
    {
      id: "profitability",
      name: "Profitability",
      blurb: "Margins and ROE — level versus history and peers, plus whether they are expanding.",
      score: profitScore,
      metrics: profitMetrics,
    },
    {
      id: "strength",
      name: "Financial strength",
      blurb: "Leverage, liquidity, cash returned to owners, and free cash flow against debt.",
      score: strengthScore,
      metrics: strengthMetrics,
    },
  ];
  const livePillars = pillarSeeds.filter((p) => finite(p.score));
  const pillarWeight = livePillars.length ? 1 / livePillars.length : 0;
  const pillars: Pillar[] = pillarSeeds.map((p) => {
    const weight = finite(p.score) ? pillarWeight : 0;
    const metrics = p.metrics.map((m) => ({
      ...m,
      points: finite(m.score) ? (m.score * m.weight * weight) : 0,
    }));
    return {
      id: p.id,
      name: p.name,
      blurb: p.blurb,
      score: finite(p.score) ? Math.round(p.score) : null,
      weight,
      summary: pillarSummary(p.name, p.score, metrics),
      metrics,
    };
  });

  const fundamental = blend(pillars.map((p) => ({ score: p.score, w: p.weight })));
  const score = finite(fundamental) && livePillars.length >= 2 ? Math.round(clamp(fundamental, 0, 100)) : null;
  const label = finite(score) ? labelFor(score) : null;

  const revCagr = cagr(a.revenue);
  const epsCagr = cagr(a.eps.filter((p) => p.value > 0));
  const fcfCagr = cagr(a.fcf.filter((p) => p.value > 0));
  const fwd = finite(input.street.epsGrowth) ? input.street.epsGrowth : input.earningsGrowth;
  const growth = blend([
    { score: growthScore(revCagr), w: 1.2 },
    { score: growthScore(epsCagr), w: 1 },
    { score: growthScore(fcfCagr), w: 0.8 },
    { score: growthScore(fwd), w: finite(fwd) ? 0.9 : 0 },
    {
      score:
        finite(input.revenueGrowth) && finite(ind.revG)
          ? spreadScore(input.revenueGrowth, ind.revG, 0.08)
          : null,
      w: 0.7,
    },
  ]);

  const r12 = returnOver(input.prices, 365);
  const r6 = returnOver(input.prices, 182);
  const spy12 = returnOver(input.spyPrices, 365);
  const spy6 = returnOver(input.spyPrices, 182);
  const excess12 = finite(r12) && finite(spy12) ? r12 - spy12 : null;
  const excess6 = finite(r6) && finite(spy6) ? r6 - spy6 : null;
  const lastPx = input.prices.at(-1)?.close ?? input.price;
  const ma40 = sma(input.prices, 40);
  const ma10 = sma(input.prices, 10);
  let trendStruct: number | null = null;
  if (finite(ma40) && lastPx > 0) {
    if (lastPx > ma40 && finite(ma10) && ma10 > ma40) trendStruct = 84;
    else if (lastPx > ma40) trendStruct = 66;
    else if (finite(ma10) && lastPx < ma10 && lastPx < ma40) trendStruct = 28;
    else trendStruct = 46;
  }
  const momentum = blend([
    { score: finite(excess12) ? clamp(58 + 36 * Math.tanh(excess12 / 0.22), 4, 96) : growthScore(r12), w: 1.3 },
    { score: finite(excess6) ? clamp(58 + 34 * Math.tanh(excess6 / 0.16), 4, 96) : null, w: 0.8 },
    { score: trendStruct, w: 0.9 },
  ]);

  const conversions: number[] = [];
  const niByDate = new Map(a.netIncome.map((p) => [p.date, p.value]));
  for (const f of a.fcf) {
    const ni = niByDate.get(f.date);
    if (finite(ni) && ni > 0 && finite(f.value)) conversions.push(f.value / ni);
  }
  const conversion = median(conversions.filter((n) => n > -1 && n < 4));
  const quality = blend([
    {
      score: finite(conversion) ? clamp(58 + 36 * Math.tanh((conversion - 0.85) / 0.45), 6, 96) : null,
      w: 1,
    },
    {
      score:
        finite(input.freeCashFlow) && finite(input.netMargin) && input.netMargin > 0 && finite(input.totalRevenue)
          ? clamp(58 + 36 * Math.tanh((input.freeCashFlow / (input.netMargin * input.totalRevenue) - 0.85) / 0.45), 6, 96)
          : null,
      w: 0.6,
    },
  ]);

  const vol = annualizedVol(input.prices);
  const dd = maxDrawdown(input.prices);
  const safety = blend([
    { score: finite(vol) ? clamp(58 - 36 * Math.tanh((vol - 0.24) / 0.16), 5, 96) : null, w: 1 },
    { score: finite(dd) ? clamp(58 + 36 * Math.tanh((dd + 0.28) / 0.16), 5, 96) : null, w: 1 },
    { score: finite(input.beta) ? clamp(58 - 34 * Math.tanh((input.beta - 1) / 0.45), 6, 94) : null, w: 0.7 },
    {
      score: finite(input.shortInterest) ? clamp(70 - input.shortInterest * 280, 10, 80) : null,
      w: 0.3,
    },
  ]);

  const sleeves: Sleeve[] = [
    sleeve("growth", "Growth", growth, growthBlurb(revCagr, epsCagr, fwd, input.revenueGrowth, ind.revG)),
    sleeve("momentum", "Momentum", momentum, momentumBlurb(r12, excess12, trendStruct)),
    sleeve("quality", "Earnings quality", quality, qualityBlurb(conversion)),
    sleeve("safety", "Risk", safety, safetyBlurb(vol, dd, input.beta)),
  ];

  const alphaRaw = blend([
    { score: fundamental, w: 0.52 },
    { score: growth, w: 0.16 },
    { score: momentum, w: 0.12 },
    { score: quality, w: 0.12 },
    { score: safety, w: 0.08 },
  ]);
  const alphaScore = finite(alphaRaw) && finite(score) ? Math.round(clamp(alphaRaw, 0, 100)) : null;

  const anchors = fairAnchors(input, {
    pe,
    ps: finite(ps) ? ps : null,
    ev: evEbitda,
    histPe,
    histPs,
    histEv,
    indPe: ind.pe,
    indPs: ind.ps,
    indEv: ind.ev,
  });
  const anchorPrices = anchors.map((x) => x.price).filter(finite);
  const fairMid = median(anchorPrices);
  const fairLow = anchorPrices.length ? Math.min(...anchorPrices) : null;
  const fairHigh = anchorPrices.length ? Math.max(...anchorPrices) : null;

  const scoredMetrics = pillars.reduce((s, p) => s + p.metrics.filter((m) => finite(m.score)).length, 0);
  const metricSlots = 10;
  let confidence = scoredMetrics / metricSlots;
  if (valuesOf(a.revenue).length < 3) confidence -= 0.08;
  if (input.detailedPeerCount < 3) confidence -= 0.08;
  confidence = clamp(confidence, 0.05, 0.98);
  const confidenceLabel = confidence >= 0.75 ? "High" : confidence >= 0.5 ? "Medium" : "Limited";

  const historyYears = Math.max(valuesOf(a.revenue).length, valuesOf(a.pe).length, grossSeries.length);

  const flags = buildFlags({
    input,
    pe,
    histPe,
    indPe: ind.pe,
    ps: finite(ps) ? ps : null,
    histPs,
    indPs: ind.ps,
    cr: crCurrent,
    de: deCurrent,
    netCash,
    fcfMarginSeries,
    netSeries,
    deSeries,
    fcfDebtSeries,
    shareholderYield,
    thinEquity,
  });

  const caveats: string[] = [];
  caveats.push(
    historyYears > 0
      ? `History uses ${historyYears} reported fiscal year${historyYears === 1 ? "" : "s"} — the window the filings feed provides, scored against live trailing figures. Medians, not means, set both the company’s baseline and the industry baseline.`
      : "Multi-year filings were not available, so the history leg is omitted and confidence is marked down.",
  );
  caveats.push(
    input.peers.length >= 3
      ? `Industry baselines are medians of ${input.peers.length} large ${input.industry || "peer"} names${input.detailedPeerCount ? `, with margins and balance-sheet items from ${input.detailedPeerCount} of them` : ""}.`
      : "The industry peer set is thin, so several industry legs were left blank instead of inventing a baseline.",
  );
  if (thinEquity) {
    caveats.push("Reported ROE is inflated by a thin equity base. The model caps ROE at 60% before it can move the score.");
  }
  if (financialish) {
    caveats.push("Financial companies are not graded on EV/EBITDA or the current ratio — those figures mislead more often than they inform. Weight shifts onto the metrics that still mean something.");
  }
  if (!finite(score)) {
    caveats.push("Fewer than two of the three pillars had enough evidence, so Halden will not publish a definitive rating.");
  }

  const annual = buildAnnual(input, grossSeries, netSeries, fcfMarginSeries);
  const prices = decimate(input.prices, 160);

  return {
    kind: "equity",
    symbol: input.symbol,
    name: input.name,
    exchange: input.exchange,
    currency: input.currency,
    sector: input.sector,
    industry: input.industry,
    profile: input.profile,
    price: input.price,
    changePct: input.changePct,
    marketCap: input.marketCap,
    beta: input.beta,
    week52High: input.week52High,
    week52Low: input.week52Low,
    dividendYield: input.dividendYield,
    forwardPe: input.forwardPe,
    peg: input.peg,
    payout: input.payout,
    insider: input.insider,
    institution: input.institution,
    shortInterest: input.shortInterest,
    asOf: new Date().toISOString(),
    historyYears,
    peerCount: input.peers.length,
    scoredMetrics,
    metricSlots,
    score,
    label,
    confidence,
    confidenceLabel,
    thesis: writeThesis(input, score, label, pillars),
    pillars,
    sleeves,
    alphaScore,
    alphaLabel: finite(alphaScore) ? labelFor(alphaScore) : null,
    flags,
    fair: {
      low: fairLow,
      mid: fairMid,
      high: fairHigh,
      upside: finite(fairMid) && input.price > 0 ? fairMid / input.price - 1 : null,
      anchors,
    },
    peers: input.peers.slice(0, 8).map(toPeerRow),
    annual,
    prices,
    street: input.street,
    caveats,
  };
}

function scorePillar(metrics: MetricRow[]): number | null {
  if (!metrics.length) return null;
  return blend(metrics.map((m) => ({ score: m.score, w: 1 })));
}

function equalWeights(metrics: MetricRow[]): Record<string, number> {
  const w = metrics.length ? 1 / metrics.length : 0;
  return Object.fromEntries(metrics.map((m) => [m.id, w]));
}

function baseWeights(pref: Record<string, number>, metrics: MetricRow[]): Record<string, number> {
  const ids = new Set(metrics.map((m) => m.id));
  let sum = 0;
  for (const id of ids) sum += pref[id] ?? 0;
  if (sum <= 0) return equalWeights(metrics);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (pref[id] ?? 0) / sum;
  return out;
}

function applyWeights(metrics: MetricRow[], weights: Record<string, number>) {
  for (const m of metrics) m.weight = weights[m.id] ?? 0;
}

function weightedAverage(metrics: MetricRow[]): number | null {
  return blend(metrics.map((m) => ({ score: m.score, w: m.weight })));
}

function pillarSummary(name: string, score: number | null, metrics: MetricRow[]): string {
  if (!finite(score)) return `${name} could not be scored. The filings did not support a baseline.`;
  const ranked = [...metrics].filter((m) => finite(m.score)).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  const band = score >= 70 ? "a strength" : score >= 50 ? "acceptable" : "a drag";
  if (best && worst && best.id !== worst.id) {
    return `${name} is ${band}. ${best.label} carries it; ${worst.label} holds it back.`;
  }
  return `${name} is ${band} on the evidence available.`;
}

function sleeve(id: Sleeve["id"], name: string, score: number | null, summary: string): Sleeve {
  return {
    id,
    name,
    score: finite(score) ? Math.round(score) : null,
    grade: finite(score) ? gradeFor(Math.round(score)) : null,
    summary,
  };
}

function growthBlurb(
  rev: number | null,
  eps: number | null,
  fwd: number | null,
  yoy: number | null,
  peer: number | null,
): string {
  const bits: string[] = [];
  if (finite(rev)) bits.push(`revenue compounded at ${(rev * 100).toFixed(1)}%`);
  if (finite(eps)) bits.push(`EPS at ${(eps * 100).toFixed(1)}%`);
  let s = bits.length ? `Over the filing window, ${bits.join(" and ")}.` : "A multi-year growth rate could not be computed.";
  if (finite(fwd)) s += ` Street looks for ${(fwd * 100).toFixed(1)}% EPS growth next year.`;
  if (finite(yoy) && finite(peer)) {
    s += yoy >= peer ? " Recent revenue growth is ahead of peers." : " Recent revenue growth trails peers.";
  }
  return s;
}

function momentumBlurb(r12: number | null, excess: number | null, trend: number | null): string {
  if (!finite(r12)) return "Not enough price history to judge the trend.";
  let s = `The shares are ${r12 >= 0 ? "up" : "down"} ${Math.abs(r12 * 100).toFixed(1)}% over a year.`;
  if (finite(excess)) {
    s += excess >= 0
      ? ` That is ${(excess * 100).toFixed(1)} points ahead of the S&P 500.`
      : ` That is ${Math.abs(excess * 100).toFixed(1)} points behind the S&P 500.`;
  }
  if (finite(trend) && trend >= 80) s += " Price is above both the intermediate and long averages.";
  else if (finite(trend) && trend <= 32) s += " Price is below both intermediate and long averages.";
  return s;
}

function qualityBlurb(conversion: number | null): string {
  if (!finite(conversion)) return "Cash conversion could not be measured from the filing window.";
  if (conversion >= 1) return `Free cash flow has covered ${(conversion * 100).toFixed(0)}% of accounting earnings. Earnings are arriving as cash.`;
  if (conversion >= 0.6) return `Free cash flow has converted about ${(conversion * 100).toFixed(0)}% of earnings — acceptable, not pristine.`;
  return `Free cash flow has converted only ${(conversion * 100).toFixed(0)}% of earnings. Accruals deserve a harder look.`;
}

function safetyBlurb(vol: number | null, dd: number | null, beta: number | null): string {
  const bits: string[] = [];
  if (finite(vol)) bits.push(`annualized volatility near ${(vol * 100).toFixed(0)}%`);
  if (finite(dd)) bits.push(`a peak-to-trough drawdown of ${(dd * 100).toFixed(0)}%`);
  if (finite(beta)) bits.push(`beta ${beta.toFixed(2)}`);
  if (!bits.length) return "Not enough price history to score risk.";
  return `Risk sleeve uses ${bits.join(", ")}. A higher score means a calmer path, not a better business.`;
}

function fairAnchors(
  input: CompanyInput,
  m: {
    pe: number | null;
    ps: number | null;
    ev: number | null;
    histPe: number | null;
    histPs: number | null;
    histEv: number | null;
    indPe: number | null;
    indPs: number | null;
    indEv: number | null;
  },
) {
  const eps = finite(input.eps) && input.eps > 0 ? input.eps : null;
  const rps =
    finite(input.revenuePerShare) && input.revenuePerShare > 0
      ? input.revenuePerShare
      : finite(input.totalRevenue) && finite(input.shares) && input.shares > 0
        ? input.totalRevenue / input.shares
        : null;
  const netDebt =
    finite(input.totalDebt) || finite(input.totalCash)
      ? (input.totalDebt ?? 0) - (input.totalCash ?? 0)
      : null;
  const fromPe = (mult: number | null) => (finite(mult) && finite(eps) ? mult * eps : null);
  const fromPs = (mult: number | null) => (finite(mult) && finite(rps) ? mult * rps : null);
  const fromEv = (mult: number | null) => {
    if (!finite(mult) || !finite(input.ebitda) || input.ebitda <= 0 || !finite(input.shares) || !(input.shares > 0)) {
      return null;
    }
    if (!finite(netDebt)) return null;
    const equity = mult * input.ebitda - netDebt;
    if (equity <= 0) return null;
    return equity / input.shares;
  };
  return [
    { label: "Own median P/E", price: fromPe(m.histPe) },
    { label: "Industry median P/E", price: fromPe(m.indPe) },
    { label: "Own median P/S", price: fromPs(m.histPs) },
    { label: "Industry median P/S", price: fromPs(m.indPs) },
    { label: "Own median EV/EBITDA", price: fromEv(m.histEv) },
    { label: "Industry median EV/EBITDA", price: fromEv(m.indEv) },
  ].filter((x) => finite(x.price) && x.price > 0 && x.price < input.price * 12 && x.price > input.price * 0.05);
}

function toPeerRow(p: PeerInput): PeerRow {
  return {
    symbol: p.symbol,
    name: p.name,
    marketCap: p.marketCap,
    currency: p.currency,
    pe: p.pe,
    forwardPe: p.forwardPe,
    ps: p.ps,
    pb: p.pb,
    dividendYield: p.dividendYield,
    change52w: p.change52w,
  };
}

function buildAnnual(
  input: CompanyInput,
  gross: SeriesPoint[],
  net: SeriesPoint[],
  fcfM: SeriesPoint[],
): AnnualPoint[] {
  const dates = new Set<string>();
  for (const s of [input.annual.pe, input.annual.ps, input.annual.evEbitda, gross, net, fcfM, input.annual.fcf, input.annual.debt]) {
    for (const p of s) dates.add(p.date);
  }
  const at = (s: SeriesPoint[], date: string) => s.find((p) => p.date === date)?.value ?? null;
  return [...dates].sort().map((date) => ({
    date,
    pe: at(input.annual.pe, date),
    ps: at(input.annual.ps, date),
    ev: at(input.annual.evEbitda, date),
    gross: at(gross, date),
    net: at(net, date),
    fcfMargin: at(fcfM, date),
    fcf: at(input.annual.fcf, date),
    debt: at(input.annual.debt, date),
  }));
}

function decimate(prices: PricePoint[], max: number): PricePoint[] {
  if (prices.length <= max) return prices;
  const step = Math.ceil(prices.length / max);
  const out: PricePoint[] = [];
  for (let i = 0; i < prices.length; i += step) out.push(prices[i]!);
  const last = prices[prices.length - 1]!;
  if (out[out.length - 1]?.date !== last.date) out.push(last);
  return out;
}

function writeThesis(
  input: CompanyInput,
  score: number | null,
  label: RatingLabel | null,
  pillars: Pillar[],
): string {
  const who = input.name || input.symbol;
  if (!finite(score) || !label) {
    return `${who} does not have enough comparable history and peer data for a definitive Halden rating. What is available is shown below; nothing has been filled in with a generic baseline.`;
  }
  const ranked = [...pillars].filter((p) => finite(p.score)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const lead = `${who} is a ${label} at ${score} on the Halden fundamental scale.`;
  if (!best || !worst) return lead;
  if (best.id === worst.id) {
    return `${lead} The score rests on ${best.name.toLowerCase()} at ${best.score}. The other pillars did not have a clean baseline.`;
  }
  const sharp = (p: Pillar, want: "high" | "low") => {
    const rows = p.metrics.filter((m) => finite(m.score));
    rows.sort((a, b) => (want === "high" ? (b.score ?? 0) - (a.score ?? 0) : (a.score ?? 0) - (b.score ?? 0)));
    return rows[0];
  };
  const lift = sharp(best, "high");
  const drag = sharp(worst, "low");
  let text = `${lead} ${best.name} is the lift${lift ? ` — ${lift.label.toLowerCase()} scores ${Math.round(lift.score!)}` : ""}. ${worst.name} is the constraint${drag ? ` — ${drag.label.toLowerCase()} scores ${Math.round(drag.score!)}` : ""}.`;
  text += " The number is fully fundamental: growth, momentum, and the Street’s target do not move it.";
  return text;
}

function buildFlags(args: {
  input: CompanyInput;
  pe: number | null;
  histPe: number | null;
  indPe: number | null;
  ps: number | null;
  histPs: number | null;
  indPs: number | null;
  cr: number | null;
  de: number | null;
  netCash: number | null;
  fcfMarginSeries: SeriesPoint[];
  netSeries: SeriesPoint[];
  deSeries: SeriesPoint[];
  fcfDebtSeries: SeriesPoint[];
  shareholderYield: number;
  thinEquity: boolean;
}): Flag[] {
  const flags: Flag[] = [];
  const { input } = args;
  if (finite(input.freeCashFlow) && input.freeCashFlow < 0) {
    flags.push({ tone: "bad", title: "Negative free cash flow", detail: "The latest trailing free cash flow does not cover the operation, let alone the debt." });
  }
  if (finite(args.cr) && args.cr < 1) {
    flags.push({ tone: "bad", title: "Tight liquidity", detail: `Current ratio is ${args.cr.toFixed(2)}. Current liabilities are larger than current assets.` });
  }
  if (finite(args.de) && args.de > 2.5 && (!finite(args.netCash) || args.netCash < 0)) {
    flags.push({ tone: "bad", title: "Heavy leverage", detail: `Debt is ${args.de.toFixed(2)}× equity. That leaves little room if cash flow slips.` });
  }
  const netSlope = slopePerYear(args.netSeries);
  if (finite(netSlope) && netSlope < -0.015) {
    flags.push({ tone: "bad", title: "Margin compression", detail: "Net margin has been contracting across the filing window, not just in a single quarter." });
  }
  const shares = input.annual.shares;
  if (shares.length >= 2 && shares[0]!.value > 0) {
    const delta = shares[shares.length - 1]!.value / shares[0]!.value - 1;
    if (delta > 0.08) {
      flags.push({ tone: "bad", title: "Dilution", detail: `Share count is up ${(delta * 100).toFixed(0)}% over the filing window.` });
    } else if (delta < -0.08) {
      flags.push({ tone: "good", title: "Shrinking share count", detail: `Share count is down ${Math.abs(delta * 100).toFixed(0)}% — buybacks are actually retiring stock.` });
    }
  }
  const richPe =
    finite(args.pe) &&
    ((finite(args.histPe) && args.pe > args.histPe * 1.45) || (finite(args.indPe) && args.pe > args.indPe * 1.45));
  const richPs =
    finite(args.ps) &&
    ((finite(args.histPs) && args.ps > args.histPs * 1.45) || (finite(args.indPs) && args.ps > args.indPs * 1.45));
  if (richPe && richPs) {
    flags.push({ tone: "bad", title: "Multiple is stretched", detail: "Both earnings and sales multiples sit well above the company’s own history or the industry median." });
  }
  const cheapPe = finite(args.pe) && finite(args.histPe) && finite(args.indPe) && args.pe < args.histPe * 0.9 && args.pe < args.indPe * 0.9;
  if (cheapPe) {
    flags.push({ tone: "good", title: "Discount to both baselines", detail: "Trailing P/E is below the company’s own prior median and below the industry median." });
  }
  const fcfDebtSlope = slopePerYear(args.fcfDebtSeries);
  if (finite(fcfDebtSlope) && fcfDebtSlope > 0.03 && finite(input.freeCashFlow) && input.freeCashFlow > 0) {
    flags.push({ tone: "good", title: "Rising FCF-to-debt", detail: "Free cash flow is covering more of the debt stack than it did earlier in the window." });
  }
  if (finite(args.netCash) && args.netCash > 0) {
    flags.push({ tone: "good", title: "Net cash", detail: "Cash and short-term investments exceed total debt." });
  }
  if (args.shareholderYield >= 0.03) {
    flags.push({ tone: "good", title: "Cash returned", detail: `Dividend plus buybacks are about ${(args.shareholderYield * 100).toFixed(1)}% of the market cap.` });
  }
  if (finite(netSlope) && netSlope > 0.01) {
    flags.push({ tone: "good", title: "Expanding net margin", detail: "Profitability is widening across the multi-year window, not just bouncing for a quarter." });
  }
  if (args.thinEquity) {
    flags.push({ tone: "bad", title: "Thin equity base", detail: "Equity is a small fraction of assets, which makes headline ROE look stronger than the economics." });
  }
  const oi = input.annual.operatingIncome.at(-1)?.value;
  const interest = input.annual.interest.at(-1)?.value;
  if (finite(oi) && finite(interest) && Math.abs(interest) > 0) {
    const cover = oi / Math.abs(interest);
    if (cover < 2) {
      flags.push({ tone: "bad", title: "Thin interest cover", detail: `Operating income covers interest only ${cover.toFixed(1)}×.` });
    }
  }
  const bad = flags.filter((f) => f.tone === "bad");
  const good = flags.filter((f) => f.tone === "good");
  return [...bad, ...good].slice(0, 8);
}
