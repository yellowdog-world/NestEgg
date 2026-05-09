import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("id")
    .eq("account_id", id)
    .eq("status", "confirmed")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snapshot) return NextResponse.json({ holdings: [] });

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, raw_name, quantity, avg_price, market_price, eval_amount, profit_loss, currency, security_ticker, security_market")
    .eq("snapshot_id", snapshot.id);

  return NextResponse.json({ holdings: holdings ?? [] });
}
