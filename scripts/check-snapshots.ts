import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 미래에셋 1700 계좌의 스냅샷 상세 (status + captured_at 포함)
  const { data: snaps } = await supabase
    .from("snapshots")
    .select("id, status, captured_at, created_at")
    .eq("account_id", "f1e3f550-422d-4342-9565-1789769cc2f9") // 미래에셋 1700
    .order("created_at", { ascending: false });

  console.log("미래에셋 1700 스냅샷:");
  for (const s of snaps ?? []) {
    console.log(`  ${s.id.slice(0,8)} status=${s.status} captured_at=${s.captured_at?.slice(0,16)} created_at=${s.created_at?.slice(0,16)}`);
  }
}
main().catch(console.error);
