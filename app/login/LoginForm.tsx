"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [status, setStatus] = useState<"idle" | "sending" | "verifying" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const router = useRouter();

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStep("code");
      setStatus("idle");
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setErrorMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setStatus("error");
      setErrorMsg("코드가 올바르지 않거나 만료되었습니다.");
    } else {
      router.push(next);
      router.refresh();
    }
  }

  if (step === "code") {
    return (
      <>
        <p className="mt-6 text-sm text-neutral-700">
          <span className="font-medium">{email}</span>로 인증 코드를 보냈습니다.
        </p>
        <form onSubmit={verifyCode} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            인증 코드
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6,8}"
              maxLength={8}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="12345678"
              className="rounded-md border border-neutral-300 px-3 py-2 text-center text-xl tracking-widest outline-none focus:border-neutral-900"
            />
          </label>
          <button
            type="submit"
            disabled={status === "verifying" || code.length < 6}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "verifying" ? "확인 중…" : "로그인"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("email"); setCode(""); setStatus("idle"); setErrorMsg(null); }}
            className="text-sm text-neutral-600 underline"
          >
            이메일 다시 입력
          </button>
        </form>
        {status === "error" && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errorMsg}</p>
        )}
      </>
    );
  }

  return (
    <>
      <form onSubmit={sendCode} className="mt-8 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-md border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
          />
        </label>
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === "sending" ? "전송 중…" : "인증 코드 받기"}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">오류: {errorMsg}</p>
      )}
    </>
  );
}
