import { rateCompany, type CompanyInput, type PeerInput, type SeriesPoint } from "@/lib/rating/engine";
import type { PricePoint, RatingResult, SearchHit, StreetView } from "@/lib/rating/types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const ANNUAL_TYPES = [
  "annualTotalRevenue",
  "annualGrossProfit",
  "annualNetIncome",
  "annualEBITDA",
  "annualDilutedEPS",
  "annualFreeCashFlow",
  "annualOperatingCashFlow",
  "annualTotalDebt",
  "annualStockholdersEquity",
  "annualCurrentAssets",
  "annualCurrentLiabilities",
  "annualTotalAssets",
  "annualCommonStockDividendPaid",
  "annualRepurchaseOfCapitalStock",
  "annualPeRatio",
  "annualPsRatio",
  "annualEnterprisesValueEBITDARatio",
  "annualMarketCap",
  "annualOrdinarySharesNumber",
  "annualInterestExpense",
  "annualOperatingIncome",
] as const;

export class MarketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketError";
  }
}

type Session = { cookie: string; crumb: string; exp: number };
let session: Session | null = null;

const reportCache = new Map<string, { at: number; data: RatingResult }>();
const industryCache = new Map<string, { at: number; peers: PeerInput[] }>();
const inflight = new Map<string, Promise<RatingResult>>();

const REPORT_TTL = 12 * 60 * 1000;
const INDUSTRY_TTL = 6 * 60 * 60 * 1000;

export function cleanSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/.test(symbol)) {
    throw new MarketError("Enter a ticker symbol like AAPL or BRK-B.");
  }
  return symbol;
}

function variants(symbol: string): string[] {
  const out = [symbol];
  if (symbol.includes(".")) out.push(symbol.replaceAll(".", "-"));
  if (symbol.includes("-")) out.push(symbol.replaceAll("-", "."));
  return [...new Set(out)];
}

function cookieHeader(res: Response): string {
  const withList = res.headers as Headers & { getSetCookie?: () => string[] };
  const parts = typeof withList.getSetCookie === "function" ? withList.getSetCookie() : [];
  if (parts.length) return parts.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const raw = res.headers.get("set-cookie");
  if (!raw) return "";
  return raw
    .split(/,(?=[^;,]+=)/)
    .map((p) => p.split(";")[0]?.trim() ?? "")
    .filter((p) => p.includes("="))
    .join("; ");
}

async function getSession(force = false): Promise<Session> {
  if (!force && session && session.exp > Date.now()) return session;
  const boot = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  const cookie = cookieHeader(boot);
  if (!cookie) throw new MarketError("Market data is temporarily unavailable. Try again in a moment.");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    signal: AbortSignal.timeout(10000),
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length > 32 || crumb.includes("{") || crumb.includes("<")) {
    throw new MarketError("Market data is temporarily unavailable. Try again in a moment.");
  }
  session = { cookie, crumb, exp: Date.now() + 15 * 60 * 1000 };
  return session;
}

async function yahoo(url: string, auth: boolean, init?: RequestInit): Promise<unknown> {
  const run = async (force: boolean) => {
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", UA);
    headers.set("Accept", "application/json");
    let target = url;
    if (auth) {
      const s = await getSession(force);
      headers.set("Cookie", s.cookie);
      target += `${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(s.crumb)}`;
    }
    return fetch(target, { ...init, headers, signal: AbortSignal.timeout(14000) });
  };
  let res = await run(false);
  if (auth && (res.status === 401 || res.status === 403)) {
    session = null;
    res = await run(true);
  }
  if (!res.ok && res.status !== 404) {
    throw new MarketError("Market data is temporarily unavailable. Try again in a moment.");
  }
  return res.json() as Promise<unknown>;
}

