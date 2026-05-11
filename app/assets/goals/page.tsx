import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GoalsContent } from "./GoalsContent";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
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

  return <GoalsContent />;
}
