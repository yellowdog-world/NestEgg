"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Calculator, Wallet, Home, PiggyBank, TrendingUp } from "lucide-react";

const sections = [
  { href: "/", label: "홈", icon: Home, exact: true },
  { href: "/wiki", label: "정보", icon: BookOpen },
  { href: "/sim", label: "시뮬레이터", icon: Calculator },
  {
    href: "/assets",
    label: "자산",
    icon: Wallet,
    exact: true,
    children: [
      { href: "/assets", label: "내 자산", exact: true },
      { href: "/assets/history", label: "자산 추이" },
      { href: "/assets/goals", label: "투자 목표" },
      { href: "/assets/retirement", label: "은퇴시뮬" },
    ],
  },
];

export function SideNav() {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden w-56 shrink-0 border-r border-neutral-200 px-4 py-6 md:block">
      <Link href="/" className="block px-2 text-lg font-semibold tracking-tight">
        🐕 yellowdog
      </Link>
      <p className="mt-1 px-2 text-sm text-neutral-600">은퇴 자산 관리</p>

      <nav className="mt-6 flex flex-col gap-0.5">
        {sections.map(({ href, label, icon: Icon, exact, children }) => {
          const active = isActive(href, exact) || (children && children.some((c) => isActive(c.href, c.exact)));
          return (
            <div key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-base transition-colors ${
                  active
                    ? "bg-neutral-100 font-medium text-neutral-900"
                    : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>

              {/* 하위 메뉴 */}
              {children && isActive(href) && (
                <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-neutral-200 pl-3">
                  {children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`rounded-md px-2 py-1.5 text-sm transition-colors ${
                        isActive(child.href, child.exact)
                          ? "font-medium text-amber-600"
                          : "text-neutral-500 hover:text-neutral-800"
                      }`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
