/**
 * KODEX 미국배당커버드콜액티브 티커 오류 수정
 * 472160 → 441640
 * 실행: npx tsx scripts/fix-kodex-ticker.ts
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

async function main() {
  const OLD = "472160";
  const NEW = "441640";
  const MARKET = "KRX";

  // 1. holdings 참조 업데이트
  const { count: hCount, error: hErr } = await supabase
    .from("holdings")
    .update({ security_ticker: NEW })
    .eq("security_ticker", OLD)
    .eq("security_market", MARKET);
  if (hErr) { console.error("holdings 수정 실패:", hErr.message); throw hErr; }
  console.log(`holdings 수정: ${hCount ?? 0}행`);

  // 2. 잘못된 securities 행 삭제 (441640이 없으면 이름 업데이트, 있으면 삭제)
  const { data: existing } = await supabase
    .from("securities")
    .select("ticker, name")
    .eq("ticker", NEW)
    .eq("market", MARKET)
    .maybeSingle();

  if (!existing) {
    // 441640 없음 → 472160 행을 441640으로 수정
    const { error } = await supabase
      .from("securities")
      .update({ ticker: NEW })
      .eq("ticker", OLD)
      .eq("market", MARKET);
    if (error) { console.error("securities 수정 실패:", error.message); throw error; }
    console.log(`securities: 472160 → 441640 ticker 수정 완료`);
  } else {
    // 441640 이미 있음 → 472160 행만 삭제
    const { error } = await supabase
      .from("securities")
      .delete()
      .eq("ticker", OLD)
      .eq("market", MARKET);
    if (error) { console.error("securities 삭제 실패:", error.message); throw error; }
    console.log(`securities: 중복 472160 행 삭제 완료 (441640 유지)`);
  }

  console.log("✅ 완료");
}

main().catch((e) => { console.error(e); process.exit(1); });
