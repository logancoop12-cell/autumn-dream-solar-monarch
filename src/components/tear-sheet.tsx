import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, Copy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CashChart, MarginChart, MultipleChart, PriceChart } from "@/components/rating-charts";
import { isWatched, remember, toggleWatch } from "@/lib/desk-store";
import {
  fmtCompact,
  fmtMetric,
  fmtMultiple,
  fmtPct,
  fmtPctPlain,
  fmtPrice,
  toneOf,
} from "@/lib/rating/format";
import type { EquityReport, MetricRow, RatingLabel } from "@/lib/rating/types";

const TONE = {
  buy: { text: "text-buy", fill: "bg-buy text-bg", line: "border-buy", bar: "bg-buy" },
  hold: { text: "text-hold", fill: "bg-hold text-bg", line: "border-hold", bar: "bg-hold" },
  sell: { text: "text-sell", fill: "bg-sell text-bg", line: "border-sell", bar: "bg-sell" },
  muted: { text: "text-muted", fill: "bg-bg-deep text-ink", line: "border-line", bar: "bg-brass" },
} as const;

export function TearSheet({ report }: { report: EquityReport }) {
  const [watched, setWatched] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    remember({
      symbol: report.symbol,
      name: report.name,
      score: report.score,
      label: report.label,
      industry: report.industry,
      at: report.asOf,
    });
    setWatched(isWatched(report.symbol));
  }, [report]);

  function onWatch() {
    const on = toggleWatch({
      symbol: report.symbol,
      name: report.name,
      score: report.score,
      label: report.label,
      industry: report.industry,
      at: report.asOf,
    });
    setWatched(on);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(briefing(report));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const tone = TONE[toneOf(report.label)];
  const strong = report.label === "Strong Buy" || report.label === "Strong Sell";
  const audit = report.pillars
    .flatMap((pillar) => pillar.metrics.map((metric) => ({ ...metric, pillar: pillar.name })))
    .sort((a, b) => b.points - a.points);

  return (
    <article className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="flex flex-col gap-6 border-b border-line py-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-brass uppercase">
            {report.exchange || "Listed"} · {report.currency}
          </p>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">{report.symbol}</h1>
          <p className="mt-1 text-lg text-muted">{report.name}</p>
          <p className="mt-2 text-sm text-muted">
            {report.sector || "Unclassified"}
            {report.industry ? ` · ${report.industry}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onWatch}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm"
          >
            {watched ? <BookmarkCheck className="size-4 text-brass" /> : <Bookmark className="size-4" />}
            {watched ? "On the desk" : "Save to desk"}
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm"
          >
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy briefing"}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Price" value={fmtPrice(report.price, report.currency)} />
        <Stat
          label="Day"
          value={fmtPct(report.changePct)}
          className={
            report.changePct != null && report.changePct < 0
              ? "text-sell"
              : report.changePct != null && report.changePct > 0
                ? "text-buy"
                : ""
          }
        />
        <Stat label="Market cap" value={fmtCompact(report.marketCap, report.currency)} />
        <Stat label="52-week" value={`${fmtPrice(report.week52Low, report.currency)}–${fmtPrice(report.week52High, report.currency)}`} />
        <Stat label="Beta" value={report.beta == null ? "—" : report.beta.toFixed(2)} />
        <Stat label="Div. yield" value={fmtPctPlain(report.dividendYield, 2)} />
        <Stat label="Forward P/E" value={fmtMultiple(report.forwardPe)} />
        <Stat label="Short float" value={fmtPctPlain(report.shortInterest, 1)} />
      </dl>

      <section className="mt-8 grid items-center gap-8 lg:grid-cols-[auto_1fr_16rem]">
        <Seal score={report.score} label={report.label} strong={strong} tone={tone} />
        <div>
          <p className="text-xs font-semibold tracking-widest text-brass uppercase">Fundamental rating</p>
          <h2 className="mt-1 font-display text-3xl sm:text-4xl">{report.label ?? "Unrated"}</h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink">{report.thesis}</p>
          <p className="mt-3 text-sm text-muted">
            Confidence {report.confidenceLabel.toLowerCase()} · {report.scoredMetrics} of {report.metricSlots} core
            inputs · {report.historyYears} fiscal year{report.historyYears === 1 ? "" : "s"} · {report.peerCount} peers
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sheet">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">Multi-factor alpha</p>
          <p className={`mt-2 font-display text-4xl tabular-nums ${TONE[toneOf(report.alphaLabel)].text}`}>
            {report.alphaScore ?? "—"}
          </p>
          <p className="text-sm text-muted">{report.alphaLabel ?? "Not enough sleeves"}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A separate sleeve. Growth, momentum, cash conversion, and risk sit on top of the fundamental score. They
            never rewrite it.
          </p>
        </div>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        {report.pillars.map((pillar) => {
          const pillarTone = TONE[toneOf(pillar.score == null ? null : labelFromScore(pillar.score))];
          return (
            <div key={pillar.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sheet">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl">{pillar.name}</h3>
                <span className={`font-display text-3xl tabular-nums ${pillarTone.text}`}>{pillar.score ?? "—"}</span>
              </div>
              <Meter score={pillar.score} bar={pillarTone.bar} />
              <p className="mt-3 text-sm leading-relaxed text-muted">{pillar.summary}</p>
              <p className="mt-2 text-xs tracking-wide text-brass uppercase">
                {Math.round(pillar.weight * 100)}% of the rating
              </p>
              <ul className="mt-4 divide-y divide-line">
                {pillar.metrics.length === 0 && (
                  <li className="py-3 text-sm text-muted">No usable baseline for this pillar.</li>
                )}
                {pillar.metrics.map((metric) => (
                  <Metric key={metric.id} metric={metric} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <Section title="Score audit" kicker="Every point is traceable">
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Each row is one input’s share of the published 0–100 fundamental score. History is this company’s own
          prior median. Industry is the median of large peers in {report.industry || "the same industry"} — not a
          market-wide constant.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <div className="hidden grid-cols-12 gap-2 bg-bg-deep px-4 py-2 text-xs tracking-wide text-muted uppercase sm:grid">
            <span className="col-span-3">Input</span>
            <span className="col-span-2 text-right">Now</span>
            <span className="col-span-2 text-right">History</span>
            <span className="col-span-2 text-right">Industry</span>
            <span className="col-span-1 text-right">Score</span>
            <span className="col-span-2 text-right">Points</span>
          </div>
          <ul>
            {audit.map((row) => (
              <li key={row.id} className="border-t border-line px-4 py-3 first:border-t-0">
                <div className="grid gap-1 sm:grid-cols-12 sm:items-baseline sm:gap-2">
                  <div className="sm:col-span-3">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-muted">{row.pillar}</p>
                  </div>
                  <p className="tabular-nums sm:col-span-2 sm:text-right">{fmtMetric(row.unit, row.current)}</p>
                  <p className="tabular-nums text-muted sm:col-span-2 sm:text-right">{fmtMetric(row.unit, row.history)}</p>
                  <p className="tabular-nums text-muted sm:col-span-2 sm:text-right">{fmtMetric(row.unit, row.industry)}</p>
                  <p className="tabular-nums sm:col-span-1 sm:text-right">{row.score == null ? "—" : Math.round(row.score)}</p>
                  <p className="font-medium tabular-nums sm:col-span-2 sm:text-right">{row.points.toFixed(1)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">{row.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="The record" kicker="Filings and the tape">
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Price, five years" legend="Weekly close">
            <PriceChart prices={report.prices} currency={report.currency} />
          </ChartCard>
          <ChartCard title="Multiples at fiscal year-end" legend="Ink P/E · brass P/S · green EV/EBITDA">
            <MultipleChart rows={report.annual} />
          </ChartCard>
          <ChartCard title="Margins" legend="Gross, net, and free-cash-flow margin">
            <MarginChart rows={report.annual} />
          </ChartCard>
          <ChartCard title="Cash versus debt" legend="Free cash flow and total debt">
            <CashChart rows={report.annual} />
          </ChartCard>
        </div>
      </Section>

      <Section title="Fair value band" kicker="If multiples reverted">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sheet">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Midpoint of the anchors</p>
                <p className="font-display text-4xl tabular-nums">{fmtPrice(report.fair.mid, report.currency)}</p>
              </div>
              <p className={`font-display text-3xl tabular-nums ${report.fair.upside != null && report.fair.upside >= 0 ? "text-buy" : "text-sell"}`}>
                {fmtPct(report.fair.upside)}
              </p>
            </div>
            <FairTrack low={report.fair.low} high={report.fair.high} mid={report.fair.mid} price={report.price} />
            <p className="mt-3 text-sm text-muted">
              Range {fmtPrice(report.fair.low, report.currency)} – {fmtPrice(report.fair.high, report.currency)}. The
              mark on the line is today’s price. This is not a target and it is not in the rating.
            </p>
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {report.fair.anchors.length === 0 && (
              <li className="p-5 text-sm text-muted">Not enough clean anchors to imply a price.</li>
            )}
            {report.fair.anchors.map((anchor) => (
              <li key={anchor.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <span className="text-sm">{anchor.label}</span>
                <span className="font-medium tabular-nums">{fmtPrice(anchor.price, report.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Sleeves" kicker="Graded, not blended into the rating">
        <div className="grid gap-4 sm:grid-cols-2">
          {report.sleeves.map((sleeve) => (
            <div key={sleeve.id} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-2xl">{sleeve.name}</h3>
                <p className="font-display text-3xl tabular-nums">
                  {sleeve.grade ?? "—"}
                  <span className="ml-2 text-base text-muted">{sleeve.score ?? ""}</span>
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{sleeve.summary}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Flags" kicker="What a committee would circle">
        {report.flags.length === 0 ? (
          <p className="text-sm text-muted">No hard flags either way. The score is carried by the levels, not by an outlier.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {report.flags.map((flag) => (
              <li key={flag.title} className="rounded-2xl border border-line bg-surface p-4">
                <p className={`text-xs font-semibold tracking-widest uppercase ${flag.tone === "good" ? "text-buy" : "text-sell"}`}>
                  {flag.tone === "good" ? "Support" : "Risk"}
                </p>
                <p className="mt-1 font-medium">{flag.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{flag.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="The Street" kicker="Shown, then ignored">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm text-muted">Consensus</p>
            <p className="font-display text-3xl">{report.street.recommendation ?? "No coverage"}</p>
            <p className="mt-2 text-sm text-muted">
              {report.street.opinions ?? "—"} opinions · mean score {report.street.mean?.toFixed(2) ?? "—"}
            </p>
            <p className="mt-4 text-sm text-muted">Mean target {fmtPrice(report.street.target, report.currency)}</p>
            <p className="font-display text-3xl tabular-nums">{fmtPct(report.street.upside)}</p>
            <p className="text-sm text-muted">
              {fmtPrice(report.street.targetLow, report.currency)} – {fmtPrice(report.street.targetHigh, report.currency)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <BucketBar street={report.street} />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Next-year revenue growth</dt>
                <dd className="font-medium tabular-nums">{fmtPctPlain(report.street.revenueGrowth)}</dd>
              </div>
              <div>
                <dt className="text-muted">Next-year EPS growth</dt>
                <dd className="font-medium tabular-nums">{fmtPctPlain(report.street.epsGrowth)}</dd>
              </div>
              <div>
                <dt className="text-muted">EPS revisions up, 30 days</dt>
                <dd className="font-medium tabular-nums">{report.street.revisionsUp30 ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">EPS revisions down, 30 days</dt>
                <dd className="font-medium tabular-nums">{report.street.revisionsDown30 ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Analyst targets and revisions are context. Halden’s rating does not move when the Street changes its mind.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Industry board" kicker={report.industry || "Peers"}>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {report.peers.length === 0 && <li className="p-5 text-sm text-muted">No peer set came back for this industry.</li>}
          {report.peers.map((peer) => (
            <li key={peer.symbol}>
              <Link
                to="/s/$symbol"
                params={{ symbol: peer.symbol }}
                className="grid gap-1 px-4 py-3 sm:grid-cols-12 sm:items-center sm:gap-2"
              >
                <span className="font-semibold sm:col-span-2">{peer.symbol}</span>
                <span className="truncate text-sm text-muted sm:col-span-4">{peer.name}</span>
                <span className="text-sm tabular-nums sm:col-span-2 sm:text-right">{peerCap(peer)}</span>
                <span className="text-sm tabular-nums sm:col-span-1 sm:text-right">{fmtMultiple(peer.pe)}</span>
                <span className="text-sm tabular-nums sm:col-span-1 sm:text-right">{fmtMultiple(peer.ps)}</span>
                <span className="text-sm tabular-nums sm:col-span-2 sm:text-right">{fmtPct(peer.change52w)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Listed market cap is in each exchange’s own currency, so do not compare the figures across countries. Trailing
          P/E, P/S, and the one-year price change are ratios. Open any name for a full rating.
        </p>
      </Section>

      {report.profile && (
        <Section title="What the company is" kicker="Business">
          <p className="max-w-3xl leading-relaxed">{report.profile}</p>
        </Section>
      )}

      <Section title="How to read this" kicker="Limits">
        <ul className="max-w-3xl space-y-2 text-sm leading-relaxed text-muted">
          {report.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
          <li>Halden is a research desk, not a recommendation to buy or sell. The scale is 0–100: 81 Strong Buy, 61 Buy, 41 Hold, 21 Sell, below that Strong Sell.</li>
        </ul>
      </Section>
    </article>
  );
}

function Seal({
  score,
  label,
  strong,
  tone,
}: {
  score: number | null;
  label: RatingLabel | null;
  strong: boolean;
  tone: (typeof TONE)[keyof typeof TONE];
}) {
  return (
    <div
      className={`flex size-40 shrink-0 flex-col items-center justify-center rounded-full border-2 sm:size-44 ${
        strong ? tone.fill : `bg-surface ${tone.line}`
      }`}
    >
      <span className={`font-display text-5xl tabular-nums ${strong ? "" : tone.text}`}>{score ?? "—"}</span>
      <span className={`mt-1 px-4 text-center text-xs font-semibold tracking-widest uppercase ${strong ? "" : tone.text}`}>
        {label ?? "No rating"}
      </span>
    </div>
  );
}

function Meter({ score, bar }: { score: number | null; bar: string }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-deep">
      <div className={`h-full ${bar}`} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

function Metric({ metric }: { metric: MetricRow }) {
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{metric.label}</span>
        <span className="text-sm tabular-nums">{metric.score == null ? "—" : Math.round(metric.score)}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Now {fmtMetric(metric.unit, metric.current)} · history {fmtMetric(metric.unit, metric.history)} · industry{" "}
        {fmtMetric(metric.unit, metric.industry)}
      </p>
    </li>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
      <dd className={`mt-1 truncate text-sm font-medium tabular-nums ${className}`}>{value}</dd>
    </div>
  );
}

function Section({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <p className="text-xs font-semibold tracking-widest text-brass uppercase">{kicker}</p>
      <h2 className="mt-1 font-display text-3xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChartCard({ title, legend, children }: { title: string; legend: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl">{title}</h3>
        <p className="text-xs text-muted">{legend}</p>
      </div>
      {children}
    </div>
  );
}

function FairTrack({
  low,
  high,
  mid,
  price,
}: {
  low: number | null;
  high: number | null;
  mid: number | null;
  price: number;
}) {
  if (low == null || high == null || mid == null || high <= low) return null;
  const lo = Math.min(low, price);
  const hi = Math.max(high, price);
  const span = hi - lo || 1;
  const at = (n: number) => `${((n - lo) / span) * 100}%`;
  return (
    <div className="relative mt-8 h-10">
      <div className="absolute top-4 right-0 left-0 h-1 rounded-full bg-bg-deep" />
      <div className="absolute top-4 h-1 bg-brass" style={{ left: at(low), width: `${((high - low) / span) * 100}%` }} />
      <span className="absolute top-3 size-3 -translate-x-1/2 rounded-full bg-brass" style={{ left: at(mid) }} />
      <span className="absolute top-2 size-5 -translate-x-1/2 rounded-full border-2 border-ink bg-surface" style={{ left: at(price) }} />
    </div>
  );
}

function BucketBar({ street }: { street: EquityReport["street"] }) {
  const b = street.buckets;
  if (!b) return <p className="text-sm text-muted">No recommendation mix published.</p>;
  const parts = [
    { label: "Strong buy", n: b.strongBuy, cls: "bg-buy" },
    { label: "Buy", n: b.buy, cls: "bg-buy opacity-70" },
    { label: "Hold", n: b.hold, cls: "bg-hold" },
    { label: "Sell", n: b.sell, cls: "bg-sell opacity-70" },
    { label: "Strong sell", n: b.strongSell, cls: "bg-sell" },
  ];
  const total = parts.reduce((s, p) => s + (Number.isFinite(p.n) ? p.n : 0), 0);
  if (!total) return <p className="text-sm text-muted">No recommendation mix published.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((part) =>
          part.n > 0 ? <div key={part.label} className={part.cls} style={{ width: `${(part.n / total) * 100}%` }} /> : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((part) => (
          <li key={part.label}>
            {part.label} {part.n}
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelFromScore(score: number): RatingLabel {
  if (score >= 81) return "Strong Buy";
  if (score >= 61) return "Buy";
  if (score >= 41) return "Hold";
  if (score >= 21) return "Sell";
  return "Strong Sell";
}

function peerCap(peer: EquityReport["peers"][number]): string {
  const compact = fmtCompact(peer.marketCap, peer.currency === "USD" ? "USD" : "");
  if (compact === "—") return compact;
  if (!peer.currency || peer.currency === "USD") return compact;
  return `${compact} ${peer.currency}`;
}

function briefing(report: EquityReport): string {
  const lines = [
    `${report.symbol} · ${report.name}`,
    report.label ? `Halden fundamental rating: ${report.label} (${report.score}/100)` : "No definitive rating",
    report.thesis,
    ...report.pillars.map((pillar) => `${pillar.name}: ${pillar.score ?? "n/a"} — ${pillar.summary}`),
    report.alphaScore != null ? `Multi-factor alpha: ${report.alphaLabel} (${report.alphaScore})` : "",
    "Not investment advice.",
  ];
  return lines.filter(Boolean).join("\n");
}