function num(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in v) {
    const raw = (v as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function text(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asDebtToEquity(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  return raw > 5 ? raw / 100 : raw;
}

function asDecimalPercent(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.abs(raw) > 1.5 ? raw / 100 : raw;
}

function clipProfile(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= 540) return t;
  const cut = t.slice(0, 540);
  const i = cut.lastIndexOf(". ");
  return i > 240 ? cut.slice(0, i + 1) : `${cut.trim()}…`;
}

function extractSeries(payload: unknown): Record<string, SeriesPoint[]> {
  const out: Record<string, SeriesPoint[]> = {};
  const result = (payload as { timeseries?: { result?: unknown[] } })?.timeseries?.result;
  if (!Array.isArray(result)) return out;
  for (const block of result) {
    if (!block || typeof block !== "object") continue;
    const rec = block as Record<string, unknown>;
    const meta = rec.meta as { type?: string[] } | undefined;
    const type = meta?.type?.[0];
    if (!type || !Array.isArray(rec[type])) continue;
    const pts: SeriesPoint[] = [];
    for (const row of rec[type] as Array<Record<string, unknown>>) {
      const date = row?.asOfDate;
      const reported = row?.reportedValue as { raw?: unknown } | undefined;
      const value = reported?.raw;
      if (typeof date === "string" && typeof value === "number" && Number.isFinite(value)) {
        pts.push({ date, value });
      }
    }
    pts.sort((a, b) => a.date.localeCompare(b.date));
    out[type] = pts;
  }
  return out;
}

function parseChart(payload: unknown): { prices: PricePoint[]; instrument: string | null } {
  const result = (payload as { chart?: { result?: Array<Record<string, unknown>> } })?.chart?.result?.[0];
  if (!result) return { prices: [], instrument: null };
  const meta = (result.meta ?? {}) as Record<string, unknown>;
  const ts = Array.isArray(result.timestamp) ? (result.timestamp as number[]) : [];
  const quote = (result.indicators as { quote?: Array<{ close?: Array<number | null> }> } | undefined)?.quote?.[0];
  const closes = quote?.close ?? [];
  const prices: PricePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c) && typeof ts[i] === "number") {
      prices.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), close: c });
    }
  }
  const instrument = typeof meta.instrumentType === "string" ? meta.instrumentType : null;
  return { prices, instrument };
}

async function quoteSummary(symbol: string, modules: string): Promise<Record<string, unknown> | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=true`;
  const json = (await yahoo(url, true)) as {
    quoteSummary?: { result?: Array<Record<string, unknown>>; error?: { description?: string } };
  };
  if (json.quoteSummary?.error) return null;
  return json.quoteSummary?.result?.[0] ?? null;
}

async function fundamentals(symbol: string): Promise<Record<string, SeriesPoint[]>> {
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url =
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?symbol=${encodeURIComponent(symbol)}&type=${ANNUAL_TYPES.join(",")}&period1=1451606400&period2=${period2}`;
  try {
    return extractSeries(await yahoo(url, false));
  } catch {
    return {};
  }
}

