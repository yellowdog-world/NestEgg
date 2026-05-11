import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSecurity } from "@/lib/market/resolve-security";

const PatchBody = z.object({
  holdings: z.array(
    z.object({
      raw_name: z.string(),
      ticker: z.string().optional(),
      quantity: z.number(),
      avg_price: z.number().nullable(),
      market_price: z.number().nullable().optional(),
      eval_amount: z.number().nullable().optional(),
      profit_loss: z.number().nullable().optional(),
      currency: z.enum(["KRW", "USD"]).default("KRW"),
    }),
  ),
});

/** GET /api/accounts/[id]/holdings
 *  계좌의 현재 보유 종목을 account_id로 직접 조회 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("id", id)
    .single();
  if (!account || account.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: holdings } = await supabase
    .from("holdings")
    .select(
      "id, snapshot_id, raw_name, quantity, avg_price, market_price, eval_amount, profit_loss, currency, security_ticker, security_market",
    )
    .eq("account_id", id)
    .order("created_at");

  return NextResponse.json({ holdings: holdings ?? [] });
}

/** PATCH /api/accounts/[id]/holdings
 *  계좌의 보유 종목을 전체 교체 (기존 삭제 → 신규 삽입) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  // 소유 확인
  const { data: account } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("id", id)
    .single();
  if (!account || account.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { holdings } = parsed.data;

  // 전체 교체: 기존 holdings 삭제
  await supabase.from("holdings").delete().eq("account_id", id);

  if (holdings.length > 0) {
    const rows = await Promise.all(
      holdings.map(async (h) => {
        const sec = await resolveSecurity(supabase, h.raw_name, h.ticker);
        const raw_name = sec?.name ?? h.raw_name;
        return {
          account_id: id,
          snapshot_id: null,
          raw_name,
          quantity: h.quantity,
          avg_price: h.avg_price,
          market_price: h.market_price ?? null,
          eval_amount: h.eval_amount ?? null,
          profit_loss: h.profit_loss ?? null,
          currency: h.currency,
          security_ticker: sec?.ticker ?? null,
          security_market: sec?.market ?? null,
        };
      }),
    );

    const { error } = await supabase.from("holdings").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/assets");

  return NextResponse.json({ ok: true });
}
