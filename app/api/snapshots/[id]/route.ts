import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveSecurity } from "@/lib/market/resolve-security";

const PatchBody = z.object({
  status: z.enum(["draft", "confirmed"]).optional(),
  captured_at: z.string().optional(),
  notes: z.string().optional(),
  holdings: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        raw_name: z.string(),
        ticker: z.string().optional(),
        quantity: z.number(),
        avg_price: z.number().nullable(),
        market_price: z.number().nullable(),
        eval_amount: z.number().nullable(),
        profit_loss: z.number().nullable(),
        currency: z.enum(["KRW", "USD"]).default("KRW"),
        _delete: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: snapshot, error } = await supabase
    .from("snapshots")
    .select("*, accounts(broker,nickname,type)")
    .eq("id", id)
    .single();
  if (error || !snapshot) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (snapshot.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: holdings } = await supabase
    .from("holdings")
    .select("*")
    .eq("snapshot_id", id)
    .order("created_at");

  return NextResponse.json({ snapshot, holdings: holdings ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { status, captured_at, notes, holdings } = parsed.data;

  // 소유 확인
  const { data: snap } = await supabase.from("snapshots").select("id,user_id").eq("id", id).single();
  if (!snap || snap.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (status || captured_at || notes !== undefined) {
    const update: Record<string, unknown> = {};
    if (status) {
      update.status = status;
      if (status === "confirmed") update.confirmed_at = new Date().toISOString();
    }
    if (captured_at) update.captured_at = captured_at;
    if (notes !== undefined) update.notes = notes;
    const { error } = await supabase.from("snapshots").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (holdings) {
    // 단순 전체 교체 전략(작은 데이터셋이라 OK)
    await supabase.from("holdings").delete().eq("snapshot_id", id);
    const rows = await Promise.all(
      holdings
        .filter((h) => !h._delete)
        .map(async (h) => {
          const sec = await resolveSecurity(supabase, h.raw_name, h.ticker);
          return {
            snapshot_id: id,
            raw_name: h.raw_name,
            quantity: h.quantity,
            avg_price: h.avg_price,
            market_price: h.market_price,
            eval_amount: h.eval_amount,
            profit_loss: h.profit_loss,
            currency: h.currency,
            security_ticker: sec?.ticker ?? null,
            security_market: sec?.market ?? null,
          };
        }),
    );
    if (rows.length) {
      const { error } = await supabase.from("holdings").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 총 평가금액 갱신
    const total = rows.reduce((s, h) => s + (h.eval_amount ?? 0), 0);
    await supabase.from("snapshots").update({ total_eval: total }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
