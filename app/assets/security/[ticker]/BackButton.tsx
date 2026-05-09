"use client";

import Link from "next/link";

export function BackButton() {
  return (
    <Link href="/assets?tab=security" className="text-sm text-neutral-500 hover:text-neutral-800">
      ← 내 자산
    </Link>
  );
}
