import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { quantity, avg_price } = body as { quantity?: number; avg_price?: number };

  // 소유권 확인: holdings → snapshots → user_id
  const { data: holding } = await supabase
    .from("holdings")
    .select("id, snapshot_id, market_price, currency")
    .eq("id", id)
    .single();
  if (!holding) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("user_id")
    .eq("id", holding.snapshot_id)
    .single();
  if (!snapshot || snapshot.user_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (quantity !== undefined) patch.quantity = quantity;
  if (avg_price !== undefined) patch.avg_price = avg_price;

  // market_price가 있으면 eval_amount / profit_loss 재계산
  const mp = holding.market_price ? Number(holding.market_price) : null;
  const qty = quantity ?? undefined;
  const ap = avg_price ?? undefined;
  if (mp !== null && qty !== undefined) {
    patch.eval_amount = qty * mp;
  }
  if (mp !== null && qty !== undefined && ap !== undefined) {
    patch.profit_loss = qty * mp - qty * ap;
  }

  const { error } = await supabase.from("holdings").update(patch).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
