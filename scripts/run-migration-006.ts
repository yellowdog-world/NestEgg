/**
 * 0006_holdings_account_id.sql을 Supabase에 직접 적용
 * 실행: npx tsx scripts/run-migration-006.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0006_holdings_account_id.sql"),
  "utf8",
);

async function main() {
  console.log("마이그레이션 0006 적용 중...");
  const { error } = await supabase.rpc("exec_sql", { query: sql });
  if (error) {
    // exec_sql RPC가 없을 수 있으므로 직접 쿼리로 시도
    console.log("RPC 없음, 단계별 실행...");
    await runStepByStep();
    return;
  }
  console.log("✅ 완료");
}

async function runStepByStep() {
  // Step 1: account_id 컬럼 추가
  console.log("  1. account_id 컬럼 추가...");
  const r1 = await supabase.rpc("exec_ddl" as never, {
    sql: "ALTER TABLE public.holdings ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE",
  });
  console.log("     결과:", r1.error?.message ?? "OK");

  // Step 2: account_id 채우기
  console.log("  2. 기존 rows에 account_id 채우기...");
  const r2 = await supabase.rpc("exec_ddl" as never, {
    sql: "UPDATE public.holdings h SET account_id = s.account_id FROM public.snapshots s WHERE s.id = h.snapshot_id AND h.account_id IS NULL",
  });
  console.log("     결과:", r2.error?.message ?? "OK");

  console.log("\n⚠️  Supabase RPC exec_ddl도 없습니다.");
  console.log("   Supabase Dashboard > SQL Editor에서 아래 SQL을 직접 실행해주세요:");
  console.log("\n---");
  console.log(sql);
  console.log("---\n");
}

main().catch(console.error);
