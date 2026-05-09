import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupByTicker, deriveTickerInfo } from "@/lib/market/ticker-map";
import { fetchNaverName, fetchYahooName } from "@/lib/market/external-apis";

// GET /api/market/resolve?ticker=379800
// 우선순위: 정적 맵 → DB 캐시 → 외부 API(Naver/Yahoo) → DB 저장
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  // 1. 정적 역방향 맵 (즉시, DB 불필요)
  const found = lookupByTicker(ticker);
  if (found) {
    return NextResponse.json({ name: found.name, market: found.info.market, currency: found.info.currency });
  }

  const supabase = await createClient();

  // 2. DB 캐시 확인
  const { data: cached } = await supabase
    .from("securities")
    .select("name, market, currency")
    .eq("ticker", ticker)
    .limit(1)
    .maybeSingle();
  if (cached?.name) {
    return NextResponse.json({ name: cached.name, market: cached.market, currency: cached.currency });
  }

  // 3. KRX 6자리 → Naver Finance
  if (/^\d{6}$/.test(ticker)) {
    const name = await fetchNaverName(ticker);
    const result = { name: name ?? ticker, market: "KRX", currency: "KRW" };
    if (name) {
      await supabase
        .from("securities")
        .upsert({ ticker, market: "KRX", name, currency: "KRW" }, { onConflict: "ticker,market" });
    }
    return NextResponse.json(result);
  }

  // 4. US 티커 패턴 → Yahoo Finance
  const info = deriveTickerInfo(ticker);
  if (info) {
    const name = await fetchYahooName(ticker);
    if (name) {
      await supabase
        .from("securities")
        .upsert({ ticker, market: info.market, name, currency: info.currency }, { onConflict: "ticker,market" });
    }
    return NextResponse.json({ name, market: info.market, currency: info.currency });
  }

  return NextResponse.json({ name: null, market: null, currency: null });
}
