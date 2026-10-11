export type RatingLabel = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";

export type SleeveGrade = "A" | "B" | "C" | "D" | "F";

export type MetricRow = {
  id: string;
  label: string;
  /** How to format `current`, `history`, and `industry`. */
  unit: "x" | "pct" | "ratio" | "yield";
  current: number | null;
  history: number | null;
  industry: number | null;
  score: number | null;
  /** Share of this pillar, 0–1, after renormalizing for missing inputs. */
  weight: number;
  /** Points contributed to the published 0–100 fundamental score. */
  points: number;
  note: string;
};

export type PillarId = "valuation" | "profitability" | "strength";

export type Pillar = {
  id: PillarId;
  name: string;
  blurb: string;
  score: number | null;
  /** Share of the fundamental score, 0–1. */
  weight: number;
  summary: string;
  metrics: MetricRow[];
};

export type Sleeve = {
  id: "growth" | "momentum" | "quality" | "safety";
  name: string;
  score: number | null;
  grade: SleeveGrade | null;
  summary: string;
};

export type Flag = {
  tone: "good" | "bad";
  title: string;
  detail: string;
};

export type Anchor = {
  label: string;
  price: number | null;
};

export type PeerRow = {
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
};

export type AnnualPoint = {
  date: string;
  pe: number | null;
  ps: number | null;
  ev: number | null;
  gross: number | null;
  net: number | null;
  fcfMargin: number | null;
  fcf: number | null;
  debt: number | null;
};

export type PricePoint = { date: string; close: number };

export type StreetView = {
  recommendation: string | null;
  mean: number | null;
  target: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  opinions: number | null;
  upside: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  revisionsUp30: number | null;
  revisionsDown30: number | null;
  buckets: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
};

export type EquityReport = {
  kind: "equity";
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
  dividendYield: number | null;
  forwardPe: number | null;
  peg: number | null;
  payout: number | null;
  insider: number | null;
  institution: number | null;
  shortInterest: number | null;
  asOf: string;
  historyYears: number;
  peerCount: number;
  scoredMetrics: number;
  metricSlots: number;
  score: number | null;
  label: RatingLabel | null;
  confidence: number;
  confidenceLabel: "High" | "Medium" | "Limited";
  thesis: string;
  pillars: Pillar[];
  sleeves: Sleeve[];
  alphaScore: number | null;
  alphaLabel: RatingLabel | null;
  flags: Flag[];
  fair: {
    low: number | null;
    mid: number | null;
    high: number | null;
    upside: number | null;
    anchors: Anchor[];
  };
  peers: PeerRow[];
  annual: AnnualPoint[];
  prices: PricePoint[];
  street: StreetView;
  caveats: string[];
};

export type UnsupportedReport = {
  kind: "unsupported";
  symbol: string;
  name: string;
  quoteType: string;
  reason: string;
};

export type RatingResult = EquityReport | UnsupportedReport;

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
  industry: string;
};
