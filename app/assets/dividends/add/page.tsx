import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPriceMap } from "@/lib/market/price";
import { DividendAddForm } from "@/components/assets/DividendAddForm";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export default async function DividendAddPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="text-sm text-neutral-600">
        <Link className="text-blue-700 underline" href="/login">로그인</Link>이 필요합니다.
      </p>
    );
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id,type,broker,nickname")
    .order("created_at", { ascending: true });

  const priceMap = await fetchPriceMap([{ ticker: "USDKRW=X", market: "FOREX" }]);
  const usdKrw = priceMap.get("USDKRW=X")?.price ?? 1380;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link
          href="/assets"
          className="text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← 내 자산
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">배당 입력</h1>
      </header>

      <DividendAddForm accounts={accounts ?? []} defaultUsdKrw={usdKrw} />
    </div>
  );
}
