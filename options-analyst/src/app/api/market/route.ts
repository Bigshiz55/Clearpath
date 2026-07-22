import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "Pass ?symbols=SPY,AAPL" }, { status: 400 });
  }
  try {
    const quotes = await getQuotes(symbols);
    return NextResponse.json({ quotes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "quote lookup failed" },
      { status: 502 },
    );
  }
}
