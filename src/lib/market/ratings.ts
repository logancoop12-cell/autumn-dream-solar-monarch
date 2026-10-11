import { createServerFn } from "@tanstack/react-start";
import { cleanSymbol, loadRating, MarketError, searchSymbols } from "@/lib/market/yahoo.server";

export const getRating = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const symbol =
      typeof input === "object" && input && "symbol" in input ? String((input as { symbol: unknown }).symbol) : "";
    try {
      return { symbol: cleanSymbol(symbol) };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Enter a ticker symbol.");
    }
  })
  .handler(async ({ data }) => {
    try {
      return await loadRating(data.symbol);
    } catch (err) {
      if (err instanceof MarketError) throw new Error(err.message);
      console.error("[halden] rating failed", err);
      throw new Error("Market data is temporarily unavailable. Try again in a moment.");
    }
  });

export const searchTickers = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const q = typeof input === "object" && input && "q" in input ? String((input as { q: unknown }).q) : "";
    return { q: q.slice(0, 40) };
  })
  .handler(async ({ data }) => searchSymbols(data.q));
