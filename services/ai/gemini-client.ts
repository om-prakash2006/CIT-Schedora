import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.ts';
import { logger } from '../../utils/logger.ts';

export interface GeminiClientStatus {
  readonly isConfigured: boolean;
  readonly model: string;
  readonly status: 'ready' | 'missing_api_key' | 'unreachable';
  readonly lastTestedAt: string;
}

let googleGenAiInstance: GoogleGenAI | null = null;

export function getSharedGeminiClient(): GoogleGenAI | null {
  if (!env.geminiApiKey) {
    return null;
  }

  if (!googleGenAiInstance) {
    try {
      googleGenAiInstance = new GoogleGenAI({
        apiKey: env.geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      logger.info('Initialized shared GoogleGenAI client', { model: env.geminiModel });
    } catch (err) {
      logger.info('Failed to initialize GoogleGenAI client, using deterministic fallback', {
        reason: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  return googleGenAiInstance;
}

export function checkGeminiStatus(): GeminiClientStatus {
  const isConfigured = Boolean(env.geminiApiKey);
  return {
    isConfigured,
    model: env.geminiModel,
    status: isConfigured ? 'ready' : 'missing_api_key',
    lastTestedAt: new Date().toISOString(),
  };
}

export async function generateContentWithStructuredOutput<T>(params: {
  readonly systemInstruction: string;
  readonly prompt: string;
  readonly responseSchema?: Record<string, unknown>;
  readonly temperature?: number;
}): Promise<{ readonly rawText: string; readonly parsedJson: T | null; readonly isFallback: boolean }> {
  const ai = getSharedGeminiClient();
  if (!ai) {
    logger.info('Gemini API key not configured, returning fallback response');
    return { rawText: '', parsedJson: null, isFallback: true };
  }

  const candidateModels =
    env.geminiModel === 'gemini-flash-latest'
      ? [env.geminiModel]
      : [env.geminiModel, 'gemini-flash-latest'];

  let lastErr: unknown = null;

  for (let attempt = 0; attempt < candidateModels.length; attempt++) {
    const modelName = candidateModels[attempt]!;
    const isModernNoTempModel =
      modelName.startsWith('gemini-3.8-flash') || modelName.startsWith('gemini-4-argon');

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.prompt,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: params.responseSchema ? 'application/json' : undefined,
          responseSchema: params.responseSchema as any,
          ...(isModernNoTempModel ? {} : { temperature: params.temperature ?? 0.2 }),
        },
      });

      const text = response.text ?? '';
      let parsedJson: T | null = null;
      if (params.responseSchema && text) {
        try {
          parsedJson = JSON.parse(text) as T;
        } catch (e) {
          logger.info('Gemini response was not valid JSON, falling back to deterministic parser', {
            model: modelName,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return {
        rawText: text,
        parsedJson,
        isFallback: false,
      };
    } catch (err: any) {
      lastErr = err;
      const status = err?.status || err?.statusCode || err?.response?.status;
      const isTransient = status === 503 || status === 429 || status === 500 || status === 502 || status === 504;
      if (isTransient && attempt + 1 < candidateModels.length) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  const status = (lastErr as any)?.status || (lastErr as any)?.statusCode || (lastErr as any)?.response?.status;
  logger.info('Gemini API unavailable, falling back to deterministic parser', {
    status: status ?? 'unknown',
    reason: (lastErr as any)?.message || String(lastErr),
  });

  return {
    rawText: '',
    parsedJson: null,
    isFallback: true,
  };
}

