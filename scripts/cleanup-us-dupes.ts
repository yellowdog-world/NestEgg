/**
 * US 종목 중복 정리 스크립트
 * 동일 ticker가 NASDAQ + NYSE 양쪽에 있는 경우 올바른 market만 남김
 * 실행: npx tsx scripts/cleanup-us-dupes.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 시드 스크립트 기준 "올바른" market
const CORRECT_MARKET: Record<string, "NASDAQ" | "NYSE"> = {};

const NASDAQ_TICKERS = [
  "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","TSLA","AVGO","COST","NFLX","AMD","QCOM",
  "INTU","INTC","AMAT","ADI","MU","LRCX","KLAC","MRVL","ORCL","CSCO","TXN","ADBE","PANW",
  "CDNS","SNPS","FTNT","CRWD","ZS","OKTA","DDOG","MDB","MCHP","NXPI","ON","SWKS","WDC","STX",
  "NTAP","AKAM","CDW","DELL","HPQ","FFIV","ZBRA","ANSS","PTC","TER","REGN","VRTX","GILD","AMGN",
  "BIIB","IDXX","ISRG","DXCM","MRNA","GEHC","ILMN","HOLX","HSIC","ALGN","PODD","PEP","SBUX",
  "MDLZ","MNST","KDP","DLTR","ODFL","FAST","CPRT","PCAR","PYPL","ADP","PAYX","CTAS","VRSK","FI",
  "NDAQ","CME","CBOE","AFRM","CMCSA","CEG","EXC","MELI","BKNG","JD","PDD","RIVN","LCID","FSLR",
  "ENPH","SEDG","PLUG",
  // NASDAQ 상장 ETF
  "QQQ","QQQM","SOXX","SMH",
];

const NYSE_TICKERS = [
  "BRK.B","JPM","BAC","GS","MS","WFC","C","USB","BK","STT","BX","KKR","APO","AXP","COF","BLK",
  "PGR","TRV","AIG","MET","PRU","AFL","ALL","V","MA","FIS","GPN","SQ","UNH","JNJ","ABT","MRK",
  "PFE","TMO","DHR","ELV","CI","CVS","HUM","MCK","CAH","BDX","SYK","BSX","EW","MDT","ZBH","DGX",
  "LH","IQV","CNC","MOH","PG","KO","WMT","HD","NKE","MCD","LOW","TGT","CMG","YUM","DPZ","MAR",
  "HLT","RCL","CCL","DG","CL","EL","PM","MO","STZ","TAP","K","GIS","CPB","HRL","SJM","GE","MMM",
  "HON","CAT","DE","UPS","FDX","BA","LMT","RTX","NOC","GD","LHX","HWM","TDG","AXON","WM","RSG",
  "CBRE","AMT","PLD","EQIX","CCI","SPG","O","WELL","PSA","CRM","IBM","ACN","SNOW","NET","PATH",
  "PLTR","APP","HOOD","XOM","CVX","COP","SLB","EOG","PSX","VLO","MPC","OXY","HAL","DVN","FANG",
  "MRO","APA","NEE","SO","DUK","AEP","D","ED","PCG","SRE","AWK","T","VZ","DIS","WBD","FOX",
  "NWS","LIN","APD","SHW","ECL","DD","DOW","NEM","FCX","NUE","STLD","ALB","MP","ABNB","UBER",
  "LYFT","LVS","MGM","WYNN","BABA","BIDU","NIO",
  // NYSE Arca 상장 ETF (대부분)
  "SPY","VOO","IVV","VTI","ITOT","SCHB","VV","MGC","SCHD","VYM","DGRO","VIG","DVY","HDV",
  "VUG","IWF","MGK","VGT","XLK","XLF","XLV","XLE","XLY","XLP","XLI","XLU","XLB","XLC","XLRE",
  "JEPI","JEPQ","XYLD","QYLD","IWM","VB","TLT","IEF","SHY","LQD","HYG","AGG","BND","GLD","IAU",
  "SLV","GDX","USO","TQQQ","SQQQ","SPXL","UPRO","SOXL","ARKK","ARKG","ARKW","ARKQ","ARKF",
  "VEA","VWO","EEM","EFA",
];

for (const t of NASDAQ_TICKERS) CORRECT_MARKET[t] = "NASDAQ";
for (const t of NYSE_TICKERS) CORRECT_MARKET[t] = "NYSE";  // NYSE가 나중에 덮으면 NYSE 우선

async function main() {
  // 중복 종목 찾기
  const { data: all } = await supabase
    .from("securities")
    .select("ticker, market, is_overseas_etf")
    .eq("currency", "USD");

  if (!all) { console.log("데이터 없음"); return; }

  const byTicker = new Map<string, string[]>();
  for (const r of all) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, []);
    byTicker.get(r.ticker)!.push(r.market);
  }

  const dupes = [...byTicker.entries()].filter(([, markets]) => markets.length > 1);
  console.log(`중복 티커 ${dupes.length}개 발견:`, dupes.map(([t, m]) => `${t}(${m.join("+")})`).join(", "));

  if (dupes.length === 0) { console.log("✅ 중복 없음"); return; }

  let fixed = 0;
  for (const [ticker, markets] of dupes) {
    const correct = CORRECT_MARKET[ticker];
    if (!correct) {
      console.log(`⚠️  ${ticker}: 올바른 market 모름, 건너뜀`);
      continue;
    }
    const wrong = markets.filter(m => m !== correct);
    for (const badMarket of wrong) {
      // holdings에서 잘못된 market 참조를 올바른 market으로 교체
      await supabase
        .from("holdings")
        .update({ security_market: correct })
        .eq("security_ticker", ticker)
        .eq("security_market", badMarket);

      // 잘못된 securities 행 삭제
      const { error } = await supabase
        .from("securities")
        .delete()
        .eq("ticker", ticker)
        .eq("market", badMarket);

      if (error) console.error(`  삭제 실패 ${ticker}/${badMarket}:`, error.message);
      else { console.log(`  ✓ ${ticker}: ${badMarket} → ${correct}`); fixed++; }
    }
  }
  console.log(`\n✅ ${fixed}개 중복 정리 완료`);
}

main().catch((e) => { console.error(e); process.exit(1); });
