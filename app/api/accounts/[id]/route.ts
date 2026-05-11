export const preferredRegion = "icn1";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PatchBody = z.object({
  type: z.enum(["pension_fund", "isa", "irp", "regular", "corp", "bank", "overseas"]).optional(),
  broker: z.string().optional(),
  nickname: z.string().optional(),
  currency: z.string().optional(),
  principal_amount: z.number().nullable().optional(),
  principal_currency: z.enum(["KRW", "USD"]).optional(),
});

async function getOwnedAccount(supabase: Awaited<ReturnType<typeof createClient>>, id: string, userId: string) {
  const { data } = await supabase
    .from("accounts")
    .select("id, user_id")
    .eq("id", id)
    .single();
  if (!data || data.user_id !== userId) return null;
  return data;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const owned = await getOwnedAccount(supabase, id, user.id);
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { data, error } = await supabase
    .from("accounts")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const owned = await getOwnedAccount(supabase, id, user.id);
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