async function chartOf(symbol: string): Promise<{ prices: PricePoint[]; instrument: string | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=5y&includePrePost=false`;
  try {
    return parseChart(await yahoo(url, false));
  } catch {
    return { prices: [], instrument: null };
  }
}

function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|plc|sa|ag|nv|co|company|group|holdings|holding|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function industryPeers(industry: string, symbol: string, name: string): Promise<PeerInput[]> {
  if (!industry) return [];
  const hit = industryCache.get(industry);
  if (hit && Date.now() - hit.at < INDUSTRY_TTL) {
    return hit.peers.filter((p) => p.symbol !== symbol && nameKey(p.name) !== nameKey(name));
  }
  let peers: PeerInput[] = [];
  try {
    peers = await screener(industry);
  } catch {
    peers = [];
  }
  industryCache.set(industry, { at: Date.now(), peers });
  return peers.filter((p) => p.symbol !== symbol && nameKey(p.name) !== nameKey(name));
}

async function screener(value: string): Promise<PeerInput[]> {
  const body = JSON.stringify({
    offset: 0,
    size: 40,
    sortField: "intradaymarketcap",
    sortType: "desc",
    quoteType: "EQUITY",
    query: {
      operator: "AND",
      operands: [{ operator: "eq", operands: ["industry", value] }],
    },
  });
  const json = (await yahoo("https://query1.finance.yahoo.com/v1/finance/screener?lang=en-US&region=US", true, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })) as { finance?: { result?: Array<{ quotes?: Array<Record<string, unknown>> }> } };
  const quotes = json.finance?.result?.[0]?.quotes ?? [];
  const rows: PeerInput[] = [];
  const seen = new Set<string>();
  for (const q of quotes) {
    const sym = text(q, "symbol");
    if (!sym || seen.has(sym)) continue;
    const nm = text(q, "longName") || text(q, "shortName") || sym;
    const key = nameKey(nm);
    if (rows.some((r) => nameKey(r.name) === key)) continue;
    seen.add(sym);
    const mkt = num(q, "marketCap");
    const pe = num(q, "trailingPE");
    const div = num(q, "dividendYield");
    const chg = num(q, "fiftyTwoWeekChangePercent");
    rows.push({
      symbol: sym,
      name: nm,
      marketCap: mkt,
      currency: text(q, "currency"),
      pe: pe != null && pe > 0 && pe < 400 ? pe : null,
      forwardPe: num(q, "forwardPE"),
      ps: null,
      pb: num(q, "priceToBook"),
      dividendYield: div == null ? null : div / 100,
      change52w: chg == null ? null : chg / 100,
      evEbitda: null,
      grossMargin: null,
      netMargin: null,
      roe: null,
      debtToEquity: null,
      currentRatio: null,
      revenueGrowth: null,
      fcfMargin: null,
    });
    if (rows.length >= 12) break;
  }
  return rows;
}

async function enrichPeers(peers: PeerInput[]): Promise<{ peers: PeerInput[]; detailed: number }> {
  const targets = peers.slice(0, 5);
  let cursor = 0;
  const detailed: Array<PeerInput | null> = new Array(targets.length).fill(null);
  async function worker() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const peer = targets[idx]!;
      try {
        const summary = await quoteSummary(peer.symbol, "financialData,defaultKeyStatistics");
        detailed[idx] = summary ? mergePeer(peer, summary) : peer;
      } catch {
        detailed[idx] = peer;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
  let count = 0;
  const merged = peers.map((p, i) => {
    if (i < detailed.length && detailed[i]) {
      const row = detailed[i]!;
      if (row.grossMargin != null || row.roe != null || row.evEbitda != null || row.debtToEquity != null) count += 1;
      return row;
    }
    return p;
  });
  return { peers: merged, detailed: count };
}

function mergePeer(peer: PeerInput, summary: Record<string, unknown>): PeerInput {
  const fd = summary.financialData;
  const ks = summary.defaultKeyStatistics;
  const revenue = num(fd, "totalRevenue");
  const fcf = num(fd, "freeCashflow");
  const ps = peer.marketCap != null && revenue != null && revenue > 0 ? peer.marketCap / revenue : null;
  return {
    ...peer,
    ps,
    evEbitda: num(ks, "enterpriseToEbitda") ?? num(fd, "enterpriseToEbitda"),
    grossMargin: num(fd, "grossMargins"),
    netMargin: num(fd, "profitMargins"),
    roe: num(fd, "returnOnEquity"),
    debtToEquity: asDebtToEquity(num(fd, "debtToEquity")),
    currentRatio: num(fd, "currentRatio"),
    revenueGrowth: num(fd, "revenueGrowth"),
    fcfMargin: fcf != null && revenue != null && revenue > 0 ? fcf / revenue : null,
  };
}

function readStreet(summary: Record<string, unknown>, price: number): StreetView {
  const fd = summary.financialData;
  const trends = ((summary.earningsTrend as { trend?: Array<Record<string, unknown>> } | undefined)?.trend ?? []);
  const plus = trends.find((t) => t.period === "+1y") ?? trends.find((t) => t.period === "0y");
  const current = trends.find((t) => t.period === "0y") ?? trends.find((t) => t.period === "0q");
  const recs = (summary.recommendationTrend as { trend?: Array<Record<string, unknown>> } | undefined)?.trend ?? [];
  const now = recs.find((r) => r.period === "0m") ?? recs[0];
  const target = num(fd, "targetMeanPrice");
  const key = text(fd, "recommendationKey");
  const rev = (current?.epsRevisions ?? {}) as Record<string, unknown>;
  const empty: StreetView = {
    recommendation: key ? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    mean: num(fd, "recommendationMean"),
    target,
    targetLow: num(fd, "targetLowPrice"),
    targetHigh: num(fd, "targetHighPrice"),
    opinions: num(fd, "numberOfAnalystOpinions"),
    upside: target != null && price > 0 ? target / price - 1 : null,
    revenueGrowth: nestedRaw(plus, ["revenueEstimate", "growth"]),
    epsGrowth: nestedRaw(plus, ["earningsEstimate", "growth"]) ?? nestedRaw(plus, ["growth"]),
    revisionsUp30: nestedRaw(rev, ["upLast30days"]) ?? num(rev, "upLast30days"),
    revisionsDown30: nestedRaw(rev, ["downLast30days"]) ?? num(rev, "downLast30days"),
    buckets: now
      ? {
          strongBuy: Number(now.strongBuy ?? 0),
          buy: Number(now.buy ?? 0),
          hold: Number(now.hold ?? 0),
          sell: Number(now.sell ?? 0),
          strongSell: Number(now.strongSell ?? 0),
        }
      : null,
  };
  return empty;
}

function nestedRaw(obj: unknown, path: string[]): number | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur === "number" && Number.isFinite(cur)) return cur;
  if (cur && typeof cur === "object" && "raw" in cur) {
    const raw = (cur as { raw: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return null;
}

function series(map: Record<string, SeriesPoint[]>, key: string): SeriesPoint[] {
  return map[key] ?? [];
}

function buildInput(
  symbol: string,
  summary: Record<string, unknown>,
  annual: Record<string, SeriesPoint[]>,
  prices: PricePoint[],
  spyPrices: PricePoint[],
  peers: PeerInput[],
  detailedPeerCount: number,
): CompanyInput | null {
  const priceMod = summary.price;
  const sd = summary.summaryDetail;
  const ks = summary.defaultKeyStatistics;
  const fd = summary.financialData;
  const profile = summary.assetProfile;
  const px = num(priceMod, "regularMarketPrice") ?? num(sd, "regularMarketPrice");
  if (px == null || !(px > 0)) return null;
  const quoteType = text(priceMod, "quoteType") ?? "EQUITY";
  const trailingPe = num(sd, "trailingPE") ?? num(ks, "trailingPE");
  const eps = num(ks, "trailingEps") ?? (trailingPe != null && trailingPe > 0 ? px / trailingPe : null);
  const revenue = num(fd, "totalRevenue");
  const shares = num(ks, "sharesOutstanding") ?? series(annual, "annualOrdinarySharesNumber").at(-1)?.value ?? null;
  const name = text(priceMod, "longName") || text(priceMod, "shortName") || symbol;
  const street = readStreet(summary, px);
  return {
    symbol,
    name,
    exchange: text(priceMod, "exchangeName") || text(sd, "exchange") || "",
    currency: text(priceMod, "currency") || "USD",
    sector: text(profile, "sector") || "",
    industry: text(profile, "industry") || "",
    profile: clipProfile(text(profile, "longBusinessSummary") || ""),
    price: px,
    changePct: num(priceMod, "regularMarketChangePercent"),
    marketCap: num(priceMod, "marketCap") ?? num(sd, "marketCap"),
    beta: num(sd, "beta") ?? num(ks, "beta"),
    week52High: num(sd, "fiftyTwoWeekHigh"),
    week52Low: num(sd, "fiftyTwoWeekLow"),
    shares,
    dividendYield: num(sd, "dividendYield") ?? num(sd, "trailingAnnualDividendYield"),
    totalRevenue: revenue,
    ebitda: num(fd, "ebitda"),
    eps,
    grossMargin: num(fd, "grossMargins"),
    netMargin: num(fd, "profitMargins"),
    roe: num(fd, "returnOnEquity"),
    roa: num(fd, "returnOnAssets"),
    debtToEquity: asDebtToEquity(num(fd, "debtToEquity")),
    currentRatio: num(fd, "currentRatio"),
    totalDebt: num(fd, "totalDebt"),
    totalCash: num(fd, "totalCash"),
    freeCashFlow: num(fd, "freeCashflow"),
    enterpriseToEbitda: num(ks, "enterpriseToEbitda"),
    enterpriseValue: num(ks, "enterpriseValue"),
    revenuePerShare: num(fd, "revenuePerShare"),
    revenueGrowth: num(fd, "revenueGrowth"),
    earningsGrowth: num(fd, "earningsGrowth"),
    forwardPe: num(sd, "forwardPE") ?? num(ks, "forwardPE"),
    peg: num(ks, "pegRatio"),
    payout: asDecimalPercent(num(sd, "payoutRatio") ?? num(ks, "payoutRatio")),
    insider: num(ks, "heldPercentInsiders"),
    institution: num(ks, "heldPercentInstitutions"),
    shortInterest: num(ks, "shortPercentOfFloat"),
    annual: {
      revenue: series(annual, "annualTotalRevenue"),
      grossProfit: series(annual, "annualGrossProfit"),
      netIncome: series(annual, "annualNetIncome"),
      ebitda: series(annual, "annualEBITDA"),
      eps: series(annual, "annualDilutedEPS"),
      fcf: series(annual, "annualFreeCashFlow"),
      opcf: series(annual, "annualOperatingCashFlow"),
      debt: series(annual, "annualTotalDebt"),
      equity: series(annual, "annualStockholdersEquity"),
      currentAssets: series(annual, "annualCurrentAssets"),
      currentLiabilities: series(annual, "annualCurrentLiabilities"),
      assets: series(annual, "annualTotalAssets"),
      dividends: series(annual, "annualCommonStockDividendPaid"),
      buybacks: series(annual, "annualRepurchaseOfCapitalStock"),
      pe: series(annual, "annualPeRatio"),
      ps: series(annual, "annualPsRatio"),
      evEbitda: series(annual, "annualEnterprisesValueEBITDARatio"),
      marketCap: series(annual, "annualMarketCap"),
      shares: series(annual, "annualOrdinarySharesNumber"),
      interest: series(annual, "annualInterestExpense"),
      operatingIncome: series(annual, "annualOperatingIncome"),
    },
    prices,
    spyPrices,
    peers,
    detailedPeerCount,
    street,
  };
}

const SUPPORTED = new Set(["EQUITY"]);

export async function loadRating(rawSymbol: string): Promise<RatingResult> {
  const requested = cleanSymbol(rawSymbol);
  const cached = reportCache.get(requested);
  if (cached && Date.now() - cached.at < REPORT_TTL) return cached.data;
  const pending = inflight.get(requested);
  if (pending) return pending;
  const job = buildRating(requested).finally(() => inflight.delete(requested));
  inflight.set(requested, job);
  return job;
}

async function buildRating(requested: string): Promise<RatingResult> {
  let summary: Record<string, unknown> | null = null;
  let symbol = requested;
  let sawListing = false;
  for (const candidate of variants(requested)) {
    const next = await quoteSummary(
      candidate,
      "assetProfile,financialData,defaultKeyStatistics,summaryDetail,price,earningsTrend,recommendationTrend",
    );
    if (!next) continue;
    sawListing = true;
    const px = num(next.price, "regularMarketPrice") ?? num(next.summaryDetail, "regularMarketPrice");
    if (px != null && px > 0) {
      summary = next;
      symbol = candidate;
      break;
    }
  }
  if (!summary) {
    throw new MarketError(
      sawListing ? `No live price for ${requested}.` : `No listing found for ${requested}.`,
    );
  }

  const quoteType = text(summary.price, "quoteType") ?? "EQUITY";
  const name = text(summary.price, "longName") || text(summary.price, "shortName") || symbol;
  if (!SUPPORTED.has(quoteType)) {
    const result: RatingResult = {
      kind: "unsupported",
      symbol,
      name,
      quoteType,
      reason:
        quoteType === "ETF"
          ? "Halden rates operating companies. An ETF is a portfolio, not a business with margins, a balance sheet, and a multiple history of its own."
          : `Halden rates common equity. ${name} is listed as ${quoteType.toLowerCase()}, so a fundamental rating would be fiction.`,
    };
    reportCache.set(requested, { at: Date.now(), data: result });
    return result;
  }

  const industry = text(summary.assetProfile, "industry") || "";
  const [annual, chart, spy, peerSeed] = await Promise.all([
    fundamentals(symbol),
    chartOf(symbol),
    chartOf("SPY"),
    industryPeers(industry, symbol, name),
  ]);
  const { peers, detailed } = await enrichPeers(peerSeed);
  const input = buildInput(symbol, summary, annual, chart.prices, spy.prices, peers, detailed);
  if (!input) throw new MarketError(`No live price for ${symbol}.`);
  const report = rateCompany(input);
  reportCache.set(requested, { at: Date.now(), data: report });
  if (symbol !== requested) reportCache.set(symbol, { at: Date.now(), data: report });
  return report;
}

export async function searchSymbols(q: string): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 40);
  if (query.length < 1) return [];
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;
  try {
    const json = (await yahoo(url, false)) as { quotes?: Array<Record<string, unknown>> };
    const quotes = json.quotes ?? [];
    const hits: SearchHit[] = [];
    for (const qte of quotes) {
      if (text(qte, "quoteType") !== "EQUITY") continue;
      const symbol = text(qte, "symbol");
      if (!symbol) continue;
      hits.push({
        symbol,
        name: text(qte, "longname") || text(qte, "shortname") || symbol,
        exchange: text(qte, "exchDisp") || text(qte, "exchange") || "",
        industry: text(qte, "industry") || text(qte, "sectorDisp") || "",
      });
      if (hits.length >= 6) break;
    }
    return hits;
  } catch {
    return [];
  }
}
