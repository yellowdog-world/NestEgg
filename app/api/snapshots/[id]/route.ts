export const preferredRegion = "icn1";
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
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
  const { data: snap } = await supabase.from("snapshots").select("id,user_id,account_id").eq("id", id).single();
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
    // 계좌의 holdings 전체 교체 (snapshot_id 기준이 아닌 account_id 기준)
    // — 같은 계좌의 다른 스냅샷 holdings와 섞이지 않도록 account_id로 삭제
    await supabase.from("holdings").delete().eq("account_id", snap.account_id);
    const rows = await Promise.all(
      holdings
        .filter((h) => !h._delete)
        .map(async (h) => {
          const sec = await resolveSecurity(supabase, h.raw_name, h.ticker);
          // 티커로 매핑된 정식 종목명이 있으면 raw_name 교정 (OCR 오류 자동 수정)
          const raw_name = sec?.name ?? h.raw_name;
          return {
            snapshot_id: id,          // OCR 출처 추적용
            account_id: snap.account_id, // 계좌 직접 참조 (신규)
            raw_name,
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

    // 총 평가금액 + captured_at 갱신
    // captured_at을 현재 시각으로 올려야 assets 페이지에서 "최신 스냅샷"으로 인식됨
    // (같은 계좌에 여러 confirmed 스냅샷이 있을 때 편집한 것이 표시되도록)
    const total = rows.reduce((s, h) => s + (h.eval_amount ?? 0), 0);
    await supabase
      .from("snapshots")
      .update({ total_eval: total, captured_at: new Date().toISOString() })
      .eq("id", id);
  }

  // 저장 완료 후 관련 페이지 캐시 무효화
  revalidatePath(`/assets/holdings/${id}`);
  revalidatePath("/assets");

  return NextResponse.json({ ok: true });
}
