"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Account = {
  id: string;
  type: string;
  broker: string | null;
  nickname: string | null;
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  pension_fund: "연저펀",
  isa: "ISA",
  irp: "IRP",
  regular: "일반계좌",
  corp: "법인",
  bank: "은행",
  overseas: "해외증권",
};

export function OcrUploader() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "ocr" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ type: "pension_fund", broker: "", nickname: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d.accounts ?? []);
        if (d.accounts?.length) setAccountId(d.accounts[0].id);
        else setShowNewAccount(true);
      });
  }, []);

  async function createAccount() {
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newAccount),
    });
    const d = await res.json();
    if (d.account) {
      setAccounts((prev) => [d.account, ...prev]);
      setAccountId(d.account.id);
      setShowNewAccount(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !accountId) return;
    setStatus("uploading");
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("로그인 필요");

      const ts = Date.now();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userData.user.id}/${accountId}/${ts}.${ext}`;

      const { error: upErr } = await supabase.storage.from("snapshots-raw").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      setStatus("ocr");
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagePath: path, accountId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || "OCR 실패");

      setStatus("done");
      router.push(`/assets/confirm/${d.snapshotId}`);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "오류");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <section>
        <label className="text-base font-medium">계좌</label>
        {accounts.length > 0 && !showNewAccount && (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {ACCOUNT_TYPE_LABEL[a.type] ?? a.type}
                {a.broker ? ` · ${a.broker}` : ""}
                {a.nickname ? ` (${a.nickname})` : ""}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setShowNewAccount((v) => !v)}
          className="mt-2 text-base text-blue-700 underline"
        >
          {showNewAccount ? "취소" : "+ 새 계좌 등록"}
        </button>
      </section>

      {showNewAccount && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="mb-2 text-base font-medium">새 계좌</h3>
          <div className="flex flex-col gap-2">
            <select
              value={newAccount.type}
              onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2"
            >
              {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              placeholder="증권사 (예: 미래에셋)"
              value={newAccount.broker}
              onChange={(e) => setNewAccount({ ...newAccount, broker: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
            <input
              placeholder="별칭 (예: 메인 연저펀)"
              value={newAccount.nickname}
              onChange={(e) => setNewAccount({ ...newAccount, nickname: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={createAccount}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-base text-white"
            >
              계좌 만들기
            </button>
          </div>
        </div>
      )}

      <section>
        <label className="text-base font-medium">캡처 이미지</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`mt-2 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            file
              ? "border-amber-400 bg-amber-50"
              : "border-neutral-300 bg-neutral-50 hover:border-amber-400 hover:bg-amber-50"
          }`}
        >
          {file ? (
            <>
              <span className="text-2xl">🖼️</span>
              <span className="text-base font-medium text-neutral-800">{file.name}</span>
              <span className="text-sm text-neutral-500">
                {(file.size / 1024).toFixed(0)} KB · 탭하면 다시 선택
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl">📷</span>
              <span className="text-base font-medium text-neutral-700">
                탭하여 사진 촬영 또는 파일 선택
              </span>
              <span className="text-sm text-neutral-400">
                증권사 앱 보유 종목 화면을 캡처해 주세요
              </span>
            </>
          )}
        </button>
      </section>

      <button
        type="submit"
        disabled={!file || !accountId || status === "uploading" || status === "ocr"}
        className="rounded-md bg-amber-500 px-4 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {status === "idle" && "업로드 후 AI 분석"}
        {status === "uploading" && "업로드 중…"}
        {status === "ocr" && "AI가 종목을 읽고 있어요…"}
        {status === "done" && "완료"}
        {status === "error" && "다시 시도"}
      </button>

      {errorMsg && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-base text-red-800">{errorMsg}</p>
      )}
    </form>
  );
}
