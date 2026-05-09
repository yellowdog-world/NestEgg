import { OcrUploader } from "@/components/assets/OcrUploader";

export default function UploadPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">자산 캡처 업로드</h1>
        <p className="mt-1 text-sm text-neutral-600">
          증권사/은행 앱의 보유 종목 화면을 캡처하면 AI가 종목·수량·평단가를 자동 추출합니다.
        </p>
      </header>

      {/* 플로우 스텝 */}
      <div className="flex items-center gap-1 text-xs">
        {[
          { n: "1", label: "계좌 선택/등록", active: true },
          { n: "2", label: "화면 캡처", active: true },
          { n: "3", label: "내용 확인", active: false },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-1">
            {i > 0 && <span className="text-neutral-300">›</span>}
            <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
              s.active
                ? "bg-amber-500 text-white"
                : "bg-neutral-100 text-neutral-400"
            }`}>
              <span>{s.n}</span>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 캡처 가이드 */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
          <span className="text-base">📋</span> 이렇게 캡처하면 정확해요
        </h2>

        {/* 필수 정보 체크리스트 */}
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {[
            { icon: "🏷️", label: "종목명 (또는 티커)" },
            { icon: "🔢", label: "보유 수량" },
            { icon: "📊", label: "평균단가 (매입가)" },
            { icon: "💰", label: "현재가" },
            { icon: "📈", label: "평가금액" },
            { icon: "📉", label: "수익률 / 손익" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-amber-800">
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* 예시 화면 목업 */}
        <p className="mb-2 text-xs font-medium text-amber-800">예시 화면</p>
        <div className="overflow-hidden rounded-xl border border-amber-300 bg-white shadow-sm">
          {/* 앱 상단 바 */}
          <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-2">
            <span className="text-xs font-medium text-neutral-600">보유 종목</span>
            <span className="text-[10px] text-neutral-400">총 3종목</span>
          </div>

          {/* 종목 행 */}
          <div className="divide-y divide-neutral-100">
            {/* 헤더 행 */}
            <div className="grid grid-cols-4 px-3 py-1.5 text-[9px] font-medium text-neutral-400">
              <span className="col-span-2">종목명</span>
              <span className="text-right">평단가</span>
              <span className="text-right">평가금액</span>
            </div>

            {/* 종목 1 — 하이라이트 */}
            <div className="relative grid grid-cols-4 bg-amber-50/60 px-3 py-2 text-[10px]">
              {/* 하이라이트 레이블들 */}
              <div className="absolute -left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-white" />
              <div className="col-span-2">
                <div className="font-semibold text-neutral-800">TIGER 미국S&P500</div>
                <div className="text-neutral-500">
                  <span className="rounded bg-amber-100 px-1 text-amber-700">수량 50</span>
                  {" "}
                  <span className="rounded bg-blue-50 px-1 text-blue-600">+12.4%</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-neutral-800">15,230</div>
                <div className="text-neutral-400">현재 17,120</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-neutral-800">856,000</div>
                <div className="text-green-600">+94,500</div>
              </div>
            </div>

            {/* 종목 2 */}
            <div className="grid grid-cols-4 px-3 py-2 text-[10px]">
              <div className="col-span-2">
                <div className="font-semibold text-neutral-800">KODEX 배당성장</div>
                <div className="text-neutral-500">
                  수량 120
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-neutral-800">10,450</div>
                <div className="text-neutral-400">현재 10,890</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-neutral-800">1,306,800</div>
                <div className="text-green-600">+52,800</div>
              </div>
            </div>

            {/* 종목 3 */}
            <div className="grid grid-cols-4 px-3 py-2 text-[10px]">
              <div className="col-span-2">
                <div className="font-semibold text-neutral-800">SCHD</div>
                <div className="text-neutral-500">
                  수량 30
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-neutral-800">$26.50</div>
                <div className="text-neutral-400">현재 $28.20</div>
              </div>
              <div className="text-right">
                <div className="font-medium text-neutral-800">1,099,800</div>
                <div className="text-green-600">+66,300</div>
              </div>
            </div>
          </div>
        </div>

        {/* 주의사항 */}
        <div className="mt-3 space-y-1">
          <p className="text-[11px] font-medium text-amber-800">이런 경우 인식률이 낮아요</p>
          <div className="grid grid-cols-1 gap-1">
            {[
              "❌ 화면이 잘리거나 흐린 경우",
              "❌ 종목명·수량만 있고 평단가가 없는 경우",
              "❌ 원화 환산 금액만 있고 달러 가격이 없는 경우",
            ].map((msg) => (
              <p key={msg} className="text-[11px] text-amber-700">{msg}</p>
            ))}
          </div>
        </div>
      </section>

      <OcrUploader />

      <p className="text-xs text-neutral-500">
        🔒 이미지는 Supabase Storage에 본인 계정에만 저장되며 AI(Anthropic)에 단발성으로 전송됩니다.
      </p>
    </div>
  );
}
