/**
 * KRX 전체 ETF 시딩 스크립트
 * 소스: 네이버 금융 ETF 목록 API (euc-kr 인코딩)
 *
 * 실행: npx tsx scripts/seed-krx-etf-full.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env.local 수동 파싱
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = {
  ticker: string;
  name: string;
  market: "KRX";
  currency: "KRW";
  is_overseas_etf: boolean;
};

// 해외 투자 ETF 판별 키워드 (이름에 포함 시 is_overseas_etf=true)
const OVERSEAS_KEYWORDS = [
  "미국", "미래", "S&P", "SP500", "나스닥", "nasdaq", "NASDAQ",
  "글로벌", "해외", "선진국", "신흥국", "MSCI", "유럽", "일본", "중국",
  "달러", "USD", "엔화", "유로", "TIGER 미국", "KODEX 미국",
  "WTI", "원유", "금속", "금선물", "구리", "골드",
  "인도", "베트남", "브라질", "러시아", "홍콩", "항셍",
];

function isOverseas(name: string): boolean {
  const upper = name.toUpperCase();
  return OVERSEAS_KEYWORDS.some(kw => upper.includes(kw.toUpperCase()));
}

interface NaverEtfItem {
  itemcode: string;
  itemname: string;
  nowVal: number;
  marketSum: number;
}

async function fetchKrxEtfList(): Promise<NaverEtfItem[]> {
  const url = "https://finance.naver.com/api/sise/etfItemList.nhn";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept-Charset": "euc-kr",
      Referer: "https://finance.naver.com/",
    },
  });

  if (!res.ok) {
    throw new Error(`Naver ETF API 오류: ${res.status} ${res.statusText}`);
  }

  // euc-kr 디코딩
  const buffer = await res.arrayBuffer();
  const decoded = new TextDecoder("euc-kr").decode(buffer);

  const parsed = JSON.parse(decoded);
  // 응답 구조: { resultCode, result: { etfItemList: [...] } }
  const items: NaverEtfItem[] = parsed?.result?.etfItemList ?? [];
  return items;
}

async function main() {
  console.log("네이버 금융 ETF 목록 조회 중...");
  const items = await fetchKrxEtfList();
  console.log(`총 ${items.length}개 ETF 조회됨`);

  if (items.length === 0) {
    throw new Error("ETF 목록이 비어 있습니다. API 응답 구조를 확인하세요.");
  }

  const rows: Row[] = items.map((item) => ({
    ticker: item.itemcode.trim(),
    name: item.itemname.trim(),
    market: "KRX",
    currency: "KRW",
    is_overseas_etf: isOverseas(item.itemname),
  }));

  // 티커 중복 제거 (동일 itemcode가 있으면 첫 번째 유지)
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.ticker)) return false;
    seen.add(r.ticker);
    return true;
  });

  const overseasCount = deduped.filter((r) => r.is_overseas_etf).length;
  const domesticCount = deduped.length - overseasCount;
  console.log(`  국내 ETF: ${domesticCount}개`);
  console.log(`  해외투자 ETF: ${overseasCount}개`);

  // 100개씩 배치 upsert
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH);
    const { error } = await supabase
      .from("securities")
      .upsert(batch, { onConflict: "ticker,market", ignoreDuplicates: false });
    if (error) {
      console.error(`\n배치 오류 (${i}~${i + batch.length}):`, error.message);
      throw error;
    }
    done += batch.length;
    process.stdout.write(`\r  진행: ${done}/${deduped.length}`);
  }

  console.log(`\n✅ KRX ETF 시딩 완료! (${deduped.length}개)`);
}

main().catch((e) => {
  console.error("\n❌ 오류:", e.message ?? e);
  process.exit(1);
});
