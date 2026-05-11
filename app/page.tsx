import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Calculator, Wallet } from "lucide-react";

const cards = [
  {
    href: "/wiki",
    icon: BookOpen,
    title: "은퇴 정보 위키",
    desc: "연저펀·ISA·IRP 활용법, 인출 순서, 세금/건보료 가이드",
  },
  {
    href: "/sim",
    icon: Calculator,
    title: "시뮬레이터",
    desc: "인출 세금, 1500만원 한도, 자산 고갈, FIRE, 해외 ETF 세금 비교",
  },
  {
    href: "/assets",
    icon: Wallet,
    title: "내 자산",
    desc: "증권사 앱 캡처 → AI가 자동 등록 → 시계열로 자산 변화 추적",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const sp = await searchParams;
  if (sp.code) {
    const qs = new URLSearchParams({ code: sp.code, ...(sp.next ? { next: sp.next } : {}) });
    redirect(`/auth/callback?${qs}`);
  }
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">은퇴 자산 관리</h1>
        <p className="text-neutral-600">
          세금은 낮추고, 현금 흐름은 끝까지. 정보 → 시뮬레이터 → 내 자산 적용까지.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-400"
          >
            <Icon className="h-6 w-6 text-amber-500" />
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-medium group-hover:underline">{title}</h2>
              <p className="text-base text-neutral-600">{desc}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
