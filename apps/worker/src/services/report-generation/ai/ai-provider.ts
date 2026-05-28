export interface AiJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  signal?: AbortSignal | undefined;
}

export interface AiJsonProvider {
  readonly providerName: string;
  readonly model?: string | undefined;
  generateJson(request: AiJsonRequest): Promise<unknown>;
}

export class DisabledAiJsonProvider implements AiJsonProvider {
  readonly providerName = "disabled";

  async generateJson(): Promise<unknown> {
    throw new Error("AI report provider is disabled");
  }
}
