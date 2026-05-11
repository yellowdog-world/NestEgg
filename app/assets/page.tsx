import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AssetsContent } from "./AssetsContent";

export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

export default async function AssetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <p className="text-base text-neutral-600">
        <Link className="text-blue-700 underline" href="/login">
          로그인
        </Link>
        이 필요합니다.
      </p>
    );
  }

  return <AssetsContent />;
}
