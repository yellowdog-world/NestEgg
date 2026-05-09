"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Calculator, Wallet, PiggyBank } from "lucide-react";

const sections = [
  { href: "/", label: "홈", icon: Home, exact: true },
  { href: "/wiki", label: "위키", icon: BookOpen },
  { href: "/sim", label: "시뮬", icon: Calculator },
  { href: "/assets", label: "자산", icon: Wallet },
  { href: "/assets/retirement", label: "은퇴", icon: PiggyBank },
];

export function MobileNav() {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact || href === "/") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
      <Link href="/" className="text-base font-semibold tracking-tight text-neutral-900">
        🐕 yellowdog
      </Link>
      <nav className="flex items-center gap-1">
        {sections.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "text-amber-600"
                  : "text-neutral-400 hover:text-neutral-700"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "stroke-amber-500" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
