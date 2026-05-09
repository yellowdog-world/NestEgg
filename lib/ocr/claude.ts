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
  const model = opts?.model ?? "claude-haiku-4-5-20251001";

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
    tool_choice: { type: "tool", name: HOLDINGS_EXTRACTION_TOOL.name },
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
            text: opts?.userHint
              ? `사용자 힌트: ${opts.userHint}\n\n위 이미지에서 보유 종목을 추출해 extract_holdings 도구로 반환하세요.`
              : "이 이미지에서 보유 종목을 추출해 extract_holdings 도구로 반환하세요.",
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
