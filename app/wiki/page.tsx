import Link from "next/link";
import { listWikiDocs } from "@/lib/wiki";

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  basics:    { label: "기초",        icon: "📚", color: "bg-blue-50 text-blue-700 border-blue-200" },
  strategy:  { label: "전략",        icon: "🎯", color: "bg-violet-50 text-violet-700 border-violet-200" },
  tax:       { label: "세금",        icon: "🧾", color: "bg-amber-50 text-amber-700 border-amber-200" },
  lifestyle: { label: "라이프스타일", icon: "🌿", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default async function WikiIndexPage() {
  const docs = await listWikiDocs();
  const grouped = groupBy(docs, (d) => d.category);
  const categoryOrder = ["basics", "strategy", "tax", "lifestyle"];
  const sortedCategories = [
    ...categoryOrder.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !categoryOrder.includes(c)),
  ];

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-10">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="text-3xl font-bold tracking-tight">은퇴 정보 위키</h1>
        <p className="text-base text-neutral-500">
          연저펀·ISA·IRP, 세금, 건보료, 생활비 — 은퇴 준비의 모든 것.
        </p>
      </header>

      {docs.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          아직 위키 문서가 없어요.{" "}
          <code className="font-mono">content/wiki/</code> 에 .mdx 파일을 추가하면 자동으로 색인됩니다.
        </p>
      ) : (
        sortedCategories.map((cat) => {
          const meta = CATEGORY_META[cat] ?? { label: cat, icon: "📄", color: "bg-neutral-50 text-neutral-600 border-neutral-200" };
          const items = grouped[cat] ?? [];
          return (
            <section key={cat} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold ${meta.color}`}>
                  <span>{meta.icon}</span>
                  {meta.label}
                </span>
                <div className="h-px flex-1 bg-neutral-100" />
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/wiki/${doc.slug}`}
                      className="group flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold text-neutral-900 leading-snug">
                          {doc.title}
                        </span>
                        <span className="mt-0.5 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-700">
                          →
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-sm text-neutral-600 leading-relaxed">
                          {doc.description}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function groupBy<T, K extends string>(items: T[], keyFn: (it: T) => K): Record<K, T[]> {
  return items.reduce(
    (acc, it) => {
      const k = keyFn(it);
      (acc[k] ??= []).push(it);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}
