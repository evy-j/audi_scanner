import { env } from "../../../config/environment.js";
import { DisabledAiJsonProvider, type AiJsonProvider } from "./ai-provider.js";
import { OpenAICompatibleJsonProvider } from "./openai-compatible.provider.js";

export function createAiReportProvider(): AiJsonProvider {
  switch (env.AI_REPORT_PROVIDER) {
    case "openai-compatible":
      return new OpenAICompatibleJsonProvider();
    case "disabled":
      return new DisabledAiJsonProvider();
  }
}
