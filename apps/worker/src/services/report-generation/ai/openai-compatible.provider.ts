import { env } from "../../../config/environment.js";
import type { AiJsonProvider, AiJsonRequest } from "./ai-provider.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class OpenAICompatibleJsonProvider implements AiJsonProvider {
  readonly providerName = "openai-compatible";
  readonly model: string;

  constructor(
    private readonly apiKey = env.AI_REPORT_API_KEY,
    private readonly baseUrl = env.AI_REPORT_BASE_URL,
    model = env.AI_REPORT_MODEL
  ) {
    if (!apiKey) {
      throw new Error("AI_REPORT_API_KEY is required when AI_REPORT_PROVIDER=openai-compatible");
    }
    if (!model) {
      throw new Error("AI_REPORT_MODEL is required when AI_REPORT_PROVIDER=openai-compatible");
    }
    this.model = model;
  }

  async generateJson(request: AiJsonRequest): Promise<unknown> {
    const timeout = AbortSignal.timeout(env.AI_REPORT_TIMEOUT_MS);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: env.AI_REPORT_TEMPERATURE,
        max_tokens: env.AI_REPORT_MAX_OUTPUT_TOKENS,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: request.userPrompt
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI report provider request failed: ${response.status} ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI report provider returned an empty response");
    }

    return JSON.parse(stripJsonFence(content));
  }
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/u, "")
    .replace(/```$/u, "")
    .trim();
}
