import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtKRW } from "@/lib/utils/format";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("id,captured_at,status,total_eval,accounts(broker,nickname,type)")
    .order("captured_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <Link href="/assets" className="text-base text-neutral-600 hover:text-neutral-900">
          ← 자산
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">스냅샷 히스토리</h1>
      </header>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-base">
          <thead className="bg-neutral-50 text-sm text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left">날짜</th>
              <th className="px-3 py-2 text-left">계좌</th>
              <th className="px-3 py-2 text-right">평가금액</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(snapshots ?? []).map((s) => {
              const accField = s.accounts as unknown;
              const acc = (Array.isArray(accField) ? accField[0] : accField) as
                | { broker: string | null; nickname: string | null; type: string }
                | null;
              return (
                <tr key={s.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">
                    {new Date(s.captured_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">
                    {acc?.broker ?? "—"}
                    {acc?.nickname ? ` · ${acc.nickname}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.total_eval !== null ? fmtKRW(Math.round(Number(s.total_eval))) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/assets/confirm/${s.id}`}
                      className="text-sm text-blue-700 hover:underline"
                    >
                      열기
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!snapshots || snapshots.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-base text-neutral-500">
                  히스토리가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-amber-100 text-amber-800";
  const label = status === "confirmed" ? "확인됨" : "초안";
  return <span className={`rounded px-1.5 py-0.5 text-sm font-medium ${cls}`}>{label}</span>;
}
