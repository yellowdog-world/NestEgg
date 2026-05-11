import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">yellowdog 로그인</h1>
      <p className="mt-2 text-base text-neutral-600">
        이메일로 인증 코드를 보내드려요. 코드를 입력하면 로그인 완료.
      </p>
      <Suspense fallback={<p className="mt-8 text-base text-neutral-600">로딩 중…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
