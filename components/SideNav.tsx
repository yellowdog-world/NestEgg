import Link from "next/link";
import { BookOpen, Calculator, Wallet, Home } from "lucide-react";

const sections = [
  { href: "/", label: "홈", icon: Home },
  { href: "/wiki", label: "위키", icon: BookOpen },
  { href: "/sim", label: "시뮬레이터", icon: Calculator },
  { href: "/assets", label: "자산", icon: Wallet },
];

export function SideNav() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-neutral-200 px-4 py-6 md:block">
      <Link href="/" className="block px-2 text-lg font-semibold tracking-tight">
        🐕 yellowdog
      </Link>
      <p className="mt-1 px-2 text-xs text-neutral-600">은퇴 자산 관리</p>

      <nav className="mt-6 flex flex-col gap-1">
        {sections.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
