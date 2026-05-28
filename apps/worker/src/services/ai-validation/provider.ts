import { env } from "../../config/environment.js";

export type AiProviderName = "OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK" | "LOCAL" | "DISABLED";

export interface AiValidationProviderUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  costEstimate?: number | undefined;
  currency?: string | undefined;
}

export interface AiValidationJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  signal?: AbortSignal | undefined;
}

export interface AiValidationJsonResult {
  json: unknown;
  rawText: string;
  usage?: AiValidationProviderUsage | undefined;
}

export interface AiValidationProvider {
  readonly providerName: AiProviderName;
  readonly model?: string | undefined;
  isConfigured(): boolean;
  generateJson(request: AiValidationJsonRequest): Promise<AiValidationJsonResult>;
}

export interface AiValidationProviderConfig {
  enabled: boolean;
  provider: AiProviderName;
  model?: string | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  maxTokens: number;
  timeoutMs: number;
}

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export function resolveAiValidationConfig(
  input: Record<string, string | undefined> = process.env
): AiValidationProviderConfig {
  const provider = toProviderName(input.AI_PROVIDER ?? "DISABLED");
  return {
    enabled: parseBoolean(input.AI_ENABLED, false),
    provider,
    model: blankToUndefined(input.AI_MODEL),
    apiKey: blankToUndefined(input.AI_API_KEY),
    baseUrl: blankToUndefined(input.AI_BASE_URL),
    maxTokens: positiveInt(input.AI_MAX_TOKENS, 2_000),
    timeoutMs: positiveInt(input.AI_TIMEOUT_MS, 45_000)
  };
}

export function createAiValidationProvider(
  config: AiValidationProviderConfig = {
    enabled: env.AI_ENABLED,
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL,
    maxTokens: env.AI_MAX_TOKENS,
    timeoutMs: env.AI_TIMEOUT_MS
  }
): AiValidationProvider {
  if (!isProviderConfigured(config)) {
    return new DisabledAiValidationProvider(config);
  }
  return new HttpAiValidationProvider(config);
}

export function isProviderConfigured(config: AiValidationProviderConfig): boolean {
  if (!config.enabled || config.provider === "DISABLED") {
    return false;
  }
  if (!config.model) {
    return false;
  }
  if (config.provider === "LOCAL") {
    return Boolean(config.baseUrl);
  }
  return Boolean(config.apiKey);
}

class DisabledAiValidationProvider implements AiValidationProvider {
  readonly providerName: AiProviderName;
  readonly model?: string | undefined;

  constructor(private readonly config: AiValidationProviderConfig) {
    this.providerName = config.provider;
    this.model = config.model;
  }

  isConfigured(): boolean {
    return false;
  }

  async generateJson(): Promise<AiValidationJsonResult> {
    throw new ProviderNotConfiguredError(providerNotConfiguredReason(this.config));
  }
}

class HttpAiValidationProvider implements AiValidationProvider {
  readonly providerName: AiProviderName;
  readonly model: string;

  constructor(private readonly config: AiValidationProviderConfig) {
    if (!isProviderConfigured(config) || !config.model) {
      throw new ProviderNotConfiguredError(providerNotConfiguredReason(config));
    }
    this.providerName = config.provider;
    this.model = config.model;
  }

  isConfigured(): boolean {
    return true;
  }

  async generateJson(request: AiValidationJsonRequest): Promise<AiValidationJsonResult> {
    switch (this.config.provider) {
      case "ANTHROPIC":
        return this.generateAnthropic(request);
      case "GEMINI":
        return this.generateGemini(request);
      case "OPENAI":
      case "DEEPSEEK":
      case "LOCAL":
        return this.generateOpenAICompatible(request);
      case "DISABLED":
        throw new ProviderNotConfiguredError(providerNotConfiguredReason(this.config));
    }
  }

