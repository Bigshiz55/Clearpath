import { NextRequest, NextResponse } from "next/server";
import { getChainSnapshot } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  if (!symbol) {
    return NextResponse.json({ error: "Pass ?symbol=AAPL[&date=YYYY-MM-DD]" }, { status: 400 });
  }
  try {
    const chain = await getChainSnapshot(symbol, date);
    return NextResponse.json({ chain });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chain lookup failed" },
      { status: 502 },
    );
  }
}
