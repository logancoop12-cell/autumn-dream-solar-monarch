import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mast } from "@/components/mast";
import { SearchField } from "@/components/search-field";
import { TearSheet } from "@/components/tear-sheet";
import { getRating } from "@/lib/market/ratings";
import { toneOf } from "@/lib/rating/format";
import type { RatingResult } from "@/lib/rating/types";

export const Route = createFileRoute("/s/$symbol")({
  validateSearch: (search: Record<string, unknown>) => {
    const vs =
      typeof search.vs === "string" ? search.vs.toUpperCase().replace(/[^A-Z0-9.\-^=]/g, "").slice(0, 15) : "";
    return vs ? { vs } : {};
  },
  loaderDeps: ({ search }: { search: { vs?: string } }) => ({ vs: search.vs ?? "" }),
  loader: async ({ params, deps }) => {
    const primary = await getRating({ data: { symbol: params.symbol } });
    let compare: RatingResult | null = null;
    let compareError: string | null = null;
    if (deps.vs && deps.vs !== params.symbol.toUpperCase()) {
      try {
        compare = await getRating({ data: { symbol: deps.vs } });
      } catch (err) {
        compareError = err instanceof Error ? err.message : "Could not rate that comparison.";
      }
    }
    return { primary, compare, compareError };
  },
  staleTime: 5 * 60 * 1000,
  pendingComponent: Pending,
  pendingMs: 150,
  errorComponent: RatingError,
  head: ({ params }) => ({
    meta: [{ title: `${params.symbol.toUpperCase()} · Halden` }],
  }),
  component: SymbolPage,
});

function SymbolPage() {
  const { primary, compare, compareError } = Route.useLoaderData();
  const { symbol } = Route.useParams();
  const { vs } = Route.useSearch();
  const compared = vs ?? "";

  return (
    <div className="min-h-screen">
      <Mast />
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <SearchField size="md" initial={symbol.toUpperCase()} label="Rate another ticker" />
        <CompareForm symbol={symbol.toUpperCase()} current={compared} />
        {compareError && <p className="mt-3 text-sm text-sell">{compareError}</p>}
        {compare && <CompareStrip primary={primary} compare={compare} />}
      </div>
      {primary.kind === "unsupported" ? <Unsupported report={primary} /> : <TearSheet report={primary} />}
    </div>
  );
}

function CompareForm({ symbol, current }: { symbol: string; current: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(current);
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const vs = value.trim().toUpperCase();
        void navigate({
          to: "/s/$symbol",
          params: { symbol },
          search: vs && vs !== symbol ? { vs } : {},
        });
      }}
    >
      <label className="sr-only" htmlFor="compare-with">
        Compare with
      </label>
      <input
        id="compare-with"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Compare with a second ticker"
        className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4"
      />
      <button type="submit" className="h-11 shrink-0 rounded-full bg-ink px-4 text-sm text-bg">
        Compare
      </button>
      {current && (
        <button
          type="button"
          className="h-11 shrink-0 rounded-full border border-line px-4 text-sm"
          onClick={() => {
            setValue("");
            void navigate({ to: "/s/$symbol", params: { symbol }, search: {} });
          }}
        >
          Clear
        </button>
      )}
    </form>
  );
}

function CompareStrip({ primary, compare }: { primary: RatingResult; compare: RatingResult }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <CompareCard result={primary} />
      <CompareCard result={compare} />
    </div>
  );
}

function CompareCard({ result }: { result: RatingResult }) {
  if (result.kind === "unsupported") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="font-semibold">{result.symbol}</p>
        <p className="mt-1 text-sm text-muted">{result.reason}</p>
      </div>
    );
  }
  const tone = toneOf(result.label);
  const text = tone === "buy" ? "text-buy" : tone === "hold" ? "text-hold" : tone === "sell" ? "text-sell" : "text-muted";
  return (
    <Link to="/s/$symbol" params={{ symbol: result.symbol }} className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{result.symbol}</p>
        <p className={`font-display text-3xl tabular-nums ${text}`}>{result.score ?? "—"}</p>
      </div>
      <p className="text-sm text-muted">{result.label ?? "Unrated"} · alpha {result.alphaScore ?? "—"}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {result.pillars.map((pillar) => (
          <li key={pillar.id} className="flex justify-between gap-3">
            <span className="text-muted">{pillar.name}</span>
            <span className="tabular-nums">{pillar.score ?? "—"}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

function Unsupported({ report }: { report: Extract<RatingResult, { kind: "unsupported" }> }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold tracking-widest text-brass uppercase">{report.quoteType}</p>
      <h1 className="mt-2 font-display text-4xl">{report.name}</h1>
      <p className="mt-4 leading-relaxed text-muted">{report.reason}</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center text-sm font-medium text-brass">
        Rate a company instead
      </Link>
    </main>
  );
}

function Pending() {
  return (
    <div className="min-h-screen">
      <Mast />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold tracking-widest text-brass uppercase">Reading filings and peers</p>
        <div className="mt-4 h-12 w-40 animate-pulse rounded-xl bg-bg-deep" />
        <div className="mt-6 h-4 w-full max-w-xl animate-pulse rounded bg-bg-deep" />
        <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-bg-deep" />
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-2xl bg-bg-deep" />
          <div className="h-48 animate-pulse rounded-2xl bg-bg-deep" />
          <div className="h-48 animate-pulse rounded-2xl bg-bg-deep" />
        </div>
      </div>
    </div>
  );
}

function RatingError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="min-h-screen">
      <Mast />
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl">That rating didn’t come back</h1>
        <p className="mt-3 leading-relaxed text-muted">{message}</p>
        <Link to="/" className="mt-6 inline-flex h-11 items-center font-medium text-brass">
          Try another ticker
        </Link>
      </main>
    </div>
  );
}
