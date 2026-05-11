"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Calculator, Wallet, PiggyBank, TrendingUp, Target } from "lucide-react";

const sections = [
  { href: "/", label: "홈", icon: Home, exact: true },
  { href: "/wiki", label: "정보", icon: BookOpen },
  { href: "/sim", label: "시뮬", icon: Calculator },
  { href: "/assets", label: "자산", icon: Wallet, exact: true },
  { href: "/assets/history", label: "추이", icon: TrendingUp },
  { href: "/assets/goals", label: "목표", icon: Target },
  { href: "/assets/retirement", label: "은퇴시뮬", icon: PiggyBank },
];

export function MobileNav() {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact || href === "/") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-neutral-200 bg-white md:hidden"
         style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {sections.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
              active ? "text-amber-500" : "text-neutral-400 hover:text-neutral-600"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[11px] font-medium leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
