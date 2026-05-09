/**
 * 미국 주식/ETF 시딩 스크립트
 * 실행: npx tsx scripts/seed-us-stocks.ts
 *
 * 시총 기준 상위 ~270개 미국 주식 + 주요 ETF ~50개
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env.local 수동 파싱 (dotenv 의존성 없이)
for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = { ticker: string; name: string; market: string; currency: "USD"; is_overseas_etf: boolean };

const NASDAQ: [string, string][] = [
  // 메가캡
  ["AAPL",  "Apple Inc."],
  ["MSFT",  "Microsoft Corp."],
  ["NVDA",  "NVIDIA Corp."],
  ["AMZN",  "Amazon.com Inc."],
  ["META",  "Meta Platforms Inc."],
  ["GOOGL", "Alphabet Inc. Class A"],
  ["GOOG",  "Alphabet Inc. Class C"],
  ["TSLA",  "Tesla Inc."],
  ["AVGO",  "Broadcom Inc."],
  ["COST",  "Costco Wholesale Corp."],
  // 테크
  ["NFLX",  "Netflix Inc."],
  ["AMD",   "Advanced Micro Devices Inc."],
  ["QCOM",  "Qualcomm Inc."],
  ["INTU",  "Intuit Inc."],
  ["INTC",  "Intel Corp."],
  ["AMAT",  "Applied Materials Inc."],
  ["ADI",   "Analog Devices Inc."],
  ["MU",    "Micron Technology Inc."],
  ["LRCX",  "Lam Research Corp."],
  ["KLAC",  "KLA Corp."],
  ["MRVL",  "Marvell Technology Inc."],
  ["ORCL",  "Oracle Corp."],
  ["CSCO",  "Cisco Systems Inc."],
  ["TXN",   "Texas Instruments Inc."],
  ["ADBE",  "Adobe Inc."],
  ["PANW",  "Palo Alto Networks Inc."],
  ["CDNS",  "Cadence Design Systems Inc."],
  ["SNPS",  "Synopsys Inc."],
  ["FTNT",  "Fortinet Inc."],
  ["CRWD",  "CrowdStrike Holdings Inc."],
  ["ZS",    "Zscaler Inc."],
  ["OKTA",  "Okta Inc."],
  ["DDOG",  "Datadog Inc."],
  ["MDB",   "MongoDB Inc."],
  ["MCHP",  "Microchip Technology Inc."],
  ["NXPI",  "NXP Semiconductors N.V."],
  ["ON",    "ON Semiconductor Corp."],
  ["SWKS",  "Skyworks Solutions Inc."],
  ["WDC",   "Western Digital Corp."],
  ["STX",   "Seagate Technology Holdings"],
  ["NTAP",  "NetApp Inc."],
  ["AKAM",  "Akamai Technologies Inc."],
  ["CDW",   "CDW Corp."],
  ["DELL",  "Dell Technologies Inc."],
  ["HPQ",   "HP Inc."],
  ["FFIV",  "F5 Inc."],
  ["ZBRA",  "Zebra Technologies Corp."],
  ["ANSS",  "Ansys Inc."],
  ["PTC",   "PTC Inc."],
  ["TER",   "Teradyne Inc."],
  // 헬스케어
  ["REGN",  "Regeneron Pharmaceuticals Inc."],
  ["VRTX",  "Vertex Pharmaceuticals Inc."],
  ["GILD",  "Gilead Sciences Inc."],
  ["AMGN",  "Amgen Inc."],
  ["BIIB",  "Biogen Inc."],
  ["IDXX",  "IDEXX Laboratories Inc."],
  ["ISRG",  "Intuitive Surgical Inc."],
  ["DXCM",  "DexCom Inc."],
  ["MRNA",  "Moderna Inc."],
  ["GEHC",  "GE HealthCare Technologies Inc."],
  ["ILMN",  "Illumina Inc."],
  ["HOLX",  "Hologic Inc."],
  ["HSIC",  "Henry Schein Inc."],
  ["ALGN",  "Align Technology Inc."],
  ["PODD",  "Insulet Corp."],
  // 소비재/유통
  ["PEP",   "PepsiCo Inc."],
  ["SBUX",  "Starbucks Corp."],
  ["MDLZ",  "Mondelez International Inc."],
  ["MNST",  "Monster Beverage Corp."],
  ["KDP",   "Keurig Dr Pepper Inc."],
  ["DLTR",  "Dollar Tree Inc."],
  ["ODFL",  "Old Dominion Freight Line Inc."],
  ["FAST",  "Fastenal Co."],
  ["CPRT",  "Copart Inc."],
  ["PCAR",  "PACCAR Inc."],
  // 금융/핀테크
  ["PYPL",  "PayPal Holdings Inc."],
  ["ADP",   "Automatic Data Processing Inc."],
  ["PAYX",  "Paychex Inc."],
  ["CTAS",  "Cintas Corp."],
  ["VRSK",  "Verisk Analytics Inc."],
  ["FI",    "Fiserv Inc."],
  ["NDAQ",  "Nasdaq Inc."],
  ["CME",   "CME Group Inc."],
  ["CBOE",  "Cboe Global Markets Inc."],
  ["AFRM",  "Affirm Holdings Inc."],
  // 커뮤니케이션/미디어
  ["CMCSA", "Comcast Corp."],
  // 에너지
  ["CEG",   "Constellation Energy Corp."],
  ["EXC",   "Exelon Corp."],
  // 이커머스/글로벌
  ["MELI",  "MercadoLibre Inc."],
  ["BKNG",  "Booking Holdings Inc."],
  ["JD",    "JD.com Inc. ADR"],
  ["PDD",   "PDD Holdings Inc. ADR"],
  // EV
  ["RIVN",  "Rivian Automotive Inc."],
  ["LCID",  "Lucid Group Inc."],
  // 클린에너지
  ["FSLR",  "First Solar Inc."],
  ["ENPH",  "Enphase Energy Inc."],
  ["SEDG",  "SolarEdge Technologies Inc."],
  ["PLUG",  "Plug Power Inc."],
];

const NYSE: [string, string][] = [
  // 버크셔
  ["BRK.B", "Berkshire Hathaway Inc. Class B"],
  // 금융
  ["JPM",   "JPMorgan Chase & Co."],
  ["BAC",   "Bank of America Corp."],
  ["GS",    "Goldman Sachs Group Inc."],
  ["MS",    "Morgan Stanley"],
  ["WFC",   "Wells Fargo & Co."],
  ["C",     "Citigroup Inc."],
  ["USB",   "U.S. Bancorp"],
  ["BK",    "Bank of New York Mellon Corp."],
  ["STT",   "State Street Corp."],
  ["BX",    "Blackstone Inc."],
  ["KKR",   "KKR & Co. Inc."],
  ["APO",   "Apollo Global Management Inc."],
  ["AXP",   "American Express Co."],
  ["COF",   "Capital One Financial Corp."],
  ["BLK",   "BlackRock Inc."],
  ["PGR",   "Progressive Corp."],
  ["TRV",   "Travelers Companies Inc."],
  ["AIG",   "American International Group Inc."],
  ["MET",   "MetLife Inc."],
  ["PRU",   "Prudential Financial Inc."],
  ["AFL",   "Aflac Inc."],
  ["ALL",   "Allstate Corp."],
  // 페이먼트
  ["V",     "Visa Inc."],
  ["MA",    "Mastercard Inc."],
  ["FIS",   "Fidelity National Information Services Inc."],
  ["GPN",   "Global Payments Inc."],
  ["SQ",    "Block Inc."],
  // 헬스케어
  ["UNH",   "UnitedHealth Group Inc."],
  ["JNJ",   "Johnson & Johnson"],
  ["ABT",   "Abbott Laboratories"],
  ["MRK",   "Merck & Co. Inc."],
  ["PFE",   "Pfizer Inc."],
  ["TMO",   "Thermo Fisher Scientific Inc."],
  ["DHR",   "Danaher Corp."],
  ["ELV",   "Elevance Health Inc."],
  ["CI",    "Cigna Group"],
  ["CVS",   "CVS Health Corp."],
  ["HUM",   "Humana Inc."],
  ["MCK",   "McKesson Corp."],
  ["CAH",   "Cardinal Health Inc."],
  ["BDX",   "Becton Dickinson and Co."],
  ["SYK",   "Stryker Corp."],
  ["BSX",   "Boston Scientific Corp."],
  ["EW",    "Edwards Lifesciences Corp."],
  ["MDT",   "Medtronic plc"],
  ["ZBH",   "Zimmer Biomet Holdings Inc."],
  ["DGX",   "Quest Diagnostics Inc."],
  ["LH",    "Labcorp"],
  ["IQV",   "IQVIA Holdings Inc."],
  ["CNC",   "Centene Corp."],
  ["MOH",   "Molina Healthcare Inc."],
  // 소비재
  ["PG",    "Procter & Gamble Co."],
  ["KO",    "Coca-Cola Co."],
  ["WMT",   "Walmart Inc."],
  ["HD",    "Home Depot Inc."],
  ["NKE",   "Nike Inc."],
  ["MCD",   "McDonald's Corp."],
  ["LOW",   "Lowe's Companies Inc."],
  ["TGT",   "Target Corp."],
  ["CMG",   "Chipotle Mexican Grill Inc."],
  ["YUM",   "Yum! Brands Inc."],
  ["DPZ",   "Domino's Pizza Inc."],
  ["MAR",   "Marriott International Inc."],
  ["HLT",   "Hilton Worldwide Holdings Inc."],
  ["RCL",   "Royal Caribbean Cruises Ltd."],
  ["CCL",   "Carnival Corp."],
  ["DG",    "Dollar General Corp."],
  ["CL",    "Colgate-Palmolive Co."],
  ["EL",    "Estée Lauder Companies Inc."],
  ["PM",    "Philip Morris International Inc."],
  ["MO",    "Altria Group Inc."],
  ["STZ",   "Constellation Brands Inc."],
  ["TAP",   "Molson Coors Beverage Co."],
  ["K",     "Kellanova"],
  ["GIS",   "General Mills Inc."],
  ["CPB",   "Campbell Soup Co."],
  ["HRL",   "Hormel Foods Corp."],
  ["SJM",   "J.M. Smucker Co."],
  // 산업재
  ["GE",    "GE Aerospace"],
  ["MMM",   "3M Co."],
  ["HON",   "Honeywell International Inc."],
  ["CAT",   "Caterpillar Inc."],
  ["DE",    "Deere & Co."],
  ["UPS",   "United Parcel Service Inc."],
  ["FDX",   "FedEx Corp."],
  ["BA",    "Boeing Co."],
  ["LMT",   "Lockheed Martin Corp."],
  ["RTX",   "RTX Corp."],
  ["NOC",   "Northrop Grumman Corp."],
  ["GD",    "General Dynamics Corp."],
  ["LHX",   "L3Harris Technologies Inc."],
  ["HWM",   "Howmet Aerospace Inc."],
  ["TDG",   "TransDigm Group Inc."],
  ["AXON",  "Axon Enterprise Inc."],
  ["WM",    "Waste Management Inc."],
  ["RSG",   "Republic Services Inc."],
  ["CBRE",  "CBRE Group Inc."],
  ["AMT",   "American Tower Corp."],
  ["PLD",   "Prologis Inc."],
  ["EQIX",  "Equinix Inc."],
  ["CCI",   "Crown Castle Inc."],
  ["SPG",   "Simon Property Group Inc."],
  ["O",     "Realty Income Corp."],
  ["WELL",  "Welltower Inc."],
  ["PSA",   "Public Storage"],
  // 테크/소프트웨어
  ["CRM",   "Salesforce Inc."],
  ["IBM",   "International Business Machines Corp."],
  ["ACN",   "Accenture plc"],
  ["SNOW",  "Snowflake Inc."],
  ["NET",   "Cloudflare Inc."],
  ["PATH",  "UiPath Inc."],
  ["PLTR",  "Palantir Technologies Inc."],
  ["APP",   "AppLovin Corp."],
  ["HOOD",  "Robinhood Markets Inc."],
  // 에너지
  ["XOM",   "Exxon Mobil Corp."],
  ["CVX",   "Chevron Corp."],
  ["COP",   "ConocoPhillips"],
  ["SLB",   "SLB"],
  ["EOG",   "EOG Resources Inc."],
  ["PSX",   "Phillips 66"],
  ["VLO",   "Valero Energy Corp."],
  ["MPC",   "Marathon Petroleum Corp."],
  ["OXY",   "Occidental Petroleum Corp."],
  ["HAL",   "Halliburton Co."],
  ["DVN",   "Devon Energy Corp."],
  ["FANG",  "Diamondback Energy Inc."],
  ["MRO",   "Marathon Oil Corp."],
  ["APA",   "APA Corp."],
  // 유틸리티
  ["NEE",   "NextEra Energy Inc."],
  ["SO",    "Southern Co."],
  ["DUK",   "Duke Energy Corp."],
  ["AEP",   "American Electric Power Co. Inc."],
  ["D",     "Dominion Energy Inc."],
  ["ED",    "Consolidated Edison Inc."],
  ["EXC",   "Exelon Corp."],
  ["PCG",   "PG&E Corp."],
  ["SRE",   "Sempra"],
  ["AWK",   "American Water Works Co. Inc."],
  // 통신
  ["T",     "AT&T Inc."],
  ["VZ",    "Verizon Communications Inc."],
  ["DIS",   "Walt Disney Co."],
  ["WBD",   "Warner Bros. Discovery Inc."],
  ["FOX",   "Fox Corp."],
  ["NWS",   "News Corp."],
  // 소재
  ["LIN",   "Linde plc"],
  ["APD",   "Air Products and Chemicals Inc."],
  ["SHW",   "Sherwin-Williams Co."],
  ["ECL",   "Ecolab Inc."],
  ["DD",    "DuPont de Nemours Inc."],
  ["DOW",   "Dow Inc."],
  ["NEM",   "Newmont Corp."],
  ["FCX",   "Freeport-McMoRan Inc."],
  ["NUE",   "Nucor Corp."],
  ["STLD",  "Steel Dynamics Inc."],
  ["ALB",   "Albemarle Corp."],
  ["MP",    "MP Materials Corp."],
  // 여행/레저
  ["ABNB",  "Airbnb Inc."],
  ["UBER",  "Uber Technologies Inc."],
  ["LYFT",  "Lyft Inc."],
  ["LVS",   "Las Vegas Sands Corp."],
  ["MGM",   "MGM Resorts International"],
  ["WYNN",  "Wynn Resorts Ltd."],
  // 중국 ADR
  ["BABA",  "Alibaba Group Holding Ltd. ADR"],
  ["BIDU",  "Baidu Inc. ADR"],
  ["NIO",   "NIO Inc. ADR"],
];

// NYSE Arca (ETF) — market은 "NYSE"로 통일
const ETF_NYSE: [string, string][] = [
  // 브로드 마켓
  ["SPY",   "SPDR S&P 500 ETF Trust"],
  ["VOO",   "Vanguard S&P 500 ETF"],
  ["IVV",   "iShares Core S&P 500 ETF"],
  ["VTI",   "Vanguard Total Stock Market ETF"],
  ["ITOT",  "iShares Core S&P Total U.S. Stock Market ETF"],
  ["SCHB",  "Schwab U.S. Broad Market ETF"],
  ["VV",    "Vanguard Large-Cap ETF"],
  ["MGC",   "Vanguard Mega Cap ETF"],
  // 배당
  ["SCHD",  "Schwab U.S. Dividend Equity ETF"],
  ["VYM",   "Vanguard High Dividend Yield ETF"],
  ["DGRO",  "iShares Core Dividend Growth ETF"],
  ["VIG",   "Vanguard Dividend Appreciation ETF"],
  ["DVY",   "iShares Select Dividend ETF"],
  ["HDV",   "iShares Core High Dividend ETF"],
  // 성장
  ["QQQ",   "Invesco QQQ Trust"],
  ["QQQM",  "Invesco NASDAQ 100 ETF"],
  ["VUG",   "Vanguard Growth ETF"],
  ["IWF",   "iShares Russell 1000 Growth ETF"],
  ["MGK",   "Vanguard Mega Cap Growth ETF"],
  // 섹터
  ["VGT",   "Vanguard Information Technology ETF"],
  ["XLK",   "Technology Select Sector SPDR Fund"],
  ["XLF",   "Financial Select Sector SPDR Fund"],
  ["XLV",   "Health Care Select Sector SPDR Fund"],
  ["XLE",   "Energy Select Sector SPDR Fund"],
  ["XLY",   "Consumer Discretionary Select Sector SPDR Fund"],
  ["XLP",   "Consumer Staples Select Sector SPDR Fund"],
  ["XLI",   "Industrial Select Sector SPDR Fund"],
  ["XLU",   "Utilities Select Sector SPDR Fund"],
  ["XLB",   "Materials Select Sector SPDR Fund"],
  ["XLC",   "Communication Services Select Sector SPDR Fund"],
  ["XLRE",  "Real Estate Select Sector SPDR Fund"],
  // 반도체
  ["SOXX",  "iShares Semiconductor ETF"],
  ["SMH",   "VanEck Semiconductor ETF"],
  // 옵션 프리미엄
  ["JEPI",  "JPMorgan Equity Premium Income ETF"],
  ["JEPQ",  "JPMorgan Nasdaq Equity Premium Income ETF"],
  ["XYLD",  "Global X S&P 500 Covered Call ETF"],
  ["QYLD",  "Global X NASDAQ 100 Covered Call ETF"],
  // 소형주
  ["IWM",   "iShares Russell 2000 ETF"],
  ["VB",    "Vanguard Small-Cap ETF"],
  // 채권
  ["TLT",   "iShares 20+ Year Treasury Bond ETF"],
  ["IEF",   "iShares 7-10 Year Treasury Bond ETF"],
  ["SHY",   "iShares 1-3 Year Treasury Bond ETF"],
  ["LQD",   "iShares iBoxx $ Investment Grade Corporate Bond ETF"],
  ["HYG",   "iShares iBoxx $ High Yield Corporate Bond ETF"],
  ["AGG",   "iShares Core U.S. Aggregate Bond ETF"],
  ["BND",   "Vanguard Total Bond Market ETF"],
  // 원자재
  ["GLD",   "SPDR Gold Shares"],
  ["IAU",   "iShares Gold Trust"],
  ["SLV",   "iShares Silver Trust"],
  ["GDX",   "VanEck Gold Miners ETF"],
  ["USO",   "United States Oil Fund"],
  // 레버리지/인버스 (자주 쓰이는 것만)
  ["TQQQ",  "ProShares UltraPro QQQ"],
  ["SQQQ",  "ProShares UltraPro Short QQQ"],
  ["SPXL",  "Direxion Daily S&P 500 Bull 3X Shares"],
  ["UPRO",  "ProShares UltraPro S&P 500"],
  ["SOXL",  "Direxion Daily Semiconductor Bull 3X Shares"],
  // ARK
  ["ARKK",  "ARK Innovation ETF"],
  ["ARKG",  "ARK Genomic Revolution ETF"],
  ["ARKW",  "ARK Next Generation Internet ETF"],
  ["ARKQ",  "ARK Autonomous Technology & Robotics ETF"],
  ["ARKF",  "ARK Fintech Innovation ETF"],
  // 글로벌
  ["VEA",   "Vanguard FTSE Developed Markets ETF"],
  ["VWO",   "Vanguard FTSE Emerging Markets ETF"],
  ["EEM",   "iShares MSCI Emerging Markets ETF"],
  ["EFA",   "iShares MSCI EAFE ETF"],
];

async function main() {
  const rows: Row[] = [
    ...NASDAQ.map(([ticker, name]) => ({ ticker, name, market: "NASDAQ", currency: "USD" as const, is_overseas_etf: false })),
    ...NYSE.map(([ticker, name]) => ({ ticker, name, market: "NYSE", currency: "USD" as const, is_overseas_etf: false })),
    ...ETF_NYSE.map(([ticker, name]) => ({ ticker, name, market: "NYSE", currency: "USD" as const, is_overseas_etf: true })),
  ];

  // 중복 ticker 제거 (NASDAQ 우선)
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    const key = `${r.ticker}:${r.market}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`총 ${deduped.length}개 종목 upsert 시작...`);
  console.log(`  NASDAQ: ${deduped.filter(r => r.market === "NASDAQ").length}`);
  console.log(`  NYSE (주식): ${deduped.filter(r => r.market === "NYSE" && !r.is_overseas_etf).length}`);
  console.log(`  NYSE (ETF):  ${deduped.filter(r => r.market === "NYSE" && r.is_overseas_etf).length}`);

  // 50개씩 배치 처리
  const BATCH = 50;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH);
    const { error } = await supabase
      .from("securities")
      .upsert(batch, { onConflict: "ticker,market", ignoreDuplicates: false });
    if (error) {
      console.error(`배치 ${i / BATCH + 1} 오류:`, error.message);
      throw error;
    }
    console.log(`  [${i + batch.length}/${deduped.length}] 완료`);
  }

  console.log("✅ 시딩 완료!");
}

main().catch((e) => { console.error(e); process.exit(1); });