  private async generateOpenAICompatible(
    request: AiValidationJsonRequest
  ): Promise<AiValidationJsonResult> {
    const response = await fetch(`${baseUrlFor(this.config).replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: this.config.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt }
        ]
      }),
      signal: combineWithTimeout(request.signal, this.config.timeoutMs)
    });
    const payload = await parseProviderResponse(response, "AI validation provider request failed");
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("AI validation provider returned an empty response");
    }
    return {
      json: JSON.parse(stripJsonFence(content)),
      rawText: content,
      usage: {
        inputTokens: numberOrUndefined(payload.usage?.prompt_tokens),
        outputTokens: numberOrUndefined(payload.usage?.completion_tokens),
        totalTokens: numberOrUndefined(payload.usage?.total_tokens)
      }
    };
  }

  private async generateAnthropic(request: AiValidationJsonRequest): Promise<AiValidationJsonResult> {
    const response = await fetch(`${baseUrlFor(this.config).replace(/\/$/u, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.config.maxTokens,
        system: request.systemPrompt,
        messages: [{ role: "user", content: request.userPrompt }]
      }),
      signal: combineWithTimeout(request.signal, this.config.timeoutMs)
    });
    const payload = await parseProviderResponse(response, "Anthropic AI validation request failed");
    const content = payload.content?.map((part: { text?: string }) => part.text ?? "").join("");
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Anthropic AI validation provider returned an empty response");
    }
    return {
      json: JSON.parse(stripJsonFence(content)),
      rawText: content,
      usage: {
        inputTokens: numberOrUndefined(payload.usage?.input_tokens),
        outputTokens: numberOrUndefined(payload.usage?.output_tokens),
        totalTokens: sumDefined(payload.usage?.input_tokens, payload.usage?.output_tokens)
      }
    };
  }

  private async generateGemini(request: AiValidationJsonRequest): Promise<AiValidationJsonResult> {
    const baseUrl = baseUrlFor(this.config).replace(/\/$/u, "");
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(
      this.config.apiKey ?? ""
    )}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: request.userPrompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: this.config.maxTokens,
          responseMimeType: "application/json"
        }
      }),
      signal: combineWithTimeout(request.signal, this.config.timeoutMs)
    });
    const payload = await parseProviderResponse(response, "Gemini AI validation request failed");
    const content = payload.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("");
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Gemini AI validation provider returned an empty response");
    }
    return {
      json: JSON.parse(stripJsonFence(content)),
      rawText: content,
      usage: {
        inputTokens: numberOrUndefined(payload.usageMetadata?.promptTokenCount),
        outputTokens: numberOrUndefined(payload.usageMetadata?.candidatesTokenCount),
        totalTokens: numberOrUndefined(payload.usageMetadata?.totalTokenCount)
      }
    };
  }
}

function providerNotConfiguredReason(config: AiValidationProviderConfig): string {
  if (!config.enabled || config.provider === "DISABLED") {
    return "AI validation provider is disabled";
  }
  if (!config.model) {
    return "AI_MODEL is required for AI validation";
  }
  if (config.provider === "LOCAL" && !config.baseUrl) {
    return "AI_BASE_URL is required for LOCAL AI validation";
  }
  if (config.provider !== "LOCAL" && !config.apiKey) {
    return "AI_API_KEY is required for AI validation";
  }
  return "AI validation provider is not configured";
}

function baseUrlFor(config: AiValidationProviderConfig): string {
  if (config.baseUrl) {
    return config.baseUrl;
  }
  switch (config.provider) {
    case "OPENAI":
      return "https://api.openai.com/v1";
    case "DEEPSEEK":
      return "https://api.deepseek.com/v1";
    case "ANTHROPIC":
      return "https://api.anthropic.com";
    case "GEMINI":
      return "https://generativelanguage.googleapis.com";
    case "LOCAL":
    case "DISABLED":
      return "";
  }
}

async function parseProviderResponse(response: Response, message: string): Promise<any> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${message}: ${response.status} ${body.slice(0, 500)}`);
  }
  return response.json();
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

function combineWithTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

function positiveInt(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toProviderName(value: string): AiProviderName {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "OPENAI" ||
    normalized === "ANTHROPIC" ||
    normalized === "GEMINI" ||
    normalized === "DEEPSEEK" ||
    normalized === "LOCAL" ||
    normalized === "DISABLED"
  ) {
    return normalized;
  }
  return "DISABLED";
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumDefined(a: unknown, b: unknown): number | undefined {
  const first = numberOrUndefined(a);
  const second = numberOrUndefined(b);
  if (first === undefined && second === undefined) {
    return undefined;
  }
  return (first ?? 0) + (second ?? 0);
}
