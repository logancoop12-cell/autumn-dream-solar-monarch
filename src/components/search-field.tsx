import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { searchTickers } from "@/lib/market/ratings";
import type { SearchHit } from "@/lib/rating/types";

export function SearchField({
  size = "lg",
  initial = "",
  label = "Ticker",
}: {
  size?: "lg" | "md";
  initial?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setHits([]);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchTickers({ data: { q: query } }).then((rows) => {
        setHits(rows);
        setActive(0);
        setOpen(rows.length > 0);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(symbol: string) {
    const next = symbol.trim().toUpperCase();
    if (!next) return;
    setOpen(false);
    void navigate({ to: "/s/$symbol", params: { symbol: next } });
  }

  const tall = size === "lg";

  return (
    <div ref={wrap} className="relative">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go(open && hits[active] ? hits[active].symbol : q);
        }}
      >
        <label htmlFor={listId} className="sr-only">
          {label}
        </label>
        <Search
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-brass ${tall ? "left-4 size-5" : "left-3 size-4"}`}
          strokeWidth={1.75}
        />
        <input
          id={listId}
          value={q}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Ticker — AAPL, JPM, ASML"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          className={`w-full rounded-2xl border border-line bg-surface text-ink shadow-sheet placeholder:text-muted ${
            tall ? "h-14 pr-4 pl-12 text-lg" : "h-11 pr-3 pl-10 text-base"
          }`}
          onChange={(event) => setQ(event.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={(event) => {
            if (!open || !hits.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((n) => (n + 1) % hits.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((n) => (n - 1 + hits.length) % hits.length);
            } else if (event.key === "Escape") setOpen(false);
          }}
        />
      </form>
      {open && hits.length > 0 && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-sheet"
        >
          {hits.map((hit, index) => (
            <li key={hit.symbol} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${index === active ? "bg-bg-deep" : "bg-surface"}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(hit.symbol)}
              >
                <span className="w-16 shrink-0 font-semibold tabular-nums">{hit.symbol}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{hit.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {hit.exchange}
                    {hit.industry ? ` · ${hit.industry}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
