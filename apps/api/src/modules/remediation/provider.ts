import { env } from "../../config/environment.js";

export type RemediationProviderName = "OPENAI" | "ANTHROPIC" | "GEMINI" | "DEEPSEEK" | "LOCAL" | "DISABLED";

export interface RemediationProviderUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  costEstimate?: number | undefined;
  currency?: string | undefined;
}

export interface RemediationJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  signal?: AbortSignal | undefined;
}

export interface RemediationJsonResult {
  json: unknown;
  rawText: string;
  usage?: RemediationProviderUsage | undefined;
}

export interface RemediationProvider {
  readonly providerName: RemediationProviderName;
  readonly model?: string | undefined;
  isConfigured(): boolean;
  generateJson(request: RemediationJsonRequest): Promise<RemediationJsonResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

interface RemediationProviderConfig {
  enabled: boolean;
  provider: RemediationProviderName;
  model?: string | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  maxTokens: number;
  timeoutMs: number;
}

export function createRemediationProvider(
  config: RemediationProviderConfig = {
    enabled: env.AI_ENABLED,
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL,
    maxTokens: env.AI_MAX_TOKENS,
    timeoutMs: env.AI_TIMEOUT_MS
  }
): RemediationProvider {
  if (!isProviderConfigured(config)) {
    return new DisabledRemediationProvider(config);
  }
  return new HttpRemediationProvider(config);
}

export function isProviderConfigured(config: RemediationProviderConfig): boolean {
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

function providerNotConfiguredReason(config: RemediationProviderConfig): string {
  if (!config.enabled || config.provider === "DISABLED") {
    return "AI remediation provider is disabled";
  }
  if (!config.model) {
    return "AI_MODEL is required for remediation";
  }
  if (config.provider === "LOCAL" && !config.baseUrl) {
    return "AI_BASE_URL is required for LOCAL remediation";
  }
  if (config.provider !== "LOCAL" && !config.apiKey) {
    return "AI_API_KEY is required for remediation";
  }
  return "AI remediation provider is not configured";
}

class DisabledRemediationProvider implements RemediationProvider {
  readonly providerName: RemediationProviderName;
  readonly model?: string | undefined;

  constructor(private readonly config: RemediationProviderConfig) {
    this.providerName = config.provider;
    this.model = config.model;
  }

  isConfigured(): boolean {
    return false;
  }

  async generateJson(): Promise<RemediationJsonResult> {
    throw new ProviderNotConfiguredError(providerNotConfiguredReason(this.config));
  }
}

class HttpRemediationProvider implements RemediationProvider {
  readonly providerName: RemediationProviderName;
  readonly model: string;

  constructor(private readonly config: RemediationProviderConfig) {
    if (!isProviderConfigured(config) || !config.model) {
      throw new ProviderNotConfiguredError(providerNotConfiguredReason(config));
    }
    this.providerName = config.provider;
    this.model = config.model;
  }

  isConfigured(): boolean {
    return true;
  }

  async generateJson(request: RemediationJsonRequest): Promise<RemediationJsonResult> {
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

  private async generateOpenAICompatible(request: RemediationJsonRequest): Promise<RemediationJsonResult> {
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
    const payload = await parseProviderResponse(response, "AI remediation provider request failed");
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("AI remediation provider returned an empty response");
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

  private async generateAnthropic(request: RemediationJsonRequest): Promise<RemediationJsonResult> {
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
    const payload = await parseProviderResponse(response, "Anthropic remediation request failed");
    const content = payload.content?.map((part: { text?: string }) => part.text ?? "").join("");
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Anthropic remediation provider returned an empty response");
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

  private async generateGemini(request: RemediationJsonRequest): Promise<RemediationJsonResult> {
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
    const payload = await parseProviderResponse(response, "Gemini remediation request failed");
    const content = payload.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("");
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("Gemini remediation provider returned an empty response");
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

function baseUrlFor(config: RemediationProviderConfig): string {
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
