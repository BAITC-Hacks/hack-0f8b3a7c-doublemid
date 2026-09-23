import { env } from 'cloudflare:workers';
import type { AIConfig } from './openai-questions';

export function getAIConfig(): AIConfig {
  return { apiKey: env.OPENAI_API_KEY, enabled: env.OPENAI_REQUESTS_ENABLED, model: env.OPENAI_MODEL };
}
