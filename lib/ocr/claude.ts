import Anthropic from "@anthropic-ai/sdk";
import { HoldingsExtraction, HOLDINGS_EXTRACTION_TOOL, type HoldingsExtractionT } from "./schema";
import { OCR_SYSTEM_PROMPT } from "./prompts";

function getClient() {
  return new Anthropic({ apiKey: process.env.OCR_ANTHROPIC_API_KEY });
}

export interface OcrResult {
  data: HoldingsExtractionT;
  raw: unknown;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
}

/**
 * Claude Vision으로 캡처에서 보유 종목 추출.
 *
 * 구현 포인트:
 * - 시스템 프롬프트와 tool 정의는 prompt caching (cache_control: ephemeral) 적용 → 반복 호출 비용 절감
 * - tool_choice 강제로 텍스트 응답 차단 → JSON만 반환
 * - 응답을 zod로 재검증해 스키마 위반 시 명확한 에러
 */
export async function extractHoldingsFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  opts?: { model?: string; userHint?: string },
): Promise<OcrResult> {
  const model = opts?.model ?? "claude-sonnet-4-5";

  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: OCR_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        ...HOLDINGS_EXTRACTION_TOOL,
        cache_control: { type: "ephemeral" },
      } as Anthropic.Tool,
    ],
    // "any" → 모델이 텍스트로 먼저 이미지를 분석한 뒤 tool을 호출할 수 있음.
    // "tool" 강제 시 추론 없이 즉시 호출 → 2행 레이아웃 디테일 누락 빈번.
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: [
              opts?.userHint ? `사용자 힌트: ${opts.userHint}` : null,
              "아래 순서대로 진행하세요.",
              "",
              "STEP 1 — 이미지 스캔 (텍스트로 출력)",
              "테이블의 각 종목별로, 화면에 보이는 모든 행의 숫자를 왼쪽→오른쪽, 위→아래 순서로 빠짐없이 나열하세요.",
              "예: '종목A / 행1: 수량=302, 현재가=24455, 평가금액=7385410 / 행2: 매도가능=302, 평균단가=20136, 평가손익=1304338, 수익률=6.46%'",
              "숫자를 나열할 때 콤마(,)는 천 단위 구분자로만 해석하고 절대 소수점으로 읽지 마세요.",
              "",
              "STEP 2 — extract_holdings 도구 호출",
              "STEP 1에서 나열한 숫자를 바탕으로 각 필드를 정확히 매핑해 extract_holdings를 호출하세요.",
            ].filter(Boolean).join("\n"),
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
  if (!toolUse || toolUse.name !== HOLDINGS_EXTRACTION_TOOL.name) {
    throw new Error("Claude가 tool_use 응답을 반환하지 않음");
  }

  const parsed = HoldingsExtraction.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Schema 검증 실패: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
  }

  return {
    data: parsed.data,
    raw: toolUse.input,
    model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? undefined,
    },
  };
}
