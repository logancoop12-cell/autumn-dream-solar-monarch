import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mast } from "@/components/mast";
import { SearchField } from "@/components/search-field";
import { readRecent, readWatch, type SavedRating } from "@/lib/desk-store";

const SAMPLES = [
  ["AAPL", "Consumer electronics"],
  ["MSFT", "Software"],
  ["NVDA", "Semiconductors"],
  ["JPM", "Banks"],
  ["XOM", "Oil and gas"],
  ["UNH", "Health care"],
  ["COST", "Retail"],
  ["ASML", "Semiconductor equipment"],
] as const;

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [watch, setWatch] = useState<SavedRating[]>([]);
  const [recent, setRecent] = useState<SavedRating[]>([]);
  useEffect(() => {
    setWatch(readWatch());
    setRecent(readRecent());
  }, []);

  return (
    <div className="min-h-screen">
      <Mast />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-8 sm:px-6 sm:pt-16">
          <p className="text-xs font-semibold tracking-widest text-brass uppercase">Fundamental rating desk</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-tight text-ink sm:text-6xl">
            A definitive rating. No flat baselines.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
            Type a ticker. Halden scores the business from Strong Sell to Strong Buy by comparing valuation,
            profitability, and the balance sheet with that company’s own history and its industry — not with a
            number that is the same for every stock.
          </p>
          <div className="mt-8 max-w-xl">
            <SearchField />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {SAMPLES.map(([symbol, industry]) => (
              <Link
                key={symbol}
                to="/s/$symbol"
                params={{ symbol }}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm"
              >
                <span className="font-semibold">{symbol}</span>
                <span className="text-muted">{industry}</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="desk" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-6 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            <Shelf title="On the desk" empty="Save a rating and it stays on this device." rows={watch} />
            <Shelf title="Recent" empty="Ratings you open will be listed here." rows={recent} />
          </div>
        </section>

        <section id="method" className="scroll-mt-6 border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <p className="text-xs font-semibold tracking-widest text-brass uppercase">The scale</p>
            <h2 className="mt-2 max-w-2xl font-display text-4xl">Three pillars, equal weight, fully audited.</h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <Method
                name="Valuation"
                body="Trailing P/E, P/S, and EV/EBITDA versus the company’s own prior-year median and the industry median. Cheap against both scores high. In line is a middle score, not a gift."
              />
              <Method
                name="Profitability"
                body="Gross margin, net margin, and return on equity. Level versus history and peers, plus whether the margins are expanding or compressing. ROE is capped when buybacks have hollowed out equity."
              />
              <Method
                name="Financial strength"
                body="Debt to equity, current ratio, shareholder yield (dividend plus buybacks), and the free-cash-flow trend — including whether FCF-to-debt is rising."
              />
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-5">
              {[
                ["81–100", "Strong Buy"],
                ["61–80", "Buy"],
                ["41–60", "Hold"],
                ["21–40", "Sell"],
                ["0–20", "Strong Sell"],
              ].map(([band, name]) => (
                <div key={name} className="rounded-2xl border border-line bg-surface px-4 py-3">
                  <p className="text-xs tracking-widest text-muted uppercase">{band}</p>
                  <p className="mt-1 font-display text-xl">{name}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 max-w-3xl space-y-3 text-sm leading-relaxed text-muted">
              <p>
                Growth, momentum versus the S&P 500, earnings quality, and risk are graded beside the rating. A
                multi-factor alpha blends them with the fundamental score so you can see the tape as well as the
                business. Alpha does not change the words Strong Buy through Strong Sell.
              </p>
              <p>
                Medians are used instead of averages so one absurd multiple cannot set the industry. Missing data is
                dropped and the remaining weights are renormalized. Halden will not publish a rating unless at least
                two pillars have evidence. Analyst targets are displayed and then left out of the math.
              </p>
              <p>Not investment advice. Figures come from public filings and live market data, and they can be late or revised.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Shelf({ title, empty, rows }: { title: string; empty: string; rows: SavedRating[] }) {
  return (
    <div>
      <h2 className="font-display text-2xl">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <li key={row.symbol}>
              <Link to="/s/$symbol" params={{ symbol: row.symbol }} className="flex items-baseline justify-between gap-3 py-3">
                <span>
                  <span className="font-semibold">{row.symbol}</span>
                  <span className="ml-2 text-sm text-muted">{row.name}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {row.score ?? "—"} {row.label ?? ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Method({ name, body }: { name: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-display text-2xl">{name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
