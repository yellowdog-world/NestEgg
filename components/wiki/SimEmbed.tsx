import Link from "next/link";
import { simulatorCatalog } from "@/simulators/catalog";

/**
 * 위키(MDX) 안에서 시뮬레이터로 가는 링크 카드.
 * 원래는 시뮬레이터 자체를 임베드하려 했으나, RSC + dynamic import 복잡성을 피해
 * v1에서는 카드 + 링크로 단순화. 클릭 시 /sim/{path}로 이동.
 */
export function SimEmbed({ simulator }: { simulator: string; preset?: Record<string, unknown> }) {
  const meta = simulatorCatalog.find((s) => s.path === simulator);
  if (!meta) {
    return (
      <div className="my-4 rounded-md border border-red-200 bg-red-50 p-3 text-base text-red-800">
        존재하지 않는 시뮬레이터: <code>{simulator}</code>
      </div>
    );
  }
  return (
    <Link
      href={`/sim/${meta.path}`}
      className="my-4 flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-4 transition-colors hover:border-amber-500 hover:bg-amber-100"
    >
      <span className="text-sm font-medium tracking-wide text-amber-700 uppercase">
        🧮 시뮬레이터
      </span>
      <span className="font-medium">{meta.title}</span>
      <span className="text-base text-neutral-700">{meta.description}</span>
      <span className="text-sm text-amber-700">→ /sim/{meta.path}</span>
    </Link>
  );
}
