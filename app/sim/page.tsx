import Link from "next/link";
import { simulatorCatalog } from "@/simulators/catalog";

export default function SimIndexPage() {
  const grouped = simulatorCatalog.reduce<Record<string, typeof simulatorCatalog>>(
    (acc, s) => {
      (acc[s.group] ??= []).push(s);
      return acc;
    },
    {},
  );

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">시뮬레이터</h1>
        <p className="mt-1 text-sm text-neutral-600">
          숫자를 직접 넣어보면서 세금·인출·고갈 시점을 확인하세요.
        </p>
      </header>

      {Object.entries(grouped).map(([group, items]) => (
        <section key={group}>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-neutral-600 uppercase">
            {group}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((s) => (
              <li key={s.path}>
                <Link
                  href={`/sim/${s.path}`}
                  className="block rounded-lg border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-neutral-400"
                >
                  <div className="font-medium">{s.title}</div>
                  <div className="mt-0.5 text-sm text-neutral-600">{s.description}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
