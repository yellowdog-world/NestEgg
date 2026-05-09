import { OcrUploader } from "@/components/assets/OcrUploader";

export default function UploadPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">자산 캡처 업로드</h1>
        <p className="mt-1 text-sm text-neutral-600">
          증권사/은행 앱의 보유 종목 화면을 캡처하거나 직접 촬영하면 AI가 종목·수량·평단가를 자동 추출합니다.
        </p>
      </header>
      <OcrUploader />
      <p className="text-xs text-neutral-500">
        🔒 이미지는 Supabase Storage에 본인 계정에만 저장되며 AI(Anthropic)에 단발성으로 전송됩니다.
      </p>
    </div>
  );
}
