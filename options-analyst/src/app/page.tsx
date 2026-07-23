"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SAMPLE_PORTFOLIO, portfolioSchema } from "@/lib/portfolio";
import type { Analysis } from "@/lib/analyze/schema";

const STORAGE_KEY = "options-analyst:portfolio";
const WATCHLIST_KEY = "options-analyst:watchlist";
const PREFS_KEY = "options-analyst:prefs";

type Bias = "auto" | "neutral" | "bullish" | "bearish";
type RiskAppetite = "conservative" | "moderate" | "aggressive";

interface Quote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

interface GreeksRow {
  label: string;
  delta: number | null;
  theta: number | null;
  vega: number | null;
  note?: string;
}

interface AnalyzeResponse {
  analysis: Analysis;
  computed: {
    greeks: {
      positions: GreeksRow[];
      netDelta: number | null;
      netTheta: number | null;
      netVega: number | null;
      unpricedCount: number;
    };
    dataUnavailableFor: string[];
  };
}

const fmt = (x: number | null | undefined, digits = 2) =>
  x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: digits });

export default function Home() {
  const [portfolioText, setPortfolioText] = useState("");
  const [watchlist, setWatchlist] = useState("SPY");
  const [bias, setBias] = useState<Bias>("auto");
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>("conservative");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setPortfolioText(
      localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(SAMPLE_PORTFOLIO, null, 2),
    );
    const wl = localStorage.getItem(WATCHLIST_KEY);
    if (wl) setWatchlist(wl);
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (prefs.bias) setBias(prefs.bias);
      if (prefs.riskAppetite) setRiskAppetite(prefs.riskAppetite);
    } catch {
      /* ignore corrupt prefs */
    }
  }, []);

  const parsed = useMemo(() => {
    try {
      return { portfolio: portfolioSchema.parse(JSON.parse(portfolioText)), error: null };
    } catch (e) {
      return { portfolio: null, error: e instanceof Error ? e.message : "invalid JSON" };
    }
  }, [portfolioText]);

  const allSymbols = useMemo(() => {
    const set = new Set<string>(
      watchlist
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    );
    if (parsed.portfolio) {
      parsed.portfolio.equities.forEach((e) => set.add(e.ticker.toUpperCase()));
      parsed.portfolio.options.forEach((o) => set.add(o.ticker.toUpperCase()));
    }
    return [...set];
  }, [watchlist, parsed.portfolio]);

  const refreshQuotes = useCallback(async () => {
    if (allSymbols.length === 0) return;
    setQuotesError(null);
    try {
      const res = await fetch(`/api/market?symbols=${allSymbols.join(",")}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "quote fetch failed");
      setQuotes(data.quotes);
    } catch (e) {
      setQuotesError(e instanceof Error ? e.message : "quote fetch failed");
    }
  }, [allSymbols]);

  useEffect(() => {
    refreshQuotes();
  }, [refreshQuotes]);

  async function analyze() {
    if (!parsed.portfolio) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    localStorage.setItem(STORAGE_KEY, portfolioText);
    localStorage.setItem(WATCHLIST_KEY, watchlist);
    localStorage.setItem(PREFS_KEY, JSON.stringify({ bias, riskAppetite }));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio: parsed.portfolio,
          watchlist: watchlist
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          preferences: { bias, riskAppetite },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `analyze failed (${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <main className="grid gap-6 lg:grid-cols-2">
      {/* Left column: inputs */}
      <section className="space-y-6">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Portfolio
            </h2>
            <button
              className="text-xs text-sky-400 hover:text-sky-300"
              onClick={() => setPortfolioText(JSON.stringify(SAMPLE_PORTFOLIO, null, 2))}
            >
              Load sample
            </button>
          </div>
          <textarea
            className="h-72 w-full resize-y rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-sky-600"
            spellCheck={false}
            value={portfolioText}
            onChange={(e) => setPortfolioText(e.target.value)}
          />
          {parsed.error ? (
            <p className="mt-2 break-all text-xs text-rose-400">⚠ {parsed.error}</p>
          ) : (
            <p className="mt-2 text-xs text-emerald-400">✓ Valid portfolio</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Watchlist
          </h2>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 p-2 font-mono text-sm outline-none focus:border-sky-600"
            value={watchlist}
            onChange={(e) => setWatchlist(e.target.value)}
            placeholder="SPY, QQQ, NVDA"
          />
          {quotesError && <p className="mt-2 text-xs text-rose-400">⚠ {quotesError}</p>}
          {quotes.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-normal">Symbol</th>
                  <th className="py-1 text-right font-normal">Last</th>
                  <th className="py-1 text-right font-normal">Change</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.symbol} className="border-t border-slate-800/60">
                    <td className="py-1.5 font-mono">{q.symbol}</td>
                    <td className="py-1.5 text-right font-mono">{fmt(q.price)}</td>
                    <td
                      className={`py-1.5 text-right font-mono ${
                        (q.change ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {q.changePercent == null ? "—" : `${q.changePercent.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Analysis preferences
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">
              Directional bias
              <select
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 outline-none focus:border-sky-600"
                value={bias}
                onChange={(e) => setBias(e.target.value as Bias)}
              >
                <option value="auto">Auto (let the data decide)</option>
                <option value="neutral">Neutral</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Risk appetite
              <select
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 outline-none focus:border-sky-600"
                value={riskAppetite}
                onChange={(e) => setRiskAppetite(e.target.value as RiskAppetite)}
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive (still defined-risk)</option>
              </select>
            </label>
          </div>
        </div>

        <button
          onClick={analyze}
          disabled={!parsed.portfolio || analyzing}
          className="w-full rounded-lg bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {analyzing ? "Analyzing… (this can take a minute)" : "Run analysis"}
        </button>
        {error && (
          <p className="rounded-md border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">
            {error}
          </p>
        )}
      </section>

      {/* Right column: results */}
      <section className="space-y-6">
        {!result && !analyzing && (
          <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
            Edit your portfolio, then run the analysis. The server pulls delayed quotes and
            option chains, computes your net Greeks deterministically, and asks the model for
            defined-risk trade ideas in strict JSON.
          </div>
        )}

        {result && (
          <>
            <Card title="Market read">
              <p className="text-sm leading-relaxed">{result.analysis.market_read}</p>
            </Card>

            <Card title="Portfolio health">
              <p className="text-sm leading-relaxed">{result.analysis.portfolio_health}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Net Δ (share-eq)" value={fmt(result.computed.greeks.netDelta)} />
                <Stat label="Net Θ ($/day)" value={fmt(result.computed.greeks.netTheta)} />
                <Stat label="Net V ($/vol pt)" value={fmt(result.computed.greeks.netVega)} />
              </div>
              {result.computed.greeks.positions.length > 0 && (
                <table className="mt-3 w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 font-normal">Position</th>
                      <th className="py-1 text-right font-normal">Δ</th>
                      <th className="py-1 text-right font-normal">Θ/day</th>
                      <th className="py-1 text-right font-normal">Vega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.computed.greeks.positions.map((p, i) => (
                      <tr key={i} className="border-t border-slate-800/60">
                        <td className="py-1 pr-2 font-mono">
                          {p.label}
                          {p.note && <span className="ml-1 text-amber-500">({p.note})</span>}
                        </td>
                        <td className="py-1 text-right font-mono">{fmt(p.delta)}</td>
                        <td className="py-1 text-right font-mono">{fmt(p.theta)}</td>
                        <td className="py-1 text-right font-mono">{fmt(p.vega)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card
              title={`Recommended actions (${result.analysis.recommended_actions.length})`}
            >
              {result.analysis.recommended_actions.length === 0 && (
                <p className="text-sm text-slate-400">
                  No trades recommended under current conditions.
                </p>
              )}
              <div className="space-y-3">
                {result.analysis.recommended_actions.map((a, i) => (
                  <div key={i} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          a.action === "OPEN"
                            ? "bg-emerald-900/60 text-emerald-300"
                            : a.action === "CLOSE"
                              ? "bg-rose-900/60 text-rose-300"
                              : "bg-amber-900/60 text-amber-300"
                        }`}
                      >
                        {a.action}
                      </span>
                      <span className="font-mono font-semibold">{a.ticker}</span>
                      <span className="text-sm text-slate-300">{a.strategy}</span>
                      <span className="ml-auto font-mono text-xs text-slate-500">
                        exp {a.expiration}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-sky-300">{a.legs.join(" · ")}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{a.rationale}</p>
                    <div className="mt-2 flex gap-4 font-mono text-xs">
                      <span className="text-rose-400">max loss ≈ ${fmt(a.max_loss, 0)}</span>
                      <span className="text-emerald-400">max profit ≈ ${fmt(a.max_profit, 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <button
              className="text-xs text-slate-500 underline hover:text-slate-300"
              onClick={() => setShowRaw((s) => !s)}
            >
              {showRaw ? "Hide" : "Show"} raw JSON
            </button>
            {showRaw && (
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                {JSON.stringify(result.analysis, null, 2)}
              </pre>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
      <div className="font-mono text-sm text-slate-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}
