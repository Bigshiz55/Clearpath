import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Options Analyst",
  description:
    "Quantitative options portfolio analysis: live vol metrics, computed Greeks, and risk-adjusted trade ideas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <header className="mb-8 flex items-baseline justify-between border-b border-slate-800 pb-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
                Options Analyst
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Delayed market data · computed Greeks · defined-risk trade ideas
              </p>
            </div>
            <span className="rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-1 text-xs text-amber-400">
              Not investment advice
            </span>
          </header>
          {children}
          <footer className="mt-12 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-500">
            Quotes and option chains are delayed data from a free public source and may be
            inaccurate. Greeks are Black-Scholes estimates. AI-generated recommendations are for
            research and education only — nothing here is investment advice. Options involve
            substantial risk of loss.
          </footer>
        </div>
      </body>
    </html>
  );
}
