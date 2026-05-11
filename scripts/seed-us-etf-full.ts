/**
 * 미국 전체 ETF 시딩 스크립트
 * 소스: NASDAQ Trader nasdaqtraded.txt (파이프 구분자)
 * URL: https://www.nasdaqtrader.com/dynamic/symdir/nasdaqtraded.txt
 *
 * 파일 형식:
 *   Act Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
 *   A|Agilent Technologies Inc.|N|A|N|100|N|A
 *   QQQ|Invesco QQQ Trust|Q|QQQ|Y|100|N|QQQ
 *
 *   ETF 컬럼: Y → ETF, N → 주식
 *   Exchange: Q=NASDAQ, N=NYSE, A=NYSE MKT(AMEX), P=NYSE Arca, Z=BATS
 *
 * 실행: npx tsx scripts/seed-us-etf-full.ts
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

type Market = "NASDAQ" | "NYSE" | "AMEX";
type Row = {
  ticker: string;
  name: string;
  market: Market;
  currency: "USD";
  is_overseas_etf: true;
};

function exchangeToMarket(exchange: string): Market {
  switch (exchange) {
    case "Q": return "NASDAQ";  // NASDAQ Global Select
    case "G": return "NASDAQ";  // NASDAQ Global Market
    case "S": return "NASDAQ";  // NASDAQ Capital Market
    case "N": return "NYSE";    // New York Stock Exchange
    case "P": return "NYSE";    // NYSE Arca
    case "A": return "AMEX";    // NYSE American (AMEX)
    case "Z": return "NASDAQ";  // BATS → NASDAQ로 분류
    case "V": return "NYSE";    // IEX → NYSE로 분류
    default:  return "NYSE";    // 기타
  }
}

async function fetchNasdaqTradedFile(): Promise<string> {
  const url = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqtraded.txt";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; yellowdog-seeder/1.0)",
    },
  });
  if (!res.ok) {
    throw new Error(`NASDAQ Trader 파일 오류: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseNasdaqTradedFile(content: string): Row[] {
  const lines = content.split("\n");
  if (lines.length < 2) throw new Error("파일 내용이 비어 있습니다.");

  // 첫 줄은 헤더
  const header = lines[0].split("|");
  // nasdaqtraded.txt 헤더: "Nasdaq Traded|Symbol|Security Name|Listing Exchange|..."
  // nasdaqlisted.txt 헤더: "Symbol|Security Name|Market Category|..."  (fallback)
  const colIdx = {
    symbol:    header.indexOf("Symbol"),        // nasdaqtraded.txt
    name:      header.indexOf("Security Name"),
    exchange:  header.indexOf("Listing Exchange") >= 0
                 ? header.indexOf("Listing Exchange")
                 : header.indexOf("Exchange"),
    isEtf:     header.indexOf("ETF"),
    testIssue: header.indexOf("Test Issue"),
  };

  // 컬럼 인덱스 검증
  if (colIdx.symbol < 0 || colIdx.isEtf < 0) {
    throw new Error(`헤더 파싱 실패. 실제 헤더: ${lines[0]}`);
  }

  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("File Creation Time")) continue;

    const cols = line.split("|");
    if (cols.length < 5) continue;

    const isEtf    = cols[colIdx.isEtf]?.trim().toUpperCase() === "Y";
    const isTest   = cols[colIdx.testIssue]?.trim().toUpperCase() === "Y";
    if (!isEtf || isTest) continue;

    const symbol   = cols[colIdx.symbol]?.trim();
    const name     = cols[colIdx.name]?.trim() ?? "";
    const exchange = cols[colIdx.exchange]?.trim() ?? "N";

    // 유효하지 않은 심볼 제외 (공백, 숫자만, 5자 초과 등)
    if (!symbol || symbol.length === 0 || symbol.length > 10) continue;
    if (/\s/.test(symbol)) continue;        // 공백 포함 심볼 제외
    if (/^[0-9]+$/.test(symbol)) continue; // 숫자만인 심볼 제외

    rows.push({
      ticker: symbol,
      name: name.replace(/\s+/g, " ").trim(),
      market: exchangeToMarket(exchange),
      currency: "USD",
      is_overseas_etf: true,
    });
  }

  return rows;
}

async function main() {
  console.log("NASDAQ Trader 파일 다운로드 중...");
  const content = await fetchNasdaqTradedFile();
  const lines = content.split("\n").length;
  console.log(`  파일 수신: ${lines}줄`);

  console.log("파싱 중...");
  const rows = parseNasdaqTradedFile(content);
  console.log(`  ETF 필터 후: ${rows.length}개`);

  if (rows.length === 0) {
    throw new Error("파싱 결과가 비어 있습니다. 파일 형식을 확인하세요.");
  }

  // 거래소별 분포 출력
  const byMarket = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.market] = (acc[r.market] ?? 0) + 1;
    return acc;
  }, {});
  for (const [mkt, cnt] of Object.entries(byMarket).sort()) {
    console.log(`    ${mkt}: ${cnt}개`);
  }

  // 100개씩 배치 upsert
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("securities")
      .upsert(batch, { onConflict: "ticker,market", ignoreDuplicates: false });
    if (error) {
      console.error(`\n배치 오류 (${i}~${i + batch.length}):`, error.message);
      throw error;
    }
    done += batch.length;
    process.stdout.write(`\r  진행: ${done}/${rows.length}`);
  }

  console.log(`\n✅ 미국 ETF 시딩 완료! (${rows.length}개)`);
}

main().catch((e) => {
  console.error("\n❌ 오류:", e.message ?? e);
  process.exit(1);
});
