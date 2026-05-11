"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  imagePath: string;
  accountId: string;
};

export function ReOcrButton({ imagePath, accountId }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleReOcr() {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagePath, accountId }),
      });
      const d = await res.json() as { snapshotId?: string; error?: string; detail?: string };
      if (!res.ok) throw new Error(d.detail || d.error || "OCR 실패");
      router.push(`/assets/confirm/${d.snapshotId}`);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleReOcr}
        disabled={status === "loading"}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-base text-neutral-600 hover:bg-neutral-50 active:scale-95 transition-all disabled:opacity-50"
      >
        {status === "loading" ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
            AI 재분석 중…
          </>
        ) : (
          <>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            다시 OCR 시도
          </>
        )}
      </button>
      {status === "error" && errorMsg && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
