import { GoogleGenAI } from '@google/genai';
import { env, type EnvironmentConfig } from '../config/env.ts';
import { SubsystemStatus } from '../types/api.types.ts';
import { ServiceNotConfiguredError } from '../utils/errors.ts';

/**
 * Shared Server-Side Gemini Boundary for CIT Schedora.
 *
 * Primary Model: gemini-3.8-flash
 * Secret Name: GEMINI_API_KEY (read exclusively from server-side environment secrets)
 *
 * IMPORTANT:
 * - Never expose GEMINI_API_KEY to React components, browser bundles, or logs.
 * - All Gemini calls must pass through this shared backend service.
 * - The LLM never determines scheduling validity or overrides hard constraints.
 */
export interface GeminiServiceBoundaryStatus {
  readonly model: string;
  readonly secretConfigured: boolean;
  readonly status: SubsystemStatus;
}

export function getGeminiBoundaryStatus(
  config: EnvironmentConfig = env
): GeminiServiceBoundaryStatus {
  const secretConfigured = Boolean(
    config.geminiApiKey && config.geminiApiKey.trim().length > 0
  );

  return {
    model: config.geminiModel,
    secretConfigured,
    // Full Gemini workflows are not yet integrated in this milestone;
    // report configured vs not_configured honestly without exposing the secret value.
    status: secretConfigured
      ? SubsystemStatus.CONFIGURED
      : SubsystemStatus.NOT_CONFIGURED,
  };
}

let sharedGenAiClient: GoogleGenAI | null = null;

/**
 * Returns the shared server-side GoogleGenAI client instance.
 * Throws ServiceNotConfiguredError if GEMINI_API_KEY is not present in server secrets.
 */
export function getSharedGeminiClient(config: EnvironmentConfig = env): GoogleGenAI {
  if (!config.geminiApiKey) {
    throw new ServiceNotConfiguredError('GeminiLlmService (GEMINI_API_KEY secret not set)');
  }

  if (!sharedGenAiClient) {
    sharedGenAiClient = new GoogleGenAI({
      apiKey: config.geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  return sharedGenAiClient;
}
