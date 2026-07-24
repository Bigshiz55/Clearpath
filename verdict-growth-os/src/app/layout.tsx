import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/app/components/Nav";
import { ProductSwitcher } from "@/app/components/ProductSwitcher";

export const metadata: Metadata = {
  title: "Verdict Growth OS",
  description: "Internal growth operating system for WatchVerdict and ReadVerdict.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col lg:flex-row">
          {/* Sidebar */}
          <aside className="shrink-0 border-b border-edge px-4 py-5 lg:w-72 lg:border-b-0 lg:border-r">
            <div className="mb-5">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/20 text-brand">◆</div>
                <div>
                  <div className="text-sm font-semibold leading-tight text-ink">Verdict Growth OS</div>
                  <div className="text-[11px] text-muted">Acquire · Activate · Retain · Monetize</div>
                </div>
              </div>
            </div>
            <Nav />
            <p className="mt-6 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
              v1 runs on labeled <strong>mock</strong> adapters. No live integrations, no auto-posting, no spend.
            </p>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 px-5 py-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="text-xs text-muted">Internal command center · demo data</div>
              <Suspense fallback={<div className="h-8" />}>
                <ProductSwitcher />
              </Suspense>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
